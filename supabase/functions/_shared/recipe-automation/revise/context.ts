// F2 Recipe Automation — Step 08: narrow read helpers for the revise stage.
//
// Same restriction every other stage in this pipeline sets (writer/context.ts, qa/context.ts): the
// Reviser agent never gets a generic Supabase/SQL tool (see revise-stage.ts — no `tools` field is
// ever passed to the agent). Every read the Reviser needs happens HERE, before the agent call,
// through narrow single-purpose helpers.
//
// Deliberately NOT reusing `../qa/context.ts`'s `loadCurrentDraft()` (highest-`version`
// `recipe_drafts` row for a job): that query is correct for QA, which never creates new draft
// rows, so "highest version" is always the one QA itself needs to look at. This stage DOES create
// a new draft row as its own output — if a prior revise attempt already stored the next version
// and then crashed before advancing the job (still claimable at `revise`), "highest version" on a
// retry would resolve to that not-yet-QA'd draft instead of the one this run is actually meant to
// revise. The robust, version-agnostic anchor is the LATEST `recipe_qa_results` row for the job
// (`loadLatestQaResult` below) — the exact verdict that routed this job to `revise` — and the
// EXACT draft version it names (`loadDraftByVersion`), never "whatever is currently highest".
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import type {
  RecipeDraftPayload,
  RecipeIngredientDraft,
  RecipeQADecision,
  RecipeQAIssue,
  RecipeSafetyReview,
  RecipeStepDraft,
} from "../types.ts";

export interface LatestQaResult {
  id: string;
  draftId: string;
  draftVersion: number;
  decision: RecipeQADecision;
  blockingIssues: RecipeQAIssue[];
  nonBlockingSuggestions: RecipeQAIssue[];
  safetyReview: RecipeSafetyReview;
}

/**
 * Loads the most recent `recipe_qa_results` row for this job (by `checked_at`, most recent first)
 * — the QA verdict that routed this job to `revise`, whatever draft version it targeted. Narrow by
 * design: this is the only field set the Reviser agent needs (see revise-stage.ts's
 * `runReviserAgent` — it is handed `blockingIssues` only, per PROMPT 08's "structured QA blocking
 * issues only" input requirement, never the full QA result). Returns null when no QA result exists
 * for this job at all — an upstream invariant violation (a job can only reach `revise` from `qa`,
 * which never routes here without storing a result first), handled by the caller the same way
 * `qa/qa-stage.ts` handles a missing current draft.
 */
export async function loadLatestQaResult(client: SupabaseClient, jobId: string): Promise<LatestQaResult | null> {
  const { data, error } = await client
    .from("recipe_qa_results")
    .select("id, draft_id, draft_version, decision, blocking_issues, non_blocking_suggestions, safety_review")
    .eq("job_id", jobId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "REVISE_QA_RESULT_QUERY_FAILED",
      message: "failed to load the latest recipe_qa_results row for this job",
      stage: "revise",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    draftId: String(row.draft_id),
    draftVersion: Number(row.draft_version),
    decision: row.decision as RecipeQADecision,
    blockingIssues: (row.blocking_issues as RecipeQAIssue[] | null) ?? [],
    nonBlockingSuggestions: (row.non_blocking_suggestions as RecipeQAIssue[] | null) ?? [],
    safetyReview: row.safety_review as RecipeSafetyReview,
  };
}

export interface DraftAtVersion {
  id: string;
  version: number;
  payload: RecipeDraftPayload;
}

/**
 * Loads the EXACT `recipe_drafts` row at `(job_id, version)` — the specific draft a
 * `recipe_qa_results` row named, not "whatever the current highest version is" (see this module's
 * header for why that distinction matters here). Rebuilds it into the exact `RecipeDraftPayload`
 * shape, the inverse of write-stage.ts's `draftToInsertRow` — same reconstruction `qa/context.ts`'s
 * `loadCurrentDraft` performs, just keyed by an exact version instead of "highest".
 */
export async function loadDraftByVersion(
  client: SupabaseClient,
  jobId: string,
  version: number,
): Promise<DraftAtVersion | null> {
  const { data, error } = await client
    .from("recipe_drafts")
    .select("*")
    .eq("job_id", jobId)
    .eq("version", version)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "REVISE_DRAFT_QUERY_FAILED",
      message: "failed to load the recipe_drafts row a QA result named",
      stage: "revise",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    version: Number(row.version),
    payload: {
      jobId,
      // recipe_drafts has NO brief_id column (see the f2s03 migration) — never persisted by
      // write-stage.ts or revise-stage.ts either; a draft's brief identity only survives via
      // recipe_generation_jobs.brief_id (carried separately as `brief.briefId`).
      briefId: null,
      title: String(row.title),
      description: (row.description as string | null) ?? null,
      coverPhotoUrl: (row.cover_photo_url as string | null) ?? null,
      servings: (row.servings as number | null) ?? null,
      prepMinutes: (row.prep_minutes as number | null) ?? null,
      cookMinutes: (row.cook_minutes as number | null) ?? null,
      restMinutes: (row.rest_minutes as number | null) ?? null,
      difficulty: (row.difficulty as RecipeDraftPayload["difficulty"]) ?? null,
      cuisine: (row.cuisine as string | null) ?? null,
      dietTags: Array.isArray(row.diet_tags) ? (row.diet_tags as string[]) : [],
      allergenLabels: (row.allergen_labels as string[] | null) ?? null,
      requiredEquipment: (row.required_equipment as RecipeDraftPayload["requiredEquipment"]) ?? null,
      sourceType: row.source_type as RecipeDraftPayload["sourceType"],
      authorType: row.author_type as RecipeDraftPayload["authorType"],
      visibility: row.visibility as RecipeDraftPayload["visibility"],
      ownerId: (row.owner_id as string | null) ?? null,
      extractionConfidence: (row.extraction_confidence as number | null) ?? null,
      ingredients: row.ingredients as RecipeIngredientDraft[],
      steps: row.steps as RecipeStepDraft[],
    },
  };
}
