// Deno.test suite for sweep.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/infra/sweep.test.ts
import assert from "node:assert/strict";
import { runRetrySweep } from "./sweep.ts";
import { FakeSupabaseClient } from "./testing/fake-supabase-client.ts";
import type { SupabaseClient } from "./supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function seedJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}): string {
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    stage: "write",
    status: "queued",
    locked_by: null,
    lock_expires_at: null,
    next_attempt_at: null,
    ...overrides,
  }]);
  return jobId;
}

const PAST = new Date(Date.now() - 60_000).toISOString();
const FUTURE = new Date(Date.now() + 60_000).toISOString();

function registerDispatchRpc(client: FakeSupabaseClient, calls: Array<{ jobId: string; functionName: string }>) {
  client.onRpc("dispatch_recipe_stage", (args) => {
    calls.push({ jobId: args._job_id as string, functionName: args._function_name as string });
    return { data: null, error: null };
  });
}

Deno.test("runRetrySweep: redispatches a due retryable job at its current stage", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client, { stage: "revise", status: "retryable", next_attempt_at: PAST, locked_by: null });
  const calls: Array<{ jobId: string; functionName: string }> = [];
  registerDispatchRpc(client, calls);
  // dispatch_recipe_stage reads the dispatch key from env — set it so dispatchNextStage doesn't
  // short-circuit on STAGE_DISPATCH_KEY_MISSING before ever calling the RPC.
  Deno.env.set("RECIPE_STAGE_DISPATCH_SECRET", "test-secret");

  const result = await runRetrySweep(asClient(client));

  assert.equal(result.retryableRedispatched, 1);
  assert.equal(result.staleLockRedispatched, 0);
  assert.deepEqual(result.skippedUnknownStage, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jobId, jobId);
  assert.equal(calls[0].functionName, "recipe-stage-revise");
});

Deno.test("runRetrySweep: ignores a retryable job whose next_attempt_at is still in the future", async () => {
  const client = new FakeSupabaseClient();
  seedJob(client, { stage: "write", status: "retryable", next_attempt_at: FUTURE, locked_by: null });
  const calls: Array<{ jobId: string; functionName: string }> = [];
  registerDispatchRpc(client, calls);
  Deno.env.set("RECIPE_STAGE_DISPATCH_SECRET", "test-secret");

  const result = await runRetrySweep(asClient(client));

  assert.equal(result.retryableRedispatched, 0);
  assert.equal(calls.length, 0);
});

Deno.test("runRetrySweep: redispatches a 'running' job whose lock has expired", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client, {
    stage: "image",
    status: "running",
    locked_by: "some-worker:abc",
    lock_expires_at: PAST,
  });
  const calls: Array<{ jobId: string; functionName: string }> = [];
  registerDispatchRpc(client, calls);
  Deno.env.set("RECIPE_STAGE_DISPATCH_SECRET", "test-secret");

  const result = await runRetrySweep(asClient(client));

  assert.equal(result.staleLockRedispatched, 1);
  assert.equal(result.retryableRedispatched, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jobId, jobId);
  assert.equal(calls[0].functionName, "recipe-stage-image");
});

Deno.test("runRetrySweep: never touches a 'running' job whose lock is still active", async () => {
  const client = new FakeSupabaseClient();
  seedJob(client, {
    stage: "qa",
    status: "running",
    locked_by: "some-worker:abc",
    lock_expires_at: FUTURE,
  });
  const calls: Array<{ jobId: string; functionName: string }> = [];
  registerDispatchRpc(client, calls);
  Deno.env.set("RECIPE_STAGE_DISPATCH_SECRET", "test-secret");

  const result = await runRetrySweep(asClient(client));

  assert.equal(result.staleLockRedispatched, 0);
  assert.equal(calls.length, 0);
});

Deno.test("runRetrySweep: never touches a queued, awaiting_approval, or terminal job", async () => {
  const client = new FakeSupabaseClient();
  seedJob(client, { stage: "write", status: "queued" });
  seedJob(client, { stage: "awaiting_approval", status: "awaiting_approval" });
  seedJob(client, { stage: "publish", status: "completed" });
  seedJob(client, { stage: "qa", status: "failed" });
  const calls: Array<{ jobId: string; functionName: string }> = [];
  registerDispatchRpc(client, calls);
  Deno.env.set("RECIPE_STAGE_DISPATCH_SECRET", "test-secret");

  const result = await runRetrySweep(asClient(client));

  assert.equal(result.retryableRedispatched, 0);
  assert.equal(result.staleLockRedispatched, 0);
  assert.equal(calls.length, 0);
});

Deno.test("runRetrySweep: redispatches both a due-retryable job and a stale-lock job in one tick", async () => {
  const client = new FakeSupabaseClient();
  const retryableJobId = seedJob(client, { stage: "finalize", status: "retryable", next_attempt_at: PAST, locked_by: null });
  const staleJobId = seedJob(client, { stage: "plan", status: "running", locked_by: "w:1", lock_expires_at: PAST });
  const calls: Array<{ jobId: string; functionName: string }> = [];
  registerDispatchRpc(client, calls);
  Deno.env.set("RECIPE_STAGE_DISPATCH_SECRET", "test-secret");

  const result = await runRetrySweep(asClient(client));

  assert.equal(result.retryableRedispatched, 1);
  assert.equal(result.staleLockRedispatched, 1);
  const dispatchedIds = calls.map((c) => c.jobId).sort();
  assert.deepEqual(dispatchedIds, [retryableJobId, staleJobId].sort());
});
