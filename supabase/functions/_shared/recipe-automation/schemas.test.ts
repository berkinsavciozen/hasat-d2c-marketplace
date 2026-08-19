// Deno.test suite for the Step 02 canonical contracts. Run with:
//   deno test --allow-net supabase/functions/_shared/recipe-automation/schemas.test.ts
// Uses Deno's built-in Node compatibility (`node:assert`) instead of `jsr:@std/assert` /
// `deno.land/std` so the suite has no dependency on hosts this sandbox's network policy blocks.
import assert from "node:assert/strict";
const assertFalse = (value: unknown, msg?: string) => assert.equal(Boolean(value), false, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => assert.deepStrictEqual(a, b, msg);
import {
  recipeBatchInputSchema,
  recipeDraftPayloadSchema,
  recipeImageSpecSchema,
  recipeQAResultSchema,
} from "./schemas.ts";
import {
  validBatchInput,
  validImageSpec1024,
  validImageSpec2048,
  validKabakRecipeDraft,
  validQAResult,
} from "./fixtures/valid-kabak-recipe.ts";

// ---------------------------------------------------------------------------
// RecipeDraftPayload
// ---------------------------------------------------------------------------

Deno.test("RecipeDraftPayload: valid kabak recipe parses", () => {
  const result = recipeDraftPayloadSchema.safeParse(validKabakRecipeDraft);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeDraftPayload: rejects English difficulty", () => {
  const draft = { ...validKabakRecipeDraft, difficulty: "medium" };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

Deno.test("RecipeIngredientDraft: rejects crop_id field", () => {
  const draft = {
    ...validKabakRecipeDraft,
    ingredients: [
      { ...validKabakRecipeDraft.ingredients[0], crop_id: "some-uuid" },
    ],
  };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

Deno.test("RecipeDraftPayload: rejects unknown extra pipeline fields", () => {
  const draft = { ...validKabakRecipeDraft, debugTrace: "should not be here" };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

Deno.test("RecipeDraftPayload: rejects missing steps", () => {
  const draft = { ...validKabakRecipeDraft, steps: [] };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

Deno.test("RecipeDraftPayload: rejects steps with a gap in step_no", () => {
  const draft = {
    ...validKabakRecipeDraft,
    steps: [
      { stepNo: 1, instruction: "Adim bir.", photoUrl: null, timerSeconds: null },
      { stepNo: 3, instruction: "Adim uc, iki eksik.", photoUrl: null, timerSeconds: null },
    ],
  };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

Deno.test("RecipeDraftPayload: rejects a step with invalid (zero) timer_seconds", () => {
  const draft = {
    ...validKabakRecipeDraft,
    steps: [
      { stepNo: 1, instruction: "Adim bir.", photoUrl: null, timerSeconds: 0 },
    ],
  };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

Deno.test("RecipeIngredientDraft: rejects zero/negative quantity", () => {
  const draft = {
    ...validKabakRecipeDraft,
    ingredients: [
      { ...validKabakRecipeDraft.ingredients[0], quantity: 0 },
    ],
  };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

Deno.test("RecipeIngredientDraft: rejects an ingredient with neither crop nor freeTextName", () => {
  const draft = {
    ...validKabakRecipeDraft,
    ingredients: [
      { crop: null, freeTextName: null, quantity: 1, unit: "adet", note: null, isKeyIngredient: false, ingredientClass: null, sortOrder: 0 },
    ],
  };
  const result = recipeDraftPayloadSchema.safeParse(draft);
  assertFalse(result.success);
});

// ---------------------------------------------------------------------------
// RecipeBatchInput
// ---------------------------------------------------------------------------

Deno.test("RecipeBatchInput: valid input parses", () => {
  const result = recipeBatchInputSchema.safeParse(validBatchInput);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeBatchInput: rejects unknown extra pipeline fields", () => {
  const input = { ...validBatchInput, provider: "openai" };
  const result = recipeBatchInputSchema.safeParse(input);
  assertFalse(result.success);
});

Deno.test("RecipeBatchInput: rejects zero targetCount", () => {
  const input = { ...validBatchInput, targetCount: 0 };
  const result = recipeBatchInputSchema.safeParse(input);
  assertFalse(result.success);
});

// ---------------------------------------------------------------------------
// RecipeQAResult / safety review shape
// ---------------------------------------------------------------------------

Deno.test("RecipeQAResult: valid result with human-reviewed safety review parses", () => {
  const result = recipeQAResultSchema.safeParse(validQAResult);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeQAResult: rejects safety review with requiresHumanReview:false", () => {
  const qa = {
    ...validQAResult,
    safetyReview: { ...validQAResult.safetyReview, requiresHumanReview: false },
  };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects approved:true without a human reviewer", () => {
  const qa = {
    ...validQAResult,
    safetyReview: { ...validQAResult.safetyReview, reviewedBy: null, reviewedAt: null, approved: true },
  };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects a safety review missing the allergens block", () => {
  const { allergens: _omit, ...safetyReviewWithoutAllergens } = validQAResult.safetyReview;
  const qa = { ...validQAResult, safetyReview: safetyReviewWithoutAllergens };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

// ---------------------------------------------------------------------------
// RecipeImageSpec
// ---------------------------------------------------------------------------

Deno.test("RecipeImageSpec: valid 1024x1024 spec parses", () => {
  const result = recipeImageSpecSchema.safeParse(validImageSpec1024);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeImageSpec: valid 2048x2048 spec parses", () => {
  const result = recipeImageSpecSchema.safeParse(validImageSpec2048);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeImageSpec: does not hard-code 2048 — any positive square resolution is valid", () => {
  const spec = { ...validImageSpec1024, sourceWidthPx: 512, sourceHeightPx: 512 };
  const result = recipeImageSpecSchema.safeParse(spec);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeImageSpec: rejects an invalid crop target", () => {
  const spec = { ...validImageSpec1024, cropTargets: ["4:3"] };
  const result = recipeImageSpecSchema.safeParse(spec);
  assertFalse(result.success);
});

Deno.test("RecipeImageSpec: rejects an out-of-range quality parameter", () => {
  const spec = { ...validImageSpec1024, outputQuality: 150 };
  const result = recipeImageSpecSchema.safeParse(spec);
  assertFalse(result.success);
});

Deno.test("RecipeImageSpec: rejects a zero quality parameter", () => {
  const spec = { ...validImageSpec1024, outputQuality: 0 };
  const result = recipeImageSpecSchema.safeParse(spec);
  assertFalse(result.success);
});

Deno.test("RecipeImageSpec: rejects non-square source dimensions", () => {
  const spec = { ...validImageSpec1024, sourceWidthPx: 1024, sourceHeightPx: 768 };
  const result = recipeImageSpecSchema.safeParse(spec);
  assertFalse(result.success);
});

Deno.test("RecipeImageSpec: rejects non-positive source dimensions", () => {
  const spec = { ...validImageSpec1024, sourceWidthPx: 0, sourceHeightPx: 0 };
  const result = recipeImageSpecSchema.safeParse(spec);
  assertFalse(result.success);
});

Deno.test("RecipeImageSpec: rejects a negative source dimension", () => {
  const spec = { ...validImageSpec1024, sourceWidthPx: -1024, sourceHeightPx: -1024 };
  const result = recipeImageSpecSchema.safeParse(spec);
  assertFalse(result.success);
});

Deno.test("RecipeImageSpec: stripMetadata cannot be set to false", () => {
  const spec = { ...validImageSpec1024, stripMetadata: false };
  const result = recipeImageSpecSchema.safeParse(spec);
  assertFalse(result.success);
});

Deno.test("RecipeImageSpec: webpEncoder defaults to null (unresolved) and accepts either candidate", () => {
  const parsedDefault = recipeImageSpecSchema.parse(validImageSpec1024);
  assertEquals(parsedDefault.webpEncoder, null);

  const withEncoder = recipeImageSpecSchema.safeParse({ ...validImageSpec1024, webpEncoder: "wasm-vips" });
  assert(withEncoder.success);

  const withBadEncoder = recipeImageSpecSchema.safeParse({ ...validImageSpec1024, webpEncoder: "sharp" });
  assertFalse(withBadEncoder.success);
});
