// Deno.test suite for publish-stage.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/publish/
import assert from "node:assert/strict";
import { runPublishStage } from "./publish-stage.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function seedReadyJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const jobId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: batchId,
    stage: "awaiting_approval",
    status: "approved",
    attempt: 1,
    max_attempts: 3,
    recipe_id: null,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  }]);
  return { jobId, batchId };
}

function seedDraft(client: FakeSupabaseClient, jobId: string, overrides: Record<string, unknown> = {}) {
  const draftId = crypto.randomUUID();
  client.seed("recipe_drafts", [{
    id: draftId,
    job_id: jobId,
    version: 1,
    title: "Firinda Kabak Dolmasi",
    description: null,
    cover_photo_url: null,
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 30,
    rest_minutes: null,
    difficulty: "kolay",
    cuisine: null,
    diet_tags: [],
    allergen_labels: null,
    required_equipment: null,
    source_type: "manual",
    author_type: "hasat",
    visibility: "private",
    owner_id: null,
    extraction_confidence: null,
    ingredients: [{ crop: "kabak", isKeyIngredient: true, sortOrder: 0 }],
    steps: [{ stepNo: 1, instruction: "Kabagi dilimleyin." }],
    ...overrides,
  }]);
  return draftId;
}

Deno.test("runPublishStage: an already-completed job short-circuits to already_published without claiming", async () => {
  const client = new FakeSupabaseClient();
  const recipeId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    stage: "publish",
    status: "completed",
    recipe_id: recipeId,
    locked_by: null,
  }]);
  client.seed("recipes", [{ id: recipeId, slug: "firinda-kabak-dolmasi", status: "published" }]);

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "already_published");
  assert.equal(result.recipeId, recipeId);
  assert.equal(result.slug, "firinda-kabak-dolmasi");

  // No claim was ever attempted — the job row is untouched.
  const row = client.getRow("recipe_generation_jobs", jobId);
  assert.equal(row?.stage, "publish");
  assert.equal(row?.status, "completed");
  assert.equal(row?.locked_by, null);
});

Deno.test("runPublishStage: job_not_found for an unknown job id", async () => {
  const client = new FakeSupabaseClient();
  const result = await runPublishStage(asClient(client), { jobId: crypto.randomUUID() });
  assert.equal(result.outcome, "job_not_found");
});

Deno.test("runPublishStage: a job never approved (still at an earlier stage) is not_claimed", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedReadyJob(client, { stage: "qa", status: "queued" });

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "not_claimed");
  assert.equal(result.claimReason, "wrong_stage");
});

Deno.test("runPublishStage: no_current_draft fails the job when the claimed job has no draft", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedReadyJob(client);

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "no_current_draft");

  const row = client.getRow("recipe_generation_jobs", jobId);
  assert.equal(row?.stage, "publish"); // enterPublishStage already moved it here
  assert.equal(row?.status, "retryable"); // failJob: retryable error, attempt(1) < max_attempts(3)
  assert.equal(row?.locked_by, null); // lock released
});

Deno.test("runPublishStage: happy path calls publish_recipe_draft with the resolved slug and lock token, and reports the new recipe", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, batchId } = seedReadyJob(client);
  const draftId = seedDraft(client, jobId);

  const capturedArgs: Record<string, unknown>[] = [];
  const recipeId = crypto.randomUUID();
  client.onRpc("publish_recipe_draft", (args) => {
    capturedArgs.push(args);
    return { data: { ok: true, recipeId, slug: "firinda-kabak-dolmasi", alreadyPublished: false }, error: null };
  });

  const result = await runPublishStage(asClient(client), { jobId });

  assert.equal(result.outcome, "published");
  assert.equal(result.recipeId, recipeId);
  assert.equal(result.slug, "firinda-kabak-dolmasi");
  assert.equal(result.draftId, draftId);
  assert.equal(result.draftVersion, 1);

  assert.equal(capturedArgs.length, 1);
  assert.equal(capturedArgs[0]._job_id, jobId);
  assert.equal(capturedArgs[0]._slug, "firinda-kabak-dolmasi");
  assert.equal(typeof capturedArgs[0]._lock_token, "string");
  assert.ok((capturedArgs[0]._lock_token as string).length > 0);

  void batchId;
});

