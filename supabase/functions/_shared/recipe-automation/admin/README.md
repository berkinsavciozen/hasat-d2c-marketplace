# Recipe Admin Review — the F2 Step 11 vertical slice

The pipeline's first human-facing surface: the admin review of a job parked at
`awaiting_approval` (and the ability to retry a job stuck at `failed`). Implements PROMPT 11 end
to end. The HTTP entrypoints are `../../admin-recipe-jobs/index.ts` (list),
`../../admin-recipe-job-detail/index.ts` (detail) and `../../admin-recipe-review-action/index.ts`
(actions); everything here is the orchestration/query logic those entrypoints delegate to, kept
HTTP-free so it's directly unit-testable.

## Modules

| File | Purpose |
|---|---|
| `checklist.ts` | The five-item human checklist Zod contract (temperature/timing/allergens/content/images). `approvalChecklistSchema` requires every item to be the literal `true`; `partialChecklistSchema` (any other action) defaults every item to `false`. |
| `review-actions.ts` | `approveJob()` / `rejectJob()` / `requestRevisionJob()` / `retryStage()` — one small CAS transition helper per action, each writing `recipe_generation_jobs` and inserting one `recipe_admin_reviews` audit row. |
| `list-jobs.ts` | `listRecipeJobs()` — the batch/job list (stage, status, revision, last error, latest QA score), filterable by stage/status/batchId, paginated. |
| `job-detail.ts` | `loadJobDetail()` — the draft detail view: current draft content/ingredients/steps (reused from `../qa/context.ts`'s `loadCurrentDraft`), Postgres RPC validation (reused from `../writer/validate-draft.ts`), the latest full QA result, both images with public URLs and frame-suspicion warnings, revision history across every draft version, recent stage-run history, and this job's own admin-review audit trail. |

## Why a new `recipe_admin_reviews` table, not `recipe_qa_results.safety_approved`

`recipe_qa_results.safety_approved` / `safety_reviewed_by` / `safety_reviewed_at`
(`20260819120000_f2s03_recipe_automation_schema.sql`) already exist and are explicitly documented,
by every one of write/qa/revise/image/finalize-stage.ts, as "the human safety gate — applies later,
at awaiting_approval/publish." Step 11 does **not** write to them. `safety_reviewed_by` is a
`uuid references public.profiles(id)`, and this admin surface's own hard constraint (F2-S11 task
brief) is that it authenticates ONLY via a timing-safe `x-admin-key` + service-role — deliberately
no `is_admin`, no RLS, no normal Lovable user session, and therefore no authenticated `profiles.id`
to legitimately attribute that FK to.

Rather than fabricate a placeholder profile row or relax that FK (weakening a constraint three
already-merged, locked stages depend on), this step records the human sign-off in its own new,
purpose-built table instead: `recipe_admin_reviews`
(`../../migrations/20260826120000_f2s11_recipe_admin_reviews.sql`). Its own CHECK constraint —
`action <> 'approve' or (temperature_reviewed and timing_reviewed and allergens_reviewed and
content_reviewed and images_reviewed)` — is the real, unbypassable mechanical gate PROMPT 11
requires ("this is not a UI constraint, the backend itself must refuse it"): proven directly against
a fresh Postgres database in `supabase/tests/f2_recipe_automation/05_admin_review_vertical_slice.sql`
(a direct SQL insert with any checklist item false, or all five left at their `false` default, is
rejected — not just a client-side check).

`recipe_qa_results.safety_approved` is left `NULL` by this step. **Recommendation for Step 12**
(transactional publish): gate publish on the latest `recipe_admin_reviews` row for the job having
`action = 'approve'`, rather than on `recipe_qa_results.safety_approved` — or introduce a real
admin-identity model first, so that column can finally be set legitimately.

## What each PROMPT 11 requirement maps to

| PROMPT 11 requirement | Where it's implemented |
|---|---|
| Batch/job list (stage, status, revision, last error, QA score) | `list-jobs.ts` |
| Draft detail (content, ingredients, ordered steps, both images, QA + RPC validation, revision history, frame warnings) | `job-detail.ts` |
| Five-item human checklist | `checklist.ts` (Zod, defense in depth) + the `recipe_admin_reviews` CHECK constraint (the real backstop) |
| approve / reject / request revision / retry failed stage | `review-actions.ts`'s four exported functions |
| Timing-safe `x-admin-key`, service-role only, no `is_admin`/RLS/Lovable session | `../infra/admin-auth.ts`'s `requireSharedSecret()`, reused as-is (same convention `../../admin-kpi/index.ts` already uses) |
| Approval mechanically impossible without the checklist | `recipe_admin_reviews`'s own CHECK constraint — see previous section |

## What this module never does

- **Never invokes a `recipe-stage-*` Edge Function.** `requestRevisionJob()`/`retryStage()` only
  flip `recipe_generation_jobs.stage`/`status` back to a runnable state — making the job eligible
  for the NEXT time something dispatches to that stage, not dispatching to it itself. See
  `review-actions.ts`'s own header.
- **Never writes to `recipe_drafts` / `recipe_qa_results` / `recipe_assets`.** Only
  `recipe_generation_jobs` (the state machine) and this step's own `recipe_admin_reviews`.
- **Never touches `recipe_qa_results.safety_approved`/`safety_reviewed_by`/`safety_reviewed_at`.**
  See the dedicated section above.
- **Never reads or writes `is_admin`, any RLS policy, or a Lovable user session.** Auth is the
  same shared-secret comparison every other admin/dispatch endpoint in this pipeline already uses.

## Running the tests

Same convention as `../qa/`/`../revise/`/`../image/`/`../finalize/`:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/
```

`review-actions.test.ts` uses `../infra/testing/fake-supabase-client.ts` (no live model call, no
live Supabase project). `checklist.test.ts` is a pure Zod unit test with no fake client at all.

For the migration + mechanical-CHECK-constraint SQL proof (fresh-database apply + assertions), see
`supabase/tests/f2_recipe_automation/05_admin_review_vertical_slice.sql` (run via
`supabase/tests/f2_recipe_automation/run.sh`).

**Sandbox note:** same pre-existing limitation `../finalize/README.md` documents — the Claude Code
session that wrote this step had no `deno` binary, and both `deno.land`/`dl.deno.land` and
`esm.sh`/`jsr.io` were blocked by this session's org egress policy. Unlike prior steps, this
session *did* have a local PostgreSQL server available — every migration/CHECK-constraint claim in
this module and its README was verified for real (see `05_admin_review_vertical_slice.sql`'s six
assertions, all passing against a fresh local database), not just asserted. Every new `.ts` file
was additionally verified with `bun build --external "npm:*" --external "https://*" --external
"jsr:*"`, which — unlike a bare parse — resolves and bundles the full local import graph
(`../qa/context.ts`, `../writer/validate-draft.ts`, `../infra/*`, `../schemas.ts`, `../types.ts`),
so a broken relative import or a syntax error would have surfaced. It does not type-check. Re-run
the `deno test` suite in an environment with `deno`/`esm.sh` access before treating this step's
Deno-level test evidence as verified.
