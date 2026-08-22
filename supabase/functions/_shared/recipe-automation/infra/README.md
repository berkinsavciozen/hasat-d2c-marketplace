# Recipe Automation — shared Edge Function infrastructure (F2 Step 05)

Shared plumbing every stage-runner Edge Function (Planner/Writer/QA/Image/Finalize/...) will
import. **No content agents are implemented here** — Writer/QA/Planner logic is explicitly out of
scope for this step (PROMPT 05); this is only the infrastructure those steps build on.

All modules import their contract types from `../schemas.ts`/`../types.ts` (the Step 02/03A
canonical Zod contracts) rather than redefining shapes locally.

## Modules

| File | Purpose |
|---|---|
| `admin-auth.ts` | Shared-secret request auth (`x-admin-key`, timing-safe compare). Mirrors `admin-kpi/index.ts`; also secures stage-to-stage dispatch under a separate secret. |
| `supabase-admin.ts` | The one place a service-role Supabase client is constructed for this pipeline. |
| `job-lock.ts` | Atomic job claim (`claimJob`) — expected job id, stage, runnable status, lock expiry, all in one UPDATE's WHERE clause. |
| `job-state.ts` | Compare-and-set stage transitions (`advanceStage`, `failJob`) — requires the caller's lock token; a stale/duplicate call is refused, not silently reapplied. |
| `stage-dispatch.ts` | Best-effort next-stage nudge (`dispatchNextStage`), calling the new `dispatch_recipe_stage` SQL RPC (mirrors `dispatch_sms`/`dispatch_push`). Never the source of truth for job state. |
| `agent-runner.ts` | Typed `AgentRunner` interface + `createAgentRunner()` factory hiding SDK-vs-Deno-native selection. Both implementations currently throw `AGENT_RUNNER_NOT_IMPLEMENTED` — real provider calls are Step 06+. |
| `errors.ts` | `RecipeAutomationError`, `toSafeErrorPayload()`, `redactUnsafeDetails()` — the one place error/detail redaction happens, shared by job-state/stage-dispatch/telemetry. |
| `telemetry.ts` | `recordStageRun()` — writes one row per stage attempt to `recipe_generation_stage_runs` (safe IDs, stage/status/attempt, provider/model/usage, redacted output/error). Best-effort, never throws. |
| `testing/fake-supabase-client.ts` | Test-only in-memory double for the query-builder subset these modules use. Not shipped to any Edge Function. |

## Who imports whom (security boundary)

`supabase-admin.ts`'s service-role client bypasses RLS. It is imported by `job-lock.ts`,
`job-state.ts`, `stage-dispatch.ts`, and `telemetry.ts` — all trusted, server-side infra that
already sits behind a lock-token check or an admin-auth gate. **`agent-runner.ts` does not, and
must not, import `supabase-admin.ts`** — an agent runner's job is to call a model provider, never
the database, so the service-role client must never be reachable from, or handed to, agent/tool
code an LLM's output could influence.

## Design notes worth knowing before extending this

- **State advance is durable before dispatch fires.** `advanceStage()` commits the job's new
  stage/status; only after that succeeds does a stage-runner call `dispatchNextStage()`. A
  dispatch failure (network, target down, `net.http_post` erroring) never rolls back or corrupts
  the job — it just means the next stage starts later instead of immediately. This is why
  `dispatch_recipe_stage`'s `exception when others` (mirroring `dispatch_sms`/`dispatch_push`)
  is safe: swallowing the failure there costs nothing the job's own persisted state doesn't
  already recover from.
- **Duplicate dispatch is safe.** Calling `dispatchNextStage`/`redispatchStage` twice for the same
  job can cause at most one extra no-op claim attempt on the other end — the next stage's own
  `claimJob()` atomic claim is what prevents double-processing, not dispatch refusing to fire
  twice.
- **A retried caller call is a safe no-op, not a bug.** Both `claimJob` and `advanceStage`/
  `failJob` are compare-and-set: if a caller retries an identical request after it actually
  already succeeded server-side, the retry's WHERE clause simply matches zero rows and the
  function reports that explicitly (`claimed: false, reason: "locked"` /
  `advanced: false, reason: "stage_mismatch"`) instead of reapplying or erroring destructively.

## Running the tests

Same convention as `../schemas.test.ts` — Deno's built-in test runner, no `jsr:@std/assert` /
`deno.land/std` dependency:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/infra/
```

`job-lock.test.ts`, `job-state.test.ts`, `stage-dispatch.test.ts`, and `telemetry.test.ts` use
`testing/fake-supabase-client.ts` instead of a live Supabase/PostgREST connection — there is no
Deno-reachable PostgREST stack in this project's local test route (see
`supabase/tests/f2_recipe_automation/README.md`), so these tests exercise the actual CAS/atomic-
claim logic in this directory's own TypeScript against an in-memory store that enforces the same
WHERE-clause semantics, rather than mocking that logic away.

The `dispatch_recipe_stage` SQL function itself (the pg_net/exception-isolation half of
`stage-dispatch.ts`) has its own fresh-local-PostgreSQL suite:
`supabase/tests/f2_recipe_stage_dispatch/run.sh`.
