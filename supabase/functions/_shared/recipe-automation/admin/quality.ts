// T10 — Admin recipe data-quality overview + edit/approve actions.
//
// Backs the `admin-recipe-quality` Edge Function. All real DB access lives here (same
// "index.ts is a thin HTTP shell, admin/*.ts does the work" convention as list-jobs.ts/
// plan-review.ts/job-detail.ts) so it stays unit-testable without an HTTP layer.
//
// Every write here goes through one of the 3 service_role-only RPCs added by
// 20260911140000_t10_admin_recipe_quality_overview.sql (admin_update_recipe_allergens/
// admin_update_recipe_facts/admin_update_ingredient_nutrition) — this module never writes
// `recipes`/`recipe_ingredients` directly, so the RPCs' own validation (allergen taxonomy,
// equipment taxonomy, recipe_ingredients' native CHECK/FK constraints) is the only place that
// logic lives, and PostgREST-level grants stay exactly as narrow as those migrations left them.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";

// ---------------------------------------------------------------------------
// List (admin_recipe_quality_overview)
// ---------------------------------------------------------------------------

export interface RecipeQualityListItem {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  createdAt: string;
  hasEquipment: boolean;
  nutritionComplete: boolean;
  nutritionSource: string | null;
  nutritionCoveragePct: number | null;
  nutritionReferenceVersion: string | null;
  allergensReviewedState: boolean;
  allergensReviewed: boolean;
  allergenLabels: string[] | null;
  ingredientCount: number;
  unresolvedIngredientCount: number;
}

export interface ListRecipeQualityParams {
  /** Only rows missing equipment, missing complete nutrition, or with an unreviewed/unresolved gap. */
  onlyIncomplete?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListRecipeQualityResult {
  recipes: RecipeQualityListItem[];
  total: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface QualityOverviewRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  created_at: string;
  has_equipment: boolean;
  nutrition_complete: boolean;
  nutrition_source: string | null;
  nutrition_coverage_pct: number | string | null;
  nutrition_reference_version: string | null;
  allergens_reviewed_state: boolean;
  allergens_reviewed: boolean;
  allergen_labels: string[] | null;
  ingredient_count: number;
  unresolved_ingredient_count: number;
}

function mapQualityRow(r: QualityOverviewRow): RecipeQualityListItem {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    visibility: r.visibility,
    createdAt: r.created_at,
    hasEquipment: r.has_equipment,
    nutritionComplete: r.nutrition_complete,
    nutritionSource: r.nutrition_source,
    nutritionCoveragePct: r.nutrition_coverage_pct == null ? null : Number(r.nutrition_coverage_pct),
    nutritionReferenceVersion: r.nutrition_reference_version,
    allergensReviewedState: r.allergens_reviewed_state,
    allergensReviewed: r.allergens_reviewed,
    allergenLabels: r.allergen_labels,
    ingredientCount: r.ingredient_count,
    unresolvedIngredientCount: r.unresolved_ingredient_count,
  };
}

