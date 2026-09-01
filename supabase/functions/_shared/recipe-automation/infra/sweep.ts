// F2 Recipe Automation — periodic retry / stale-lock reconciliation sweep.
//
// Closes a gap present since Step 05: `dispatch_recipe_stage` is only ever called right after a
// successful `advanceStage()` (see stage-dispatch.ts's own header) — nothing calls it again for a
// job that instead ends its attempt via `failJob()`. Two categories of job are affected, and both
// are silent: neither shows an error anywhere beyond the job's own `last_error`/`status` columns.
//
//   1. `status = 'retryable'` — `failJob()` scheduled a retry (`next_attempt_at`, `attempt`
//      incremented, lock released) but nothing ever re-invokes the job's stage-runner once that
//      time passes. `claimJob()` happily reclaims a 'retryable' job at any time — it never checks
//      `next_attempt_at` itself — the job simply sits there until something calls dispatch again.
//   2. `status = 'running'` with an expired lock — a worker crashed or timed out mid-stage.
//      `claimJob()`'s own `CLAIMABLE_STATUSES` already includes 'running' specifically to recover
//      this case (see job-lock.ts's comment on that constant), but again, nothing ever calls
//      `claimJob()` a second time on its own.
//
// This module is the periodic nudge for both: find every job currently eligible under either
// condition and re-dispatch its CURRENT stage via the exact same `redispatchStage` helper every
// stage-runner's own successful-advance path already uses — its own doc comment anticipates
// exactly this ("re-nudging an already-queued job... e.g. a reconciliation sweep"). This module
// never claims or processes a job itself; it only asks the job's own stage-runner to try again,
// exactly the way a fresh dispatch would. Redispatch is documented idempotent-safe to repeat, so a
// job that gets swept twice (a slow stage-runner still finishing when the next sweep tick fires)
// costs at most one extra no-op claim attempt on the stage-runner side, never double-processing.
import type { SupabaseClient } from "./supabase-admin.ts";
import { redispatchStage } from "./stage-dispatch.ts";
import { RecipeAutomationError } from "./errors.ts";
import type { RecipeJobStage } from "../types.ts";

/** Caps how much work one sweep tick does — a runaway backlog is worked off over several ticks
 * rather than in one unbounded pass. */
const SWEEP_BATCH_LIMIT = 50;

/** Mirrors `dispatch_recipe_stage`'s own `_allowed_function_names` allow-list (f2s05 migration)
 * exactly — 'awaiting_approval' is excluded there for the same reason it's excluded here: it is a
 * human-review resting state, never something a stage-runner auto-advances out of, so a job
 * parked there is never a sweep candidate in the first place (nothing sets its status to
 * 'retryable' or leaves it 'running' while stage='awaiting_approval'). */
const STAGE_FUNCTION_NAMES: Partial<Record<RecipeJobStage, string>> = {
  plan: "recipe-stage-plan",
  write: "recipe-stage-write",
  qa: "recipe-stage-qa",
  revise: "recipe-stage-revise",
  image: "recipe-stage-image",
  finalize: "recipe-stage-finalize",
  publish: "recipe-stage-publish",
};

interface SweepCandidateRow {
  id: string;
  stage: RecipeJobStage;
  batch_id: string;
}

/** `status = 'retryable'` jobs whose scheduled retry time has arrived. `locked_by IS NULL` is
 * defensive rather than load-bearing — `failJob()` always clears the lock when it sets
 * status='retryable', so this should already be true of every retryable row; kept as an explicit
 * filter so this query's own intent ("only ever touch a genuinely unlocked job") doesn't silently
 * depend on that invariant holding elsewhere. */
async function fetchDueRetryableJobs(client: SupabaseClient, nowIso: string): Promise<SweepCandidateRow[]> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .select("id, stage, batch_id")
    .eq("status", "retryable")
    .lte("next_attempt_at", nowIso)
    .is("locked_by", null)
    .limit(SWEEP_BATCH_LIMIT);

  if (error) {
    throw new RecipeAutomationError({
      code: "RETRY_SWEEP_QUERY_FAILED",
      message: "failed to query recipe_generation_jobs for due retryable jobs",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as SweepCandidateRow[] | null) ?? [];
}

/** `status = 'running'` jobs whose lock has expired — the same reclaim-eligibility condition
 * `claimJob()` itself uses (job-lock.ts's `.or(locked_by.is.null,lock_expires_at.lt.<now>)`): a
 * 'running' row is only ever a stale-lock candidate once its lock is absent or expired, never
 * while genuinely held by an in-flight invocation. */
async function fetchStaleRunningJobs(client: SupabaseClient, nowIso: string): Promise<SweepCandidateRow[]> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .select("id, stage, batch_id")
    .eq("status", "running")
    .or(`locked_by.is.null,lock_expires_at.lt.${nowIso}`)
    .limit(SWEEP_BATCH_LIMIT);

  if (error) {
    throw new RecipeAutomationError({
      code: "RETRY_SWEEP_QUERY_FAILED",
      message: "failed to query recipe_generation_jobs for stale-lock running jobs",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as SweepCandidateRow[] | null) ?? [];
}

async function redispatchRows(
  client: SupabaseClient,
  rows: SweepCandidateRow[],
): Promise<{ redispatched: number; skipped: string[] }> {
  let redispatched = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const functionName = STAGE_FUNCTION_NAMES[row.stage];
    if (!functionName) {
      skipped.push(row.id);
      continue;
    }
    await redispatchStage(client, { jobId: row.id, functionName, payload: { batchId: row.batch_id } });
    redispatched++;
  }
  return { redispatched, skipped };
}

export interface RetrySweepResult {
  /** Jobs found with status='retryable' and next_attempt_at due, redispatched. */
  retryableRedispatched: number;
  /** Jobs found with status='running' and an expired lock, redispatched. */
  staleLockRedispatched: number;
  /** Candidate rows whose `stage` isn't in the allow-list above — skipped, never redispatched.
   * Should always be empty in practice (every non-terminal stage a job can sit at while
   * retryable/running is in the map); surfaced for observability rather than silently dropped. */
  skippedUnknownStage: string[];
}

/**
 * Runs one sweep tick. Never throws for "found nothing" or an individual redispatch failure
 * (`redispatchStage`/`dispatchNextStage` is itself never-throws, best-effort, by contract) — only
 * an unexpected failure reading the candidate rows themselves throws, the same convention every
 * other infra module in this pipeline uses.
 */
export async function runRetrySweep(client: SupabaseClient): Promise<RetrySweepResult> {
  const nowIso = new Date().toISOString();

  const [dueRetryable, staleRunning] = await Promise.all([
    fetchDueRetryableJobs(client, nowIso),
    fetchStaleRunningJobs(client, nowIso),
  ]);

  const retryable = await redispatchRows(client, dueRetryable);
  const staleLocks = await redispatchRows(client, staleRunning);

  return {
    retryableRedispatched: retryable.redispatched,
    staleLockRedispatched: staleLocks.redispatched,
    skippedUnknownStage: [...retryable.skipped, ...staleLocks.skipped],
  };
}
