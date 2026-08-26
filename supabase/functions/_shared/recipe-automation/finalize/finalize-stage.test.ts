// Deno.test suite for finalize-stage.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/finalize/
import assert from "node:assert/strict";
import { runFinalizeStage } from "./finalize-stage.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { validKabakRecipeDraft } from "../fixtures/valid-kabak-recipe.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

const PASS_ISSUES = { valid: true, issues: [] };
const SLUG = "firinda-kabak-musakka"; // slugifyTitle(validKabakRecipeDraft.title)

/** Happy-path stubs for every Postgres RPC validateDraft() (../writer/validate-draft.ts) calls —
 * same fixture qa-stage.test.ts/revise-stage.test.ts use. finalize-stage.ts never calls
 * find_recipe_duplicates or dispatch_recipe_stage (there is no next-stage function to dispatch
 * to), so those are deliberately NOT registered here. */
function registerHappyPathRpcs(client: FakeSupabaseClient) {
  client.onRpc("validate_recipe_structure", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_crop_values", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_ingredient_coverage", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_slug", () => ({ data: { valid: true, issues: [], slug: SLUG }, error: null }));
  client.onRpc("normalize_recipe_units", (args) => ({ data: args.p_ingredients, error: null }));
}

function seedFinalizeJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    brief_id: crypto.randomUUID(),
    recipe_id: null,
    working_title: validKabakRecipeDraft.title,
    stage: "finalize",
    status: "queued",
    attempt: 1,
    max_attempts: 3,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  }]);
  return jobId;
}

function seedDraft(client: FakeSupabaseClient, jobId: string, version: number, overrides: Record<string, unknown> = {}) {
  const draftId = crypto.randomUUID();
  client.seed("recipe_drafts", [{
    id: draftId,
    job_id: jobId,
    version,
    title: validKabakRecipeDraft.title,
    description: validKabakRecipeDraft.description,
    cover_photo_url: validKabakRecipeDraft.coverPhotoUrl,
    servings: validKabakRecipeDraft.servings,
    prep_minutes: validKabakRecipeDraft.prepMinutes,
    cook_minutes: validKabakRecipeDraft.cookMinutes,
    rest_minutes: validKabakRecipeDraft.restMinutes,
    difficulty: validKabakRecipeDraft.difficulty,
    cuisine: validKabakRecipeDraft.cuisine,
    diet_tags: validKabakRecipeDraft.dietTags,
    allergen_labels: validKabakRecipeDraft.allergenLabels,
    required_equipment: validKabakRecipeDraft.requiredEquipment,
    source_type: validKabakRecipeDraft.sourceType,
    author_type: validKabakRecipeDraft.authorType,
    visibility: validKabakRecipeDraft.visibility,
    owner_id: validKabakRecipeDraft.ownerId,
    extraction_confidence: validKabakRecipeDraft.extractionConfidence,
    ingredients: validKabakRecipeDraft.ingredients,
    steps: validKabakRecipeDraft.steps,
    ...overrides,
  }]);
  return draftId;
}

function seedQaResult(
  client: FakeSupabaseClient,
  jobId: string,
  draftId: string,
  draftVersion: number,
  overrides: Record<string, unknown> = {},
) {
  const qaResultId = crypto.randomUUID();
  client.seed("recipe_qa_results", [{
    id: qaResultId,
    job_id: jobId,
    draft_id: draftId,
    draft_version: draftVersion,
    recipe_id: null,
    decision: "approved",
    approved_for_imaging: true,
    blocking_issues: [],
    safety_review: {
      temperature: { flagged: false, notes: null },
      timing: { flagged: false, notes: null },
      allergens: { flagged: true, notes: "Sut icerir.", detectedLabels: ["sut"] },
      requiresHumanReview: true,
      reviewedBy: null,
      reviewedAt: null,
      approved: null,
    },
    checked_at: new Date().toISOString(),
    ...overrides,
  }]);
  return qaResultId;
}

