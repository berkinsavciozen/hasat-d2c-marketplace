// Deno.test suite for the Step 02 canonical contracts. Run with:
//   deno test --allow-net supabase/functions/_shared/recipe-automation/schemas.test.ts
// Uses Deno's built-in Node compatibility (`node:assert`) instead of `jsr:@std/assert` /
// `deno.land/std` so the suite has no dependency on hosts this sandbox's network policy blocks.
import assert from "node:assert/strict";
const assertFalse = (value: unknown, msg?: string) => assert.equal(Boolean(value), false, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => assert.deepStrictEqual(a, b, msg);
import {
  RECIPE_JOB_STAGE_VALUES,
  RECIPE_JOB_STATUS_VALUES,
  recipeBatchInputSchema,
  recipeBriefSchema,
  recipeDraftPayloadSchema,
  recipeImageSpecSchema,
  recipePlanBatchSchema,
  recipeQAResultSchema,
} from "./schemas.ts";
import {
  BATCH_ID,
  validBatchInput,
  validBrief,
  validImageSpec1024,
  validImageSpec2048,
  validKabakRecipeDraft,
  validPlanBatch,
  validQAResult,
  validQAResultApprovedPendingSafetyReview,
  validQAResultRevisionRequired,
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

Deno.test("RecipeQAResult: valid approved result with human-reviewed safety review parses", () => {
  const result = recipeQAResultSchema.safeParse(validQAResult);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeQAResult: valid revision_required result with a blocking issue parses", () => {
  const result = recipeQAResultSchema.safeParse(validQAResultRevisionRequired);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeQAResult: decision:'approved' with a pending (not-yet-human-reviewed) safety review still parses — decision is independent of safetyReview.approved (Step 03B; DB parity with 01_assertions.sql test 5a)", () => {
  const result = recipeQAResultSchema.safeParse(validQAResultApprovedPendingSafetyReview);
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

Deno.test("RecipeQAResult: rejects decision:'approved' while blockingIssues is non-empty", () => {
  const qa = {
    ...validQAResultRevisionRequired,
    decision: "approved" as const,
    approvedForImaging: true,
  };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects approvedForImaging:true while blockingIssues is non-empty", () => {
  const qa = { ...validQAResultRevisionRequired, approvedForImaging: true };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects approvedForImaging:false when decision is 'approved' and there are no blocking issues", () => {
  const qa = { ...validQAResult, approvedForImaging: false };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects a decision value outside approved|revision_required|manual_review_required", () => {
  const qa = { ...validQAResult, decision: "passed" };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: manual_review_required with no blocking issues and approvedForImaging:false parses", () => {
  const qa = { ...validQAResultRevisionRequired, decision: "manual_review_required" as const, blockingIssues: [] };
  const result = recipeQAResultSchema.safeParse(qa);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeQAResult: rejects manual_review_required with approvedForImaging:true even without blocking issues", () => {
  const qa = {
    ...validQAResultRevisionRequired,
    decision: "manual_review_required" as const,
    blockingIssues: [],
    approvedForImaging: true,
  };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success, "approvedForImaging must only be true when decision is 'approved'");
});

Deno.test("RecipeQAResult: rejects a blocking issue missing 'code' or 'requiredChange' key structure mismatch (extra keys)", () => {
  const qa = {
    ...validQAResultRevisionRequired,
    blockingIssues: [
      { ...validQAResultRevisionRequired.blockingIssues[0], legacyExtraKey: "nope" },
    ],
  };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects a lowercase (non-SCREAMING_SNAKE_CASE) issue code", () => {
  const qa = {
    ...validQAResultRevisionRequired,
    blockingIssues: [{ ...validQAResultRevisionRequired.blockingIssues[0], code: "unused_ingredient" }],
  };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects a non-blocking suggestion with severity 'blocking'", () => {
  const qa = {
    ...validQAResult,
    nonBlockingSuggestions: [
      { code: "STYLE_HINT", field: "description", severity: "blocking" as const, message: "x", requiredChange: null },
    ],
  };
  const result = recipeQAResultSchema.safeParse(qa);
  assertFalse(result.success);
});

Deno.test("RecipeQAResult: rejects missing draftId/draftVersion", () => {
  const { draftId: _d, draftVersion: _v, ...withoutDraftIdentity } = validQAResult;
  const result = recipeQAResultSchema.safeParse(withoutDraftIdentity);
  assertFalse(result.success);
});

// ---------------------------------------------------------------------------
// RecipePlanBatch — no singular jobId; stable briefId identity instead
// ---------------------------------------------------------------------------

Deno.test("RecipePlanBatch: valid plan batch (no jobId) parses", () => {
  const result = recipePlanBatchSchema.safeParse(validPlanBatch);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipePlanBatch: rejects a legacy singular jobId field", () => {
  const batch = { ...validPlanBatch, jobId: "11111111-1111-4111-8111-111111111111" };
  const result = recipePlanBatchSchema.safeParse(batch);
  assertFalse(result.success);
});

Deno.test("RecipePlanBatch: rejects duplicate briefId within the same batch", () => {
  const batch = { ...validPlanBatch, briefs: [validBrief, validBrief] };
  const result = recipePlanBatchSchema.safeParse(batch);
  assertFalse(result.success);
});

Deno.test("RecipePlanBatch: rejects a brief whose batchId does not match the batch", () => {
  const batch = {
    ...validPlanBatch,
    briefs: [{ ...validBrief, batchId: "99999999-9999-4999-8999-999999999999" }],
  };
  const result = recipePlanBatchSchema.safeParse(batch);
  assertFalse(result.success);
});

// ---------------------------------------------------------------------------
// RecipeBrief — Step 13: audience/mealType/selectionReason
// ---------------------------------------------------------------------------

Deno.test("RecipeBrief: valid brief (with audience/mealType/selectionReason) parses", () => {
  const result = recipeBriefSchema.safeParse(validBrief);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
});

Deno.test("RecipeBrief: audience defaults to 'bireysel' when omitted", () => {
  const { audience: _a, ...withoutAudience } = validBrief;
  const result = recipeBriefSchema.safeParse(withoutAudience);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
  if (result.success) assertEquals(result.data.audience, "bireysel");
});

Deno.test("RecipeBrief: rejects an audience outside bireysel|horeca", () => {
  const brief = { ...validBrief, audience: "kurumsal" };
  const result = recipeBriefSchema.safeParse(brief);
  assertFalse(result.success);
});

Deno.test("RecipeBrief: mealType defaults to null when omitted", () => {
  const { mealType: _m, ...withoutMealType } = validBrief;
  const result = recipeBriefSchema.safeParse(withoutMealType);
  assert(result.success, JSON.stringify(result.success ? null : result.error.format()));
  if (result.success) assertEquals(result.data.mealType, null);
});

Deno.test("RecipeBrief: rejects a mealType outside the fixed enum", () => {
  const brief = { ...validBrief, mealType: "brunch" };
  const result = recipeBriefSchema.safeParse(brief);
  assertFalse(result.success);
});

Deno.test("RecipeBrief: rejects a missing selectionReason", () => {
  const { selectionReason: _s, ...withoutReason } = validBrief;
  const result = recipeBriefSchema.safeParse(withoutReason);
  assertFalse(result.success);
});

Deno.test("RecipeBrief: rejects a blank selectionReason", () => {
  const brief = { ...validBrief, selectionReason: "   " };
  const result = recipeBriefSchema.safeParse(brief);
  assertFalse(result.success);
});

// ---------------------------------------------------------------------------
// Pipeline stage/status vocabulary — RecipeAutomation.md §3, verbatim
// ---------------------------------------------------------------------------

Deno.test("RECIPE_JOB_STAGE_VALUES carries every canonical transition (plan/write/qa/revise/image/finalize/awaiting_approval/publish)", () => {
  assertEquals(
    [...RECIPE_JOB_STAGE_VALUES].sort(),
    ["awaiting_approval", "finalize", "image", "plan", "publish", "qa", "revise", "write"].sort(),
  );
});

Deno.test("RECIPE_JOB_STATUS_VALUES matches RecipeAutomation.md §3 verbatim", () => {
  assertEquals(
    [...RECIPE_JOB_STATUS_VALUES].sort(),
    ["approved", "awaiting_approval", "cancelled", "completed", "failed", "queued", "rejected", "retryable", "running"].sort(),
  );
});

Deno.test("RecipeAutomation batchId constant is a stable uuid used across brief/plan fixtures", () => {
  assertEquals(validBrief.batchId, BATCH_ID);
  assertEquals(validPlanBatch.batchId, BATCH_ID);
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
