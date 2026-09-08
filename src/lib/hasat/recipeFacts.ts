import type { Database } from "../core/db/types";

type RecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

/** Transport fields; null means unknown, never a zero or an allergen-free claim. */
export type RecipeFacts = Pick<
  RecipeRow,
  | "allergen_labels"
  | "allergens_reviewed"
  | "allergens_reviewed_at"
  | "allergens_reviewed_by"
  | "calories"
  | "protein_g"
  | "carbs_g"
  | "fat_g"
  | "fiber_g"
  | "micronutrients"
  | "nutrition_calculated_at"
  | "nutrition_source"
  | "nutrition_coverage_pct"
  | "nutrition_input_hash"
  | "nutrition_reference_version"
  | "nutrition_warnings"
>;

export const RECIPE_FACT_COLUMNS =
  "allergen_labels, allergens_reviewed, allergens_reviewed_at, allergens_reviewed_by, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients, nutrition_calculated_at, nutrition_source, nutrition_coverage_pct, nutrition_input_hash, nutrition_reference_version, nutrition_warnings";

/** Also accepts pre-T3/T4 cached records. Preserve explicit nulls, empty arrays and zero. */
export function mapRecipeFacts(row: Partial<RecipeFacts>): RecipeFacts {
  return {
    allergen_labels: row.allergen_labels ?? null,
    allergens_reviewed: row.allergens_reviewed === true,
    allergens_reviewed_at: row.allergens_reviewed_at ?? null,
    allergens_reviewed_by: row.allergens_reviewed_by ?? null,
    calories: row.calories ?? null,
    protein_g: row.protein_g ?? null,
    carbs_g: row.carbs_g ?? null,
    fat_g: row.fat_g ?? null,
    fiber_g: row.fiber_g ?? null,
    micronutrients: row.micronutrients ?? null,
    nutrition_calculated_at: row.nutrition_calculated_at ?? null,
    nutrition_source: row.nutrition_source ?? null,
    nutrition_coverage_pct: row.nutrition_coverage_pct ?? null,
    nutrition_input_hash: row.nutrition_input_hash ?? null,
    nutrition_reference_version: row.nutrition_reference_version ?? null,
    nutrition_warnings: row.nutrition_warnings ?? [],
  };
}

export const ALLERGEN_SLUGS = [
  "gluten",
  "laktoz",
  "yumurta",
  "findik-yerfistigi",
  "soya",
  "susam",
  "deniz-urunu",
] as const;
export type AllergenSlug = (typeof ALLERGEN_SLUGS)[number];
export type ReviewedAllergens =
  | { reviewState: "unreviewed"; labels: null }
  | { reviewState: "reviewed_with_labels" | "reviewed_without_labels"; labels: AllergenSlug[] };

/** Explicit public trust boundary. Raw candidate labels remain transport data only. */
export function getReviewedAllergens(row: Partial<RecipeFacts>): ReviewedAllergens {
  const labels = row.allergen_labels;
  if (
    row.allergens_reviewed !== true ||
    !row.allergens_reviewed_at ||
    !Array.isArray(labels) ||
    !labels.every((label): label is AllergenSlug =>
      ALLERGEN_SLUGS.includes(label as AllergenSlug),
    ) ||
    new Set(labels).size !== labels.length
  ) {
    return { reviewState: "unreviewed", labels: null };
  }
  return {
    reviewState: labels.length ? "reviewed_with_labels" : "reviewed_without_labels",
    labels: [...labels],
  };
}

export type NutritionState = "computed" | "partial" | "estimated" | "unavailable";

/** Readiness classification only; no calculation, formatting or UI behavior. */
export function getNutritionState(
  row: Partial<RecipeFacts> & { servings?: number | null },
): NutritionState {
  const finiteNonnegative = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (
    !finiteNonnegative(row.servings) ||
    row.servings === 0 ||
    ![row.calories, row.protein_g, row.carbs_g, row.fat_g].every(finiteNonnegative) ||
    !row.nutrition_calculated_at ||
    !row.nutrition_input_hash ||
    !row.nutrition_reference_version
  )
    return "unavailable";
  const coverage = row.nutrition_coverage_pct;
  if (!finiteNonnegative(coverage) || coverage > 100) return "unavailable";
  if (row.nutrition_source === "computed" && coverage === 100) return "computed";
  if (row.nutrition_source === "partial" && coverage > 0 && coverage < 100) return "partial";
  if (row.nutrition_source === "estimated" && coverage === 0) return "estimated";
  return "unavailable";
}
