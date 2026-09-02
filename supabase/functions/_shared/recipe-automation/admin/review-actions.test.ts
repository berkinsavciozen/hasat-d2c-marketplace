// Deno.test suite for review-actions.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/
import assert from "node:assert/strict";
import { approveJob, rejectJob, requestRevisionJob, retryStage } from "./review-actions.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

const FULL_CHECKLIST = {
  temperatureReviewed: true,
  timingReviewed: true,
  allergensReviewed: true,
  contentReviewed: true,
  imagesReviewed: true,
};

function seedAwaitingApprovalJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const jobId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: batchId,
    brief_id: crypto.randomUUID(),
    working_title: "Test Recipe",
    stage: "awaiting_approval",
    status: "awaiting_approval",
    revision_count: 0,
    attempt: 1,
    max_attempts: 3,
    last_error: null,
    ...overrides,
  }]);
  return { jobId, batchId };
}

function registerDispatchRpc(client: FakeSupabaseClient, calls: Array<{ jobId: string; functionName: string; batchId: unknown }>) {
  client.onRpc("dispatch_recipe_stage", (args) => {
    calls.push({
      jobId: args._job_id as string,
      functionName: args._function_name as string,
      batchId: (args._payload as Record<string, unknown> | undefined)?.batchId,
    });
    return { data: null, error: null };
  });
}

Deno.test("approveJob: succeeds with a complete checklist and records an audit row", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client);
  const draftId = crypto.randomUUID();

  const result = await approveJob(asClient(client), {
    jobId,
    draftId,
    draftVersion: 1,
    checklist: FULL_CHECKLIST,
    adminActor: "berkin",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.status, "approved");
  assert.equal(result.job.stage, "awaiting_approval");

  const reviewRow = client.getRow("recipe_admin_reviews", result.reviewId) as Record<string, unknown>;
  assert.equal(reviewRow.action, "approve");
  assert.equal(reviewRow.temperature_reviewed, true);
  assert.equal(reviewRow.images_reviewed, true);
  assert.equal(reviewRow.admin_actor, "berkin");
});

Deno.test("approveJob: dispatches recipe-stage-publish for the newly-approved job", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, batchId } = seedAwaitingApprovalJob(client);
  const calls: Array<{ jobId: string; functionName: string; batchId: unknown }> = [];
  registerDispatchRpc(client, calls);
  Deno.env.set("RECIPE_STAGE_DISPATCH_SECRET", "test-secret");

  const result = await approveJob(asClient(client), {
    jobId,
    draftId: crypto.randomUUID(),
    draftVersion: 1,
    checklist: FULL_CHECKLIST,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jobId, jobId);
  assert.equal(calls[0].functionName, "recipe-stage-publish");
  assert.equal(calls[0].batchId, batchId);
});

Deno.test("approveJob: still succeeds even when the publish dispatch itself fails (best-effort)", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client);
  // No RECIPE_STAGE_DISPATCH_SECRET set and no rpc handler registered — dispatchNextStage must
  // report a failure internally without ever throwing back into approveJob.
  Deno.env.delete("RECIPE_STAGE_DISPATCH_SECRET");

  const result = await approveJob(asClient(client), {
    jobId,
    draftId: crypto.randomUUID(),
    draftVersion: 1,
    checklist: FULL_CHECKLIST,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.status, "approved");
});

Deno.test("approveJob: mechanically refuses an incomplete checklist BEFORE touching job state", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client);

  const result = await approveJob(asClient(client), {
    jobId,
    draftId: crypto.randomUUID(),
    draftVersion: 1,
    // imagesReviewed missing — must be literal `true`, not merely truthy/omitted.
    checklist: { ...FULL_CHECKLIST, imagesReviewed: false },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "checklist_incomplete");

  // Job must be untouched — still awaiting_approval, not silently approved.
  const jobRow = client.getRow("recipe_generation_jobs", jobId) as Record<string, unknown>;
  assert.equal(jobRow.status, "awaiting_approval");
});

Deno.test("approveJob: refuses a job that is not at awaiting_approval", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client, { stage: "qa", status: "running" });

  const result = await approveJob(asClient(client), {
    jobId,
    draftId: crypto.randomUUID(),
    draftVersion: 1,
    checklist: FULL_CHECKLIST,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "wrong_state");
});

Deno.test("approveJob: not_found for an unknown job id", async () => {
  const client = new FakeSupabaseClient();
  const result = await approveJob(asClient(client), {
    jobId: crypto.randomUUID(),
    draftId: crypto.randomUUID(),
    draftVersion: 1,
    checklist: FULL_CHECKLIST,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not_found");
});

Deno.test("rejectJob: moves status to rejected, stage unchanged, no checklist required", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client);

  const result = await rejectJob(asClient(client), { jobId, notes: "recipe içeriği zayıf" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.status, "rejected");
  assert.equal(result.job.stage, "awaiting_approval");
});

Deno.test("requestRevisionJob: routes back to revise/queued and increments revision_count", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client, { revision_count: 1 });

  const result = await requestRevisionJob(asClient(client), { jobId, notes: "sıcaklık birimi eksik" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.stage, "revise");
  assert.equal(result.job.status, "queued");
  assert.equal(result.job.revision_count, 2);
});

Deno.test("requestRevisionJob: refuses once the two-revision cap is already reached", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client, { revision_count: 2 });

  const result = await requestRevisionJob(asClient(client), { jobId });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "revision_limit_reached");

  // Must not have mutated the job.
  const jobRow = client.getRow("recipe_generation_jobs", jobId) as Record<string, unknown>;
  assert.equal(jobRow.stage, "awaiting_approval");
  assert.equal(jobRow.status, "awaiting_approval");
});

Deno.test("retryStage: re-queues a failed job at its current stage and resets attempt/last_error/completed_at", async () => {
  const client = new FakeSupabaseClient();
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    brief_id: crypto.randomUUID(),
    working_title: "Test Recipe",
    stage: "image",
    status: "failed",
    revision_count: 0,
    attempt: 3,
    max_attempts: 3,
    last_error: { code: "SOME_ERROR", message: "boom", stage: "image", retryable: false, occurredAt: new Date().toISOString() },
    next_attempt_at: null,
    // A real 'failed' row always has this set (job-state.ts's failJob/advanceStage both set it on
    // any terminal status) — the fake client won't enforce the DB's own CHECK
    // (completed_at is null or status in ('completed','failed','cancelled')) the way real Postgres
    // does (see 05_admin_review_vertical_slice.sql's SQL-level proof), but asserting it's cleared
    // here still documents and locks in the fix.
    completed_at: new Date().toISOString(),
  }]);

  const result = await retryStage(asClient(client), { jobId });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.stage, "image"); // unchanged — retries the SAME stage
  assert.equal(result.job.status, "queued");

  const jobRow = client.getRow("recipe_generation_jobs", jobId) as Record<string, unknown>;
  assert.equal(jobRow.attempt, 1);
  assert.equal(jobRow.last_error, null);
  assert.equal(jobRow.completed_at, null);
});

Deno.test("retryStage: refuses a job that is not currently failed", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = seedAwaitingApprovalJob(client, { stage: "qa", status: "retryable" });

  const result = await retryStage(asClient(client), { jobId });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "wrong_state");
});
