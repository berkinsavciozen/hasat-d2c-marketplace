# Recipe Publish — the F2 Step 12 vertical slice

The pipeline's terminal automated stage: `publish`. Implements PROMPT 12 — a deterministic,
idempotent publish that creates the live `recipes`/`recipe_ingredients`/`recipe_steps` rows from an
approved draft. The actual HTTP entrypoint is `../../recipe-stage-publish/index.ts`; everything
here is the orchestration this entrypoint delegates to, kept HTTP-free so it's directly
unit-testable.

Unlike every other stage in this pipeline, most of PROMPT 12's actual work does **not** live in
TypeScript. It lives in one Postgres function — `public.publish_recipe_draft`
(`../../../migrations/20260826130000_f2s12_recipe_publish_rpc.sql`) — because "on failure, rollback
all partial writes" is a real transaction guarantee only Postgres itself can give: a sequence of
separate PostgREST calls from this directory could never provide it. This directory's own code is
correspondingly thin.

## Modules

| File | Purpose |
|---|---|
| `publish-stage.ts` | `runPublishStage()` — the orchestrator. Checks for an already-completed job first (no lock touched), performs the one-time `awaiting_approval`+`approved` → `publish`+`queued` transition, claims the job via the existing, unmodified `../infra/job-lock.ts`, resolves the candidate slug (the one input the RPC cannot derive itself), calls `publish_recipe_draft`, and translates the result into a typed outcome + `recordStageRun`/`failJob` — the same shape every other stage-runner in this pipeline uses. |
| `context.ts` | `loadJobSummary()` (idempotency pre-check), `loadPublishedRecipeSummary()` (recipe details for a repeated-call reply), `enterPublishStage()` (the one-time stage transition — see below). `loadCurrentDraft()` is reused as-is from `../qa/context.ts`, exactly as `../finalize/context.ts` already does. |
| `rpc-error.ts` | `parsePublishRpcError()` — maps the RPC's `CODE: message` exception shape back to a typed `RunPublishStageOutcome` + retryability, so the SQL and TypeScript layers never carry two independent failure vocabularies for the same precondition. |

## What each PROMPT 12 precondition maps to

All of the following are checked **inside `publish_recipe_draft`**, in this order, every one before
the first write statement — see that function's own comments for the exact SQL:

