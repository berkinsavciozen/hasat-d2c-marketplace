// F2 Recipe Automation — Step 05: stage-run telemetry.
//
// Writes one row per stage invocation attempt to `recipe_generation_stage_runs`
// (20260819120000_f2s03_recipe_automation_schema.sql) — the table's own comment: "kept even after
// a job retries, for attempt-level observability." Columns are exactly: safe IDs (job/batch/
// recipe), stage/status/attempt, started_at/finished_at (duration is these two, not a separate
// stored column), trace_id/provider/model/usage, and output/error — both `jsonb` with a
// "shape not content" CHECK (must be a JSON object), same convention as recipe_generation_jobs.
// last_error. Only `error` carries the "shape not content" jsonb CHECK at the DB layer (must be a
// JSON object) — see 20260819120000_f2s03_recipe_automation_schema.sql's recipe_generation_jobs
// .last_error and this table's own `error` column; `output` has no such CHECK. This module is the
// one place BOTH are defensively redacted in code regardless: `output` and `error.details` are
// passed through errors.ts's redactUnsafeDetails() before insert, so a stage that accidentally
// includes a provider payload or a header dict in its result doesn't leak a credential into a
// table every service-role-scoped caller can read.
//
// Telemetry recording is best-effort: a failed insert is logged and swallowed, never thrown — the
// same resilience convention admin-kpi's `safe()` helper uses for its dashboard queries. A stage
// run succeeding or failing must never itself fail because telemetry couldn't be written.
//
// `recordStageRun` retries the insert, bumping the attempt number by one each time, whenever it
// hits a collision on the table's own `UNIQUE(job_id, stage, attempt)` constraint
// (`recipe_generation_stage_runs_job_stage_attempt_key`). Every caller passes `entry.attempt`
// straight from the claimed `recipe_generation_jobs.attempt` column, but `admin/review-actions.ts`'s
// `retryStage()` deliberately resets that column back to 1 for a fresh RETRY BUDGET on every admin
// retry (see its own comment) — independent of, and in tension with, this table's own "kept even
// after a job retries, for attempt-level observability" intent above. A job that has ever been
// retried via `retry_stage` and then runs again at the same stage collides with the row already
// recorded at (job_id, stage, attempt=1) from its first pass; without this retry loop that collision
// silently drops the retried run's entire telemetry row. Found live 2026-09-02: jobs
// ed705ede-20c2-46a0-9f84-81f82cebfdc4 and 67567ad5-5ee7-4dd9-a60d-6546687d811e were both reset and
// re-run at `revise` — one succeeded, one failed differently, and a fresh `qa` pass ran on the
// former's new draft (confirmed via real `recipe_drafts`/`recipe_qa_results` rows) — yet none of it
// left a single `recipe_generation_stage_runs` row, purely because every insert landed on an
// already-used attempt number. Bumping the recorded attempt number past the collision preserves
// both: the job's own `attempt` column keeps its fresh-budget meaning, and this table still gets a
// row per real invocation instead of silently losing one to the collision.
import type { SupabaseClient } from "./supabase-admin.ts";
import type { RecipeErrorPayload, RecipeJobStage, RecipeJobStatus } from "../types.ts";
import { redactUnsafeDetails } from "./errors.ts";

export interface StageTelemetryEntry {
  jobId: string;
  batchId: string;
  recipeId?: string | null;
  stage: RecipeJobStage;
  status: RecipeJobStatus;
  attempt: number;
  startedAt: string;
  finishedAt?: string | null;
  /** Must already be a JSON-serializable object with no prompts/secrets — redacted defensively
   * below, but callers are the first line of defense (same contract as recipeErrorPayloadSchema). */
  output?: Record<string, unknown> | null;
  error?: RecipeErrorPayload | null;
  traceId?: string | null;
  provider?: string | null;
  model?: string | null;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
}

export function computeDurationMs(startedAt: string, finishedAt?: string | null): number | null {
  if (!finishedAt) return null;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** Postgres' unique_violation SQLSTATE — the only constraint this insert can realistically hit
 * (`recipe_generation_stage_runs_job_stage_attempt_key`; `id` is a generated PK, never supplied). */
const UNIQUE_VIOLATION_PG_CODE = "23505";

/** Bounded so a persistently-colliding attempt sequence (e.g. a job retried many times without
 * this table's attempt numbers ever being reconciled) fails closed — logged and swallowed, same as
 * any other insert error — rather than looping indefinitely. Comfortably above any real retry
 * count this pipeline's own MAX_AUTOMATIC_REVISIONS/max_attempts constants ever produce. */
const MAX_ATTEMPT_COLLISION_RETRIES = 20;

/**
 * Inserts a stage-run telemetry row. Returns the new row's id, or null if the insert failed
 * (logged to console.error, never thrown). Retries past a `UNIQUE(job_id, stage, attempt)`
 * collision by bumping the recorded attempt number — see this module's header for why that
 * collision is a real, reachable case (an admin `retry_stage` action), not just a defensive guard.
 */
export async function recordStageRun(
  client: SupabaseClient,
  entry: StageTelemetryEntry,
): Promise<{ id: string } | null> {
  try {
    const safeOutput = entry.output
      ? (redactUnsafeDetails(entry.output) as Record<string, unknown>)
      : null;
    const safeError = entry.error
      ? { ...entry.error, details: entry.error.details ? redactUnsafeDetails(entry.error.details) : undefined }
      : null;

    let attempt = entry.attempt;
    for (let tries = 0; tries < MAX_ATTEMPT_COLLISION_RETRIES; tries++) {
      const { data, error } = await client
        .from("recipe_generation_stage_runs")
        .insert({
          job_id: entry.jobId,
          batch_id: entry.batchId,
          recipe_id: entry.recipeId ?? null,
          stage: entry.stage,
          status: entry.status,
          attempt,
          started_at: entry.startedAt,
          finished_at: entry.finishedAt ?? null,
          output: safeOutput,
          error: safeError,
          trace_id: entry.traceId ?? null,
          provider: entry.provider ?? null,
          model: entry.model ?? null,
          usage: entry.usage ?? null,
        })
        .select("id")
        .single();

      if (!error) return data as { id: string };

      if ((error as { code?: string }).code === UNIQUE_VIOLATION_PG_CODE) {
        attempt++;
        continue;
      }
      console.error("recordStageRun insert error", error);
      return null;
    }
    console.error("recordStageRun insert error: exhausted attempt-collision retries", {
      jobId: entry.jobId,
      stage: entry.stage,
      startingAttempt: entry.attempt,
    });
    return null;
  } catch (e) {
    console.error("recordStageRun threw", e);
    return null;
  }
}
