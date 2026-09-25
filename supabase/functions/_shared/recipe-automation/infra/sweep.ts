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
//   3. `stage = 'awaiting_approval'`, `status = 'approved'` — an admin approved the job
//      (`admin/review-actions.ts`'s `approveJob()`) but the best-effort dispatch it fires
//      immediately after was dropped (network blip, cold start, etc). Unlike categories 1 and 2,
//      this status is otherwise invisible to this sweep's original two queries below — it is
//      neither 'retryable' nor 'running' — so it needed its own candidate query. Found in
//      production 2026-09-02 (job 451234c7-cdc0-4322-b201-9b4d62fe4cc9: approved, never
//      published, no automated path back to `publish` at all before this).
//
//   4. `status = 'queued'` with no lock/lease and an `updated_at` older than one complete stage
//      lease — an advance committed the next stage, but its best-effort dispatch disappeared
//      before the next worker could claim it. Fresh queued work is deliberately left alone.
//
// This module is the periodic nudge for all four: find every job currently eligible under any
// condition and re-dispatch it via the exact same `redispatchStage` helper every stage-runner's
// own successful-advance path already uses — its own doc comment anticipates exactly this
// ("re-nudging an already-queued job... e.g. a reconciliation sweep"). This module never claims or
// processes a job itself; it only asks the job's own stage-runner to try again, exactly the way a
// fresh dispatch would. Redispatch is documented idempotent-safe to repeat, so a job that gets
// swept twice (a slow stage-runner still finishing when the next sweep tick fires) costs at most
// one extra no-op claim attempt on the stage-runner side, never double-processing. For category 3
// specifically, `recipe-stage-publish` itself performs the `awaiting_approval`+`approved` ->
// `publish`+`queued` transition on receipt (`publish/context.ts`'s `enterPublishStage`), so
// redispatching it while the job is still at stage='awaiting_approval' is exactly the right call —
// there is no earlier "advance to publish" step this sweep needs to perform itself.
import type { SupabaseClient } from "./supabase-admin.ts";
import { redispatchStage } from "./stage-dispatch.ts";
import { DEFAULT_LOCK_DURATION_MS } from "./job-lock.ts";
import { RecipeAutomationError } from "./errors.ts";
import type { RecipeJobStage } from "../types.ts";

/** Caps how much work one sweep tick does — a runaway backlog is worked off over several ticks
 * rather than in one unbounded pass. */
const SWEEP_BATCH_LIMIT = 50;

/** Mirrors `dispatch_recipe_stage`'s own `_allowed_function_names` allow-list (f2s05 migration)
 * exactly — 'awaiting_approval' is excluded here (used to look up a candidate's CURRENT stage for
 * categories 1/2 above) for the same reason it always was: it is a human-review resting state, and
 * neither 'retryable' nor 'running' is ever set while a job sits there. Category 3 (approved
 * awaiting publish) below targets `recipe-stage-publish` directly instead of going through this
 * map — see `PUBLISH_FUNCTION_NAME` and `fetchApprovedAwaitingPublishJobs`. */
const STAGE_FUNCTION_NAMES: Partial<Record<RecipeJobStage, string>> = {
  plan: "recipe-stage-plan",
  write: "recipe-stage-write",
  qa: "recipe-stage-qa",
  revise: "recipe-stage-revise",
  image: "recipe-stage-image",
  finalize: "recipe-stage-finalize",
  publish: "recipe-stage-publish",
};

/** Matches `admin/review-actions.ts`'s own `PUBLISH_FUNCTION_NAME` — category 3's target is always
 * `recipe-stage-publish`, regardless of the candidate's (still `awaiting_approval`) `stage` value,
 * so it is not looked up through `STAGE_FUNCTION_NAMES` above. */
const PUBLISH_FUNCTION_NAME = "recipe-stage-publish";

interface SweepCandidateRow {
  id: string;
  stage: RecipeJobStage;
  batch_id: string;
}

interface OrphanedQueuedCandidateRow extends SweepCandidateRow {
  attempt: number;
  max_attempts: number;
  updated_at: string;
}

