import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { installRuntime } from "./recipeTestRuntime.mjs";
import {
  nutritionFixtures,
  allergenFixtures,
  reviewedAtFixtures,
  recipeRow,
  unavailable,
} from "./recipeFacts.fixtures.mjs";

let row = recipeRow();
let fail = false;
const requests = [];
globalThis.__recipeClient = createClient("https://example.test", "fixture-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (fail) return new Response(JSON.stringify({ message: "fixture error" }), { status: 400 });
      const data = url.pathname.endsWith("/recipes") ? row : [];
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    },
  },
});
globalThis.__recipeClient.auth.getUser = async () => ({
  data: { user: { id: "owner-1" } },
  error: null,
});
installRuntime();
const { mapRecipeFacts, getReviewedAllergens, getNutritionState, ALLERGEN_SLUGS } =
  await import("../src/lib/hasat/recipeFacts.ts");
const api = await import("../src/lib/hasat/recipes.ts");
const fetchDetail = api.fetchRecipeBySlug ?? api.fetchRecipeDetailFromNetwork;

for (const [state, facts] of Object.entries(nutritionFixtures)) {
  test(`real detail query maps ${state} nutrition and selects every fact`, async () => {
    row = recipeRow(facts);
    requests.length = 0;
    const detail = await fetchDetail(row.slug);
    assert.deepEqual(mapRecipeFacts(detail.recipe), facts);
    assert.equal(getNutritionState(detail.recipe), state);
    const query = requests.find((url) => url.pathname.endsWith("/recipes"));
    const selected = query.searchParams.get("select").split(",");
    for (const key of Object.keys(unavailable)) assert.ok(selected.includes(key), key);
    assert.equal(query.searchParams.get("slug"), "eq.fixture-recipe");
    assert.equal(query.searchParams.get("visibility"), "eq.public");
    assert.equal(query.searchParams.get("status"), "eq.published");
  });
}
for (const [state, facts] of Object.entries(allergenFixtures)) {
  test(`real detail query preserves ${state} and public trust semantics`, async () => {
    row = recipeRow(facts);
    const { recipe } = await fetchDetail(row.slug);
    assert.deepEqual(mapRecipeFacts(recipe), facts);
    const reviewed = getReviewedAllergens(recipe);
    assert.equal(reviewed.reviewState, state);
    assert.deepEqual(reviewed.labels, state === "unreviewed" ? null : facts.allergen_labels);
  });
}
test("missing legacy fields are unknown; zero and null remain distinct", async () => {
  row = recipeRow();
  for (const key of Object.keys(unavailable)) delete row[key];
  assert.deepEqual(mapRecipeFacts((await fetchDetail(row.slug)).recipe), unavailable);
  assert.equal(
    getNutritionState({ ...nutritionFixtures.computed, calories: 0, servings: 1 }),
    "computed",
  );
  assert.equal(
    getNutritionState({ ...nutritionFixtures.computed, calories: null, servings: 1 }),
    "unavailable",
  );
  assert.equal(mapRecipeFacts({ fiber_g: 0 }).fiber_g, 0);
  assert.equal(mapRecipeFacts({ fiber_g: null }).fiber_g, null);
});
test("allergen review fails closed and never confuses null with reviewed empty", () => {
  for (const delta of [
    { allergens_reviewed: false },
    { allergens_reviewed: null },
    { allergens_reviewed_at: null },
    { allergen_labels: null },
    { allergen_labels: ["milk"] },
    { allergen_labels: ["gluten", "gluten"] },
  ]) {
    assert.deepEqual(getReviewedAllergens({ ...allergenFixtures.reviewed_with_labels, ...delta }), {
      reviewState: "unreviewed",
      labels: null,
    });
  }
  assert.equal(
    getReviewedAllergens({
      ...allergenFixtures.reviewed_with_labels,
      allergen_labels: [...ALLERGEN_SLUGS],
    }).labels.length,
    7,
  );
});
test("allergen review requires a valid timezone-qualified ISO timestamp", () => {
  for (const [name, allergens_reviewed_at] of Object.entries(reviewedAtFixtures.valid)) {
    assert.equal(
      getReviewedAllergens({
        ...allergenFixtures.reviewed_with_labels,
        allergens_reviewed_at,
      }).reviewState,
      "reviewed_with_labels",
      name,
    );
  }
  for (const [name, allergens_reviewed_at] of Object.entries(reviewedAtFixtures.invalid)) {
    assert.deepEqual(
      getReviewedAllergens({
        ...allergenFixtures.reviewed_with_labels,
        allergens_reviewed_at,
      }),
      { reviewState: "unreviewed", labels: null },
      name,
    );
  }
});
test("nutrition rejects incomplete/invalid source, coverage, servings and macros", () => {
  const valid = { ...nutritionFixtures.computed, servings: 2 };
  for (const delta of [
    { servings: 0 },
    { servings: null },
    { servings: NaN },
    { calories: -1 },
    { calories: Infinity },
    { protein_g: null },
    { nutrition_source: null },
    { nutrition_source: "future" },
    { nutrition_coverage_pct: 99.5 },
    { nutrition_coverage_pct: null },
    { nutrition_input_hash: null },
    { nutrition_reference_version: null },
    { nutrition_calculated_at: null },
  ])
    assert.equal(getNutritionState({ ...valid, ...delta }), "unavailable");
  for (const coverage of [0.01, 50, 99.99])
    assert.equal(
      getNutritionState({
        ...valid,
        nutrition_source: "partial",
        nutrition_coverage_pct: coverage,
      }),
      "partial",
    );
  for (const coverage of [0, 100])
    assert.equal(
      getNutritionState({
        ...valid,
        nutrition_source: "partial",
        nutrition_coverage_pct: coverage,
      }),
      "unavailable",
    );
  assert.equal(getNutritionState({ ...valid, fiber_g: null, micronutrients: null }), "computed");
  assert.deepEqual(mapRecipeFacts({ nutrition_warnings: ["stale_reference"] }).nutrition_warnings, [
    "stale_reference",
  ]);
});
test("real detail query returns null for missing recipe and propagates query error", async () => {
  row = null;
  assert.equal(await fetchDetail("missing"), null);
  fail = true;
  await assert.rejects(fetchDetail("error"));
  fail = false;
});
