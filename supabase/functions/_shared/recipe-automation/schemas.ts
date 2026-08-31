// Canonical Zod contracts for the Hasat Recipe Automation pipeline (F2, Step 02 + Step 03A
// foundation reconciliation).
//
// These schemas are the single runtime-validated source of truth for every payload that
// crosses a stage boundary in the chained, short-lived Edge Function pipeline described in
// RecipeAutomation.md. `types.ts` in this same directory re-exports the inferred TypeScript
// types so callers can `import type` without pulling Zod into type-only positions.
//
// Step 03A reconciliation (2026-08-19/20): this file's Step 02 version was merged (PR #40)
// before the Master Plan's canonical state-machine vocabulary (RecipeAutomation.md §3) and the
// `RecipeQAResult` decision/score/blocking-issue contract (§5.3) were fully implemented. This
// revision aligns the stage/status enums and QA contract to those sections and to
// 02_Execution_Tracker.md's Step 03A gate, while keeping every previously-accepted live-schema
// mapping below unchanged.
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
import { z } from "npm:zod@3.25.76";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const nonEmptyTrimmedString = z.string().trim().min(1);
/** 0-100 inclusive, matches the RecipeQAResult `scores`/`overallScore` range in RecipeAutomation.md §5.3. */
const scoreSchema = z.number().min(0).max(100);

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
//
// Step 03A: adopted VERBATIM from RecipeAutomation.md §3 ("Önerilen job stage değerleri" /
// "Önerilen job status değerleri") instead of the Step 02 paraphrase (planning/drafting/
// qa_review/safety_review/image_generation/publish_ready/published), which omitted the revise
// loop, finalize step and awaiting-approval gate as distinct, addressable states. Using the
// Master Plan's own names — rather than a re-mapped equivalent — removes any translation layer
// between this contract and the canonical doc, which is the smallest-drift option available.
//
// `stage` is WHICH pipeline node a job is at; `status` is the OUTCOME of the job's current
// attempt at that stage. The two are orthogonal (e.g. stage='qa', status='running' while the QA
// agent call is in flight; stage='awaiting_approval', status='awaiting_approval' while a human
// reviewer hasn't acted yet — the Master Plan's own vocabulary reuses the same word for both,
// which is intentional: it is the natural resting state, not a modeling error).
//
// Standalone `safety_review` is NOT a pipeline stage here (Step 02 had one). Per §5.3 and §9,
// temperature/timing/allergen findings are always emitted as part of the QA agent's structured
// output (`recipeQAResultSchema.safetyReview` below) and are re-checked as an admin approval
// precondition (§9's publish contract) — they are a mandatory field on every QA result and a gate
// before `publish`, not a separate Edge Function stage node of their own.

export const RECIPE_JOB_STAGE_VALUES = [
  "plan",
  "write",
  "qa",
  "revise",
  "image",
  "finalize",
  "awaiting_approval",
  "publish",
] as const;
export const recipeJobStageSchema = z.enum(RECIPE_JOB_STAGE_VALUES);

export const RECIPE_JOB_STATUS_VALUES = [
  "queued",
  "running",
  "retryable",
  "failed",
  "awaiting_approval",
  "approved",
  "rejected",
  "completed",
  "cancelled",
] as const;
export const recipeJobStatusSchema = z.enum(RECIPE_JOB_STATUS_VALUES);

/** Batch-level lifecycle — coarser than a job's stage/status; see recipe_generation_batches. */
export const RECIPE_BATCH_STATUS_VALUES = ["active", "completed", "failed", "cancelled"] as const;
export const recipeBatchStatusSchema = z.enum(RECIPE_BATCH_STATUS_VALUES);

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
//
// Step 13 (Planner/plan-stage): added `audience`/`mealType`/`selectionReason` — the plan-diversity
// dimensions PROMPT 13 requires the Planner to balance across a batch (bireysel vs HoReCa, meal
// type mix) and the per-brief editorial justification PROMPT 13 requires be kept ("her brief için
// bir seçim gerekçesi sakla"). All three are additive: nothing before Step 13 ever constructed a
// `RecipeBrief` (see the Step 03A note below — briefs were never persisted until
// `recipe_plan_briefs`, Step 13), so this widens the contract without touching a shipped shape.
// `focusCrop` stays nullable at the Zod layer for backward compatibility with the existing
// `WriteStageBrief`/job-row mapping (write/context.ts's `briefFromJobRow` reads a possibly-null
// `focus_crop` column) — Step 13's own planning-stage rule ("primary crop'lar mutlaka
// crop_config'den gelmeli") is enforced as a BLOCKING diversity-gate issue instead
// (`validate_recipe_plan_diversity`'s `DIVERSITY_CROP_REQUIRED`/`DIVERSITY_CROP_NOT_IN_CONFIG`,
// f2s13 migration), not a schema-level `.min(1)` — same "Zod enforces shape, the deterministic
// Postgres RPC enforces the business rule" split every other stage in this pipeline already uses
// (see e.g. `recipeQAResultSchema`'s own header on refine-vs-RPC responsibilities).