function validProcessingParams(overrides: Record<string, unknown> = {}) {
  return {
    chopFraction: 0.14,
    cropAlignment: "center",
    geometryEngine: "imagescript",
    webpEncoder: "jsquash-webp",
    outputQuality: 82,
    ...overrides,
  };
}

function seedAsset(
  client: FakeSupabaseClient,
  jobId: string,
  draftId: string,
  assetType: "hero" | "square",
  overrides: Record<string, unknown> = {},
) {
  const assetId = crypto.randomUUID();
  const dims = assetType === "hero" ? { width_px: 878, height_px: 494 } : { width_px: 878, height_px: 878 };
  client.seed("recipe_assets", [{
    id: assetId,
    job_id: jobId,
    draft_id: draftId,
    asset_type: assetType,
    storage_bucket: "crop-photos",
    storage_path: `${SLUG}-${assetType === "hero" ? "16x9" : "1x1"}.webp`,
    content_type: "image/webp",
    ...dims,
    quality: 82,
    validation_status: "passed",
    processing_params: validProcessingParams(),
    ...overrides,
  }]);
  return assetId;
}

/** Seeds a job with a current draft, an approving QA result for that exact draft version, and
 * conformant hero+square assets — the full happy-path fixture every failure test starts from and
 * then deliberately breaks one piece of. */
function seedFullyReadyJob(client: FakeSupabaseClient, jobOverrides: Record<string, unknown> = {}) {
  const jobId = seedFinalizeJob(client, jobOverrides);
  const draftId = seedDraft(client, jobId, 1);
  const qaResultId = seedQaResult(client, jobId, draftId, 1);
  seedAsset(client, jobId, draftId, "hero");
  seedAsset(client, jobId, draftId, "square");
  return { jobId, draftId, qaResultId };
}

Deno.test("runFinalizeStage: not_claimed when the job isn't at the finalize stage", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedFinalizeJob(client, { stage: "image" });

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "not_claimed");
});

Deno.test("runFinalizeStage: no_current_draft when the job has no recipe_drafts row", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedFinalizeJob(client);

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "no_current_draft");
});

Deno.test("runFinalizeStage: no_approved_qa_result when the latest QA result isn't approved", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedFinalizeJob(client);
  const draftId = seedDraft(client, jobId, 1);
  seedQaResult(client, jobId, draftId, 1, { decision: "revision_required", approved_for_imaging: false });

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "no_approved_qa_result");
});

Deno.test("runFinalizeStage: stale_qa_version when QA approved an older draft version than the current one", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedFinalizeJob(client);
  const draftV1 = seedDraft(client, jobId, 1);
  seedDraft(client, jobId, 2); // a newer draft version exists that QA never reviewed
  seedQaResult(client, jobId, draftV1, 1);

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "stale_qa_version");
});

Deno.test("runFinalizeStage: blocking_issues_remain when the QA row still carries blocking issues", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedFinalizeJob(client);
  const draftId = seedDraft(client, jobId, 1);
  seedQaResult(client, jobId, draftId, 1, {
    blocking_issues: [
      { code: "UNUSED_INGREDIENT", field: "ingredients[1]", severity: "blocking", message: "x", requiredChange: "y" },
    ],
  });

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "blocking_issues_remain");
  assert.equal(result.issues?.length, 1);
});

Deno.test("runFinalizeStage: safety_review_incomplete when a required safety finding is missing", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedFinalizeJob(client);
  const draftId = seedDraft(client, jobId, 1);
  seedQaResult(client, jobId, draftId, 1, {
    safety_review: {
      timing: { flagged: false, notes: null },
      allergens: { flagged: false, notes: null, detectedLabels: [] },
      requiresHumanReview: true,
      reviewedBy: null,
      reviewedAt: null,
      approved: null,
      // temperature deliberately omitted
    },
  });

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "safety_review_incomplete");
  assert.ok(result.issues?.some((i) => i.code === "FINALIZE_SAFETY_TEMPERATURE_MISSING"));
});

