// F2 Recipe Automation — Step 07: narrow read/RPC helpers for the QA stage.
//
// Same restriction the Writer stage set (context.ts, write/): the QA agent never gets a generic
// Supabase/SQL tool (see qa-stage.ts — no `tools` field is ever passed to the agent). Every read
// the QA agent needs (current draft, duplicate candidates, prior QA history) is fetched HERE,
// before the agent call, through narrow single-purpose helpers — never a raw table read the model
// could somehow influence.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import type {
  RecipeDraftPayload,
  RecipeIngredientDraft,
  RecipeQADecision,
  RecipeQAIssue,
  RecipeStepDraft,
} from "../types.ts";

export interface CurrentDraft {
  id: string;
  version: number;
  payload: RecipeDraftPayload;
}

/**
 * Loads the highest-`version` `recipe_drafts` row for a job — "the exact current draft version"
 * PROMPT 07 asks the QA stage to resolve — and rebuilds it into the exact `RecipeDraftPayload`
 * shape (the inverse of write-stage.ts's `draftToInsertRow`), so it can be fed straight back
 * through `validateDraft` (../writer/validate-draft.ts, reused as-is — the Postgres structure/
 * crop/slug/coverage checks it runs are not Writer-specific) and the QA agent's own input.
 */
export async function loadCurrentDraft(client: SupabaseClient, jobId: string): Promise<CurrentDraft | null> {
  const { data, error } = await client
    .from("recipe_drafts")
    .select("*")
    .eq("job_id", jobId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "CURRENT_DRAFT_QUERY_FAILED",
      message: "failed to load the current recipe_drafts row",
      stage: "qa",
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
      // recipe_drafts has NO brief_id column (see the f2s03 migration) — write-stage.ts never
      // persisted it either; a draft's brief identity only survives via recipe_generation_jobs.
      // brief_id (already carried separately as `brief.briefId` alongside this payload — see
      // qa-stage.ts's agent input), never reconstructible from the draft row itself.
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
      requiredEquipment: (row.required_equipment as string[] | null) ?? null,
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

export interface DuplicateCandidate {
  id: string;
  slug: string;
  title: string;
  matchReason: string;
  status: string;
  visibility: string;
}

/** Narrow RPC helper: calls ONLY find_recipe_duplicates(title, crop, slug, limit) — never a raw
 * `recipes` table scan. Gives the QA agent "originality"/duplicate-avoidance signal ahead of its
 * own judgment call, per PROMPT 07 step 4. */
export async function loadDuplicateCandidates(
  client: SupabaseClient,
  params: { title: string; crop: string | null; slug: string; limit?: number },
): Promise<DuplicateCandidate[]> {
  const { data, error } = await client.rpc("find_recipe_duplicates", {
    p_title: params.title,
    p_crop: params.crop,
    p_slug: params.slug,
    p_limit: params.limit ?? 5,
  });
  if (error) {
    throw new RecipeAutomationError({
      code: "DUPLICATE_CANDIDATES_RPC_FAILED",
      message: "find_recipe_duplicates RPC failed",
      stage: "qa",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as DuplicateCandidate[] | null) ?? [];
}

export interface PriorQaHistoryEntry {
  draftVersion: number;
  decision: RecipeQADecision;
  overallScore: number;
  blockingIssues: RecipeQAIssue[];
  checkedAt: string;
}

/**
 * Prior QA passes for this job (across earlier draft versions from the revise loop), most recent
 * first — so the QA agent can see what was already flagged instead of re-litigating the same
 * ground on every revision. Deliberately excludes `safety_reviewed_by`/reviewer identity: the
 * agent needs the content history, never a human reviewer's PII.
 */
export async function loadPriorQaHistory(
  client: SupabaseClient,
  jobId: string,
  limit = 5,
): Promise<PriorQaHistoryEntry[]> {
  const { data, error } = await client
    .from("recipe_qa_results")
    .select("draft_version, decision, overall_score, blocking_issues, checked_at")
    .eq("job_id", jobId)
    .order("checked_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new RecipeAutomationError({
      code: "PRIOR_QA_HISTORY_QUERY_FAILED",
      message: "failed to load prior recipe_qa_results rows",
      stage: "qa",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    draftVersion: Number(row.draft_version),
    decision: row.decision as RecipeQADecision,
    overallScore: Number(row.overall_score),
    blockingIssues: (row.blocking_issues as RecipeQAIssue[] | null) ?? [],
    checkedAt: String(row.checked_at),
  }));
}