/** Per-brief target audience — PROMPT 13's "hem bireysel hem HoReCa hedef kitlelerini kapsa". */
export const RECIPE_TARGET_AUDIENCE_VALUES = ["bireysel", "horeca"] as const;
export const recipeTargetAudienceSchema = z.enum(RECIPE_TARGET_AUDIENCE_VALUES);

/** Per-brief meal/dish type — PROMPT 13's "yemek türlerini ... dengele". Free-form Turkish meal
 * categories, not tied to any live DB enum (there is no `recipes.meal_type` column). */
export const RECIPE_MEAL_TYPE_VALUES = [
  "kahvalti",
  "ana_yemek",
  "aperatif_meze",
  "corba",
  "salata",
  "tatli",
  "icecek",
] as const;
export const recipeMealTypeSchema = z.enum(RECIPE_MEAL_TYPE_VALUES);

export const recipeBriefSchema = z.object({
  briefId: uuidSchema,
  batchId: uuidSchema,
  workingTitle: nonEmptyTrimmedString.max(200),
  /** Text crop slug matching `crop_config.crop`. Never a `crop_id`. Nullable at the Zod layer —
   * see this section's header for why "must come from crop_config" is a diversity-gate RPC check,
   * not a schema constraint. */
  focusCrop: nonEmptyTrimmedString.nullable().default(null),
  angle: z.string().trim().max(1000).nullable().default(null),
  targetDifficulty: recipeDifficultySchema.nullable().default(null),
  dietTags: z.array(nonEmptyTrimmedString).default([]),
  locale: z.string().trim().min(2).default("tr"),
  /** Defaults to 'bireysel' — a Planner that ignores audience mix still produces a schema-valid
   * (if diversity-flagged) brief rather than an outright parse failure. */
  audience: recipeTargetAudienceSchema.default("bireysel"),
  mealType: recipeMealTypeSchema.nullable().default(null),
  /** Required, non-empty — PROMPT 13: "her brief için bir seçim gerekçesi (selection reason)
   * sakla". Why THIS crop/angle/audience/difficulty was chosen, for the admin plan-review surface. */
  selectionReason: z.string().trim().min(1).max(1000),
}).strict();

// ---------------------------------------------------------------------------
// RecipePlanBatch — planning-stage output: a batch of briefs
// ---------------------------------------------------------------------------
//
// Step 03A: the Step 02 version carried a singular `jobId` alongside `briefs: RecipeBrief[]`.
// That is not representable: one planning pass creates MANY briefs, and only later — one at a
// time, as each brief is independently approved — does a single `recipe_generation_jobs` row
// (one job per approved brief) get created. A `RecipePlanBatch` is emitted before any job exists,
// so it cannot carry a `jobId` at all. `jobId` is removed outright (not renamed) rather than
// justified, because there is no reading of "the plan's job" that is coherent for a batch of N
// briefs. Stable identity going forward is `RecipeBrief.briefId` (already present, UUID,
// generated by the Planner) — `recipeDraftPayloadSchema.briefId` below carries that same value
// through drafting/QA/revision history, so a draft (and everything derived from it) can always be
// traced back to the exact brief it was written from, without a job-level indirection.
export const recipePlanBatchSchema = z.object({
  batchId: uuidSchema,
  briefs: z.array(recipeBriefSchema).min(1).max(25),
  plannedAt: isoDateTimeSchema,
  /** Which model/provider produced the plan. Intentionally free text — not hard-coded. */
  plannerModel: z.string().trim().min(1).nullable().default(null),
}).strict()
  .refine(
    (batch) => batch.briefs.every((brief) => brief.batchId === batch.batchId),
    { message: "every brief.batchId must match the batch's own batchId", path: ["briefs"] },
  )
  .refine(
    (batch) => new Set(batch.briefs.map((brief) => brief.briefId)).size === batch.briefs.length,
    { message: "every brief.briefId in a batch must be unique", path: ["briefs"] },
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
// RecipeQAResult — the real routing contract (Step 03A rebuild)
// ---------------------------------------------------------------------------
//
// Step 02's version (`passed: boolean` + a flat `issues[]` + nested `safetyReview`) collapsed
// the Master Plan's three-way routing decision (§5.3: approved | revision_required |
// manual_review_required) into a boolean, had no blocking/non-blocking issue split, no named
// score groups, and did not identify which exact draft/version was reviewed — so a QA result
// could not be unambiguously tied back to the draft it graded once a job had multiple draft
// versions (revision loop). This rebuild is a direct, field-for-field mapping of §5.3's
// structured output, plus `draftId`/`draftVersion` for exact-draft identity (enforced at the DB
// layer too — see the Step 03 migration's composite FK from recipe_qa_results to recipe_drafts).

/**
 * Shared issue shape for QA blocking issues, non-blocking suggestions, AND every Postgres
 * validation RPC's `issues` array (Step 04) — deliberately the SAME schema in both places so an
 * RPC's jsonb issue objects can be pushed directly into a `recipeQAResultSchema`-shaped array
 * without transformation. `code` is a stable, machine-matchable identifier (never renamed once
 * shipped); `field`/`message` remain human-readable location + description; `requiredChange` is
 * the concrete fix a reviision pass should make, non-null for anything actually actionable.
 */
export const recipeQAIssueSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "code must be SCREAMING_SNAKE_CASE"),
  field: nonEmptyTrimmedString,
  severity: z.enum(["info", "warning", "blocking"]),
  message: nonEmptyTrimmedString.max(1000),
  requiredChange: z.string().trim().min(1).max(1000).nullable().default(null),
}).strict();