export async function listRecipeQuality(
  client: SupabaseClient,
  params: ListRecipeQualityParams = {},
): Promise<ListRecipeQualityResult> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = client
    .from("admin_recipe_quality_overview")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.onlyIncomplete) {
    // PostgREST `or` filter — same shape as gaps this overview is meant to surface: missing
    // equipment info, incomplete nutrition, an unreviewed allergen state, or an unresolved
    // ingredient. `.or()` needs one comma-joined expression string.
    query = query.or(
      "has_equipment.eq.false,nutrition_complete.eq.false,allergens_reviewed.eq.false,unresolved_ingredient_count.gt.0",
    );
  }

  const { data, error, count } = await query;
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_RECIPE_QUALITY_LIST_QUERY_FAILED",
      message: "failed to list admin_recipe_quality_overview",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  return {
    recipes: ((data ?? []) as QualityOverviewRow[]).map(mapQualityRow),
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Detail — one recipe's full ingredient list + allergen/equipment/diet fields
// ---------------------------------------------------------------------------

export interface RecipeQualityIngredient {
  id: string;
  sortOrder: number;
  crop: string | null;
  freeTextName: string | null;
  quantity: number | null;
  unit: string | null;
  nutritionFoodKey: string | null;
  nutritionExclusionReason: string | null;
}

export interface NutritionFoodKeyOption {
  foodKey: string;
  displayName: string;
}

export interface RecipeQualityDetail {
  /** Full ingredient_nutrition_reference food_key list (43 rows at last count) — anon/authenticated
   * have no SELECT grant on that table (locked down alongside crop_nutrition, see T4-A/F0-24), so
   * the admin panel's nutrition_food_key autocomplete has to get its options from here rather than
   * querying it directly. */
  nutritionFoodKeyOptions: NutritionFoodKeyOption[];
  recipe: {
    id: string;
    slug: string;
    title: string;
    servings: number | null;
    allergenLabels: string[] | null;
    allergensReviewed: boolean;
    allergensReviewedAt: string | null;
    requiredEquipment: string[] | null;
    dietTags: string[];
    nutritionSource: string | null;
    nutritionCoveragePct: number | null;
    nutritionReferenceVersion: string | null;
    nutritionCalculatedAt: string | null;
    nutritionWarnings: string[];
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
  };
  ingredients: RecipeQualityIngredient[];
}

interface RecipeDetailRow {
  id: string;
  slug: string;
  title: string;
  servings: number | null;
  allergen_labels: string[] | null;
  allergens_reviewed: boolean;
  allergens_reviewed_at: string | null;
  required_equipment: string[] | null;
  diet_tags: string[];
  nutrition_source: string | null;
  nutrition_coverage_pct: number | string | null;
  nutrition_reference_version: string | null;
  nutrition_calculated_at: string | null;
  nutrition_warnings: string[];
  calories: number | string | null;
  protein_g: number | string | null;
  carbs_g: number | string | null;
  fat_g: number | string | null;
  fiber_g: number | string | null;
}

interface IngredientRow {
  id: string;
  sort_order: number;
  crop: string | null;
  free_text_name: string | null;
  quantity: number | string | null;
  unit: string | null;
  nutrition_food_key: string | null;
  nutrition_exclusion_reason: string | null;
}

const numOrNull = (v: number | string | null): number | null => (v == null ? null : Number(v));

export async function getRecipeQualityDetail(
  client: SupabaseClient,
  recipeId: string,
): Promise<RecipeQualityDetail | null> {
  const { data: recipe, error: recipeError } = await client
    .from("recipes")
    .select(
      "id, slug, title, servings, allergen_labels, allergens_reviewed, allergens_reviewed_at, " +
        "required_equipment, diet_tags, nutrition_source, nutrition_coverage_pct, " +
        "nutrition_reference_version, nutrition_calculated_at, nutrition_warnings, calories, " +
        "protein_g, carbs_g, fat_g, fiber_g",
    )
    .eq("id", recipeId)
    .maybeSingle();
  if (recipeError) {
    throw new RecipeAutomationError({
      code: "ADMIN_RECIPE_QUALITY_DETAIL_QUERY_FAILED",
      message: "failed to load recipe for quality detail",
      retryable: true,
      details: { pgCode: (recipeError as { code?: string }).code },
    });
  }
  if (!recipe) return null;
  const r = recipe as RecipeDetailRow;

  const { data: ingredients, error: ingredientsError } = await client
    .from("recipe_ingredients")
    .select("id, sort_order, crop, free_text_name, quantity, unit, nutrition_food_key, nutrition_exclusion_reason")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });
  if (ingredientsError) {
    throw new RecipeAutomationError({
      code: "ADMIN_RECIPE_QUALITY_DETAIL_INGREDIENTS_QUERY_FAILED",
      message: "failed to load recipe_ingredients for quality detail",
      retryable: true,
      details: { pgCode: (ingredientsError as { code?: string }).code },
    });
  }

  const { data: foodKeys, error: foodKeysError } = await client
    .from("ingredient_nutrition_reference")
    .select("food_key, display_name")
    .order("display_name", { ascending: true });
  if (foodKeysError) {
    throw new RecipeAutomationError({
      code: "ADMIN_RECIPE_QUALITY_DETAIL_FOOD_KEYS_QUERY_FAILED",
      message: "failed to load ingredient_nutrition_reference for quality detail",
      retryable: true,
      details: { pgCode: (foodKeysError as { code?: string }).code },
    });
  }

  return {
    nutritionFoodKeyOptions: ((foodKeys ?? []) as Array<{ food_key: string; display_name: string }>).map((f) => ({
      foodKey: f.food_key,
      displayName: f.display_name,
    })),
    recipe: {
      id: r.id,
      slug: r.slug,
      title: r.title,
      servings: r.servings,
      allergenLabels: r.allergen_labels,
      allergensReviewed: r.allergens_reviewed,
      allergensReviewedAt: r.allergens_reviewed_at,
      requiredEquipment: r.required_equipment,
      dietTags: r.diet_tags,
      nutritionSource: r.nutrition_source,
      nutritionCoveragePct: numOrNull(r.nutrition_coverage_pct),
      nutritionReferenceVersion: r.nutrition_reference_version,
      nutritionCalculatedAt: r.nutrition_calculated_at,
      nutritionWarnings: r.nutrition_warnings ?? [],
      calories: numOrNull(r.calories),
      proteinG: numOrNull(r.protein_g),
      carbsG: numOrNull(r.carbs_g),
      fatG: numOrNull(r.fat_g),
      fiberG: numOrNull(r.fiber_g),
    },
    ingredients: ((ingredients ?? []) as IngredientRow[]).map((i) => ({
      id: i.id,
      sortOrder: i.sort_order,
      crop: i.crop,
      freeTextName: i.free_text_name,
      quantity: numOrNull(i.quantity),
      unit: i.unit,
      nutritionFoodKey: i.nutrition_food_key,
      nutritionExclusionReason: i.nutrition_exclusion_reason,
    })),
  };
}

