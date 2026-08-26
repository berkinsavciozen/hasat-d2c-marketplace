// F2 Recipe Automation — Step 10: structural completeness check for a QA result's safety review.
//
// "safety review requirements for temperature, timing and allergens are present" (PROMPT 10) — a
// SHAPE check, not a human-approval check. The human sign-off itself (`safety_approved`,
// `safety_reviewed_by`, `safety_reviewed_at`) is a LATER gate (Step 11/12,
// RecipeAutomation.md §9's awaiting_approval/publish precondition) and is never touched, read, or
// bypassed here — see `recipe_qa_results`'s own migration comment: "Temperature, timing ve
// allergen insan checklist'i awaiting_approval/publish kapısında zorunlu kalır ve asla QA skoru
// ile bypass edilmez."
//
// `recipeSafetyReviewSchema` (schemas.ts) already requires temperature/timing/allergens findings
// on every `recipe_qa_results` row written through the Zod layer, and the DB's own
// `jsonb_typeof(safety_review) = 'object'` CHECK backs that up loosely — but neither guarantees the
// three specific sub-keys survived a row this stage didn't write itself (a hand-run admin fix, a
// direct SQL insert bypassing the Edge Function). This module re-verifies that shape defensively,
// the same "don't just trust upstream" posture `finalize-stage.ts` takes everywhere else.
import type { RecipeQAIssue, RecipeSafetyReview } from "../types.ts";

function issue(code: string, field: string, message: string): RecipeQAIssue {
  return { code, field, severity: "blocking", message, requiredChange: null };
}

function isFindingPresent(value: unknown): value is { flagged: boolean } {
  return Boolean(value) && typeof value === "object" &&
    typeof (value as { flagged?: unknown }).flagged === "boolean";
}

/** Returns an empty array iff `safetyReview` has all three required findings, each shaped as
 * `{ flagged: boolean, ... }`, and `requiresHumanReview === true`. Never inspects `approved`/
 * `reviewedBy`/`reviewedAt` — those are the human sign-off itself, out of scope for this check. */
export function validateSafetyReviewPresence(
  safetyReview: RecipeSafetyReview | null | undefined,
): RecipeQAIssue[] {
  const review = safetyReview as unknown as Record<string, unknown> | null | undefined;

  if (!review || typeof review !== "object") {
    return [issue(
      "FINALIZE_SAFETY_REVIEW_MISSING",
      "safetyReview",
      "QA result has no safety_review recorded",
    )];
  }

  const issues: RecipeQAIssue[] = [];

  if (!isFindingPresent(review.temperature)) {
    issues.push(issue(
      "FINALIZE_SAFETY_TEMPERATURE_MISSING",
      "safetyReview.temperature",
      "temperature safety finding is missing or malformed",
    ));
  }
  if (!isFindingPresent(review.timing)) {
    issues.push(issue(
      "FINALIZE_SAFETY_TIMING_MISSING",
      "safetyReview.timing",
      "timing safety finding is missing or malformed",
    ));
  }
  if (!isFindingPresent(review.allergens)) {
    issues.push(issue(
      "FINALIZE_SAFETY_ALLERGENS_MISSING",
      "safetyReview.allergens",
      "allergens safety finding is missing or malformed",
    ));
  }
  if (review.requiresHumanReview !== true) {
    issues.push(issue(
      "FINALIZE_SAFETY_REQUIRES_HUMAN_REVIEW_NOT_TRUE",
      "safetyReview.requiresHumanReview",
      "requiresHumanReview must always be true",
    ));
  }

  return issues;
}
