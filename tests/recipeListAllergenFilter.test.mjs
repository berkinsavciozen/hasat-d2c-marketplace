import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { installRuntime } from "./recipeTestRuntime.mjs";

const reviewedAt = "2026-09-08T00:00:00Z";
const base = {
  id: "recipe-1",
  slug: "fixture-recipe",
  title: "Fixture recipe",
  description: null,
  cover_photo_url: "https://example.test/cover.webp",
  servings: 2,
  prep_minutes: 10,
  cook_minutes: 20,
  rest_minutes: null,
  difficulty: "kolay",
  cuisine: "Ege",
  diet_tags: ["vegan"],
  required_equipment: ["firin"],
  allergen_labels: [],
  allergens_reviewed: true,
  allergens_reviewed_at: reviewedAt,
};

let rows = [base];
const requests = [];
globalThis.__recipeClient = createClient("https://example.test", "fixture-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      return new Response(JSON.stringify(url.pathname.endsWith("/recipes") ? rows : []), {
        headers: { "Content-Type": "application/json" },
      });
    },
  },
});
globalThis.__recipeClient.auth.getUser = async () => ({ data: { user: null }, error: null });
installRuntime();

const { ALLERGEN_OPTIONS, matchesAllergenExclusion } =
  await import("../src/lib/hasat/recipeFacts.ts");
const { fetchRecipeList } = await import("../src/lib/hasat/recipes.ts");

const matching = (candidates, selected) =>
  candidates.filter((recipe) => matchesAllergenExclusion(recipe, selected));

test("inactive filter preserves the loaded list exactly", () => {
  const candidates = [
    base,
    { ...base, id: "unreviewed", allergens_reviewed: false, allergen_labels: ["gluten"] },
  ];
  assert.deepEqual(matching(candidates, []), candidates);
});

test("single and multiple selections use fail-closed AND exclusion", () => {
  const candidates = [
    { ...base, id: "empty" },
    { ...base, id: "gluten", allergen_labels: ["gluten"] },
    { ...base, id: "laktoz", allergen_labels: ["laktoz"] },
    { ...base, id: "susam", allergen_labels: ["susam"] },
  ];
  assert.deepEqual(
    matching(candidates, ["gluten"]).map(({ id }) => id),
    ["empty", "laktoz", "susam"],
  );
  assert.deepEqual(
    matching(candidates, ["gluten", "laktoz"]).map(({ id }) => id),
    ["empty", "susam"],
  );
});

test("reviewed-empty is included while every untrusted shape fails closed", () => {
  const untrusted = [
    { allergens_reviewed: false, allergen_labels: null, allergens_reviewed_at: null },
    { allergens_reviewed: false, allergen_labels: [], allergens_reviewed_at: null },
    { allergens_reviewed: false, allergen_labels: ["laktoz"], allergens_reviewed_at: null },
    { allergens_reviewed: true, allergen_labels: [], allergens_reviewed_at: null },
    { allergens_reviewed: true, allergen_labels: [], allergens_reviewed_at: "2026-09-08" },
    {
      allergens_reviewed: true,
      allergen_labels: ["future-slug"],
      allergens_reviewed_at: reviewedAt,
    },
    {
      allergens_reviewed: true,
      allergen_labels: ["susam", "susam"],
      allergens_reviewed_at: reviewedAt,
    },
  ];
  assert.equal(matchesAllergenExclusion(base, ["gluten"]), true);
  for (const candidate of untrusted)
    assert.equal(matchesAllergenExclusion(candidate, ["gluten"]), false);
});

test("allergen exclusion composes with existing equipment, diet, duration and availability filters", () => {
  const candidates = [
    base,
    { ...base, id: "wrong-equipment", required_equipment: ["ocak"] },
    { ...base, id: "wrong-diet", diet_tags: ["vejetaryen"] },
    { ...base, id: "contains-gluten", allergen_labels: ["gluten"] },
    { ...base, id: "unreviewed", allergens_reviewed: false },
  ].map((recipe, index) => ({ ...recipe, availableCount: index === 0 ? 1 : 0 }));
  const result = candidates.filter(
    (recipe) =>
      recipe.required_equipment.includes("firin") &&
      recipe.diet_tags.includes("vegan") &&
      recipe.prep_minutes + recipe.cook_minutes <= 30 &&
      recipe.availableCount >= 1 &&
      matchesAllergenExclusion(recipe, ["gluten"]),
  );
  assert.deepEqual(
    result.map(({ id }) => id),
    ["recipe-1"],
  );
});

test("list payload selects only the three allergen fields and preserves null/false/empty", async () => {
  rows = [
    base,
    {
      ...base,
      id: "unknown",
      allergen_labels: null,
      allergens_reviewed: false,
      allergens_reviewed_at: null,
    },
  ];
  requests.length = 0;
  const result = await fetchRecipeList();
  assert.deepEqual(
    result.map(({ allergen_labels, allergens_reviewed, allergens_reviewed_at }) => ({
      allergen_labels,
      allergens_reviewed,
      allergens_reviewed_at,
    })),
    [
      { allergen_labels: [], allergens_reviewed: true, allergens_reviewed_at: reviewedAt },
      { allergen_labels: null, allergens_reviewed: false, allergens_reviewed_at: null },
    ],
  );
  const query = requests.find((url) => url.pathname.endsWith("/recipes"));
  const selected = query.searchParams.get("select").split(",");
  for (const field of ["allergen_labels", "allergens_reviewed", "allergens_reviewed_at"])
    assert.ok(selected.includes(field), field);
  for (const forbidden of ["allergens_reviewed_by", "calories", "protein_g", "carbs_g", "fat_g"])
    assert.equal(selected.includes(forbidden), false, forbidden);
});

test("controlled options and route source preserve clear, chip, empty-state and a11y contracts", async () => {
  assert.deepEqual(
    ALLERGEN_OPTIONS.map(({ slug }) => slug),
    [
      "gluten",
      "laktoz",
      "yumurta",
      "findik-yerfistigi",
      "agac-kuruyemisi",
      "soya",
      "susam",
      "deniz-urunu",
      "hardal",
      "kereviz",
      "sulfit",
      "lupin",
    ],
  );
  const route = await readFile(
    new URL("../src/routes/tarifler.index.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /Şunları içermeyenler/);
  assert.match(route, /role="group" aria-labelledby="allergen-filter-heading"/);
  assert.match(route, /htmlFor=\{checkboxId\}/);
  assert.match(route, /onCheckedChange=\{\(\) => toggleAllergen\(slug\)\}/);
  assert.match(route, /aria-label=\{label\}/);
  assert.match(route, /min-h-\[44px\]/);
  assert.match(route, /focus-visible:ring-2/);
  assert.match(route, /aria-label=\{`\$\{ALLERGEN_LABELS\[slug\]\} filtresini kaldır`\}/);
  assert.match(route, /onClick=\{\(\) => setExcludedAllergens\(\[\]\)\}/);
  assert.doesNotMatch(route, /setEquipment\(\[\]\).*Tümünü temizle/s);
  assert.match(route, /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(
    route,
    /Bu seçimlerle eşleşen, alerjen bilgisi doğrulanmış tarif bulunamadı\. Doğrulanmamış alerjen bilgisine sahip tarifler bu filtrede gösterilmez\./,
  );
  assert.match(
    route,
    /\{excludedAllergens\.length > 0\s+\? "Bu seçimlerle[\s\S]+?: onlyWithAvailableIngredient/,
  );
});