export const RECIPE_QA_DECISION_VALUES = ["approved", "revision_required", "manual_review_required"] as const;
export const recipeQADecisionSchema = z.enum(RECIPE_QA_DECISION_VALUES);

export const recipeQAResultSchema = z.object({
  jobId: uuidSchema,
  /** Exact draft reviewed — both required so a result can never be ambiguous about its target. */
  draftId: uuidSchema,
  draftVersion: z.number().int().positive(),
  recipeId: uuidSchema.nullable().default(null),
  decision: recipeQADecisionSchema,
  overallScore: scoreSchema,
  /** Named score groups, verbatim from RecipeAutomation.md §5.3's structured-output example. */
  scores: z.object({
    clarity: scoreSchema,
    feasibility: scoreSchema,
    ingredientConsistency: scoreSchema,
    originality: scoreSchema,
    hasatRelevance: scoreSchema,
  }).strict(),
  blockingIssues: z.array(recipeQAIssueSchema.extend({ severity: z.literal("blocking") }).strict()).default([]),
  nonBlockingSuggestions: z.array(
    recipeQAIssueSchema.extend({ severity: z.enum(["info", "warning"]) }).strict(),
  ).default([]),
  /** Mandatory temperature/timing/allergen findings — never resolvable by score, always human-gated. */
  safetyReview: recipeSafetyReviewSchema,
  approvedForImaging: z.boolean(),
  checkedAt: isoDateTimeSchema,
  /** Which model/provider ran QA. Intentionally free text — not hard-coded. */
  model: z.string().trim().min(1).nullable().default(null),
}).strict()
  .refine(
    (qa) => qa.decision !== "approved" || qa.blockingIssues.length === 0,
    { message: "decision cannot be 'approved' while blockingIssues is non-empty", path: ["decision"] },
  )
  .refine(
    (qa) => qa.blockingIssues.length === 0 || !qa.approvedForImaging,
    { message: "approvedForImaging cannot be true while blockingIssues is non-empty", path: ["approvedForImaging"] },
  )
  .refine(
    (qa) => qa.approvedForImaging === (qa.decision === "approved" && qa.blockingIssues.length === 0),
    {
      message: "approvedForImaging must be true iff decision is 'approved' and there are no blockingIssues",
      path: ["approvedForImaging"],
    },
  );
// Note on "QA must not impersonate a human reviewer" (Step 03A brief item 3): this QA result's
// own `decision` is an automated content/structure verdict, deliberately independent from
// `safetyReview.approved` — the human temperature/timing/allergen sign-off happens later, at the
// admin draft-review gate (RecipeAutomation.md §10), not inside this schema. What this schema DOES
// enforce is that `safetyReview.approved` itself can never be true without a human identity/
// timestamp (`reviewedBy`/`reviewedAt`, required by `recipeSafetyReviewSchema`'s own refine above)
// — an automated QA pass has no way to set that field to true on its own, regardless of `decision`.

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