/** A newly queued stage gets one complete stage lease to be claimed before reconciliation may
 * treat it as orphaned. This is intentionally derived from job-lock.ts's worker budget (5 min),
 * not a separate guessed timeout. With the existing 5-minute cron cadence, recovery happens
 * 5–10 minutes after the lost dispatch while active/recent work remains untouched. */
export const ORPHANED_QUEUED_GRACE_MS = DEFAULT_LOCK_DURATION_MS;

/** `status = 'retryable'` jobs whose scheduled retry time has arrived. `locked_by IS NULL` is
 * defensive rather than load-bearing — `failJob()` always clears the lock when it sets
 * status='retryable', so this should already be true of every retryable row; kept as an explicit
 * filter so this query's own intent ("only ever touch a genuinely unlocked job") doesn't silently
 * depend on that invariant holding elsewhere. */
async function fetchDueRetryableJobs(
  client: SupabaseClient,
  nowIso: string,
): Promise<SweepCandidateRow[]> {
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
async function fetchStaleRunningJobs(
  client: SupabaseClient,
  nowIso: string,
): Promise<SweepCandidateRow[]> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .select("id, stage, batch_id")
    .eq("status", "running")
    .or(`locked_by.is.null,lock_expires_at.lt.${nowIso}`)
    .limit(SWEEP_BATCH_LIMIT);

  if (error) {
    throw new RecipeAutomationError({
      code: "RETRY_SWEEP_QUERY_FAILED",
      message:
        "failed to query recipe_generation_jobs for stale-lock running jobs",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as SweepCandidateRow[] | null) ?? [];
}

/** `stage = 'awaiting_approval'`, `status = 'approved'` jobs — category 3, see this module's
 * header. No time-based or lock-based filter (unlike the two queries above): there is no
 * `next_attempt_at`/`locked_by` concept for this category at all, an approved job is either still
 * unpublished or it isn't, so any row this finds is by definition due for a redispatch. */
async function fetchApprovedAwaitingPublishJobs(
  client: SupabaseClient,
): Promise<SweepCandidateRow[]> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .select("id, stage, batch_id")
    .eq("stage", "awaiting_approval")
    .eq("status", "approved")
    .limit(SWEEP_BATCH_LIMIT);

  if (error) {
    throw new RecipeAutomationError({
      code: "RETRY_SWEEP_QUERY_FAILED",
      message:
        "failed to query recipe_generation_jobs for approved-awaiting-publish jobs",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as SweepCandidateRow[] | null) ?? [];
}

/** Category 4: queued work whose post-advance dispatch has had a full stage lease to arrive but
 * still has no claim lock. `updated_at` is the durable hand-off timestamp because every advance
 * updates this row and the table's trigger refreshes it on every later mutation. */
async function fetchOrphanedQueuedJobs(
  client: SupabaseClient,
  staleBeforeIso: string,
): Promise<OrphanedQueuedCandidateRow[]> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .select("id, stage, batch_id, attempt, max_attempts, updated_at")
    .eq("status", "queued")
    .is("locked_by", null)
    .is("locked_at", null)
    .is("lock_expires_at", null)
    .lt("updated_at", staleBeforeIso)
    .limit(SWEEP_BATCH_LIMIT);

  if (error) {
    throw new RecipeAutomationError({
      code: "RETRY_SWEEP_QUERY_FAILED",
      message:
        "failed to query recipe_generation_jobs for orphaned queued jobs",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return ((data as OrphanedQueuedCandidateRow[] | null) ?? []).filter((row) =>
    row.attempt <= row.max_attempts
  );
}

/** Atomically consumes a category-4 candidate's stale `updated_at` before dispatch. Two sweep
 * invocations may read the same candidate, but Postgres row locking lets only one UPDATE retain
 * every predicate and return the row. Refreshing `updated_at` also gives a failed best-effort
 * dispatch the same bounded grace before a later sweep retries it. */
async function reserveOrphanedQueuedJob(
  client: SupabaseClient,
  row: OrphanedQueuedCandidateRow,
  staleBeforeIso: string,
  nowIso: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .update({ updated_at: nowIso })
    .eq("id", row.id)
    .eq("stage", row.stage)
    .eq("status", "queued")
    .eq("attempt", row.attempt)
    .eq("max_attempts", row.max_attempts)
    .is("locked_by", null)
    .is("locked_at", null)
    .is("lock_expires_at", null)
    .lt("updated_at", staleBeforeIso)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "RETRY_SWEEP_QUERY_FAILED",
      message: "failed to reserve an orphaned queued job for redispatch",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return Boolean(data);
}

async function redispatchOrphanedQueuedRows(
  client: SupabaseClient,
  rows: OrphanedQueuedCandidateRow[],
  staleBeforeIso: string,
  nowIso: string,
): Promise<{ redispatched: number; skipped: string[] }> {
  let redispatched = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const functionName = STAGE_FUNCTION_NAMES[row.stage];
    if (!functionName) {
      skipped.push(row.id);
      continue;
    }
    if (!await reserveOrphanedQueuedJob(client, row, staleBeforeIso, nowIso)) {
      continue;
    }
    await redispatchStage(client, {
      jobId: row.id,
      functionName,
      payload: { batchId: row.batch_id },
    });
    redispatched++;
  }
  return { redispatched, skipped };
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
    await redispatchStage(client, {
      jobId: row.id,
      functionName,
      payload: { batchId: row.batch_id },
    });
    redispatched++;
  }
  return { redispatched, skipped };
}

/** Category 3's redispatch — always targets `recipe-stage-publish` directly (never looked up via
 * `STAGE_FUNCTION_NAMES`, see that map's own comment), so every row found is redispatched, never
 * skipped. */
async function redispatchApprovedAwaitingPublishRows(
  client: SupabaseClient,
  rows: SweepCandidateRow[],
): Promise<number> {
  for (const row of rows) {
    await redispatchStage(client, {
      jobId: row.id,
      functionName: PUBLISH_FUNCTION_NAME,
      payload: { batchId: row.batch_id },
    });
  }
  return rows.length;
}

export interface RetrySweepResult {
  /** Jobs found with status='retryable' and next_attempt_at due, redispatched. */
  retryableRedispatched: number;
  /** Jobs found with status='running' and an expired lock, redispatched. */
  staleLockRedispatched: number;
  /** Jobs found at stage='awaiting_approval', status='approved', redispatched to
   * recipe-stage-publish — category 3, see this module's header. */
  approvedAwaitingPublishRedispatched: number;
  /** Old, unlocked queued jobs atomically reserved and redispatched — category 4. */
  orphanedQueuedRedispatched: number;
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
export async function runRetrySweep(
  client: SupabaseClient,
): Promise<RetrySweepResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const orphanedQueuedBeforeIso = new Date(
    now.getTime() - ORPHANED_QUEUED_GRACE_MS,
  ).toISOString();

  const [dueRetryable, staleRunning, approvedAwaitingPublish, orphanedQueued] =
    await Promise.all([
      fetchDueRetryableJobs(client, nowIso),
      fetchStaleRunningJobs(client, nowIso),
      fetchApprovedAwaitingPublishJobs(client),
      fetchOrphanedQueuedJobs(client, orphanedQueuedBeforeIso),
    ]);

  const retryable = await redispatchRows(client, dueRetryable);
  const staleLocks = await redispatchRows(client, staleRunning);
  const approvedAwaitingPublishRedispatched =
    await redispatchApprovedAwaitingPublishRows(
      client,
      approvedAwaitingPublish,
    );
  const orphanedQueuedResult = await redispatchOrphanedQueuedRows(
    client,
    orphanedQueued,
    orphanedQueuedBeforeIso,
    nowIso,
  );

  return {
    retryableRedispatched: retryable.redispatched,
    staleLockRedispatched: staleLocks.redispatched,
    approvedAwaitingPublishRedispatched,
    orphanedQueuedRedispatched: orphanedQueuedResult.redispatched,
    skippedUnknownStage: [
      ...retryable.skipped,
      ...staleLocks.skipped,
      ...orphanedQueuedResult.skipped,
    ],
  };
}