// ---------------------------------------------------------------------------
// Writes — thin wrappers over the 3 RPCs. A Postgres error raised inside the RPC (our own
// validation, or a native CHECK/FK violation) is classified from its sqlstate/message prefix so
// the Edge Function layer can map it to a clean 4xx instead of a bare 500.
// ---------------------------------------------------------------------------

export type QualityWriteResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; code: string; message: string };

function classifyRpcError(error: { code?: string; message?: string }, notFoundPrefix: string): QualityWriteResult {
  const message = error.message ?? "unknown error";
  const pgCode = error.code;

  // Our own RPCs' `raise exception 'CODE: message', ...` — supabase-js surfaces the raised text
  // verbatim in error.message.
  const customCodeMatch = message.match(/^([A-Z][A-Z0-9_]*)/);
  const customCode = customCodeMatch?.[1];
  if (customCode?.startsWith(notFoundPrefix)) {
    return { ok: false, status: 404, code: customCode, message };
  }
  if (customCode?.startsWith("ADMIN_UPDATE_")) {
    return { ok: false, status: 400, code: customCode, message };
  }
  // recipe_ingredients' own native constraints — 23503 foreign_key_violation (bad
  // nutrition_food_key), 23514 check_violation (name-present / mutual-exclusion / quantity > 0).
  if (pgCode === "23503" || pgCode === "23514") {
    return { ok: false, status: 400, code: pgCode, message };
  }
  return { ok: false, status: 400, code: pgCode ?? "UNKNOWN", message };
}

