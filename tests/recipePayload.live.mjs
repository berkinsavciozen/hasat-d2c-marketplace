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
    fields: Object.keys(unavailable).length,
    nutrition: getNutritionState(result.recipe),
    allergens: getReviewedAllergens(result.recipe).reviewState,
    steps: result.steps.length,
    ingredients: result.ingredients.length,
  }),
);
