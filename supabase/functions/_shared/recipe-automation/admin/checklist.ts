// F2 Recipe Automation — Step 11: the admin approval checklist contract.
//
// PROMPT 11's "required human checklist" verbatim: cooking temperatures reviewed, cooking/waiting
// times reviewed, allergens reviewed, recipe content reviewed, both images reviewed. Approval must
// be "mechanically impossible" without all five — this module is the FIRST gate (fast, readable
// 400 on a bad request); `../../migrations/20260826120000_f2s11_recipe_admin_reviews.sql`'s own
// CHECK constraint on `recipe_admin_reviews` is the real, unbypassable backstop (see that
// migration's header) — this is defense in depth, not a substitute for it, same
// "the CHECK is the backstop, this is the actual routing decision" split every other stage in this
// pipeline already uses (see revise-stage.ts's MAX_AUTOMATIC_REVISIONS comment).
import { z } from "npm:zod@3.25.76";

export const approvalChecklistSchema = z.object({
  temperatureReviewed: z.literal(true),
  timingReviewed: z.literal(true),
  allergensReviewed: z.literal(true),
  contentReviewed: z.literal(true),
  imagesReviewed: z.literal(true),
}).strict();

export type ApprovalChecklist = z.infer<typeof approvalChecklistSchema>;

/** Loosened version accepted for actions OTHER than 'approve' (reject/request_revision/
 * retry_stage don't require any item true, but a caller may still legitimately send partial
 * progress, e.g. an admin who reviewed temperature/timing before deciding to request a revision
 * instead of approving) — every key optional, defaults to false. */
export const partialChecklistSchema = z.object({
  temperatureReviewed: z.boolean().default(false),
  timingReviewed: z.boolean().default(false),
  allergensReviewed: z.boolean().default(false),
  contentReviewed: z.boolean().default(false),
  imagesReviewed: z.boolean().default(false),
}).strict();

export type PartialChecklist = z.infer<typeof partialChecklistSchema>;

/** Column-name mapping, single source of truth for review-actions.ts's insert payload. */
export function checklistToRow(checklist: PartialChecklist): Record<string, boolean> {
  return {
    temperature_reviewed: checklist.temperatureReviewed,
    timing_reviewed: checklist.timingReviewed,
    allergens_reviewed: checklist.allergensReviewed,
    content_reviewed: checklist.contentReviewed,
    images_reviewed: checklist.imagesReviewed,
  };
}
