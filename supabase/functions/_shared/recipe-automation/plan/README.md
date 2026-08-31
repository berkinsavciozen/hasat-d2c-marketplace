# Recipe Planner — the F2 Step 13 vertical slice (Weekly Portfolio Planner)

The pipeline's first content agent to run — `recipe-stage-plan`, the Planner. Implements PROMPT 13
end to end: resolve/create a `recipe_generation_batches` row from a `RecipeBatchInput`, load narrow
read context (seasonal crop candidates, recent recipe mix, existing/duplicate recipe sample), run
the Planner through the shared agent-runner seam for exactly one `recipePlanBatchSchema`-shaped
output, gate it through two deterministic Postgres checks, and persist one `recipe_plan_briefs` row
per brief for admin review — **never** a `recipe_generation_jobs` row. Job creation only ever
happens later, via `../admin/plan-review.ts`'s `approvePlanBatch()` (which calls
`fan_out_recipe_plan_batch`, `../../migrations/20260831090000_f2s13_recipe_stage_plan.sql`), after
an explicit admin approval.

The HTTP entrypoint is `../../recipe-stage-plan/index.ts`. Unlike every other `recipe-stage-*`
function, this one is never reached via `dispatch_recipe_stage` from a preceding stage — planning
is the first pipeline node, so there is nothing to dispatch it. It is invoked directly (same
"human operator with the dispatch key, or server-to-server" convention every `recipe-stage-*`
function uses) with a `RecipeBatchInput` body, not a `{ jobId }` body.

## Modules

| File | Purpose |
|---|---|
| `context.ts` | Narrow RPC read helpers: `loadSeasonalCropCandidates` (`get_seasonal_crop_candidates`, f2s04), `loadRecentRecipeMix` (`get_recent_recipe_mix`, f2s04), `loadExistingRecipeSample` (`search_existing_recipes`, f2s04). No raw `crop_config`/`recipes` table scan. |
| `system-prompt.ts` | `buildPlannerSystemPrompt()` — PROMPT 13's "Başlangıç kuralları" restated as agent instructions (`RECIPE_PLANNER_RULES`). |
| `plan-stage.ts` | `runPlanStage()` — the orchestration: resolve/create batch, idempotency check, load context, call the agent (zero tools), Zod-validate, exact-count check, `validate_recipe_plan` (f2s04, structural) then `validate_recipe_plan_diversity` (f2s13, diversity) gates, persist `recipe_plan_briefs`. |

## Planner restrictions enforced in code, not just in the prompt

The agent is given **zero tools** (see `plan-stage.ts`'s `runPlannerAgent` — no `tools` field is
ever passed to `agentRunner.run(...)`), so there is no generic Supabase/SQL surface, no
publish/delete capability, and no live-DB-write capability reachable from the agent's output at
all:

- Every **read** (crop candidates, recent mix, existing recipes, editorial constraints) happens
  BEFORE the agent call, via `context.ts`'s narrow RPC wrappers and the caller's own
  `RecipeBatchInput` — never inside the agent.
- Every **write** (`recipe_generation_batches`/`recipe_plan_briefs` only — never
  `recipe_generation_jobs`, never `recipes`) happens AFTER the call, entirely in this trusted
  stage-runner TypeScript the agent's output can only ever flow *through*, never invoke.
- The agent's structured output is re-parsed against the FULL, unmodified `recipePlanBatchSchema`
  and then re-validated by two independent Postgres RPCs before a single row is persisted — the
  same "the LLM proposes, deterministic code disposes" discipline every other content agent in this
  pipeline (Writer/QA/Reviser) already follows.

## The two-gate validation PROMPT 13 requires

