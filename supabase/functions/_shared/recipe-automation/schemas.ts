// Canonical Zod contracts for the Hasat Recipe Automation pipeline (F2, Step 02).
//
// These schemas are the single runtime-validated source of truth for every payload that
// crosses a stage boundary in the chained, short-lived Edge Function pipeline described in
// RecipeAutomation.md. `types.ts` in this same directory re-exports the inferred TypeScript
// types so callers can `import type` without pulling Zod into type-only positions.
//
// Live-schema alignment (verified against Supabase project `efuqpiaavrzimvstpdpm`, see
// docs/recipe-automation/00-repo-audit-decision-log.md for the full audit):
// - `recipes.difficulty` CHECK: difficulty IS NULL OR difficulty = ANY (ARRAY['kolay','orta','zor'])
// - `recipes.status` CHECK: status = ANY (ARRAY['draft','published']) — this pipeline's own
//   RecipeJobStage/RecipeJobStatus enums (below) are intentionally a separate value space and
//   are never written to recipes.status.
// - `recipes.author_type` CHECK: author_type = ANY (ARRAY['hasat','ciftci','sef','kullanici']).
//   `hasat_ai` is NOT a member of this constraint today (decision log §7.1, still Proposed) —
//   this file does not invent it. `authorType` below defaults to the existing 'hasat' value as a
//   placeholder for editorial/pipeline-authored content pending that decision.
// - `recipes.source_type` CHECK: source_type = ANY (ARRAY['manual','text','photo','url']).
// - `recipes.visibility` CHECK: visibility = ANY (ARRAY['public','private']).
// - `recipes.allergen_labels` is `text[]`, nullable, NO CHECK constraint (confirmed live via
//   pg_constraint) — modeled here as a plain nullable array of non-empty strings, not an enum.
//   Do not add a value restriction here; the live column has none.
// - `recipe_ingredients.crop` is `text`, FK to `crop_config(crop)`. There is no `crop_id` column
//   anywhere in this schema — `.strict()` below rejects any payload that includes one.
// - `recipe_ingredients_name_present`: crop IS NOT NULL OR NULLIF(btrim(free_text_name),'') IS NOT NULL.
// - `recipe_ingredients.quantity` CHECK: quantity IS NULL OR quantity > 0.
// - `recipe_steps.step_no` CHECK: step_no > 0. `recipe_steps.timer_seconds` CHECK: > 0.
// - `recipes.servings` CHECK: > 0. `prep_minutes`/`cook_minutes` CHECK: >= 0 (no constraint exists
//   on `rest_minutes` live, but it is modeled the same way for consistency — a negative rest time
//   is never meaningful).
//
// Image spec fields encode the Step 01 spike findings (docs/recipe-automation/01-runtime-feasibility-spikes.md):
// Gemini via the existing LOVABLE_API_KEY gateway, 14% right/bottom chop then center-crop to 16:9
// and 1:1, WebP q82 intent, metadata always stripped, `imagescript` accepted for geometry/metadata
// decode. Source resolution is intentionally NOT hard-coded to 2048 — the gateway was observed
// returning 1024x1024 in testing, and the final resolution choice is deferred to Step 09. The WebP
// encoder itself is left unresolved/nullable, since Step 01 did not land a working Edge-compatible
// WebP encoder (jSquash's WASM loading failed; wasm-vips was untried).
import { z } from "npm:zod@3.23.8";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const nonEmptyTrimmedString = z.string().trim().min(1);

/** `recipes.difficulty` CHECK constraint, verbatim. */
export const RECIPE_DIFFICULTY_VALUES = ["kolay", "orta", "zor"] as const;
export const recipeDifficultySchema = z.enum(RECIPE_DIFFICULTY_VALUES);

/** `recipes.author_type` CHECK constraint, verbatim (see file header re: `hasat_ai`, §7.1). */
export const RECIPE_AUTHOR_TYPE_VALUES = ["hasat", "ciftci", "sef", "kullanici"] as const;
export const recipeAuthorTypeSchema = z.enum(RECIPE_AUTHOR_TYPE_VALUES);

/** `recipes.source_type` CHECK constraint, verbatim. */
export const RECIPE_SOURCE_TYPE_VALUES = ["manual", "text", "photo", "url"] as const;
export const recipeSourceTypeSchema = z.enum(RECIPE_SOURCE_TYPE_VALUES);

/** `recipes.visibility` CHECK constraint, verbatim. */
export const RECIPE_VISIBILITY_VALUES = ["public", "private"] as const;
export const recipeVisibilitySchema = z.enum(RECIPE_VISIBILITY_VALUES);

