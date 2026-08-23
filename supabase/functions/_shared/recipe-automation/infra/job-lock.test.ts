// Deno.test suite for job-lock.ts. Run with:
//   deno test --allow-net supabase/functions/_shared/recipe-automation/infra/job-lock.test.ts
import assert from "node:assert/strict";
import { claimJob, releaseLock } from "./job-lock.ts";
import { FakeSupabaseClient } from "./testing/fake-supabase-client.ts";
import type { SupabaseClient } from "./supabase-admin.ts";

function seedJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id,
    stage: "write",
    status: "queued",
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  }]);
  return id;
}

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

Deno.test("claimJob: claims a fresh, runnable job", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client);

  const result = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(result.claimed, true);
  if (result.claimed) {
    assert.equal(typeof result.job.lockToken, "string");
    const row = client.getRow("recipe_generation_jobs", jobId)!;
    assert.equal(row.status, "running");
    assert.equal(row.locked_by, result.job.lockToken);
  }
});

Deno.test("claimJob: double claim — second claim on an already-locked job is refused", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client);

  const first = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(first.claimed, true);

  const second = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(second.claimed, false);
  if (!second.claimed) assert.equal(second.reason, "locked");

  // Only the first claimant's token is recorded — the second never overwrote it.
  if (first.claimed) {
    const row = client.getRow("recipe_generation_jobs", jobId)!;
    assert.equal(row.locked_by, first.job.lockToken);
  }
});

Deno.test("claimJob: same request invoked twice — identical retried call behaves like double claim, not corruption", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client);
  const claimArgs = { jobId, expectedStage: "write" as const };

  const first = await claimJob(asClient(client), claimArgs);
  const retry = await claimJob(asClient(client), claimArgs);

  assert.equal(first.claimed, true);
  assert.equal(retry.claimed, false);
  // The row is left exactly as the first (successful) call set it — a naive retry cannot
  // silently re-lock or reset lock ownership.
  const row = client.getRow("recipe_generation_jobs", jobId)!;
  if (first.claimed) assert.equal(row.locked_by, first.job.lockToken);
});

Deno.test("claimJob: stale lock recovery — an expired lock can be reclaimed", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client, {
    status: "running",
    locked_by: "stale-worker:old-token",
    locked_at: new Date(Date.now() - 60_000).toISOString(),
    lock_expires_at: new Date(Date.now() - 30_000).toISOString(), // already expired
  });

  const result = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(result.claimed, true);
  if (result.claimed) {
    assert.notEqual(result.job.lockToken, "stale-worker:old-token");
    const row = client.getRow("recipe_generation_jobs", jobId)!;
    assert.equal(row.locked_by, result.job.lockToken);
  }
});

Deno.test("claimJob: an unexpired lock is NOT recoverable (control case for stale-lock test)", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client, {
    status: "running",
    locked_by: "active-worker:token",
    locked_at: new Date().toISOString(),
    lock_expires_at: new Date(Date.now() + 60_000).toISOString(), // still valid
  });

  const result = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(result.claimed, false);
  if (!result.claimed) assert.equal(result.reason, "locked");
});

Deno.test("claimJob: wrong-stage invocation is refused", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client, { stage: "qa" });

  const result = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(result.claimed, false);
  if (!result.claimed) assert.equal(result.reason, "wrong_stage");
});

Deno.test("claimJob: non-runnable status (e.g. completed) is refused", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client, { status: "completed" });

  const result = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(result.claimed, false);
  if (!result.claimed) assert.equal(result.reason, "not_runnable");
});

Deno.test("claimJob: unknown job id is refused as not_found", async () => {
  const client = new FakeSupabaseClient();
  const result = await claimJob(asClient(client), {
    jobId: crypto.randomUUID(),
    expectedStage: "write",
  });
  assert.equal(result.claimed, false);
  if (!result.claimed) assert.equal(result.reason, "not_found");
});

// F2 Step 06 (P7 preflight): releaseLock had no test coverage at all.

Deno.test("releaseLock: clears locked_by/locked_at/lock_expires_at without touching stage/status", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client);
  const claim = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(claim.claimed, true);
  if (!claim.claimed) throw new Error("setup failed");

  const result = await releaseLock(asClient(client), { jobId, lockToken: claim.job.lockToken });
  assert.equal(result.released, true);

  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.locked_by, null);
  assert.equal(row.locked_at, null);
  assert.equal(row.lock_expires_at, null);
  // releaseLock is deliberately narrower than advanceStage/failJob — it must never touch
  // stage/status itself (a caller that wants those changed uses those functions instead).
  assert.equal(row.stage, "write");
  assert.equal(row.status, "running");
});

Deno.test("releaseLock: wrong lock token is refused — only the owning claim may release", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client);
  const claim = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(claim.claimed, true);
  if (!claim.claimed) throw new Error("setup failed");

  const result = await releaseLock(asClient(client), { jobId, lockToken: "someone-elses-token" });
  assert.equal(result.released, false);

  const row = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(row.locked_by, claim.job.lockToken, "lock must remain held by its real owner");
});

Deno.test("releaseLock: an already-released lock is a safe no-op, not an error", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedJob(client);
  const claim = await claimJob(asClient(client), { jobId, expectedStage: "write" });
  assert.equal(claim.claimed, true);
  if (!claim.claimed) throw new Error("setup failed");

  const first = await releaseLock(asClient(client), { jobId, lockToken: claim.job.lockToken });
  const second = await releaseLock(asClient(client), { jobId, lockToken: claim.job.lockToken });

  assert.equal(first.released, true);
  assert.equal(second.released, false, "a retried release finds no matching locked_by anymore");
});
