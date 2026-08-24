// Shared valid fixtures for schemas.test.ts. Kept separate from the test file so other stages'
// future tests (drafting, QA, image generation) can reuse the same known-good baseline instead of
// re-typing a full draft payload each time.
import type {
  RecipeBatchInput,
  RecipeBrief,
  RecipeDraftPayload,
  RecipeImageSpec,
  RecipePlanBatch,
  RecipeQAResult,
} from "../types.ts";

export const JOB_ID = "11111111-1111-4111-8111-111111111111";
export const BATCH_ID = "22222222-2222-4222-8222-222222222222";
export const BRIEF_ID = "33333333-3333-4333-8333-333333333333";
export const RECIPE_ID = "44444444-4444-4444-8444-444444444444";
export const REVIEWER_ID = "55555555-5555-4555-8555-555555555555";

export const validBatchInput: RecipeBatchInput = {
  batchId: BATCH_ID,
  requestedBy: null,
  targetCount: 5,
  focusCrops: ["kabak"],
  dietFocus: [],
  locale: "tr",
  notes: "F13 sebze serisi icin kabak agirlikli tarifler.",
  requestedAt: "2026-08-19T09:00:00Z",
};

export const validBrief: RecipeBrief = {
  briefId: BRIEF_ID,
  batchId: BATCH_ID,
  workingTitle: "Firinda Kabak Musakka",
  focusCrop: "kabak",
  angle: "Mevsimlik kabaklarla hafif bir aksam yemegi.",
  targetDifficulty: "orta",
  dietTags: ["vejetaryen"],
  locale: "tr",
};

export const validPlanBatch: RecipePlanBatch = {
  batchId: BATCH_ID,
  briefs: [validBrief],
  plannedAt: "2026-08-19T09:05:00Z",
  plannerModel: "google/gemini-2.5-flash",
};

/** "valid kabak recipe" fixture required by Step 02's fixture list. */
export const validKabakRecipeDraft: RecipeDraftPayload = {
  jobId: JOB_ID,
  briefId: BRIEF_ID,
  title: "Firinda Kabak Musakka",
  description: "Mevsimlik kabak, domates ve sogan ile hazirlanan firin yemegi.",
  coverPhotoUrl: null,
  servings: 4,
  prepMinutes: 20,
  cookMinutes: 40,
  restMinutes: 5,
  difficulty: "orta",
  cuisine: "turk",
  dietTags: ["vejetaryen"],
  allergenLabels: ["sut"],
  requiredEquipment: ["firin_tepsisi"],
  sourceType: "manual",
  authorType: "hasat",
  visibility: "private",
  ownerId: null,
  extractionConfidence: 0.92,
  ingredients: [
    {
      crop: "kabak",
      freeTextName: null,
      quantity: 3,
      unit: "adet",
      note: "orta boy",
      isKeyIngredient: true,
      ingredientClass: "tarimsal",
      sortOrder: 0,
    },
    {
      crop: null,
      freeTextName: "kasar peyniri",
      quantity: 100,
      unit: "g",
      note: null,
      isKeyIngredient: false,
      ingredientClass: "platform_disi",
      sortOrder: 1,
    },
  ],
  steps: [
    { stepNo: 1, instruction: "Kabaklari yikayip ince dilimleyin.", photoUrl: null, timerSeconds: null },
    { stepNo: 2, instruction: "Firini 200 derecede on isitin.", photoUrl: null, timerSeconds: 600 },
    { stepNo: 3, instruction: "Malzemeleri tepside katman katman dizip 40 dakika pisirin.", photoUrl: null, timerSeconds: 2400 },
  ],
};

export const DRAFT_ID = "66666666-6666-4666-8666-666666666666";

