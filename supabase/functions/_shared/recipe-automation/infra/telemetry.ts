// F2 Recipe Automation — Step 05: stage-run telemetry.
//
// Writes one row per stage invocation attempt to `recipe_generation_stage_runs`
// (20260819120000_f2s03_recipe_automation_schema.sql) — the table's own comment: "kept even after
// a job retries, for attempt-level observability." Columns are exactly: safe IDs (job/batch/
// recipe), stage/status/attempt, started_at/finished_at (duration is these two, not a separate
// stored column), trace_id/provider/model/usage, and output/error — both `jsonb` with a
// "shape not content" CHECK (must be a JSON object), same convention as recipe_generation_jobs.
// last_error. This module is the one place that convention is enforced in code: `output` and
// `error.details` are passed through errors.ts's redactUnsafeDetails() before insert, so a stage
// that accidentally includes a provider payload or a header dict in its result doesn't leak a
// credential into a table every service-role-scoped caller can read.
//
// Telemetry recording is best-effort: a failed insert is logged and swallowed, never thrown — the
// same resilience convention admin-kpi's `safe()` helper uses for its dashboard queries. A stage
// run succeeding or failing must never itself fail because telemetry couldn't be written.
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

/**
 * Inserts a stage-run telemetry row. Returns the new row's id, or null if the insert failed
 * (logged to console.error, never thrown).
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

    const { data, error } = await client
      .from("recipe_generation_stage_runs")
      .insert({
        job_id: entry.jobId,
        batch_id: entry.batchId,
        recipe_id: entry.recipeId ?? null,
        stage: entry.stage,
        status: entry.status,
        attempt: entry.attempt,
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

    if (error) {
      console.error("recordStageRun insert error", error);
      return null;
    }
    return data as { id: string };
  } catch (e) {
    console.error("recordStageRun threw", e);
    return null;
  }
}
