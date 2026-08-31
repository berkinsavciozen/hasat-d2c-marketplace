// Deno.test suite for plan-review.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/plan-review.test.ts
import assert from "node:assert/strict";
import {
  approvePlanBatch,
  editPlanBrief,
  rejectPlanBatch,
  setPlanBriefExclusion,
} from "./plan-review.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function seedBatch(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const batchId = crypto.randomUUID();
  client.seed("recipe_generation_batches", [{
    id: batchId, target_count: 2, focus_crops: null, diet_focus: [], locale: "tr", notes: null,
    review_status: "pending_review", reviewed_by: null, reviewed_at: null, fanned_out_at: null,
    diversity_report: null, plan_error: null,
    ...overrides,
  }]);
  return batchId;
}

function seedBrief(client: FakeSupabaseClient, batchId: string, overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  client.seed("recipe_plan_briefs", [{
    id, batch_id: batchId, brief_id: crypto.randomUUID(), working_title: "Firinda Kabak Musakka",
    focus_crop: "kabak", angle: "test angle", target_difficulty: "orta", diet_tags: [], locale: "tr",
    audience: "bireysel", meal_type: "ana_yemek", selection_reason: "test reason",
    excluded: false, exclusion_reason: null, job_id: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  }]);
  return id;
}

function registerFanOutRpc(client: FakeSupabaseClient, jobsForBatch: Map<string, unknown[]>) {
  client.onRpc("fan_out_recipe_plan_batch", (args) => {
    const batchId = args._batch_id as string;
    const jobs = jobsForBatch.get(batchId) ?? [];
    return { data: { ok: true, batchId, jobs }, error: null };
  });
}

Deno.test("editPlanBrief: updates an editable field on a pending-review, unpromoted brief", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client);
  const briefId = seedBrief(client, batchId);

  const result = await editPlanBrief(asClient(client), { briefId, patch: { workingTitle: "Yeni Baslik" } });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.brief.workingTitle, "Yeni Baslik");
});

Deno.test("editPlanBrief: refuses to edit a brief already promoted into a job", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client);
  const briefId = seedBrief(client, batchId, { job_id: crypto.randomUUID() });

  const result = await editPlanBrief(asClient(client), { briefId, patch: { workingTitle: "x" } });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "already_promoted");
});

Deno.test("editPlanBrief: refuses to edit a brief once its batch has left pending_review", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client, { review_status: "approved" });
  const briefId = seedBrief(client, batchId);

  const result = await editPlanBrief(asClient(client), { briefId, patch: { workingTitle: "x" } });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "wrong_state");
});

Deno.test("setPlanBriefExclusion: excludes and re-includes a brief with a reason", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client);
  const briefId = seedBrief(client, batchId);

  const excluded = await setPlanBriefExclusion(asClient(client), { briefId, excluded: true, exclusionReason: "editorial cut" });
  assert.equal(excluded.ok, true);
  if (excluded.ok) {
    assert.equal(excluded.brief.excluded, true);
    assert.equal(excluded.brief.exclusionReason, "editorial cut");
  }

  const included = await setPlanBriefExclusion(asClient(client), { briefId, excluded: false });
  assert.equal(included.ok, true);
  if (included.ok) {
    assert.equal(included.brief.excluded, false);
    assert.equal(included.brief.exclusionReason, null);
  }
});

Deno.test("rejectPlanBatch: moves a pending_review batch to rejected and never fans out", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client);
  let fanOutCalled = false;
  client.onRpc("fan_out_recipe_plan_batch", () => {
    fanOutCalled = true;
    return { data: { ok: true, batchId, jobs: [] }, error: null };
  });

  const result = await rejectPlanBatch(asClient(client), { batchId, adminActor: "berkin@hasat.com" });

  assert.equal(result.ok, true);
  assert.equal(fanOutCalled, false);
  const row = client.getRow("recipe_generation_batches", batchId)!;
  assert.equal(row.review_status, "rejected");
});

Deno.test("rejectPlanBatch: wrong_state for an already-decided batch", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client, { review_status: "approved" });

  const result = await rejectPlanBatch(asClient(client), { batchId });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "wrong_state");
});

Deno.test("approvePlanBatch: refuses (diversity_invalid) and does not approve when the current brief set violates diversity", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client);
  seedBrief(client, batchId, { focus_crop: "kabak" });
  seedBrief(client, batchId, { focus_crop: "kabak" }); // admin-edited duplicate crop
  client.onRpc("validate_recipe_plan_diversity", () => ({
    data: { valid: false, issues: [{ code: "DIVERSITY_CROP_REPEATED", field: "briefs[1].focusCrop", severity: "blocking", message: "x", requiredChange: null }] },
    error: null,
  }));
  let fanOutCalled = false;
  client.onRpc("fan_out_recipe_plan_batch", () => {
    fanOutCalled = true;
    return { data: { ok: true, batchId, jobs: [] }, error: null };
  });

  const result = await approvePlanBatch(asClient(client), { batchId });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "diversity_invalid");
  assert.equal(fanOutCalled, false);
  const row = client.getRow("recipe_generation_batches", batchId)!;
  assert.equal(row.review_status, "pending_review");
});

Deno.test("approvePlanBatch: approves, fans out, and dispatches every non-excluded brief exactly once", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client);
  const brief1 = seedBrief(client, batchId, { focus_crop: "kabak" });
  seedBrief(client, batchId, { focus_crop: "domates", excluded: true }); // must be skipped
  client.onRpc("validate_recipe_plan_diversity", () => ({ data: { valid: true, issues: [] }, error: null }));
  const job1 = crypto.randomUUID();
  registerFanOutRpc(client, new Map([[batchId, [
    { briefId: brief1, jobId: job1, workingTitle: "x", focusCrop: "kabak", created: true },
  ]]]));
  const dispatchCalls: unknown[] = [];
  client.onRpc("dispatch_recipe_stage", (args) => {
    dispatchCalls.push(args);
    return { data: null, error: null };
  });

  const result = await approvePlanBatch(asClient(client), { batchId, adminActor: "berkin@hasat.com" });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].jobId, job1);
  }
  const row = client.getRow("recipe_generation_batches", batchId)!;
  assert.equal(row.review_status, "approved");
  assert.equal(row.reviewed_by, "berkin@hasat.com");
});

Deno.test("approvePlanBatch: calling it again for an already-approved batch retries fan-out/dispatch idempotently", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client, { review_status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: "x" });
  const brief1 = seedBrief(client, batchId, { focus_crop: "kabak", job_id: crypto.randomUUID() });
  let fanOutCalls = 0;
  client.onRpc("fan_out_recipe_plan_batch", (args) => {
    fanOutCalls++;
    return {
      data: { ok: true, batchId: args._batch_id, jobs: [{ briefId: brief1, jobId: "existing-job", workingTitle: "x", focusCrop: "kabak", created: false }] },
      error: null,
    };
  });
  client.onRpc("dispatch_recipe_stage", () => ({ data: null, error: null }));

  const result = await approvePlanBatch(asClient(client), { batchId });

  assert.equal(result.ok, true);
  assert.equal(fanOutCalls, 1);
  if (result.ok) assert.equal(result.jobs[0].created, false);
});

Deno.test("approvePlanBatch: wrong_state when the batch was already rejected", async () => {
  const client = new FakeSupabaseClient();
  const batchId = seedBatch(client, { review_status: "rejected" });

  const result = await approvePlanBatch(asClient(client), { batchId });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "wrong_state");
});
