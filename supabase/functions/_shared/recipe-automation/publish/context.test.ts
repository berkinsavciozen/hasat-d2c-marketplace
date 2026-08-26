// Deno.test suite for context.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/publish/
import assert from "node:assert/strict";
import { enterPublishStage, loadJobSummary, loadPublishedRecipeSummary } from "./context.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

Deno.test("loadJobSummary: returns null for an unknown job id", async () => {
  const client = new FakeSupabaseClient();
  const result = await loadJobSummary(asClient(client), crypto.randomUUID());
  assert.equal(result, null);
});

Deno.test("loadJobSummary: maps a job row into the typed summary", async () => {
  const client = new FakeSupabaseClient();
  const jobId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: batchId,
    stage: "publish",
    status: "completed",
    attempt: 2,
    recipe_id: "recipe-1",
  }]);

  const result = await loadJobSummary(asClient(client), jobId);
  assert.deepEqual(result, {
    id: jobId,
    batchId,
    stage: "publish",
    status: "completed",
    attempt: 2,
    recipeId: "recipe-1",
  });
});

Deno.test("loadJobSummary: recipeId defaults to null when the column is null", async () => {
  const client = new FakeSupabaseClient();
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    stage: "awaiting_approval",
    status: "approved",
    attempt: 1,
    recipe_id: null,
  }]);

  const result = await loadJobSummary(asClient(client), jobId);
  assert.equal(result?.recipeId, null);
});

Deno.test("loadPublishedRecipeSummary: returns null for an unknown recipe id", async () => {
  const client = new FakeSupabaseClient();
  const result = await loadPublishedRecipeSummary(asClient(client), crypto.randomUUID());
  assert.equal(result, null);
});

Deno.test("loadPublishedRecipeSummary: maps a recipes row", async () => {
  const client = new FakeSupabaseClient();
  const recipeId = crypto.randomUUID();
  client.seed("recipes", [{ id: recipeId, slug: "test-slug", status: "published" }]);

  const result = await loadPublishedRecipeSummary(asClient(client), recipeId);
  assert.deepEqual(result, { id: recipeId, slug: "test-slug", status: "published" });
});

Deno.test("enterPublishStage: transitions awaiting_approval/approved -> publish/queued", async () => {
  const client = new FakeSupabaseClient();
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    stage: "awaiting_approval",
    status: "approved",
  }]);

  const result = await enterPublishStage(asClient(client), jobId);
  assert.equal(result.transitioned, true);

  const row = client.getRow("recipe_generation_jobs", jobId);
  assert.equal(row?.stage, "publish");
  assert.equal(row?.status, "queued");
});

Deno.test("enterPublishStage: a no-op when the job is not exactly awaiting_approval/approved", async () => {
  const client = new FakeSupabaseClient();
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    stage: "awaiting_approval",
    status: "awaiting_approval", // never approved
  }]);

  const result = await enterPublishStage(asClient(client), jobId);
  assert.equal(result.transitioned, false);

  const row = client.getRow("recipe_generation_jobs", jobId);
  assert.equal(row?.stage, "awaiting_approval");
  assert.equal(row?.status, "awaiting_approval");
});

Deno.test("enterPublishStage: a no-op on a second call once the job already left awaiting_approval (retry path)", async () => {
  const client = new FakeSupabaseClient();
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    stage: "publish",
    status: "retryable", // already past this transition, e.g. a prior failed publish attempt
  }]);

  const result = await enterPublishStage(asClient(client), jobId);
  assert.equal(result.transitioned, false);

  const row = client.getRow("recipe_generation_jobs", jobId);
  assert.equal(row?.stage, "publish");
  assert.equal(row?.status, "retryable");
});
