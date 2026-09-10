import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { installRuntime } from "./recipeTestRuntime.mjs";
import { allergenFixtures, nutritionFixtures } from "./recipeFacts.fixtures.mjs";

installRuntime();
const {
  buildAllergenPresentation,
  buildNutritionPresentation,
  CONTROLLED_ALLERGEN_LABELS,
  formatNutritionNumber,
  scaleNutrition,
  toNutritionInformation,
} = await import("../src/lib/hasat/recipeDetailPresentation.ts");

const withServings = (facts, servings = 4) => ({ ...facts, servings });

test("computed, partial low/mid/99.5, estimated and unavailable states follow the freeze", () => {
  const computed = buildNutritionPresentation(withServings(nutritionFixtures.computed));
  assert.equal(computed.state, "computed");
  assert.equal(computed.coveragePct, 100);
  assert.equal(computed.explanation, "Malzemelerin tamamı referans verilerle hesaplandı.");
  assert.equal(
    buildNutritionPresentation(
      withServings({ ...nutritionFixtures.computed, nutrition_warnings: ["stale_reference"] }),
    ).state,
    "computed",
  );

  for (const [coverage, displayed] of [
    [0.25, 0],
    [53.25, 53],
    [99.5, 99],
  ]) {
    const partial = buildNutritionPresentation(
      withServings({ ...nutritionFixtures.partial, nutrition_coverage_pct: coverage }),
    );
    assert.equal(partial.state, "partial");
    assert.equal(partial.coveragePct, displayed);
    assert.match(partial.explanation, new RegExp(`%${displayed}\\b`));
    assert.match(partial.explanation, /kalan kısmı tahminidir/);
  }

  const estimated = buildNutritionPresentation(withServings(nutritionFixtures.estimated));
  assert.equal(estimated.state, "estimated");
  assert.equal(estimated.coveragePct, 0);
  assert.match(estimated.explanation, /tamamı tahminidir/);

  assert.deepEqual(buildNutritionPresentation(withServings(nutritionFixtures.unavailable)), {
    state: "unavailable",
    message: "Besin bilgisi henüz hazır değil.",
  });
});

test("fiber null, real zero, invalid servings and invalid optional fiber stay distinct", () => {
  const fiberUnknown = buildNutritionPresentation(
    withServings({ ...nutritionFixtures.computed, fiber_g: null }),
  );
  assert.equal(fiberUnknown.state, "computed");
  assert.equal(fiberUnknown.perServing.fiberG, null);

  const zeros = buildNutritionPresentation(
    withServings({
      ...nutritionFixtures.computed,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
    }),
  );
  assert.deepEqual(zeros.perServing, {
    caloriesKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
  });

  for (const servings of [null, 0, -1, Number.NaN])
    assert.equal(
      buildNutritionPresentation(withServings(nutritionFixtures.computed, servings)).state,
      "unavailable",
    );
  assert.equal(
    buildNutritionPresentation(withServings({ ...nutritionFixtures.computed, fiber_g: -1 })).state,
    "unavailable",
  );
});

test("Turkish display formatting has at most one decimal and handles long values", () => {
  assert.equal(formatNutritionNumber(420.56), "420,6");
  assert.equal(formatNutritionNumber(0), "0");
  assert.equal(formatNutritionNumber(1234567.89), "1.234.567,9");
});

test("one serving stays stable and N-serving totals only multiply per-serving values", () => {
  const model = buildNutritionPresentation(withServings(nutritionFixtures.computed));
  assert.notEqual(model.state, "unavailable");
  assert.deepEqual(scaleNutrition(model.perServing, 1), model.perServing);
  assert.deepEqual(scaleNutrition(model.perServing, 3), {
    caloriesKcal: 1261.5,
    proteinG: 54,
    carbsG: 150,
    fatG: 48,
    fiberG: 0,
  });
  assert.equal(scaleNutrition({ ...model.perServing, fiberG: null }, 3).fiberG, null);
});

test("allergen presentation covers one/all controlled labels, reviewed-empty and unreviewed fail-closed", () => {
  const one = buildAllergenPresentation({
    ...allergenFixtures.reviewed_with_labels,
    allergen_labels: ["gluten"],
  });
  assert.deepEqual(one, {
    state: "reviewed_with_labels",
    labels: ["Gluten"],
    message: "İşaretlenenler:",
  });

  const controlled = buildAllergenPresentation({
    ...allergenFixtures.reviewed_with_labels,
    allergen_labels: [
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
  });
  assert.deepEqual(controlled.labels, CONTROLLED_ALLERGEN_LABELS);
  assert.deepEqual(buildAllergenPresentation(allergenFixtures.reviewed_without_labels), {
    state: "reviewed_without_labels",
    labels: [],
    message:
      "İşaretlenmiş alerjen bulunmuyor — içerikleri ve çapraz bulaşma riskini ayrıca kontrol edin.",
  });
  const unreviewed = buildAllergenPresentation(allergenFixtures.unreviewed);
  assert.deepEqual(unreviewed, {
    state: "unreviewed",
    labels: null,
    message: "Alerjen bilgisi henüz doğrulanmadı.",
  });
  assert.doesNotMatch(JSON.stringify(unreviewed), /Gluten/);
});

test("JSON-LD parses, uses schema units, equals per-serving values and omits unavailable nutrition", () => {
  const model = buildNutritionPresentation(withServings(nutritionFixtures.computed));
  assert.notEqual(model.state, "unavailable");
  const nutrition = toNutritionInformation(model);
  const parsed = JSON.parse(JSON.stringify({ "@type": "Recipe", nutrition }));
  assert.deepEqual(parsed.nutrition, {
    "@type": "NutritionInformation",
    calories: `${model.perServing.caloriesKcal} calories`,
    proteinContent: `${model.perServing.proteinG} g`,
    carbohydrateContent: `${model.perServing.carbsG} g`,
    fatContent: `${model.perServing.fatG} g`,
    fiberContent: `${model.perServing.fiberG} g`,
  });
  assert.equal(
    toNutritionInformation(buildNutritionPresentation(withServings(nutritionFixtures.unavailable))),
    undefined,
  );
  const noFiber = toNutritionInformation(
    buildNutritionPresentation(withServings({ ...nutritionFixtures.computed, fiber_g: null })),
  );
  assert.equal("fiberContent" in noFiber, false);
  assert.doesNotMatch(JSON.stringify(nutrition), /420,5/);
});

test("route order and panel source preserve responsive and accessibility hooks", async () => {
  const route = await readFile(
    new URL("../src/routes/tarifler.$slug.tsx", import.meta.url),
    "utf8",
  );
  const panels = await readFile(
    new URL("../src/components/hasat/RecipeFactsPanels.tsx", import.meta.url),
    "utf8",
  );
  const ordered = [
    'id="servings-heading"',
    "<NutritionPanel",
    "<AllergenPanel",
    'id="ingredients-heading"',
  ].map((token) => route.indexOf(token));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual(
    ordered,
    [...ordered].sort((a, b) => a - b),
  );
  assert.match(route, /focus-visible:ring-2/);
  assert.match(route, /motion-reduce:transition-none/);
  assert.match(route, /aria-live="polite"/);
  assert.match(panels, /grid-cols-2/);
  assert.match(panels, /md:grid-cols-5/);
  assert.match(panels, /break-words/);
  assert.match(panels, /Tahmini besin değerleridir; tıbbi veya diyetetik tavsiye değildir\./);
  assert.match(panels, /Bu bilgi tıbbi tavsiye değildir\./);
});
