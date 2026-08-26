// Deno.test suite for checklist.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/
import assert from "node:assert/strict";
import { approvalChecklistSchema, checklistToRow, partialChecklistSchema } from "./checklist.ts";

const FULL = {
  temperatureReviewed: true,
  timingReviewed: true,
  allergensReviewed: true,
  contentReviewed: true,
  imagesReviewed: true,
};

Deno.test("approvalChecklistSchema: accepts only when every item is literal true", () => {
  assert.equal(approvalChecklistSchema.safeParse(FULL).success, true);
});

for (const key of Object.keys(FULL)) {
  Deno.test(`approvalChecklistSchema: rejects when ${key} is false`, () => {
    const result = approvalChecklistSchema.safeParse({ ...FULL, [key]: false });
    assert.equal(result.success, false);
  });

  Deno.test(`approvalChecklistSchema: rejects when ${key} is missing`, () => {
    const partial = { ...FULL } as Record<string, unknown>;
    delete partial[key];
    const result = approvalChecklistSchema.safeParse(partial);
    assert.equal(result.success, false);
  });
}

Deno.test("approvalChecklistSchema: rejects a truthy-but-not-boolean-true value", () => {
  // Guards against a client sending e.g. the string "true" — must be the JSON literal `true`.
  const result = approvalChecklistSchema.safeParse({ ...FULL, imagesReviewed: "true" });
  assert.equal(result.success, false);
});

Deno.test("approvalChecklistSchema: rejects unknown extra keys (.strict())", () => {
  const result = approvalChecklistSchema.safeParse({ ...FULL, extra: true });
  assert.equal(result.success, false);
});

Deno.test("partialChecklistSchema: defaults every item to false when omitted", () => {
  const result = partialChecklistSchema.parse({});
  assert.deepEqual(result, {
    temperatureReviewed: false,
    timingReviewed: false,
    allergensReviewed: false,
    contentReviewed: false,
    imagesReviewed: false,
  });
});

Deno.test("checklistToRow: maps camelCase to the recipe_admin_reviews snake_case columns", () => {
  const row = checklistToRow(FULL);
  assert.deepEqual(row, {
    temperature_reviewed: true,
    timing_reviewed: true,
    allergens_reviewed: true,
    content_reviewed: true,
    images_reviewed: true,
  });
});