export const validQAResult: RecipeQAResult = {
  jobId: JOB_ID,
  draftId: DRAFT_ID,
  draftVersion: 1,
  recipeId: RECIPE_ID,
  decision: "approved",
  overallScore: 88,
  scores: {
    clarity: 90,
    feasibility: 85,
    ingredientConsistency: 90,
    originality: 80,
    hasatRelevance: 95,
  },
  blockingIssues: [],
  nonBlockingSuggestions: [],
  safetyReview: {
    temperature: { flagged: false, notes: null },
    timing: { flagged: false, notes: null },
    allergens: { flagged: true, notes: "Sut icerir.", detectedLabels: ["sut"] },
    requiresHumanReview: true,
    reviewedBy: REVIEWER_ID,
    reviewedAt: "2026-08-19T10:00:00Z",
    approved: true,
  },
  approvedForImaging: true,
  checkedAt: "2026-08-19T09:45:00Z",
  model: "google/gemini-2.5-flash",
};

/**
 * Step 03B: an automated QA 'approved' decision BEFORE the human safety sign-off has happened.
 * Proves `decision`/`approvedForImaging` are independent of `safetyReview.approved` — the
 * RecipeAutomation.md §2.1/§9 canonical order is qa -> image -> finalize -> human approval ->
 * publish, so an automated 'approved' QA verdict must be usable immediately, not gated behind a
 * human reviewer who acts later at the awaiting_approval/publish step. Numeric values mirror
 * supabase/tests/f2_recipe_automation/01_assertions.sql test 5a's DB-layer literal values, so the
 * same payload is exercised as a Zod/DB parity pair.
 */
export const validQAResultApprovedPendingSafetyReview: RecipeQAResult = {
  ...validQAResult,
  overallScore: 95,
  scores: {
    clarity: 95,
    feasibility: 95,
    ingredientConsistency: 95,
    originality: 95,
    hasatRelevance: 95,
  },
  safetyReview: {
    temperature: { flagged: false, notes: null },
    timing: { flagged: false, notes: null },
    allergens: { flagged: false, notes: null, detectedLabels: [] },
    requiresHumanReview: true,
    reviewedBy: null,
    reviewedAt: null,
    approved: null,
  },
};

export const validQAResultRevisionRequired: RecipeQAResult = {
  ...validQAResult,
  decision: "revision_required",
  overallScore: 62,
  blockingIssues: [
    {
      code: "UNUSED_INGREDIENT",
      field: "ingredients[1]",
      severity: "blocking",
      message: "kasar peyniri hicbir adimda kullanilmiyor.",
      requiredChange: "Son adima ekleyin veya malzeme listesinden cikarin.",
    },
  ],
  safetyReview: {
    ...validQAResult.safetyReview,
    reviewedBy: null,
    reviewedAt: null,
    approved: null,
  },
  approvedForImaging: false,
};

/** Step 07: a QA pass that judges the problem not fixable by a simple revision (e.g. a strong
 * duplicate match) — routed to a human review queue instead of the revise loop. */
export const validQAResultManualReviewRequired: RecipeQAResult = {
  ...validQAResult,
  decision: "manual_review_required",
  overallScore: 55,
  blockingIssues: [
    {
      code: "STRONG_DUPLICATE_MATCH",
      field: "title",
      severity: "blocking",
      message: "Bu baslik, katalogda halihazirda var olan bir tarifle neredeyse ayni.",
      requiredChange: "Bir editorun bu tarifin yayinlanip yayinlanmayacagina karar vermesi gerekiyor.",
    },
  ],
  safetyReview: {
    ...validQAResult.safetyReview,
    reviewedBy: null,
    reviewedAt: null,
    approved: null,
  },
  approvedForImaging: false,
};

export const validImageSpec1024: RecipeImageSpec = {
  targetKind: "recipe_cover",
  recipeId: RECIPE_ID,
  stepId: null,
  provider: "google-gemini",
  modelId: "google/gemini-2.5-flash-image",
  sourceWidthPx: 1024,
  sourceHeightPx: 1024,
  chopFraction: 0.14,
  cropTargets: ["1:1", "16:9"],
  cropAlignment: "center",
  outputFormat: "webp",
  outputQuality: 82,
  stripMetadata: true,
  geometryEngine: "imagescript",
  webpEncoder: null,
  storageBucket: "crop-photos",
};

export const validImageSpec2048: RecipeImageSpec = {
  ...validImageSpec1024,
  sourceWidthPx: 2048,
  sourceHeightPx: 2048,
};
