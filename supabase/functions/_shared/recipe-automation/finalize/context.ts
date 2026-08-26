// F2 Recipe Automation — Step 10: narrow read helpers for the finalize stage.
//
// Same "narrow, single-purpose helper per read" discipline every other stage's context.ts sets
// (writer/context.ts, qa/context.ts, revise/context.ts, image/context.ts). finalize-stage.ts never
// calls a content agent — it is a deterministic gate, not a judgment call — so there is no
// "zero tools for an LLM" restriction to enforce here, but scattering raw table reads through the
// orchestrator would still make it harder to audit than a handful of named, typed loaders.
//
// `loadCurrentDraft` (the current, highest-`version` `recipe_drafts` row, rebuilt into a full
// `RecipeDraftPayload`) is reused as-is from `../qa/context.ts` rather than duplicated here —
// finalize needs the exact same "current draft" resolution QA already implements, both to re-run
// Postgres validation (`../writer/validate-draft.ts`) and to derive the expected asset filename
// slug from `draft.title`.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import { RECIPE_JOB_STAGE_VALUES } from "../schemas.ts";
import type { RecipeJobStage, RecipeQADecision, RecipeQAIssue, RecipeSafetyReview } from "../types.ts";

export interface LatestQaResult {
  id: string;
  draftId: string;
  draftVersion: number;
  recipeId: string | null;
  decision: RecipeQADecision;
  blockingIssues: RecipeQAIssue[];
  safetyReview: RecipeSafetyReview;
  approvedForImaging: boolean;
}

/**
 * Loads the most recent `recipe_qa_results` row for this job (most recent by `checked_at`, same
 * anchor `../image/context.ts`'s `loadApprovedQaResult` uses). Unlike that helper, this one never
 * throws when the result isn't approved — finalize-stage.ts treats "no approved QA result" and
 * "QA result exists but names a stale draft version" as two DIFFERENT, independently reportable
 * outcomes (PROMPT 10 lists "QA approval references the current draft version" and "no blocking
 * issue remains" as separate checks), so the caller decides what each combination means rather
 * than this loader collapsing them into one thrown error.
 */
export async function loadLatestQaResult(client: SupabaseClient, jobId: string): Promise<LatestQaResult | null> {
  const { data, error } = await client
    .from("recipe_qa_results")
    .select("id, draft_id, draft_version, recipe_id, decision, blocking_issues, safety_review, approved_for_imaging")
    .eq("job_id", jobId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "FINALIZE_QA_RESULT_QUERY_FAILED",
      message: "failed to load the latest recipe_qa_results row for this job",
      stage: "finalize",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const row = data as Record<string, unknown> | null;
  if (!row) return null;

  return {
    id: String(row.id),
    draftId: String(row.draft_id),
    draftVersion: Number(row.draft_version),
    recipeId: (row.recipe_id as string | null) ?? null,
    decision: row.decision as RecipeQADecision,
    blockingIssues: (row.blocking_issues as RecipeQAIssue[] | null) ?? [],
    safetyReview: row.safety_review as RecipeSafetyReview,
    approvedForImaging: Boolean(row.approved_for_imaging),
  };
}

export interface FinalizeAsset {
  id: string;
  storageBucket: string;
  storagePath: string;
  contentType: string;
  widthPx: number | null;
  heightPx: number | null;
  quality: number | null;
  validationStatus: string | null;
  processingParams: Record<string, unknown> | null;
}

export interface FinalizeImageAssets {
  hero: FinalizeAsset | null;
  square: FinalizeAsset | null;
}

/** Loads whatever `recipe_assets` rows exist for this (job, draft) among the two cover-photo
 * variants finalize cares about — 'source' and 'step' rows are out of scope for this stage, same
 * exclusion `../image/context.ts`'s `loadExistingImageAssets` documents for its own asset_type
 * filter. */
export async function loadFinalizeImageAssets(
  client: SupabaseClient,
  jobId: string,
  draftId: string,
): Promise<FinalizeImageAssets> {
  const { data, error } = await client
    .from("recipe_assets")
    .select(
      "id, asset_type, storage_bucket, storage_path, content_type, width_px, height_px, quality, validation_status, processing_params",
    )
    .eq("job_id", jobId)
    .eq("draft_id", draftId)
    .in("asset_type", ["hero", "square"]);

  if (error) {
    throw new RecipeAutomationError({
      code: "FINALIZE_ASSETS_QUERY_FAILED",
      message: "failed to load recipe_assets rows for this draft",
      stage: "finalize",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const rows = (data as Array<Record<string, unknown>>) ?? [];
  const byType = (type: string) => rows.find((r) => r.asset_type === type) ?? null;
  const toAsset = (row: Record<string, unknown> | null): FinalizeAsset | null => {
    if (!row) return null;
    return {
      id: String(row.id),
      storageBucket: String(row.storage_bucket),
      storagePath: String(row.storage_path),
      contentType: String(row.content_type),
      widthPx: (row.width_px as number | null) ?? null,
      heightPx: (row.height_px as number | null) ?? null,
      quality: (row.quality as number | null) ?? null,
      validationStatus: (row.validation_status as string | null) ?? null,
      processingParams: (row.processing_params as Record<string, unknown> | null) ?? null,
    };
  };

  return { hero: toAsset(byType("hero")), square: toAsset(byType("square")) };
}

export interface LatestStageRun {
  stage: RecipeJobStage;
  status: string;
}

/** Every pipeline stage EXCEPT `finalize` itself — see `loadLatestUpstreamStageRun`'s own header
 * for why finalize's own retry history must never be part of this check. */
const UPSTREAM_STAGES = RECIPE_JOB_STAGE_VALUES.filter((stage) => stage !== "finalize");

/**
 * "no unresolved stage error remains" (PROMPT 10) — resolved here as: the most recently recorded
 * `recipe_generation_stage_runs` attempt for this job, across every stage BEFORE `finalize`
 * (write/qa/revise/image), must not itself be a failure. `recipe_generation_jobs.last_error` is
 * NOT used for this check — it is deliberately sticky (job-state.ts's `advanceStage` never clears
 * it, and Step 11's admin job list is specified to keep showing it as history — PROMPT 11: "last
 * error" is a required list column), so a job that failed once transiently and later succeeded on
 * retry would otherwise be permanently unable to finalize even though nothing is actually
 * unresolved. `recipe_generation_stage_runs` is append-only per attempt, so its single latest row
 * for this job is exactly "the most recent thing that happened to this job's pipeline progress" —
 * 'completed' means clean, 'failed' means something upstream never actually recovered.
 * `finalize`'s own stage is excluded from the scan: this stage retrying itself (a transient DB
 * hiccup on an earlier finalize attempt) is normal operation, not the "unresolved stage error"
 * PROMPT 10 means — self-excluding avoids a stage that could otherwise never recover from its own
 * first failed attempt.
 */
export async function loadLatestUpstreamStageRun(
  client: SupabaseClient,
  jobId: string,
): Promise<LatestStageRun | null> {
  const { data, error } = await client
    .from("recipe_generation_stage_runs")
    .select("stage, status")
    .eq("job_id", jobId)
    .in("stage", UPSTREAM_STAGES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "FINALIZE_STAGE_RUNS_QUERY_FAILED",
      message: "failed to load recent recipe_generation_stage_runs rows for this job",
      stage: "finalize",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const row = data as Record<string, unknown> | null;
  if (!row) return null;
  return { stage: row.stage as RecipeJobStage, status: String(row.status) };
}
