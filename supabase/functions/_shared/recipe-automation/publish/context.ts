// F2 Recipe Automation — Step 12: narrow read/transition helpers for the publish stage.
//
// Same "narrow, single-purpose helper per read" discipline every other stage's context.ts sets.
// Two of these are NOT ordinary reads:
//   - `loadJobSummary` is what lets publish-stage.ts short-circuit a repeated publish call BEFORE
//     ever attempting a claim — see its own doc comment below.
//   - `enterPublishStage` is the one-time `awaiting_approval`+`approved` -> `publish`+`queued`
//     transition nothing else in this codebase performs yet (see the publish RPC migration's
//     header for why this step owns that wiring). It is intentionally NOT built on top of
//     ../infra/job-lock.ts's `claimJob` — that helper claims a job already AT its expected stage;
//     this one-time transition moves a job INTO `publish` in the first place, structurally
//     identical to review-actions.ts's own `requestRevisionJob()` CAS (awaiting_approval/approved
//     -> revise/queued), just for a different destination stage and authored here since
//     admin/review-actions.ts is locked for this step.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import type { RecipeJobStage, RecipeJobStatus } from "../types.ts";

export interface JobSummary {
  id: string;
  batchId: string;
  stage: RecipeJobStage;
  status: RecipeJobStatus;
  attempt: number;
  recipeId: string | null;
}

/**
 * Loads just enough of a job row to decide, BEFORE attempting any claim, whether this is a fresh
 * publish request, a retry, or a repeat of an already-completed publish. Reading this first (no
 * lock taken) is what lets a repeated publish call for an already-published job return the
 * existing recipe without ever touching `recipe_generation_jobs.locked_by` — a job's own
 * `recipe_id` is only ever set by the SAME transaction that marks it `stage='publish',
 * status='completed'` (../../migrations/20260826130000_f2s12_recipe_publish_rpc.sql), so this
 * single column is a sufficient, race-free idempotency signal on its own.
 */
export async function loadJobSummary(client: SupabaseClient, jobId: string): Promise<JobSummary | null> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .select("id, batch_id, stage, status, attempt, recipe_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "PUBLISH_JOB_SUMMARY_QUERY_FAILED",
      message: "failed to load the job row",
      stage: "publish",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    stage: row.stage as RecipeJobStage,
    status: row.status as RecipeJobStatus,
    attempt: Number(row.attempt ?? 1),
    recipeId: (row.recipe_id as string | null) ?? null,
  };
}

export interface PublishedRecipeSummary {
  id: string;
  slug: string;
  status: string;
}

/** Used only on the idempotent "already published" reply path, to hand the caller back the live
 * recipe's current slug/status rather than just its id. */
export async function loadPublishedRecipeSummary(
  client: SupabaseClient,
  recipeId: string,
): Promise<PublishedRecipeSummary | null> {
  const { data, error } = await client
    .from("recipes")
    .select("id, slug, status")
    .eq("id", recipeId)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "PUBLISH_RECIPE_SUMMARY_QUERY_FAILED",
      message: "failed to load the published recipes row",
      stage: "publish",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return { id: String(row.id), slug: String(row.slug), status: String(row.status) };
}

/**
 * One-time CAS: moves a job from `awaiting_approval`+`approved` to `publish`+`queued`, only if it
 * is still exactly there. A no-op (zero rows matched, not an error) is the expected outcome on
 * every call after the first for a given job — retries of a failed publish attempt find the job
 * already at `stage='publish'` and skip straight past this, relying on ../infra/job-lock.ts's own
 * `queued`/`retryable`/stale-`running` claim handling instead. The caller (publish-stage.ts)
 * always calls `claimJob` right after this regardless of whether it matched, so the two failure
 * modes this can't distinguish on its own — "never approved" and "already past this transition" —
 * are both correctly diagnosed by that next call's own `wrong_stage`/`not_runnable`/`locked`
 * reasons. No `recipe_id is null` guard is needed here: a job can only reach
 * `stage='awaiting_approval', status='approved'` via `approveJob()` (admin/review-actions.ts),
 * which never touches `recipe_id` — that column is only ever set by the publish RPC's own final
 * UPDATE, which simultaneously moves the job OFF `awaiting_approval` — so the two states this
 * function matches against are invariantly disjoint from "already has a recipe" already.
 */
export async function enterPublishStage(client: SupabaseClient, jobId: string): Promise<{ transitioned: boolean }> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .update({ stage: "publish", status: "queued" })
    .eq("id", jobId)
    .eq("stage", "awaiting_approval")
    .eq("status", "approved")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "PUBLISH_ENTER_STAGE_FAILED",
      message: "enterPublishStage update failed",
      stage: "publish",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return { transitioned: Boolean(data) };
}