export async function updateRecipeAllergens(
  client: SupabaseClient,
  params: { recipeId: string; allergenLabels: string[]; reviewed: boolean },
): Promise<QualityWriteResult> {
  const { error } = await client.rpc("admin_update_recipe_allergens", {
    p_recipe_id: params.recipeId,
    p_allergen_labels: params.allergenLabels,
    p_reviewed: params.reviewed,
  });
  if (error) return classifyRpcError(error, "ADMIN_UPDATE_ALLERGENS_NOT_FOUND");
  return { ok: true };
}

export async function updateRecipeFacts(
  client: SupabaseClient,
  params: { recipeId: string; requiredEquipment: string[]; dietTags: string[] },
): Promise<QualityWriteResult> {
  const { error } = await client.rpc("admin_update_recipe_facts", {
    p_recipe_id: params.recipeId,
    p_required_equipment: params.requiredEquipment,
    p_diet_tags: params.dietTags,
  });
  if (error) return classifyRpcError(error, "ADMIN_UPDATE_FACTS_NOT_FOUND");
  return { ok: true };
}

export async function updateIngredientNutrition(
  client: SupabaseClient,
  params: {
    ingredientId: string;
    crop: string | null;
    freeTextName: string | null;
    quantity: number | null;
    unit: string | null;
    nutritionFoodKey: string | null;
    nutritionExclusionReason: string | null;
  },
): Promise<QualityWriteResult> {
  const { error } = await client.rpc("admin_update_ingredient_nutrition", {
    p_ingredient_id: params.ingredientId,
    p_crop: params.crop,
    p_free_text_name: params.freeTextName,
    p_quantity: params.quantity,
    p_unit: params.unit,
    p_nutrition_food_key: params.nutritionFoodKey,
    p_nutrition_exclusion_reason: params.nutritionExclusionReason,
  });
  if (error) return classifyRpcError(error, "ADMIN_UPDATE_INGREDIENT_NOT_FOUND");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Recalculate — deliberately a SEPARATE explicit step from updateIngredientNutrition (see the
// T10 migration header): calls calculate_recipe_nutrition directly, always, regardless of
// whether recipe_ingredients' own T4-B trigger already ran it as a side effect of the last
// ingredient edit. Idempotent (calculate_recipe_nutrition is a pure function of current state),
// so calling it "again" here is always safe.
// ---------------------------------------------------------------------------

export interface RecalculateNutritionResult {
  ok: boolean;
  notFound?: boolean;
  nutritionSource: string | null;
  nutritionCoveragePct: number | null;
  nutritionWarnings: string[];
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  nutritionCalculatedAt: string | null;
}

export async function recalculateNutrition(
  client: SupabaseClient,
  recipeId: string,
): Promise<RecalculateNutritionResult | null> {
  const { error: rpcError } = await client.rpc("calculate_recipe_nutrition", { p_recipe_id: recipeId });
  if (rpcError) {
    throw new RecipeAutomationError({
      code: "ADMIN_RECIPE_QUALITY_RECALCULATE_FAILED",
      message: "calculate_recipe_nutrition failed",
      retryable: true,
      details: { pgCode: (rpcError as { code?: string }).code, pgMessage: (rpcError as { message?: string }).message },
    });
  }

  const { data, error } = await client
    .from("recipes")
    .select("nutrition_source, nutrition_coverage_pct, nutrition_warnings, calories, protein_g, carbs_g, fat_g, fiber_g, nutrition_calculated_at")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_RECIPE_QUALITY_RECALCULATE_REREAD_FAILED",
      message: "failed to re-read recipe after recalculation",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (!data) return null;

  const r = data as RecipeDetailRow;
  return {
    ok: true,
    nutritionSource: r.nutrition_source,
    nutritionCoveragePct: numOrNull(r.nutrition_coverage_pct),
    nutritionWarnings: r.nutrition_warnings ?? [],
    calories: numOrNull(r.calories),
    proteinG: numOrNull(r.protein_g),
    carbsG: numOrNull(r.carbs_g),
    fatG: numOrNull(r.fat_g),
    fiberG: numOrNull(r.fiber_g),
    nutritionCalculatedAt: r.nutrition_calculated_at,
  };
}
