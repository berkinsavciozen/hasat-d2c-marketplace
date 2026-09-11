// F2 Recipe Automation — admin plan guidance: read-only "what's already in the catalog for this
// crop" + "is this working title a likely duplicate" signal for the admin dashboard, surfaced
// BEFORE a brief is ever sent to the Writer.
//
// Every read here reuses a pipeline RPC that already exists and is already called from inside an
// agent stage — never a new RPC, never a raw table scan the admin dashboard didn't have before:
//   - `search_existing_recipes` is the SAME RPC ../plan/context.ts's `loadExistingRecipeSample`
//     wraps for the Planner's own generic (crop-less) catalog-overlap sample. Here it is called
//     crop-scoped and status-scoped to 'published' instead — a different, additive parameterization
//     of the identical RPC, not a new one, needed because "bu crop icin katalogda zaten ne var"
//     (admin-facing, per selected focusCrop) is a different question than "genel bir ornek" (the
//     Planner's own unscoped sample, left completely untouched below).
//   - `get_recent_recipe_mix` is reused as-is via `loadRecentRecipeMix` (../plan/context.ts) — the
//     exact same call, same default days/limit, the Planner already makes.
//   - `find_recipe_duplicates` is the SAME RPC the QA stage already calls (../qa/context.ts's
//     `loadDuplicateCandidates`) ahead of drafting; called here directly (rather than through that
//     helper) only because the QA-stage helper's `slug` parameter is required — QA always has a
//     real generated slug (../writer/slug.ts) by the time it runs, but an admin editing a
//     pre-Writer brief never does, so this module passes `p_slug: null` explicitly instead of
//     coercing an empty string into that parameter.
//
// No new table, no new RPC, no new write path — this module never calls `.insert()`/`.update()`.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import { loadRecentRecipeMix, type ExistingRecipeSummary, type RecentRecipeMixEntry } from "../plan/context.ts";

const MAX_FOCUS_CROPS = 5;
const EXISTING_PER_CROP_LIMIT = 10;
const DUPLICATE_LIMIT = 5;

export interface ExistingRecipesForCrop {
  crop: string;
  recipes: ExistingRecipeSummary[];
}

export interface CatalogGuidanceResult {
  existingByCrop: ExistingRecipesForCrop[];
  recentMix: RecentRecipeMixEntry[];
}

/** Narrow RPC helper: calls ONLY search_existing_recipes(...), crop- and 'published'-status-scoped
 * — see file header for why this is an additive parameterization of the same RPC
 * loadExistingRecipeSample already wraps, not a new one. */
async function loadPublishedRecipesForCrop(
  client: SupabaseClient,
  crop: string,
  limit: number,
): Promise<ExistingRecipeSummary[]> {
  const { data, error } = await client.rpc("search_existing_recipes", {
    p_query: null,
    p_crop: crop,
    p_status: "published",
    p_limit: limit,
  });
  if (error) {
    throw new RecipeAutomationError({
      code: "PLAN_GUIDANCE_EXISTING_RECIPES_RPC_FAILED",
      message: "search_existing_recipes RPC failed",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code, crop },
    });
  }
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    status: String(row.status),
    createdAt: String(row.created_at),
  }));
}

/** "Katalogda Zaten Var" panel data: published recipes already on the platform for each selected
 * focusCrop, plus the Planner's own recent-mix signal (unfiltered — the admin sees the same
 * crop-coverage picture the Planner itself is steered by). `focusCrops` is capped and de-duped
 * defensively; an empty/missing list returns an empty `existingByCrop` (never an error — a batch
 * with no focus crop chosen yet simply has nothing crop-scoped to show). */
export async function getCatalogGuidance(
  client: SupabaseClient,
  params: { focusCrops?: string[] | null },
): Promise<CatalogGuidanceResult> {
  const focusCrops = [
    ...new Set((params.focusCrops ?? []).map((c) => c.trim()).filter(Boolean)),
  ].slice(0, MAX_FOCUS_CROPS);

  const [existingByCrop, recentMix] = await Promise.all([
    Promise.all(focusCrops.map(async (crop) => ({
      crop,
      recipes: await loadPublishedRecipesForCrop(client, crop, EXISTING_PER_CROP_LIMIT),
    }))),
    loadRecentRecipeMix(client, { days: 30, limit: 20 }),
  ]);

  return { existingByCrop, recentMix };
}

export interface DuplicateCandidate {
  id: string;
  slug: string;
  title: string;
  matchReason: string;
  status: string;
  visibility: string;
}

/** "Benzerlik Kontrol Et" button: a live find_recipe_duplicates(title, crop, slug=null, limit)
 * call against the admin's IN-PROGRESS edits (workingTitle/focusCrop), run BEFORE the brief is
 * ever dispatched to the Writer. Same RPC, same match_reason vocabulary
 * (exact_slug/exact_title/title_word_overlap/same_crop_and_title_word) the QA stage already
 * surfaces after the fact — this just moves that signal earlier, for a human, on demand. */
export async function checkTitleDuplicates(
  client: SupabaseClient,
  params: { workingTitle: string; focusCrop?: string | null; limit?: number },
): Promise<DuplicateCandidate[]> {
  const title = params.workingTitle.trim();
  if (!title) return [];

  const { data, error } = await client.rpc("find_recipe_duplicates", {
    p_title: title,
    p_crop: params.focusCrop?.trim() || null,
    p_slug: null,
    p_limit: params.limit ?? DUPLICATE_LIMIT,
  });
  if (error) {
    throw new RecipeAutomationError({
      code: "PLAN_GUIDANCE_DUPLICATE_CHECK_RPC_FAILED",
      message: "find_recipe_duplicates RPC failed",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    matchReason: String(row.match_reason),
    status: String(row.status),
    visibility: String(row.visibility),
  }));
}
