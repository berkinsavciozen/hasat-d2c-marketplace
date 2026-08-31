// Canonical TypeScript types for the Hasat Recipe Automation pipeline (F2, Step 02).
//
// Every type here is inferred directly from the Zod schemas in `./schemas.ts` — there is no
// hand-maintained duplicate shape to drift out of sync. Import from this file (as `import type`)
// wherever only the compile-time type is needed; import from `./schemas.ts` wherever runtime
// validation is required.
import type { z } from "npm:zod@3.25.76";
import type {
  recipeAuthorTypeSchema,
  recipeBatchInputSchema,
  recipeBatchStatusSchema,
  recipeBriefSchema,
  recipeDifficultySchema,
  recipeDraftPayloadSchema,
  recipeErrorPayloadSchema,
  recipeImageCropTargetSchema,
  recipeImageSpecSchema,
  recipeIngredientClassSchema,
  recipeIngredientDraftSchema,
  recipeJobStageSchema,
  recipeJobStatusSchema,
  recipeMealTypeSchema,
  recipePlanBatchSchema,
  recipeQADecisionSchema,
  recipeQAIssueSchema,
  recipeQAResultSchema,
  recipeSafetyReviewSchema,
  recipeSourceTypeSchema,
  recipeStageResultSchema,
  recipeStepDraftSchema,
  recipeTargetAudienceSchema,
  recipeVisibilitySchema,
} from "./schemas.ts";

export type RecipeDifficulty = z.infer<typeof recipeDifficultySchema>;
export type RecipeAuthorType = z.infer<typeof recipeAuthorTypeSchema>;
export type RecipeSourceType = z.infer<typeof recipeSourceTypeSchema>;
export type RecipeVisibility = z.infer<typeof recipeVisibilitySchema>;
export type RecipeIngredientClass = z.infer<typeof recipeIngredientClassSchema>;

/** Pipeline stage — separate value space from `recipes.status` (draft | published only). */
export type RecipeJobStage = z.infer<typeof recipeJobStageSchema>;
export type RecipeJobStatus = z.infer<typeof recipeJobStatusSchema>;
export type RecipeBatchStatus = z.infer<typeof recipeBatchStatusSchema>;

export type RecipeErrorPayload = z.infer<typeof recipeErrorPayloadSchema>;

export type RecipeBatchInput = z.infer<typeof recipeBatchInputSchema>;
export type RecipeTargetAudience = z.infer<typeof recipeTargetAudienceSchema>;
export type RecipeMealType = z.infer<typeof recipeMealTypeSchema>;
export type RecipeBrief = z.infer<typeof recipeBriefSchema>;
export type RecipePlanBatch = z.infer<typeof recipePlanBatchSchema>;

export type RecipeIngredientDraft = z.infer<typeof recipeIngredientDraftSchema>;
export type RecipeStepDraft = z.infer<typeof recipeStepDraftSchema>;
export type RecipeDraftPayload = z.infer<typeof recipeDraftPayloadSchema>;

export type RecipeSafetyReview = z.infer<typeof recipeSafetyReviewSchema>;
export type RecipeQADecision = z.infer<typeof recipeQADecisionSchema>;
export type RecipeQAIssue = z.infer<typeof recipeQAIssueSchema>;
export type RecipeQAResult = z.infer<typeof recipeQAResultSchema>;

export type RecipeImageCropTarget = z.infer<typeof recipeImageCropTargetSchema>;
export type RecipeImageSpec = z.infer<typeof recipeImageSpecSchema>;

export type RecipeStageResult = z.infer<typeof recipeStageResultSchema>;
