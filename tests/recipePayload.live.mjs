// Read-only anon smoke test. Uses local public client configuration; never writes data.
import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { installRuntime } from "./recipeTestRuntime.mjs";
import { unavailable } from "./recipeFacts.fixtures.mjs";
loadEnvFile(new URL("../.env", import.meta.url));
const url = process.env.VITE_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, "efuqpiaavrzimvstpdpm.supabase.co");
globalThis.__recipeClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
installRuntime();
const api = await import("../src/lib/hasat/recipes.ts");
const { getNutritionState, getReviewedAllergens } = await import("../src/lib/hasat/recipeFacts.ts");
const list = await api.fetchRecipeList();
assert.ok(list.length, "Need a public recipe for the list payload smoke test");
for (const field of ["allergen_labels", "allergens_reviewed", "allergens_reviewed_at"])
  assert.notEqual(list[0][field], undefined, field);
assert.equal("allergens_reviewed_by" in list[0], false);
assert.equal("calories" in list[0], false);
const { data, error } = await globalThis.__recipeClient
  .from("recipes")
  .select("slug")
  .eq("visibility", "public")
  .eq("status", "published")
  .limit(1);
if (error) throw new Error(error.message);
assert.ok(data.length, "Need a public recipe for the read-only smoke test");
const fetchDetail = api.fetchRecipeBySlug ?? api.fetchRecipeDetailFromNetwork;
const result = await fetchDetail(data[0].slug);
assert.ok(result);
for (const field of Object.keys(unavailable))
  assert.notEqual(result.recipe[field], undefined, field);
console.log(
  JSON.stringify({
    mode: "read-only anonymous actual detail query",
    listFields: ["allergen_labels", "allergens_reviewed", "allergens_reviewed_at"],
    fields: Object.keys(unavailable).length,
    nutrition: getNutritionState(result.recipe),
    allergens: getReviewedAllergens(result.recipe).reviewState,
    steps: result.steps.length,
    ingredients: result.ingredients.length,
  }),
);
