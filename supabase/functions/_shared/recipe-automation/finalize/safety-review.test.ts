// Deno.test suite for safety-review.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/finalize/safety-review.test.ts
import assert from "node:assert/strict";
import { validateSafetyReviewPresence } from "./safety-review.ts";
import type { RecipeSafetyReview } from "../types.ts";

function validSafetyReview(overrides: Partial<RecipeSafetyReview> = {}): RecipeSafetyReview {
  return {
    temperature: { flagged: false, notes: null },
    timing: { flagged: false, notes: null },
    allergens: { flagged: true, notes: "Sut icerir.", detectedLabels: ["sut"] },
    requiresHumanReview: true,
    reviewedBy: null,
    reviewedAt: null,
    approved: null,
    ...overrides,
  };
}

Deno.test("validateSafetyReviewPresence: a fully-present safety review has no issues", () => {
  assert.deepEqual(validateSafetyReviewPresence(validSafetyReview()), []);
});

Deno.test("validateSafetyReviewPresence: unreviewed-by-a-human is still fine (that gate is later, not this check)", () => {
  // reviewedBy/reviewedAt/approved are all null here — this check must not require them.
  assert.deepEqual(validateSafetyReviewPresence(validSafetyReview()), []);
});

Deno.test("validateSafetyReviewPresence: a totally missing safety review is reported", () => {
  const issues = validateSafetyReviewPresence(null);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "FINALIZE_SAFETY_REVIEW_MISSING");
});

Deno.test("validateSafetyReviewPresence: a missing temperature finding is reported", () => {
  const review = validSafetyReview();
  const malformed = { ...review, temperature: undefined } as unknown as RecipeSafetyReview;
  const issues = validateSafetyReviewPresence(malformed);
  assert.ok(issues.some((i) => i.code === "FINALIZE_SAFETY_TEMPERATURE_MISSING"));
});

Deno.test("validateSafetyReviewPresence: a malformed timing finding (no boolean flagged) is reported", () => {
  const review = validSafetyReview();
  const malformed = { ...review, timing: { notes: "eksik" } } as unknown as RecipeSafetyReview;
  const issues = validateSafetyReviewPresence(malformed);
  assert.ok(issues.some((i) => i.code === "FINALIZE_SAFETY_TIMING_MISSING"));
});

Deno.test("validateSafetyReviewPresence: a missing allergens finding is reported", () => {
  const review = validSafetyReview();
  const malformed = { ...review, allergens: null } as unknown as RecipeSafetyReview;
  const issues = validateSafetyReviewPresence(malformed);
  assert.ok(issues.some((i) => i.code === "FINALIZE_SAFETY_ALLERGENS_MISSING"));
});

Deno.test("validateSafetyReviewPresence: requiresHumanReview !== true is reported", () => {
  const review = validSafetyReview();
  const malformed = { ...review, requiresHumanReview: false } as unknown as RecipeSafetyReview;
  const issues = validateSafetyReviewPresence(malformed);
  assert.ok(issues.some((i) => i.code === "FINALIZE_SAFETY_REQUIRES_HUMAN_REVIEW_NOT_TRUE"));
});
