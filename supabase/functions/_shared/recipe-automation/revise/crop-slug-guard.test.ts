// Deno.test suite for crop-slug-guard.ts. Standalone by design — like allowed-changes.test.ts, it
// only imports ../types.ts and the shared fixtures, no Supabase/OpenAI dependency:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/revise/crop-slug-guard.test.ts
import assert from "node:assert/strict";
import { sanitizeUnknownCropIngredients } from "./crop-slug-guard.ts";
import { validKabakRecipeDraft } from "../fixtures/valid-kabak-recipe.ts";
import type { RecipeQAIssue } from "../types.ts";

function unknownCropIssue(index: number, crop: string): RecipeQAIssue {
  return {
    code: "INGREDIENT_CROP_UNKNOWN",
    field: `ingredients[${index}].crop`,
    severity: "blocking",
    message: `ingredient #${index} references unknown crop "${crop}" (not in crop_config)`,
    requiredChange: "crop_config icinde tanimli gecerli bir crop secin.",
  };
}

Deno.test("sanitizeUnknownCropIngredients: no issues -> draft returned unchanged", () => {
  const result = sanitizeUnknownCropIngredients(validKabakRecipeDraft, []);
  assert.equal(result.draft, validKabakRecipeDraft);
  assert.deepEqual(result.sanitizedIngredientIndices, []);
});

Deno.test("sanitizeUnknownCropIngredients: a flagged ingredient's invented crop is forced to null with a humanized freeTextName", () => {
  const draft = {
    ...validKabakRecipeDraft,
    ingredients: [
      { ...validKabakRecipeDraft.ingredients[0] },
      { crop: "zeytin-yagi-invented", freeTextName: null, quantity: 2, unit: "yemek kasigi", note: null, isKeyIngredient: false, ingredientClass: "tarimsal" as const, sortOrder: 1 },
    ],
  };

  const result = sanitizeUnknownCropIngredients(draft, [unknownCropIssue(1, "zeytin-yagi-invented")]);

  assert.deepEqual(result.sanitizedIngredientIndices, [1]);
  assert.equal(result.draft.ingredients[1].crop, null);
  assert.equal(result.draft.ingredients[1].freeTextName, "zeytin yagi invented");
  // Untouched index kept byte-for-byte identical.
  assert.deepEqual(result.draft.ingredients[0], draft.ingredients[0]);
});

Deno.test("sanitizeUnknownCropIngredients: an unknown-crop issue naming an index whose ingredient already has a freeTextName keeps it, rather than overwriting with the humanized slug", () => {
  const draft = {
    ...validKabakRecipeDraft,
    ingredients: [
      { crop: "invented-slug", freeTextName: "orijinal isim", quantity: 1, unit: "adet", note: null, isKeyIngredient: false, ingredientClass: "tarimsal" as const, sortOrder: 0 },
    ],
  };

  const result = sanitizeUnknownCropIngredients(draft, [unknownCropIssue(0, "invented-slug")]);

  assert.equal(result.draft.ingredients[0].crop, null);
  assert.equal(result.draft.ingredients[0].freeTextName, "orijinal isim");
});

Deno.test("sanitizeUnknownCropIngredients: mixed valid + invalid — only the flagged (invalid) index is touched", () => {
  const draft = {
    ...validKabakRecipeDraft,
    ingredients: [
      { crop: "kabak", freeTextName: null, quantity: 3, unit: "adet", note: null, isKeyIngredient: true, ingredientClass: "tarimsal" as const, sortOrder: 0 },
      { crop: "sogan", freeTextName: null, quantity: 1, unit: "adet", note: null, isKeyIngredient: false, ingredientClass: "tarimsal" as const, sortOrder: 1 },
      { crop: "zeytinyagi-invented", freeTextName: null, quantity: 2, unit: "yemek kasigi", note: null, isKeyIngredient: false, ingredientClass: "tarimsal" as const, sortOrder: 2 },
    ],
  };
  // Only index 2 was reported unknown — index 1's "sogan" is a real crop_config slug and never
  // appears in unknownCropIssues at all.
  const result = sanitizeUnknownCropIngredients(draft, [unknownCropIssue(2, "zeytinyagi-invented")]);

  assert.deepEqual(result.sanitizedIngredientIndices, [2]);
  assert.equal(result.draft.ingredients[0].crop, "kabak", "untouched, not named by any issue");
  assert.equal(result.draft.ingredients[1].crop, "sogan", "untouched — a valid crop was never flagged");
  assert.equal(result.draft.ingredients[2].crop, null);
  assert.equal(result.draft.ingredients[2].freeTextName, "zeytinyagi invented");
});

Deno.test("sanitizeUnknownCropIngredients: an unparseable field is ignored, not treated as index 0", () => {
  const issue: RecipeQAIssue = {
    code: "INGREDIENT_CROP_UNKNOWN",
    field: "ingredients",
    severity: "blocking",
    message: "not a per-item field path",
    requiredChange: null,
  };
  const result = sanitizeUnknownCropIngredients(validKabakRecipeDraft, [issue]);
  assert.deepEqual(result.sanitizedIngredientIndices, []);
  assert.equal(result.draft.ingredients[0].crop, validKabakRecipeDraft.ingredients[0].crop);
});