| Gate | Function | Checks |
|---|---|---|
| Structural | `validate_recipe_plan` (f2s04, unchanged — already applied to the shared project, see this migration's own header) | Every `workingTitle` present, `focusCrop` in `crop_config` if given, `targetDifficulty` a live enum value, no same-batch title collision. |
| Diversity | `validate_recipe_plan_diversity` (f2s13, new — see `../../migrations/20260831090000_f2s13_recipe_stage_plan.sql`) | `focusCrop` **required** and must resolve in `crop_config` (blocking); no primary-crop repeat unless `allowCropRepeat` is explicitly requested (blocking); no exact-duplicate title match via `find_recipe_duplicates` (blocking) / near-duplicate (warning); audience/meal-type/difficulty balance (warning, heuristic). |

Both gates run in `plan-stage.ts` **before** a single `recipe_plan_briefs` row is persisted — so
nothing that ever reaches admin review, let alone `fan_out_recipe_plan_batch`, has skipped either
check. `approvePlanBatch()` (`../admin/plan-review.ts`) re-runs the diversity gate a second time,
over whatever the admin's edits/exclusions left in place, immediately before flipping
`review_status` to `'approved'` — an edit made after planning (e.g. changing two briefs to the same
`focusCrop`) can reintroduce a violation, so this is re-checked, not just trusted from the earlier
pass.

## Admin plan review (before job fan-out)

`../admin/plan-review.ts` is the human-facing surface PROMPT 13 requires ("planı görüntüleyip
düzenleyip onaylayabilmeli"): list batches (`../../admin-recipe-plan-batches/index.ts`), batch
detail with every brief (`../../admin-recipe-plan-batch-detail/index.ts`), and edit/exclude/
approve/reject actions (`../../admin-recipe-plan-review-action/index.ts`). See `../admin/README.md`
for that module's own conventions — this section only covers what's specific to plan review:

- **Editing/excluding a brief** is refused once its batch has left `pending_review`, or once the
  brief has already been promoted into a job (`recipe_plan_briefs.job_id` set) — either means it is
  no longer "the plan", it is live pipeline state.
- **`approvePlanBatch()`** is the ONLY function in this pipeline that ever creates a
  `recipe_generation_jobs` row (via `fan_out_recipe_plan_batch`) and the ONLY one that ever
  dispatches a `recipe-stage-*` Edge Function. It is safe to call again for an already-approved
  batch (the CAS review-status update is a no-op the second time; fan-out/dispatch still runs) —
  this is the batch's own retry path after a partial dispatch failure.
- **Dispatch concurrency is bounded** (`DISPATCH_CONCURRENCY = 5` in `plan-review.ts`, not
  configurable via request input) — PROMPT 13: "write'ı kontrollü concurrency ile dispatch et".
  Dispatch itself reuses `../infra/stage-dispatch.ts`'s existing `dispatchNextStage` — best-effort,
  never the source of truth for job state.

## Job fan-out: idempotent by construction

`fan_out_recipe_plan_batch` (f2s13 migration) locks the batch row, re-derives
`review_status = 'approved'` from first principles (never trusts the caller), then for each
non-excluded brief either creates a job (`stage='write', status='queued'`) or links to one that
already exists for that exact `(batch_id, brief_id)` — via
`ON CONFLICT ON CONSTRAINT recipe_generation_jobs_batch_id_brief_id_key DO NOTHING`, reusing the
SAME unique constraint `recipe_generation_jobs` has carried since f2s03. A brief can never be
promoted into two jobs, whether from a genuinely concurrent fan-out call (blocked by the row lock)
or a caller retrying after a partial dispatch failure (the `ON CONFLICT` path). Proven directly
against a fresh local Postgres database — see "Running the tests" below.

## Running the tests

Same convention as `../writer/`/`../qa/`/`../admin/`:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/plan/ supabase/functions/_shared/recipe-automation/admin/plan-review.test.ts
```

`plan-stage.test.ts` and `../admin/plan-review.test.ts` use `../infra/testing/fake-supabase-client.ts`
(no live model call, no live Supabase project) — extended in this step to support `.is()` (null
checks) and bulk `.insert(rows[])`, both additive, neither changes any existing caller's behavior.

For the migration + RPC SQL proof (fresh-database apply + assertions), see
`supabase/tests/f2_recipe_plan/run.sh` — two vertical slices:
`01_plan_diversity_vertical_slice.sql` (every `validate_recipe_plan_diversity` rule, plus the
`recipe_plan_briefs.focus_crop` crop_config FK as a second, independent enforcement of "primary crop
must come from crop_config") and `02_fan_out_vertical_slice.sql` (the admin-approval gate and both
idempotent-fan-out paths).

**Verified for real in this session** — unlike several earlier F2 steps' documented sandbox
limitations, this session had both a local PostgreSQL 16 server (started via `pg_ctlcluster`) and
network access to install Deno and reach `esm.sh`/`jsr.io`/`registry.npmjs.org`. Every claim above
was actually run, not just asserted:
  - `supabase/tests/f2_recipe_plan/run.sh` — both vertical slices, PASSED.
  - All six F2 migrations (f2s03/04/05/11/12/13) applied together, in order, to one fresh database
    — no naming collision, no constraint conflict with the already-applied stack.
  - `deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/` — 283 passed,
    0 failed among anything this step touched (the only 9 failures are pre-existing, unrelated
    Step 09 image/WASM tests that need `--allow-read` for a vendored `.wasm` file — see
    `../image/vendor/README.md`).
  - `deno check` (full type-check) on every new/changed file in this step.

None of the F2 migrations — including this step's `20260831090000_f2s13_recipe_stage_plan.sql` —
were applied to any shared/live Supabase environment. Only a disposable, local-only database was
used.
