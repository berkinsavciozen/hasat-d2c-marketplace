// F2 Recipe Automation — Step 05: compare-and-set stage transitions.
//
// job-lock.ts's claimJob() establishes exclusive ownership of a job via a lock token. Every
// mutation that follows — advancing to the next stage, or recording a failure/retry — must
// present that same token and have it checked in the same UPDATE's WHERE clause, so a second,
// racing caller (a duplicate dispatch, a retried HTTP call that actually succeeded server-side
// the first time) can never also apply its own transition. This also makes retrying the *caller*
// of these functions safe: if the job's stage/status has already moved past what a duplicate call
// expects, its CAS matches zero rows and the function reports that explicitly instead of
// corrupting state or double-applying a transition.
import type { SupabaseClient } from "./supabase-admin.ts";
import type { RecipeErrorPayload, RecipeJobStage, RecipeJobStatus } from "../types.ts";
import { RecipeAutomationError } from "./errors.ts";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 30_000;

const TERMINAL_STATUSES: ReadonlySet<RecipeJobStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export interface AdvanceStageParams {
  jobId: string;
  lockToken: string;
  fromStage: RecipeJobStage;
  toStage: RecipeJobStage;
  /** Status to leave the job in after advancing. Defaults to 'queued' (ready for the next
   * stage-runner to claim) — pass 'awaiting_approval' when advancing INTO that stage, etc. */
  toStatus?: RecipeJobStatus;
  /** Extra safe-to-persist columns (trace_id/provider/model/usage/recipe_id/...). Never pass
   * prompts, raw provider payloads, or secrets here — this is written to the job row as-is. */
  patch?: Record<string, unknown>;
}

export type AdvanceFailureReason = "lock_mismatch" | "stage_mismatch" | "not_found";

export type AdvanceStageResult =
  | { advanced: true; row: Record<string, unknown> }
  | { advanced: false; reason: AdvanceFailureReason };

export async function advanceStage(
  client: SupabaseClient,
  params: AdvanceStageParams,
): Promise<AdvanceStageResult> {
  const { jobId, lockToken, fromStage, toStage, toStatus = "queued", patch = {} } = params;
  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = {
    ...patch,
    stage: toStage,
    status: toStatus,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    finished_at: nowIso,
  };
  if (TERMINAL_STATUSES.has(toStatus)) {
    update.completed_at = nowIso;
  }

  const { data, error } = await client
    .from("recipe_generation_jobs")
    .update(update)
    .eq("id", jobId)
    .eq("locked_by", lockToken)
    .eq("stage", fromStage)
    .eq("status", "running")
    .select()
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "JOB_ADVANCE_QUERY_FAILED",
      message: "advanceStage update failed",
      stage: fromStage,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  if (data) return { advanced: true, row: data };
  return { advanced: false, reason: await diagnoseCasFailure(client, jobId, lockToken, fromStage) };
}

export interface FailJobParams {
  jobId: string;
  lockToken: string;
  /** Current stage — unchanged by a failure; only status/attempt/lock/error columns move. */
  stage: RecipeJobStage;
  error: RecipeErrorPayload;
  /** Overrides the job's own max_attempts for the retryable-vs-terminal decision, for tests. */
  maxAttempts?: number;
  retryDelayMs?: number;
}

export type FailJobResult =
  | { failed: true; row: Record<string, unknown>; nextStatus: "retryable" | "failed" }
  | { failed: false; reason: AdvanceFailureReason };

/**
 * Records a stage failure and either schedules a retry (status='retryable', next_attempt_at set,
 * attempt incremented, lock released so a future claimJob can pick it back up at the SAME stage)
 * or terminates the job (status='failed', completed_at set) — depending on `error.retryable` and
 * whether max_attempts has been reached. Either way the lock is released: a failure must never
 * leave a job stuck locked.
 */
export async function failJob(
  client: SupabaseClient,
  params: FailJobParams,
): Promise<FailJobResult> {
  const { jobId, lockToken, stage, error, retryDelayMs = DEFAULT_RETRY_DELAY_MS } = params;

  const { data: current, error: readError } = await client
    .from("recipe_generation_jobs")
    .select("attempt,max_attempts")
    .eq("id", jobId)
    .eq("locked_by", lockToken)
    .maybeSingle();

  if (readError) {
    throw new RecipeAutomationError({
      code: "JOB_FAIL_READ_FAILED",
      message: "failJob pre-read failed",
      stage,
      retryable: true,
      details: { pgCode: (readError as { code?: string }).code },
    });
  }
  if (!current) {
    return { failed: false, reason: await diagnoseCasFailure(client, jobId, lockToken, stage) };
  }

  const row = current as { attempt: number; max_attempts: number };
  const maxAttempts = params.maxAttempts ?? row.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
  const willRetry = error.retryable && row.attempt < maxAttempts;
  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = {
    last_error: error,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    finished_at: nowIso,
  };
  if (willRetry) {
    update.status = "retryable";
    update.attempt = row.attempt + 1;
    update.next_attempt_at = new Date(Date.now() + retryDelayMs).toISOString();
  } else {
    update.status = "failed";
    update.next_attempt_at = null;
    update.completed_at = nowIso;
  }

  const { data, error: writeError } = await client
    .from("recipe_generation_jobs")
    .update(update)
    .eq("id", jobId)
    .eq("locked_by", lockToken)
    .eq("stage", stage)
    .eq("status", "running")
    .select()
    .maybeSingle();

  if (writeError) {
    throw new RecipeAutomationError({
      code: "JOB_FAIL_WRITE_FAILED",
      message: "failJob update failed",
      stage,
      retryable: true,
      details: { pgCode: (writeError as { code?: string }).code },
    });
  }
  if (!data) {
    return { failed: false, reason: await diagnoseCasFailure(client, jobId, lockToken, stage) };
  }
  return { failed: true, row: data, nextStatus: willRetry ? "retryable" : "failed" };
}

async function diagnoseCasFailure(
  client: SupabaseClient,
  jobId: string,
  lockToken: string,
  expectedStage: RecipeJobStage,
): Promise<AdvanceFailureReason> {
  const { data } = await client
    .from("recipe_generation_jobs")
    .select("stage,locked_by")
    .eq("id", jobId)
    .maybeSingle();

  if (!data) return "not_found";
  const row = data as { stage: string; locked_by: string | null };
  // Check stage before lock ownership: the dominant real-world cause of a failed CAS is a
  // retried/duplicate call arriving after the first one already succeeded — at that point the
  // stage has moved AND the lock has been released, so both conditions are simultaneously true.
  // "stage_mismatch" is the more informative label for that case (it tells the caller the job
  // already progressed); "lock_mismatch" alone would suggest a different worker holds it, which
  // is the narrower, less common case where the stage hasn't actually changed.
  if (row.stage !== expectedStage) return "stage_mismatch";
  if (row.locked_by !== lockToken) return "lock_mismatch";
  return "lock_mismatch";
}
