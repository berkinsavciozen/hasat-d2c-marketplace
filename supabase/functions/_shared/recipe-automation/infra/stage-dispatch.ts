// F2 Recipe Automation — Step 05: next-stage dispatch.
//
// Mirrors `public.dispatch_sms`/`public.dispatch_push` (see
// supabase/migrations/20260720073613_d61a683e-0286-4e36-9c82-4d0418efb009.sql and the live
// project's `dispatch_push`): a thin, exception-isolated `net.http_post` call that fires a
// notification and never raises back to its caller. Here the "notification" is "please run the
// next stage" — the new `public.dispatch_recipe_stage` SQL function (see
// supabase/migrations/20260822120000_f2s05_recipe_stage_dispatch.sql) is that mirror, wrapped in
// the exact same `exception when others then raise log ...; end;` shape as dispatch_sms.
//
// CRITICAL ordering guarantee this module depends on: dispatch is called strictly AFTER
// job-state.ts's advanceStage() has already committed the job's new stage/status. The dispatch
// call is a best-effort nudge to start the next stage sooner, NOT the source of truth for what
// stage a job is in. If the HTTP call inside dispatch_recipe_stage never reaches the next
// stage-runner (network failure, target down, pg_net itself erroring) the job simply sits at its
// new stage in a runnable status — a "dispatch failure leaves a recoverable job state" by
// construction, not because this module retries anything. Re-dispatching (see redispatchStage
// below) is always safe to call again: the next stage-runner's own claimJob() atomic claim means
// a duplicate dispatch can cause at most one extra no-op claim attempt, never double-processing.
//
// F2 Step 06 (P5 preflight): that ordering guarantee used to be enforced only by a comment (this
// one) telling each stage-runner to call advanceStage() then dispatchNextStage() by hand — nothing
// in code actually stopped a stage-runner from getting that backwards. `advanceStageAndDispatch()`
// below is now the one place that sequencing is structural: it awaits advanceStage() and only
// calls dispatchNextStage() when that resolves with `advanced: true`. Every stage-runner (starting
// with recipe-stage-write, see ../write/write-stage.ts) calls this helper instead of calling
// advanceStage/dispatchNextStage separately.
import type { SupabaseClient } from "./supabase-admin.ts";
import { toSafeErrorPayload } from "./errors.ts";
import { advanceStage, type AdvanceStageParams, type AdvanceStageResult } from "./job-state.ts";

const DEFAULT_DISPATCH_KEY_ENV_VAR = "RECIPE_STAGE_DISPATCH_SECRET";

export interface DispatchStageParams {
  jobId: string;
  /** Target Edge Function's name, e.g. "recipe-writer" — becomes the functions/v1/<name> path. */
  functionName: string;
  /** Extra body fields merged alongside { jobId }. Keep this to routing hints only — never a
   * prompt, draft content, or provider payload; the SQL side logs this on failure. */
  payload?: Record<string, unknown>;
}

export interface DispatchResult {
  dispatched: boolean;
  /** Present only when dispatched=false — a safe, redacted summary, never the raw thrown value. */
  error?: ReturnType<typeof toSafeErrorPayload>;
}

export interface DispatchOptions {
  dispatchKeyEnvVar?: string;
}

/**
 * Best-effort: calls the `dispatch_recipe_stage` RPC and reports whether the call itself
 * succeeded. Never throws — a dispatch failure must not fail the stage-runner request that just
 * successfully advanced the job.
 */
export async function dispatchNextStage(
  client: SupabaseClient,
  params: DispatchStageParams,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const envVarName = options.dispatchKeyEnvVar ?? DEFAULT_DISPATCH_KEY_ENV_VAR;
  const dispatchKey = Deno.env.get(envVarName) ?? "";

  if (!dispatchKey) {
    return {
      dispatched: false,
      error: toSafeErrorPayload("dispatch key not configured", {
        code: "STAGE_DISPATCH_KEY_MISSING",
        retryable: false,
      }),
    };
  }

  try {
    const { error } = await client.rpc("dispatch_recipe_stage", {
      _job_id: params.jobId,
      _function_name: params.functionName,
      _dispatch_key: dispatchKey,
      _payload: params.payload ?? {},
    });
    if (error) {
      return {
        dispatched: false,
        error: toSafeErrorPayload(error, { code: "STAGE_DISPATCH_RPC_FAILED", retryable: true }),
      };
    }
    return { dispatched: true };
  } catch (e) {
    return {
      dispatched: false,
      error: toSafeErrorPayload(e, { code: "STAGE_DISPATCH_THREW", retryable: true }),
    };
  }
}

/** Alias documenting intent at call sites that are explicitly re-nudging an already-queued job
 * (e.g. a reconciliation sweep) rather than dispatching right after an advance. Same function —
 * dispatch is idempotent-safe to repeat, see module header. */
export const redispatchStage = dispatchNextStage;

export interface AdvanceAndDispatchResult {
  advance: AdvanceStageResult;
  /** Never attempted (stays null) when `advance.advanced` is false — see below. */
  dispatch: DispatchResult | null;
}

/**
 * F2 Step 06 (P5 preflight): the ONE place that enforces "advanceStage commits before
 * dispatchNextStage fires" IN CODE rather than as a comment-only convention every stage-runner had
 * to remember to follow by hand. `dispatchNextStage` is only ever called after `advanceStage`'s
 * own await has resolved, and only when it actually reports `advanced: true` — a failed/CAS-refused
 * advance short-circuits with `dispatch: null`, so a stage-runner can never accidentally nudge the
 * next stage to start on top of a job whose stage/status advance didn't actually happen.
 */
export async function advanceStageAndDispatch(
  client: SupabaseClient,
  advanceParams: AdvanceStageParams,
  dispatchParams: Omit<DispatchStageParams, "jobId">,
  dispatchOptions: DispatchOptions = {},
): Promise<AdvanceAndDispatchResult> {
  const advance = await advanceStage(client, advanceParams);
  if (!advance.advanced) {
    return { advance, dispatch: null };
  }

  const dispatch = await dispatchNextStage(
    client,
    { jobId: advanceParams.jobId, ...dispatchParams },
    dispatchOptions,
  );
  return { advance, dispatch };
}
