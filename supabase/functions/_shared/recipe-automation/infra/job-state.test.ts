// Deno.test suite for job-state.ts. Run with:
//   deno test --allow-net supabase/functions/_shared/recipe-automation/infra/job-state.test.ts
import assert from "node:assert/strict";
import { advanceStage, failJob } from "./job-state.ts";
import { claimJob } from "./job-lock.ts";
import { FakeSupabaseClient } from "./testing/fake-supabase-client.ts";
import type { SupabaseClient } from "./supabase-admin.ts";
import type { RecipeErrorPayload } from "../types.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

async function seedAndClaim(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const jobId = crypto.randomUUID();
  const stage = (overrides.stage as string | undefined) ?? "write";
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    stage,
    status: "queued",
    attempt: 1,
    max_attempts: 3,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  }]);
  const claim = await claimJob(asClient(client), { jobId, expectedStage: stage as never });
  assert.equal(claim.claimed, true);
  if (!claim.claimed) throw new Error("setup failed");
  return { jobId, lockToken: claim.job.lockToken };
}

Deno.test("advanceStage: successful advance moves stage/status and releases the lock", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, lockToken } = await seedAndClaim(client);

  const result = await advanceStage(asClient(client), {
    jobId,
    lockToken,
    fromStage: "write",
    toStage: "qa",
    toStatus: "queued",
  });

  assert.equal(result.advanced, true);
  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.stage, "qa");
  assert.equal(row.status, "queued");
  assert.equal(row.locked_by, null);
  assert.equal(row.locked_at, null);
  assert.equal(row.lock_expires_at, null);
});

Deno.test("advanceStage: terminal status sets completed_at", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, lockToken } = await seedAndClaim(client, { stage: "publish" });

  await advanceStage(asClient(client), {
    jobId,
    lockToken,
    fromStage: "publish",
    toStage: "publish",
    toStatus: "completed",
  });

  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.status, "completed");
  assert.notEqual(row.completed_at, null);
});

Deno.test("advanceStage: same request invoked twice — the retried call is a safe no-op, not a double-advance", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, lockToken } = await seedAndClaim(client);
  const params = { jobId, lockToken, fromStage: "write" as const, toStage: "qa" as const };

  const first = await advanceStage(asClient(client), params);
  const retry = await advanceStage(asClient(client), params);

  assert.equal(first.advanced, true);
  assert.equal(retry.advanced, false);
  if (!retry.advanced) assert.equal(retry.reason, "stage_mismatch");
  // The row still reflects exactly the first call's effect — the retry did not apply again.
  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.stage, "qa");
});

Deno.test("advanceStage: lock token mismatch is refused (only the owning claim may advance)", async () => {
  const client = new FakeSupabaseClient();
  const { jobId } = await seedAndClaim(client);

  const result = await advanceStage(asClient(client), {
    jobId,
    lockToken: "someone-elses-token",
    fromStage: "write",
    toStage: "qa",
  });

  assert.equal(result.advanced, false);
  if (!result.advanced) assert.equal(result.reason, "lock_mismatch");
  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.stage, "write", "stage must be unchanged after a rejected advance");
});

const safetyPendingError: RecipeErrorPayload = {
  code: "PROVIDER_TIMEOUT",
  message: "provider request timed out",
  stage: "write",
  retryable: true,
  occurredAt: new Date().toISOString(),
};

const terminalError: RecipeErrorPayload = {
  code: "PROVIDER_REJECTED",
  message: "provider rejected the request",
  stage: "write",
  retryable: false,
  occurredAt: new Date().toISOString(),
};

Deno.test("failJob: retryable error under max_attempts schedules a retry and releases the lock", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, lockToken } = await seedAndClaim(client, { attempt: 1, max_attempts: 3 });

  const result = await failJob(asClient(client), {
    jobId,
    lockToken,
    stage: "write",
    error: safetyPendingError,
  });

  assert.equal(result.failed, true);
  if (result.failed) assert.equal(result.nextStatus, "retryable");
  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.status, "retryable");
  assert.equal(row.attempt, 2);
  assert.equal(row.locked_by, null);
  assert.notEqual(row.next_attempt_at, null);
});

Deno.test("failJob: retryable error at max_attempts terminates the job instead", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, lockToken } = await seedAndClaim(client, { attempt: 3, max_attempts: 3 });

  const result = await failJob(asClient(client), {
    jobId,
    lockToken,
    stage: "write",
    error: safetyPendingError,
  });

  assert.equal(result.failed, true);
  if (result.failed) assert.equal(result.nextStatus, "failed");
  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.status, "failed");
  assert.notEqual(row.completed_at, null);
});

Deno.test("failJob: non-retryable error terminates immediately regardless of attempt count", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, lockToken } = await seedAndClaim(client, { attempt: 1, max_attempts: 3 });

  const result = await failJob(asClient(client), {
    jobId,
    lockToken,
    stage: "write",
    error: terminalError,
  });

  assert.equal(result.failed, true);
  if (result.failed) assert.equal(result.nextStatus, "failed");
});

Deno.test("failJob: a retried job can be re-claimed at the same stage after the retry delay", async () => {
  const client = new FakeSupabaseClient();
  const { jobId, lockToken } = await seedAndClaim(client, { attempt: 1, max_attempts: 3 });

  await failJob(asClient(client), { jobId, lockToken, stage: "write", error: safetyPendingError });

  // Simulate next_attempt_at already being due.
  const row = client.getRow("recipe_generation_jobs", jobId)!;
  row.next_attempt_at = new Date(Date.now() - 1000).toISOString();

  const reclaim = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(reclaim.claimed, true);
});
