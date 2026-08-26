# Recipe Finalize — the F2 Step 10 vertical slice

The pipeline's last automated stage-runner before a human ever sees a job: `finalize`. Implements
PROMPT 10 end to end — a deterministic gate, not a content agent. The actual HTTP entrypoint is
`../../recipe-stage-finalize/index.ts`; everything here is the orchestration/check logic that
entrypoint delegates to, kept HTTP-free so it's directly unit-testable.

## Modules

| File | Purpose |
|---|---|
| `finalize-stage.ts` | `runFinalizeStage()` — claim the job, re-verify every PROMPT 10 precondition against the CURRENT draft/QA/asset state (never trusted from whatever routed the job here), and — only if all pass — atomically move the job to the `awaiting_approval` stage. The one place all of the below is sequenced. |
| `context.ts` | Narrow read helpers: `loadLatestQaResult()` (most recent `recipe_qa_results` row, full shape — decision/blockingIssues/safetyReview/approvedForImaging), `loadFinalizeImageAssets()` (the job+draft's `hero`/`square` `recipe_assets` rows), `loadLatestUpstreamStageRun()` (see below). `loadCurrentDraft()` is reused as-is from `../qa/context.ts` — finalize needs the exact same "current draft" resolution QA already implements. |
| `asset-contract.ts` | Pure functions re-deriving the Step 09 asset contract (bucket, content type, filename, dimensions/aspect-ratio, `processing_params` shape, `quality`, acceptable `validation_status`) and diffing a stored `recipe_assets` row against it. No I/O — exhaustively unit-testable on its own. |
| `safety-review.ts` | Pure structural-completeness check for a QA result's `safetyReview` (temperature/timing/allergens findings present, `requiresHumanReview === true`) — deliberately never inspects the human sign-off fields (`approved`/`reviewedBy`/`reviewedAt`), which are a LATER gate. |

## What each PROMPT 10 bullet maps to

| PROMPT 10 requirement | Where it's checked | Outcome on failure |
|---|---|---|
| QA approval references the current draft version | `finalize-stage.ts`: latest QA result must be `decision='approved'` + `approved_for_imaging=true`, AND its `draftVersion` must equal the current (highest-version) draft's version | `no_approved_qa_result` / `stale_qa_version` |
| No blocking issue remains | `finalize-stage.ts`: `qaResult.blockingIssues.length === 0`, re-checked directly (defense in depth — the DB CHECK on `recipe_qa_results` already guarantees this whenever `approved_for_imaging=true`, but this stage doesn't just trust that) | `blocking_issues_remain` |
| Postgres validations still pass | `../writer/validate-draft.ts`'s `validateDraft()`, re-run against the current draft — same structure/crop/slug/coverage RPCs write-stage.ts/qa-stage.ts/revise-stage.ts already call | `postgres_validation_failed` |
| hero_16x9 and square_1x1 assets exist and are valid | `context.ts`'s `loadFinalizeImageAssets()` + `asset-contract.ts`'s `validateAssetContract()` | `missing_image_assets` / `invalid_image_assets` |
| Filenames, formats, bucket and processing metadata match contract | `asset-contract.ts` (same call as above — both bullets act on the same two rows) | `invalid_image_assets` |
| Safety review requirements for temperature, timing and allergens are present | `safety-review.ts`'s `validateSafetyReviewPresence()` | `safety_review_incomplete` |
| No unresolved stage error remains | `context.ts`'s `loadLatestUpstreamStageRun()` (see below) | `unresolved_stage_error` |

## A necessary interpretive decision, documented

PROMPT 10's "no unresolved stage error remains" bullet is not further specified in
RecipeAutomation.md or the prompt itself. `recipe_generation_jobs.last_error` was deliberately
**not** used for this check: `job-state.ts`'s `advanceStage()` never clears it on a successful
transition, and PROMPT 11 requires it as a permanent, visible admin job-list column ("last error") —
so it is intentionally sticky, by design, elsewhere in this pipeline. Gating finalize on
"`last_error` is null" would therefore permanently block any job that ever failed transiently and
later succeeded on retry at an EARLIER stage, which is normal, expected pipeline operation, not an
"unresolved" error.

Instead, this check is resolved as: **the most recently recorded `recipe_generation_stage_runs` row
for this job, across every stage BEFORE `finalize`, must not be a failure.** `recipe_generation_stage_runs`
is append-only per attempt (Step 05's own inclusion rationale: "kept even after a job retries, for
attempt-level observability"), so its single latest row for a job is exactly "the most recent thing
that happened to this job's pipeline progress" — `'completed'` means clean, `'failed'` means
something upstream never actually recovered before this job reached `finalize`.

`finalize`'s own stage is explicitly excluded from this scan (`context.ts`'s `UPSTREAM_STAGES`) —
otherwise a job that failed its first `finalize` attempt (a transient DB hiccup, say) could never
pass this specific check on a later, successful retry, since its own prior failure would always be
"the most recent stage run." A stage retrying itself is normal operation; this bullet is about
whether the pipeline actually got here cleanly, not about finalize's own retry count.

## Another interpretive decision: what "set to awaiting_approval" means

PROMPT 10 says "atomically set the automation job to awaiting_approval." `RECIPE_JOB_STAGE_VALUES`
(`../schemas.ts`) lists `awaiting_approval` as its own pipeline STAGE — distinct from `finalize` —
matching RecipeAutomation.md's canonical `plan -> write -> qa -> revise? -> image -> finalize ->
awaiting_approval -> publish` order and its flow diagram. `finalize-stage.ts`'s success path
therefore advances the job's STAGE to `awaiting_approval` (not merely a status while staying at
stage `finalize`), with `status` also set to `'awaiting_approval'` — the fitting "outcome" value
for a node whose entire purpose is to wait on a human, mirroring how `qa-stage.ts`'s own
`manual_review_required` branch and `revise-stage.ts`'s `routeToManualReview()` already use
`status='awaiting_approval'` as their human-queue parking state. No dispatch follows: there is no
next-stage Edge Function to nudge for a human decision — Step 11's admin surface is expected to
list/poll `awaiting_approval` jobs directly, not be dispatched to.

## What this stage never does

- **Never writes to `recipes`** — no import of, or reference to, `recipes`/`recipe_ingredients`/
  `recipe_steps` anywhere in this directory. Creating a live recipe row is Step 12's job.
- **Never calls a publish RPC** — there is none to call yet; publish is Step 12.
- **Never calls an `AgentRunner`** — unlike write/qa/revise, finalize has nothing for a model to
  judge. It is closer in shape to `../image/image-stage.ts` (deterministic processing, no LLM
  call) than to `qa-stage.ts`.
- **Never touches `recipe_qa_results.safety_approved`/`safety_reviewed_by`/`safety_reviewed_at`** —
  the human safety sign-off stays a later gate (Step 11/12), exactly as `qa-stage.ts` also never
  touches it. `safety-review.ts` checks structural PRESENCE of the three findings, never approval.

## Running the tests

Same convention as `../qa/`/`../revise/`/`../image/`:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/finalize/
```

`finalize-stage.test.ts` uses `../infra/testing/fake-supabase-client.ts` — no live model call, no
live Supabase project, and (unlike `../image/image-stage.test.ts`) no `jsr:@matmen/imagescript`
dependency either, since finalize never decodes/encodes an image itself. `asset-contract.test.ts`
and `safety-review.test.ts` are pure-function unit tests with no fake client at all.

**Sandbox note:** the Claude Code session that wrote this step could not execute `deno test` at
all — no `deno` binary is installed, and both `deno.land`/`dl.deno.land` (to install one) and
`esm.sh` (`../infra/supabase-admin.ts`'s `@supabase/supabase-js` import, needed even for
type-checking a file that only imports `type { SupabaseClient }` from it) are blocked by this
session's org egress policy, the same pre-existing class of limitation `../image/image-stage.test.ts`'s
own header documents for `jsr.io`. Every new file was syntax-checked with Bun's transpiler
(parse-only, no type-check, no module resolution) and manually cross-checked line-by-line against
`../qa/qa-stage.ts`/`../revise/revise-stage.ts`/`../image/image-stage.ts`'s already-merged,
already-reviewed conventions. Re-run the suite in an environment with `deno`/`esm.sh` access before
treating this step's Deno-level test evidence as verified.
