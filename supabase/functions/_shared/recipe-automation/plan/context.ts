// F2 Recipe Automation — Step 13: narrow read/RPC helpers for the Planner stage.
//
// Same restriction every other content agent in this pipeline has (writer/context.ts, qa/
// context.ts): the Planner is given ZERO tools (see plan-stage.ts — no `tools` field is ever passed
// to the agent). Every read the Planner needs — seasonal crop candidates, recent recipe mix,
// existing/near-duplicate recipes, editorial constraints — is fetched HERE, by trusted stage-runner
// TypeScript code, through the narrow single-purpose RPCs f2s04 already built for exactly this
// (`get_seasonal_crop_candidates`, `get_recent_recipe_mix`, `search_existing_recipes`), never a raw
// `crop_config`/`recipes` table scan the model itself could somehow influence. "Editorial
// constraints admin tarafından sağlanan" is simply the caller's own `RecipeBatchInput`
// (focusCrops/dietFocus/notes) — no separate RPC needed, it is passed straight through.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";

export interface SeasonalCropCandidate {
  crop: string;
  displayName: string;
  categoryGroup: string | null;
  defaultUnit: string | null;
  harvestWindowStartMonth: number | null;
  harvestWindowEndMonth: number | null;
  inSeason: boolean;
  isEdible: boolean;
  defaultPhotoUrl: string | null;
}

/** Narrow RPC helper: calls ONLY get_seasonal_crop_candidates(...). Never a raw `crop_config` scan.
 * "sezonluk aday crop'lar crop_config'den" (PROMPT 13) — this is the ENTIRE candidate universe the
 * Planner's `focusCrop` choices are validated against downstream (validate_recipe_plan_diversity's
 * DIVERSITY_CROP_NOT_IN_CONFIG). */
export async function loadSeasonalCropCandidates(
  client: SupabaseClient,
  params: { month?: number | null; categoryGroup?: string | null; onlyInSeason?: boolean; edibleOnly?: boolean; limit?: number } = {},
): Promise<SeasonalCropCandidate[]> {
  const { data, error } = await client.rpc("get_seasonal_crop_candidates", {
    p_month: params.month ?? null,
    p_category_group: params.categoryGroup ?? null,
    p_only_in_season: params.onlyInSeason ?? true,
    p_edible_only: params.edibleOnly ?? true,
    p_limit: params.limit ?? 40,
  });
  if (error) {
    throw new RecipeAutomationError({
      code: "SEASONAL_CROP_CANDIDATES_RPC_FAILED",
      message: "get_seasonal_crop_candidates RPC failed",
      stage: "plan",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    crop: String(row.crop),
    displayName: String(row.display_name),
    categoryGroup: (row.category_group as string | null) ?? null,
    defaultUnit: (row.default_unit as string | null) ?? null,
    harvestWindowStartMonth: (row.harvest_window_start_month as number | null) ?? null,
    harvestWindowEndMonth: (row.harvest_window_end_month as number | null) ?? null,
    inSeason: Boolean(row.in_season),
    isEdible: Boolean(row.is_edible),
    defaultPhotoUrl: (row.default_photo_url as string | null) ?? null,
  }));
}

export interface RecentRecipeMixEntry {
  crop: string;
  displayName: string;
  recipeCount: number;
  lastCreatedAt: string;
}

/** Narrow RPC helper: calls ONLY get_recent_recipe_mix(days, limit). "son dönemdeki tarif karışımı"
 * (PROMPT 13) — steers the Planner away from crops already covered a lot lately. */
export async function loadRecentRecipeMix(
  client: SupabaseClient,
  params: { days?: number; limit?: number } = {},
): Promise<RecentRecipeMixEntry[]> {
  const { data, error } = await client.rpc("get_recent_recipe_mix", {
    p_days: params.days ?? 30,
    p_limit: params.limit ?? 20,
  });
  if (error) {
    throw new RecipeAutomationError({
      code: "RECENT_RECIPE_MIX_RPC_FAILED",
      message: "get_recent_recipe_mix RPC failed",
      stage: "plan",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    crop: String(row.crop),
    displayName: String(row.display_name),
    recipeCount: Number(row.recipe_count),
    lastCreatedAt: String(row.last_created_at),
  }));
}

export interface ExistingRecipeSummary {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
}

/** Narrow RPC helper: calls ONLY search_existing_recipes(...). "mevcut/duplicate tarif adayları"
 * (PROMPT 13) — a recent-titles sample so the Planner has direct catalog-overlap signal in its own
 * input, ahead of (and in addition to) the deterministic find_recipe_duplicates gate
 * (validate_recipe_plan_diversity) that runs on its actual output afterward. */
export async function loadExistingRecipeSample(
  client: SupabaseClient,
  params: { limit?: number } = {},
): Promise<ExistingRecipeSummary[]> {
  const { data, error } = await client.rpc("search_existing_recipes", {
    p_query: null,
    p_crop: null,
    p_status: null,
    p_limit: params.limit ?? 30,
  });
  if (error) {
    throw new RecipeAutomationError({
      code: "EXISTING_RECIPE_SAMPLE_RPC_FAILED",
      message: "search_existing_recipes RPC failed",
      stage: "plan",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
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