/** `recipe_ingredients.ingredient_class` CHECK constraint, verbatim. */
export const RECIPE_INGREDIENT_CLASS_VALUES = ["tarimsal", "platform_disi"] as const;
export const recipeIngredientClassSchema = z.enum(RECIPE_INGREDIENT_CLASS_VALUES);

// ---------------------------------------------------------------------------
// Pipeline job stage / status (deliberately separate from recipes.status)
// ---------------------------------------------------------------------------

/**
 * Where a `recipe_generation_jobs` row currently is in the chained-Edge-Function pipeline.
 * This is NEVER written to `recipes.status` (which only ever accepts 'draft' | 'published').
 */
export const RECIPE_JOB_STAGE_VALUES = [
  "planning",
  "drafting",
  "qa_review",
  "safety_review",
  "image_generation",
  "publish_ready",
  "published",
] as const;
export const recipeJobStageSchema = z.enum(RECIPE_JOB_STAGE_VALUES);

/** Outcome of the job's current stage — orthogonal to which stage it is in. */
export const RECIPE_JOB_STATUS_VALUES = [
  "pending",
  "in_progress",
  "succeeded",
  "failed",
  "needs_human_review",
  "cancelled",
] as const;
export const recipeJobStatusSchema = z.enum(RECIPE_JOB_STATUS_VALUES);

// ---------------------------------------------------------------------------
// Standard safe error payload
// ---------------------------------------------------------------------------

/**
 * The only shape an Edge Function in this pipeline may use to report a failure to the next
 * stage / to logs. `message` must be safe to surface (no stack traces, no secret values, no raw
 * provider payloads) — callers are responsible for sanitizing before constructing this object;
 * the schema enforces shape, not content redaction.
 */
export const recipeErrorPayloadSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "code must be SCREAMING_SNAKE_CASE"),
  message: nonEmptyTrimmedString.max(2000),
  stage: recipeJobStageSchema.nullable(),
  retryable: z.boolean().default(false),
  occurredAt: isoDateTimeSchema,
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();

// ---------------------------------------------------------------------------
// RecipeBatchInput — kicks off a planning job
// ---------------------------------------------------------------------------

export const recipeBatchInputSchema = z.object({
  batchId: uuidSchema.nullable().default(null),
  requestedBy: uuidSchema.nullable().default(null),
  targetCount: z.number().int().positive().max(25),
  focusCrops: z.array(nonEmptyTrimmedString).max(25).nullable().default(null),
  dietFocus: z.array(nonEmptyTrimmedString).default([]),
  locale: z.string().trim().min(2).default("tr"),
  notes: z.string().trim().max(4000).nullable().default(null),
  requestedAt: isoDateTimeSchema.optional(),
}).strict();

// ---------------------------------------------------------------------------
// RecipeBrief — a single planned recipe idea, prior to drafting
// ---------------------------------------------------------------------------

export const recipeBriefSchema = z.object({
  briefId: uuidSchema,
  batchId: uuidSchema,
  workingTitle: nonEmptyTrimmedString.max(200),
  /** Text crop slug matching `crop_config.crop`. Never a `crop_id`. */
  focusCrop: nonEmptyTrimmedString.nullable().default(null),
  angle: z.string().trim().max(1000).nullable().default(null),
  targetDifficulty: recipeDifficultySchema.nullable().default(null),
  dietTags: z.array(nonEmptyTrimmedString).default([]),
  locale: z.string().trim().min(2).default("tr"),
}).strict();

// ---------------------------------------------------------------------------
// RecipePlanBatch — planning-stage output: a batch of briefs
// ---------------------------------------------------------------------------

export const recipePlanBatchSchema = z.object({
  batchId: uuidSchema,
  jobId: uuidSchema,
  briefs: z.array(recipeBriefSchema).min(1).max(25),
  plannedAt: isoDateTimeSchema,
  /** Which model/provider produced the plan. Intentionally free text — not hard-coded. */
  plannerModel: z.string().trim().min(1).nullable().default(null),
}).strict()
  .refine(
    (batch) => batch.briefs.every((brief) => brief.batchId === batch.batchId),
    { message: "every brief.batchId must match the batch's own batchId", path: ["briefs"] },
  );

// ---------------------------------------------------------------------------
// RecipeIngredientDraft — mirrors recipe_ingredients, pre-insert
// ---------------------------------------------------------------------------