Deno.test("runFinalizeStage: postgres_validation_failed when a re-run structure/crop check fails", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedFullyReadyJob(client);
  client.onRpc("validate_recipe_structure", () => ({
    data: {
      valid: false,
      issues: [{ code: "TITLE_MISSING", field: "title", severity: "blocking", message: "x", requiredChange: null }],
    },
    error: null,
  }));
  client.onRpc("validate_recipe_crop_values", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_ingredient_coverage", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_slug", () => ({ data: { valid: true, issues: [], slug: SLUG }, error: null }));
  client.onRpc("normalize_recipe_units", (args) => ({ data: args.p_ingredients, error: null }));

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "postgres_validation_failed");
});

Deno.test("runFinalizeStage: missing_image_assets when the square variant was never stored", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const jobId = seedFinalizeJob(client);
  const draftId = seedDraft(client, jobId, 1);
  seedQaResult(client, jobId, draftId, 1);
  seedAsset(client, jobId, draftId, "hero");
  // square intentionally not seeded

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "missing_image_assets");
});

Deno.test("runFinalizeStage: invalid_image_assets when a stored asset doesn't match the Step 09 contract", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const jobId = seedFinalizeJob(client);
  const draftId = seedDraft(client, jobId, 1);
  seedQaResult(client, jobId, draftId, 1);
  seedAsset(client, jobId, draftId, "hero", { storage_bucket: "recipe-photos" });
  seedAsset(client, jobId, draftId, "square");

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "invalid_image_assets");
  assert.ok(result.issues?.some((i) => i.code === "FINALIZE_ASSET_BUCKET_MISMATCH"));
});

Deno.test("runFinalizeStage: a warning validation_status (frame suspicion) does not block finalization", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const jobId = seedFinalizeJob(client);
  const draftId = seedDraft(client, jobId, 1);
  seedQaResult(client, jobId, draftId, 1);
  seedAsset(client, jobId, draftId, "hero", { validation_status: "warning" });
  seedAsset(client, jobId, draftId, "square");

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "finalized");
});

Deno.test("runFinalizeStage: unresolved_stage_error when the most recent upstream stage run failed", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const { jobId } = seedFullyReadyJob(client);
  client.seed("recipe_generation_stage_runs", [{
    id: crypto.randomUUID(),
    job_id: jobId,
    batch_id: crypto.randomUUID(),
    stage: "image",
    status: "failed",
    attempt: 1,
    started_at: new Date(Date.now() - 1000).toISOString(),
    created_at: new Date().toISOString(),
  }]);

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "unresolved_stage_error");
});

Deno.test("runFinalizeStage: finalize's own earlier failed attempt never self-blocks a later retry", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const { jobId } = seedFullyReadyJob(client);
  // A prior finalize attempt's own failure — must be excluded from the "unresolved stage error"
  // scan (see context.ts's loadLatestUpstreamStageRun header).
  client.seed("recipe_generation_stage_runs", [{
    id: crypto.randomUUID(),
    job_id: jobId,
    batch_id: crypto.randomUUID(),
    stage: "finalize",
    status: "failed",
    attempt: 1,
    started_at: new Date(Date.now() - 1000).toISOString(),
    created_at: new Date().toISOString(),
  }]);

  const result = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(result.outcome, "finalized");
});

Deno.test("runFinalizeStage: successful finalization moves the job to stage=awaiting_approval", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const { jobId, draftId } = seedFullyReadyJob(client);

  const result = await runFinalizeStage(asClient(client), { jobId });

  assert.equal(result.outcome, "finalized");
  assert.equal(result.draftId, draftId);
  assert.equal(result.draftVersion, 1);

  const jobRow = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(jobRow.stage, "awaiting_approval");
  assert.equal(jobRow.status, "awaiting_approval");
  assert.equal(jobRow.locked_by, null); // advanceStage always releases the lock
});

Deno.test("runFinalizeStage: duplicate invocation after a successful finalization is a safe not_claimed", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const { jobId } = seedFullyReadyJob(client);

  const first = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(first.outcome, "finalized");

  const second = await runFinalizeStage(asClient(client), { jobId });
  assert.equal(second.outcome, "not_claimed");
  assert.equal(second.claimReason, "wrong_stage");
});