| PROMPT 12 requirement | Where it's checked | RPC exception code |
|---|---|---|
| valid `x-admin-key` | `../../recipe-stage-publish/index.ts` via `../infra/admin-auth.ts` (reused as-is) | n/a — HTTP layer |
| job approved and at publish | `enterPublishStage()` + the existing `claimJob()` — see "a necessary interpretive decision" below | n/a — `not_claimed` outcome |
| exact approved draft version | the CURRENT (highest-version) `recipe_drafts` row for the job; every later lookup matches its EXACT `(job_id, id, version)` triple | `PUBLISH_NO_DRAFT` |
| matching QA result without blockers | exact-triple `recipe_qa_results` lookup, `decision='approved'` and no blocking issues | `PUBLISH_QA_RESULT_MISSING` / `PUBLISH_QA_NOT_CLEAN` |
| completed temperature/timing/allergen human checks | exact-triple `recipe_admin_reviews` lookup, `action='approve'` (that table's own CHECK already guarantees the checklist was complete — see the migration header) | `PUBLISH_SAFETY_CHECKLIST_INCOMPLETE` |
| both crop-photos assets exist | `recipe_assets` rows for `asset_type in ('hero','square')` | `PUBLISH_MISSING_ASSETS` |
| slug is still unique | the live `recipes_slug_key` UNIQUE index, caught via an exception handler around the INSERT (not a separate pre-check — see the migration's own comment on why) | `PUBLISH_SLUG_ALREADY_USED` |
| crop values remain valid | `validate_recipe_crop_values` (Step 04 RPC), re-run against the current draft | `PUBLISH_VALIDATION_FAILED` |
| job has not already produced another live recipe | `job.recipe_id is not null` short-circuit — see idempotency below | n/a — returns the existing recipe |

## A necessary interpretive decision: "job approved and at publish"

Nothing before this step ever moves a job to `stage='publish'`. `approveJob()`
(`../admin/review-actions.ts`, Step 11, locked for this step, read for reference only) deliberately
stops at `stage='awaiting_approval', status='approved'` — its own header states the dispatch to a
stage-runner is intentionally not its job. So "approved and at publish" is read here as "approved
and ready to enter publish": `enterPublishStage()` performs that missing
`awaiting_approval`+`approved` → `publish`+`queued` transition itself — a plain CAS UPDATE,
structurally identical to `review-actions.ts`'s own `requestRevisionJob()` transition, just not
authored in that locked file — immediately before calling the existing, **unmodified**
`claimJob()` (`../infra/job-lock.ts`) with `expectedStage: 'publish'`. A job that was never
approved (or was rejected) never makes that transition, so `claimJob` correctly reports
`not_claimed`/`wrong_stage` for it, same as it would for any other stage.

`enterPublishStage()` is a safe no-op on every call after the first for a given job — a retried
publish attempt (after a transient RPC failure) finds the job already at `stage='publish'` and
relies on `claimJob`'s own `queued`/`retryable`/stale-`running` handling instead, completely
unmodified.

## Idempotency: "a repeated publish call must return/reuse the same live recipe"

Two independent layers, both keyed on `recipe_generation_jobs.recipe_id` alone (never on lock
state, which a completed job no longer has):

1. **`publish-stage.ts`**, before any claim is attempted: `loadJobSummary()` checks
   `stage='publish', status='completed', recipe_id is not null` and returns the existing recipe
   directly — no lock touched, no RPC call.
2. **`publish_recipe_draft` itself**, as a defense-in-depth backstop: after locking the job row
   (`select ... for update`), if `recipe_id is not null` it returns the existing recipe WITHOUT
   requiring the caller's lock token to still match — checked deliberately *before* the
   lock/stage/status assertion, since a job that finished publishing is no longer `status='running'`
   or locked by anyone. See the vertical-slice SQL test's "double publish" case
   (`../../../tests/f2_recipe_publish/01_publish_vertical_slice.sql`), which calls the RPC twice
   for the same job with two DIFFERENT lock tokens and asserts the same `recipeId` both times.

The RPC's own initial `select ... for update` is the actual no-duplicate guarantee under real
concurrency: a second call racing for the SAME job simply blocks at that statement until the first
transaction commits, then observes the already-set `recipe_id` and takes the idempotent path — this
holds regardless of whether `claimJob`'s own CAS also prevented the wasted concurrent call in the
common case.

## What this stage never does

- **Never writes `recipe_qa_results.safety_approved`/`safety_reviewed_by`/`safety_reviewed_at`** —
  those stay exactly as Step 11 left them (NULL). The human safety sign-off this step relies on is
  `recipe_admin_reviews`, per that table's own migration header and the Step 11 completion report's
  explicit recommendation for this step.
- **Never widens `../infra/job-lock.ts`'s `CLAIMABLE_STATUSES`** — the `awaiting_approval`+
  `approved` → `publish`+`queued` transition is a separate, one-time, publish-owned CAS
  (`enterPublishStage`), not a change to what every other stage's claim considers claimable.
- **Never re-implements `slugifyTitle`** — reused as-is from `../writer/slug.ts`, the same function
  `write-stage.ts`/`finalize-stage.ts` already use, so a recipe's real slug and every earlier
  candidate-slug check in the pipeline are never able to silently drift apart.

## Running the tests

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/publish/
```

`context.test.ts` and `publish-stage.test.ts` use `../infra/testing/fake-supabase-client.ts` — no
live model call, no live Supabase project, no live Postgres. `rpc-error.test.ts` is a pure-function
unit test with no fake client at all. **These three files do not exercise
`publish_recipe_draft`'s own SQL** — the fake client has no schema/constraint enforcement, so the
transaction/rollback/idempotency guarantees the RPC itself provides are proven separately, against
a real fresh local PostgreSQL database, by
`../../../tests/f2_recipe_publish/01_publish_vertical_slice.sql` (see that suite's own `run.sh`).

Unlike `../finalize/README.md`'s own note for Step 10, this step's Claude Code session **could**
execute `deno test` in its sandbox: `esm.sh` itself is blocked by the org egress policy here too
(confirmed via repeated, consistent `unsuccessful tunnel` failures), but a local import-map
redirecting `https://esm.sh/@supabase/supabase-js@2.45.0` to a throwaway local stub (exporting only
the `SupabaseClient` type and a `createClient()` that's never actually called by any test in this
directory) let every test in this directory run for real, type-checked and executed, entirely
offline. All 22 tests across this directory's three `*.test.ts` files pass, along with every other
`*.test.ts` file already in this pipeline (`infra`/`qa`/`revise`/`finalize`/`writer`/`admin`/root
`schemas.test.ts` — 187 tests total; the only 2 failures anywhere are two pre-existing
`supabase-admin.test.ts` cases that call the real `createClient()` on purpose, an inherent
limitation of the stub, not a regression). See the Step 12 completion report for the exact command
and evidence.