export const recipeIngredientDraftSchema = z.object({
  /** Text crop slug matching `crop_config.crop`. Never `crop_id` — that column does not exist. */
  crop: nonEmptyTrimmedString.nullable().default(null),
  freeTextName: nonEmptyTrimmedString.nullable().default(null),
  quantity: z.number().positive().nullable().default(null),
  unit: z.string().trim().min(1).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
  isKeyIngredient: z.boolean().default(false),
  ingredientClass: recipeIngredientClassSchema.nullable().default(null),
  sortOrder: z.number().int().nonnegative().default(0),
}).strict()
  .refine(
    (ingredient) => ingredient.crop !== null || ingredient.freeTextName !== null,
    { message: "either crop or freeTextName must be present", path: ["freeTextName"] },
  );

// ---------------------------------------------------------------------------
// RecipeStepDraft — mirrors recipe_steps, pre-insert
// ---------------------------------------------------------------------------

export const recipeStepDraftSchema = z.object({
  stepNo: z.number().int().positive(),
  instruction: nonEmptyTrimmedString.max(2000),
  photoUrl: z.string().url().nullable().default(null),
  timerSeconds: z.number().int().positive().nullable().default(null),
}).strict();

// ---------------------------------------------------------------------------
// RecipeDraftPayload — full draft ready for QA / safety review
// ---------------------------------------------------------------------------

export const recipeDraftPayloadSchema = z.object({
  jobId: uuidSchema,
  briefId: uuidSchema.nullable().default(null),
  title: nonEmptyTrimmedString.max(200),
  description: z.string().trim().max(4000).nullable().default(null),
  coverPhotoUrl: z.string().url().nullable().default(null),
  servings: z.number().int().positive().nullable().default(null),
  prepMinutes: z.number().int().nonnegative().nullable().default(null),
  cookMinutes: z.number().int().nonnegative().nullable().default(null),
  restMinutes: z.number().int().nonnegative().nullable().default(null),
  difficulty: recipeDifficultySchema.nullable().default(null),
  cuisine: z.string().trim().min(1).nullable().default(null),
  dietTags: z.array(nonEmptyTrimmedString).default([]),
  /** Models `recipes.allergen_labels` exactly: nullable text[], no enum restriction. */
  allergenLabels: z.array(nonEmptyTrimmedString).nullable().default(null),
  requiredEquipment: z.array(nonEmptyTrimmedString).nullable().default(null),
  sourceType: recipeSourceTypeSchema.default("manual"),
  authorType: recipeAuthorTypeSchema.default("hasat"),
  visibility: recipeVisibilitySchema.default("private"),
  ownerId: uuidSchema.nullable().default(null),
  extractionConfidence: z.number().min(0).max(1).nullable().default(null),
  ingredients: z.array(recipeIngredientDraftSchema).min(1).max(60),
  steps: z.array(recipeStepDraftSchema).min(1).max(60),
}).strict()
  .refine(
    (draft) => {
      const sorted = [...draft.steps].sort((a, b) => a.stepNo - b.stepNo);
      return sorted.every((step, index) => step.stepNo === index + 1);
    },
    { message: "steps must have sequential step_no starting at 1, with no gaps or duplicates", path: ["steps"] },
  );

// ---------------------------------------------------------------------------
// Safety review — always independent, always requires a human
// ---------------------------------------------------------------------------

const safetyFindingSchema = z.object({
  flagged: z.boolean(),
  notes: z.string().trim().max(1000).nullable().default(null),
}).strict();

export const recipeSafetyReviewSchema = z.object({
  temperature: safetyFindingSchema,
  timing: safetyFindingSchema,
  allergens: safetyFindingSchema.extend({
    detectedLabels: z.array(nonEmptyTrimmedString).default([]),
  }).strict(),
  /** Always true. A safety review can never be skipped or resolved by a score alone. */
  requiresHumanReview: z.literal(true),
  reviewedBy: uuidSchema.nullable().default(null),
  reviewedAt: isoDateTimeSchema.nullable().default(null),
  approved: z.boolean().nullable().default(null),
}).strict()
  .refine(
    (review) => !review.approved || (review.reviewedBy !== null && review.reviewedAt !== null),
    { message: "approved can only be true once reviewedBy and reviewedAt are set", path: ["approved"] },
  );

// ---------------------------------------------------------------------------
// RecipeQAResult — automated QA pass, safety review always nested and human-gated
// ---------------------------------------------------------------------------

const qaIssueSeveritySchema = z.enum(["info", "warning", "blocking"]);