Deno.test("runPublishStage: an RPC failure maps to the matching outcome and fails the job", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedReadyJob(client);
  seedDraft(client, jobId);

  client.onRpc("publish_recipe_draft", () => ({
    data: null,
    error: { message: 'PUBLISH_SLUG_ALREADY_USED: slug "firinda-kabak-dolmasi" is already used by an existing recipe' },
  }));

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "slug_already_used");
  assert.equal(result.errorCode, "PUBLISH_SLUG_ALREADY_USED");

  const row = client.getRow("recipe_generation_jobs", jobId);
  assert.equal(row?.status, "failed"); // non-retryable
  assert.equal(row?.locked_by, null);
});

Deno.test("runPublishStage: a retryable RPC failure (missing assets) leaves the job retryable", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedReadyJob(client);
  seedDraft(client, jobId);

  client.onRpc("publish_recipe_draft", () => ({
    data: null,
    error: { message: "PUBLISH_MISSING_ASSETS: job is missing recipe_assets row(s): square" },
  }));

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "missing_assets");

  const row = client.getRow("recipe_generation_jobs", jobId);
  assert.equal(row?.status, "retryable");
});

Deno.test("runPublishStage: the RPC's own defensive already-published reply is passed through", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedReadyJob(client);
  seedDraft(client, jobId);
  const recipeId = crypto.randomUUID();

  client.onRpc("publish_recipe_draft", () => ({
    data: { ok: true, recipeId, slug: "firinda-kabak-dolmasi", alreadyPublished: true },
    error: null,
  }));
  let nutritionCalls = 0;
  client.onRpc("calculate_recipe_nutrition", () => {
    nutritionCalls++;
    return { data: null, error: null };
  });

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "already_published");
  assert.equal(result.recipeId, recipeId);
  // A repeated/idempotent-replay publish is not a real F2 publish transition — F0-24 lifecycle
  // wiring (dispatch requirement: "F2 publish — status -> 'published' transition") must not fire.
  assert.equal(result.nutritionRecalc, undefined);
  assert.equal(nutritionCalls, 0);
});

Deno.test("runPublishStage: a genuine publish transition triggers the F0-24 nutrition recalc as a best-effort side effect", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedReadyJob(client);
  seedDraft(client, jobId);
  const recipeId = crypto.randomUUID();

  client.onRpc("publish_recipe_draft", () => ({
    data: { ok: true, recipeId, slug: "firinda-kabak-dolmasi", alreadyPublished: false },
    error: null,
  }));
  // The publish RPC itself creates the live `recipes` row transactionally; the fake client has no
  // trigger/transaction engine to do that for us, so this test seeds it directly to exercise
  // invokeNutritionRecalc's own read the same way the real service-role client would see it
  // immediately after a real publish_recipe_draft call commits.
  client.seed("recipes", [{ id: recipeId, status: "published", servings: 4, nutrition_input_hash: null }]);
  let nutritionCalls = 0;
  const nutritionArgs: Record<string, unknown>[] = [];
  client.onRpc("calculate_recipe_nutrition", (args) => {
    nutritionCalls++;
    nutritionArgs.push(args);
    return { data: null, error: null };
  });

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "published");
  assert.equal(result.nutritionRecalc, "recalculated");
  assert.equal(nutritionCalls, 1);
  assert.equal(nutritionArgs[0].p_recipe_id, recipeId);
});

Deno.test("runPublishStage: a nutrition recalc failure never fails an otherwise-successful publish", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedReadyJob(client);
  seedDraft(client, jobId);
  const recipeId = crypto.randomUUID();

  client.onRpc("publish_recipe_draft", () => ({
    data: { ok: true, recipeId, slug: "firinda-kabak-dolmasi", alreadyPublished: false },
    error: null,
  }));
  client.seed("recipes", [{ id: recipeId, status: "published", servings: 4, nutrition_input_hash: null }]);
  client.onRpc("calculate_recipe_nutrition", () => ({
    data: null,
    error: { message: "crop_nutrition lookup failed", code: "XX000" },
  }));

  const result = await runPublishStage(asClient(client), { jobId });
  assert.equal(result.outcome, "published"); // still a successful publish
  assert.equal(result.recipeId, recipeId);
  assert.equal(result.nutritionRecalc, "failed"); // visible, but never blocking
});
