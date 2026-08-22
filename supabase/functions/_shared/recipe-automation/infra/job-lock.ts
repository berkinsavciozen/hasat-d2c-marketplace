// F2 Recipe Automation — Step 05: atomic job claim.
//
// A stage-runner Edge Function must claim a `recipe_generation_jobs` row before doing any work on
// it, so two concurrent invocations (a duplicated dispatch, an overlapping cron sweep, a retried
// HTTP call) can never both process the same job. The migration's own lock-column comment
// describes exactly the primitive this module implements: "a single
// `UPDATE ... WHERE locked_by IS NULL OR lock_expires_at < now() ...` can never leave the row in
// a half-claimed state, because half-claimed states are now unrepresentable"
// (20260819120000_f2s03_recipe_automation_schema.sql, recipe_generation_jobs.locked_by).
//
// The claim is a single PostgREST UPDATE with every precondition in its WHERE clause — expected
// job id, expected current stage, a runnable status, and an absent-or-expired lock — so Postgres'
// own row-level locking makes the claim atomic: of two concurrent claims on the same row, exactly
// one UPDATE matches and returns a row; the other matches zero rows. No separate "check then
// write" step exists for callers to race on.
import type { SupabaseClient } from "./supabase-admin.ts";
import type { RecipeJobStage } from "../types.ts";
import { RecipeAutomationError } from "./errors.ts";

/** Statuses a job may be claimed from under normal operation. Anything else (awaiting_approval,
 * or a terminal status) is not runnable work a stage-runner should pick up. */
export const RUNNABLE_JOB_STATUSES = ["queued", "retryable"] as const;
export type RunnableJobStatus = (typeof RUNNABLE_JOB_STATUSES)[number];

// 'running' is included here ONLY so a crashed/timed-out worker's job can be recovered: claimJob
// always moves a job to status='running' as part of claiming it, and only advanceStage/failJob
// ever move it away — so a worker that crashes mid-stage leaves the row stuck at status='running'
// forever unless a later claim is allowed to target it too. The `.or(locked_by.is.null,
// lock_expires_at.lt.<now>)` filter below is what actually gates this: a 'running' row is only
// claimable through this path once its lock has expired, never while it's genuinely still held.
const CLAIMABLE_STATUSES = [...RUNNABLE_JOB_STATUSES, "running"] as const;

const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes — a single stage's Edge Function budget

export interface ClaimJobParams {
  jobId: string;
  /** The job must currently be at this stage, or the claim is refused (wrong_stage). */
  expectedStage: RecipeJobStage;
  /** How long this worker holds the lock before another claim may recover it as stale. */
  lockDurationMs?: number;
  /** Optional caller identity folded into the lock token, for log/trace correlation only. */
  workerId?: string;
}

export interface ClaimedJob {
  /** The full post-claim row, as returned by PostgREST — callers read whatever columns they need. */
  row: Record<string, unknown>;
  /** Opaque token the claimer must present to job-state.ts's advanceStage/failJob to prove
   * ownership. Not a secret — it has no privileges on its own, PostgREST access is what's
   * privileged — it is a compare-and-set key. */
  lockToken: string;
  lockExpiresAt: string;
}

export type ClaimFailureReason = "not_found" | "wrong_stage" | "not_runnable" | "locked";

export type ClaimJobResult =
  | { claimed: true; job: ClaimedJob }
  | { claimed: false; reason: ClaimFailureReason };

export async function claimJob(
  client: SupabaseClient,
  params: ClaimJobParams,
): Promise<ClaimJobResult> {
  const { jobId, expectedStage, lockDurationMs = DEFAULT_LOCK_DURATION_MS, workerId } = params;

  const now = new Date();
  const nowIso = now.toISOString();
  const lockExpiresAt = new Date(now.getTime() + lockDurationMs).toISOString();
  const lockToken = workerId ? `${workerId}:${crypto.randomUUID()}` : crypto.randomUUID();

  const { data, error } = await client
    .from("recipe_generation_jobs")
    .update({
      locked_by: lockToken,
      locked_at: nowIso,
      lock_expires_at: lockExpiresAt,
      status: "running",
    })
    .eq("id", jobId)
    .eq("stage", expectedStage)
    .in("status", CLAIMABLE_STATUSES)
    .or(`locked_by.is.null,lock_expires_at.lt.${nowIso}`)
    .select()
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "JOB_CLAIM_QUERY_FAILED",
      message: "claimJob update failed",
      stage: expectedStage,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  if (data) {
    return { claimed: true, job: { row: data, lockToken, lockExpiresAt } };
  }

  return { claimed: false, reason: await diagnoseClaimFailure(client, jobId, expectedStage) };
}

/**
 * The UPDATE above is the single source of truth for whether a claim succeeded — this is a
 * best-effort, non-atomic follow-up read used only to give callers/telemetry a human-meaningful
 * reason for a failed claim. A race between the UPDATE and this SELECT (someone else claims or
 * releases in between) can make the reason slightly stale; that's fine, it's diagnostic, not a
 * correctness dependency.
 */
async function diagnoseClaimFailure(
  client: SupabaseClient,
  jobId: string,
  expectedStage: RecipeJobStage,
): Promise<ClaimFailureReason> {
  const { data } = await client
    .from("recipe_generation_jobs")
    .select("stage,status,locked_by,lock_expires_at")
    .eq("id", jobId)
    .maybeSingle();

  if (!data) return "not_found";
  const row = data as {
    stage: string;
    status: string;
    locked_by: string | null;
    lock_expires_at: string | null;
  };
  if (row.stage !== expectedStage) return "wrong_stage";

  // Check "actively locked" before "not a runnable status": a claimed job's status is 'running'
  // by construction (see CLAIMABLE_STATUSES above), which is ALSO true of every stale-lock
  // recovery candidate — so status alone can't distinguish "someone else genuinely holds this
  // right now" from "not runnable for an unrelated reason". An active, unexpired lock is the more
  // specific and more common real-world cause (a concurrent/duplicate claim attempt).
  const lockActive = row.locked_by !== null && row.lock_expires_at !== null &&
    row.lock_expires_at > new Date().toISOString();
  if (lockActive) return "locked";

  if (!(CLAIMABLE_STATUSES as readonly string[]).includes(row.status)) return "not_runnable";
  // Runnable status, stage matches, no active lock — the UPDATE must have lost a race to another
  // claimer between it running and this diagnostic SELECT. "locked" is the accurate label for that.
  return "locked";
}

/**
 * Releases a lock without changing stage/status — used when a stage run ends in a way job-state's
 * advanceStage/failJob don't already cover (e.g. an aborted run that should just go back to being
 * claimable at the same stage). Requires the caller's own lock token, same CAS discipline as
 * job-state.ts.
 */
export async function releaseLock(
  client: SupabaseClient,
  params: { jobId: string; lockToken: string },
): Promise<{ released: boolean }> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .update({ locked_by: null, locked_at: null, lock_expires_at: null })
    .eq("id", params.jobId)
    .eq("locked_by", params.lockToken)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "JOB_LOCK_RELEASE_FAILED",
      message: "releaseLock update failed",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return { released: Boolean(data) };
}