export const recipeQAResultSchema = z.object({
  jobId: uuidSchema,
  recipeId: uuidSchema.nullable().default(null),
  passed: z.boolean(),
  issues: z.array(z.object({
    field: nonEmptyTrimmedString,
    severity: qaIssueSeveritySchema,
    message: nonEmptyTrimmedString.max(1000),
  }).strict()).default([]),
  safetyReview: recipeSafetyReviewSchema,
  checkedAt: isoDateTimeSchema,
  /** Which model/provider ran QA. Intentionally free text — not hard-coded. */
  model: z.string().trim().min(1).nullable().default(null),
}).strict();

// ---------------------------------------------------------------------------
// RecipeImageSpec — Gemini generation + Edge-compatible processing contract
// ---------------------------------------------------------------------------

/** Fixed per Step 01's crop-math spike: chop 14% off the right and bottom edges. */
export const IMAGE_CHOP_FRACTION = 0.14;
/** WebP q82 is the encoding intent; the field below still validates a sane range. */
export const IMAGE_DEFAULT_WEBP_QUALITY = 82;
/** Both cover and crop-fallback photos live in this bucket — there is no `recipe-photos` bucket. */
export const IMAGE_STORAGE_BUCKET = "crop-photos";
/** The only geometry/metadata engine Step 01 validated as Edge-compatible (no native bindings). */
export const IMAGE_GEOMETRY_ENGINE = "imagescript";
/** Neither WebP encoder candidate was confirmed working in Step 01 — left unresolved. */
export const IMAGE_WEBP_ENCODER_CANDIDATES = ["jsquash-webp", "wasm-vips"] as const;

export const recipeImageCropTargetSchema = z.enum(["1:1", "16:9"]);

export const recipeImageSpecSchema = z.object({
  targetKind: z.enum(["recipe_cover", "recipe_step"]),
  recipeId: uuidSchema.nullable().default(null),
  stepId: uuidSchema.nullable().default(null),
  /** Only Google Gemini (via the existing LOVABLE_API_KEY gateway) was validated in Step 01. */
  provider: z.literal("google-gemini").default("google-gemini"),
  /** Configurable on purpose — Step 01 found the gateway's canonical id drops the "-preview" suffix. */
  modelId: nonEmptyTrimmedString.default("google/gemini-2.5-flash-image"),
  /**
   * Configurable and validated as a positive integer — NOT hard-coded to 2048. The gateway was
   * observed returning 1024x1024 in Step 01 testing; the final resolution is a Step 09 decision.
   */
  sourceWidthPx: z.number().int().positive(),
  sourceHeightPx: z.number().int().positive(),
  chopFraction: z.number().gt(0).lt(0.5).default(IMAGE_CHOP_FRACTION),
  cropTargets: z.array(recipeImageCropTargetSchema).min(1).max(2)
    .refine((targets) => new Set(targets).size === targets.length, "cropTargets must not repeat"),
  cropAlignment: z.literal("center").default("center"),
  outputFormat: z.literal("webp").default("webp"),
  outputQuality: z.number().int().min(1).max(100).default(IMAGE_DEFAULT_WEBP_QUALITY),
  /** Always true — stripping is a structural property of the `imagescript` decode step. */
  stripMetadata: z.literal(true).default(true),
  geometryEngine: z.literal(IMAGE_GEOMETRY_ENGINE).default(IMAGE_GEOMETRY_ENGINE),
  /** Unresolved as of Step 01 (jSquash WASM loading failed; wasm-vips untried) — nullable. */
  webpEncoder: z.enum(IMAGE_WEBP_ENCODER_CANDIDATES).nullable().default(null),
  storageBucket: z.literal(IMAGE_STORAGE_BUCKET).default(IMAGE_STORAGE_BUCKET),
}).strict()
  .refine(
    (spec) => spec.sourceWidthPx === spec.sourceHeightPx,
    { message: "source image must be square (sourceWidthPx must equal sourceHeightPx)", path: ["sourceHeightPx"] },
  );

// ---------------------------------------------------------------------------
// RecipeStageResult — generic envelope every chained stage invocation returns
// ---------------------------------------------------------------------------

export const recipeStageResultSchema = z.object({
  jobId: uuidSchema,
  batchId: uuidSchema.nullable().default(null),
  recipeId: uuidSchema.nullable().default(null),
  stage: recipeJobStageSchema,
  status: recipeJobStatusSchema,
  attempt: z.number().int().positive(),
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable().default(null),
  output: z.unknown().nullable().default(null),
  error: recipeErrorPayloadSchema.nullable().default(null),
}).strict();
