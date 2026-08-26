// F2 Recipe Automation — Step 09: narrow read helpers for the image stage.
//
// Same restriction every other stage in this pipeline sets (writer/context.ts, qa/context.ts,
// revise/context.ts): no generic Supabase/SQL tool is ever handed to a model here either — this
// stage doesn't even call a content agent with DB access, but the same "narrow single-purpose
// helpers, not a raw table read scattered through the stage runner" discipline still applies.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import type { RecipeIngredientDraft, RecipeStepDraft } from "../types.ts";

export interface ApprovedQaResult {
  qaResultId: string;
  draftId: string;
  draftVersion: number;
  recipeId: string | null;
}

/**
 * Loads the most recent `recipe_qa_results` row for this job and requires it to be the
 * QA-approved verdict this stage may act on (`decision = 'approved'` AND
 * `approved_for_imaging = true` — recipeQAResultSchema's own refine already guarantees these two
 * always agree, so checking either is equivalent; both are checked here so a future schema change
 * can't silently let one drift without this call noticing). A job only reaches the `image` stage
 * by qa-stage.ts routing it there on exactly this verdict, so a missing/non-approved result here
 * means an upstream invariant broke — reported as a `RecipeAutomationError`, not silently treated
 * as "nothing to do".
 */
export async function loadApprovedQaResult(client: SupabaseClient, jobId: string): Promise<ApprovedQaResult> {
  const { data, error } = await client
    .from("recipe_qa_results")
    .select("id, draft_id, draft_version, recipe_id, decision, approved_for_imaging")
    .eq("job_id", jobId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "IMAGE_QA_RESULT_QUERY_FAILED",
      message: "failed to load the latest recipe_qa_results row for this job",
      stage: "image",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const row = data as Record<string, unknown> | null;
  if (!row || row.decision !== "approved" || row.approved_for_imaging !== true) {
    throw new RecipeAutomationError({
      code: "IMAGE_NO_APPROVED_QA_RESULT",
      message: "job reached the image stage without an approved+approved_for_imaging QA result",
      stage: "image",
      retryable: false,
    });
  }

  return {
    qaResultId: String(row.id),
    draftId: String(row.draft_id),
    draftVersion: Number(row.draft_version),
    recipeId: (row.recipe_id as string | null) ?? null,
  };
}

export interface ImageStageDraft {
  id: string;
  title: string;
  description: string | null;
  cuisine: string | null;
  ingredients: RecipeIngredientDraft[];
  steps: RecipeStepDraft[];
}

/** Loads only the fields the image prompt builder (prompt.ts) actually needs from the exact
 * QA-approved draft version — not the full `RecipeDraftPayload` reconstruction revise/context.ts
 * does, since this stage never re-validates or re-stores a draft, only reads a few text fields. */
export async function loadDraftForImaging(
  client: SupabaseClient,
  jobId: string,
  draftId: string,
): Promise<ImageStageDraft> {
  const { data, error } = await client
    .from("recipe_drafts")
    .select("id, title, description, cuisine, ingredients, steps")
    .eq("job_id", jobId)
    .eq("id", draftId)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "IMAGE_DRAFT_QUERY_FAILED",
      message: "failed to load the QA-approved recipe_drafts row",
      stage: "image",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  const row = data as Record<string, unknown> | null;
  if (!row) {
    throw new RecipeAutomationError({
      code: "IMAGE_DRAFT_NOT_FOUND",
      message: "the recipe_drafts row a QA result named no longer exists",
      stage: "image",
      retryable: false,
    });
  }

  return {
    id: String(row.id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    cuisine: (row.cuisine as string | null) ?? null,
    ingredients: row.ingredients as RecipeIngredientDraft[],
    steps: row.steps as RecipeStepDraft[],
  };
}

export interface ExistingImageAssets {
  source: { id: string; storagePath: string; widthPx: number | null; heightPx: number | null } | null;
  hero: { id: string } | null;
  square: { id: string } | null;
}

/** Loads whatever `recipe_assets` rows already exist for this (job, draft) among the three
 * cover-photo asset types — the idempotency check this step's mandate requires ("reuse valid
 * existing source/variants for the same job+draft+asset_type and avoid another paid Gemini
 * generation"). `step`-type rows are out of scope for this stage (per-step photos are not part of
 * PROMPT 09's flow) and deliberately excluded. */
export async function loadExistingImageAssets(
  client: SupabaseClient,
  jobId: string,
  draftId: string,
): Promise<ExistingImageAssets> {
  const { data, error } = await client
    .from("recipe_assets")
    .select("id, asset_type, storage_path, width_px, height_px")
    .eq("job_id", jobId)
    .eq("draft_id", draftId)
    .in("asset_type", ["source", "hero", "square"]);

  if (error) {
    throw new RecipeAutomationError({
      code: "IMAGE_EXISTING_ASSETS_QUERY_FAILED",
      message: "failed to check for existing recipe_assets rows",
      stage: "image",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const rows = (data as Array<Record<string, unknown>>) ?? [];
  const byType = (type: string) => rows.find((r) => r.asset_type === type) ?? null;
  const sourceRow = byType("source");

  return {
    source: sourceRow
      ? {
        id: String(sourceRow.id),
        storagePath: String(sourceRow.storage_path),
        widthPx: (sourceRow.width_px as number | null) ?? null,
        heightPx: (sourceRow.height_px as number | null) ?? null,
      }
      : null,
    hero: byType("hero") ? { id: String(byType("hero")!.id) } : null,
    square: byType("square") ? { id: String(byType("square")!.id) } : null,
  };
}
