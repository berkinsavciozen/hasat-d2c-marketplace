// Synthetic contract fixtures. These do not represent human-reviewed production records.
export const unavailable = {
  allergen_labels: null,
  allergens_reviewed: false,
  allergens_reviewed_at: null,
  allergens_reviewed_by: null,
  calories: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  fiber_g: null,
  micronutrients: null,
  nutrition_calculated_at: null,
  nutrition_source: null,
  nutrition_coverage_pct: null,
  nutrition_input_hash: null,
  nutrition_reference_version: null,
  nutrition_warnings: [],
};
const macros = {
  calories: 420.5,
  protein_g: 18,
  carbs_g: 50,
  fat_g: 16,
  fiber_g: 0,
  micronutrients: { schema_version: 1, basis: "per_serving", values: { sodium_mg: 12.5 } },
  nutrition_calculated_at: "2026-09-07T00:00:00Z",
  nutrition_input_hash: "fixture-input-hash",
  nutrition_reference_version: "fixture-v1",
};
export const nutritionFixtures = {
  computed: {
    ...unavailable,
    ...macros,
    nutrition_source: "computed",
    nutrition_coverage_pct: 100,
  },
  partial: {
    ...unavailable,
    ...macros,
    nutrition_source: "partial",
    nutrition_coverage_pct: 53.25,
    nutrition_warnings: ["unmatched_ingredient"],
  },
  estimated: {
    ...unavailable,
    ...macros,
    nutrition_source: "estimated",
    nutrition_coverage_pct: 0,
    nutrition_warnings: ["estimated_quantity"],
  },
  unavailable,
};
export const allergenFixtures = {
  reviewed_with_labels: {
    ...unavailable,
    allergen_labels: ["gluten", "laktoz"],
    allergens_reviewed: true,
    allergens_reviewed_at: "2026-09-07T00:00:00Z",
    allergens_reviewed_by: "00000000-0000-4000-8000-000000000001",
  },
  reviewed_without_labels: {
    ...unavailable,
    allergen_labels: [],
    allergens_reviewed: true,
    allergens_reviewed_at: "2026-09-07T00:00:00Z",
  },
  unreviewed: { ...unavailable, allergen_labels: ["gluten"] },
};
export function recipeRow(facts = unavailable) {
  return {
    id: "recipe-1",
    slug: "fixture-recipe",
    title: "Fixture recipe",
    description: null,
    cover_photo_url: "https://example.test/cover.webp",
    servings: 2,
    prep_minutes: 10,
    cook_minutes: 20,
    rest_minutes: null,
    difficulty: null,
    cuisine: null,
    diet_tags: [],
    required_equipment: [],
    ...facts,
  };
}
