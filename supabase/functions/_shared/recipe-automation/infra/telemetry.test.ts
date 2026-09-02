// Deno.test suite for telemetry.ts. Run with:
//   deno test --allow-net supabase/functions/_shared/recipe-automation/infra/telemetry.test.ts
import assert from "node:assert/strict";
import { computeDurationMs, recordStageRun } from "./telemetry.ts";
import { FakeSupabaseClient } from "./testing/fake-supabase-client.ts";
import type { SupabaseClient } from "./supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

Deno.test("computeDurationMs: null finishedAt -> null", () => {
  assert.equal(computeDurationMs(new Date().toISOString(), null), null);
});

Deno.test("computeDurationMs: computes a positive duration", () => {
  const started = new Date(Date.now() - 5000).toISOString();
  const finished = new Date().toISOString();
  const ms = computeDurationMs(started, finished);
  assert.ok(typeof ms === "number" && ms >= 4900);
});

Deno.test("recordStageRun: writes safe IDs, stage/status, provider/model, usage", async () => {
  const client = new FakeSupabaseClient();
  const startedAt = new Date().toISOString();
  const result = await recordStageRun(asClient(client), {
    jobId: "job-1",
    batchId: "batch-1",
    stage: "write",
    status: "completed",
    attempt: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    provider: "openai",
    model: "gpt-test",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  });
  assert.ok(result?.id);
});

Deno.test("recordStageRun: redacts secret-shaped keys out of output before insert", async () => {
  const client = new FakeSupabaseClient();
  const insertedRows: Record<string, unknown>[] = [];
  const originalFrom = client.from.bind(client);
  client.from = ((name: string) => {
    const builder = originalFrom(name);
    if (name === "recipe_generation_stage_runs") {
      const originalInsert = builder.insert.bind(builder);
      builder.insert = (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return originalInsert(row);
      };
    }
    return builder;
  }) as typeof client.from;

  await recordStageRun(asClient(client), {
    jobId: "job-1",
    batchId: "batch-1",
    stage: "write",
    status: "completed",
    attempt: 1,
    startedAt: new Date().toISOString(),
    output: { title: "ok", apiKey: "sk-should-not-be-stored" },
  });

  const stored = insertedRows[0].output as Record<string, unknown>;
  assert.equal(stored.title, "ok");
  assert.equal(stored.apiKey, "[redacted]");
});

Deno.test("recordStageRun: a failing insert is swallowed, never thrown", async () => {
  const client = new FakeSupabaseClient();
  client.from = (() => {
    throw new Error("simulated table access failure");
  }) as typeof client.from;

  const result = await recordStageRun(asClient(client), {
    jobId: "job-1",
    batchId: "batch-1",
    stage: "write",
    status: "completed",
    attempt: 1,
    startedAt: new Date().toISOString(),
  });
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------------------------
// UNIQUE(job_id, stage, attempt) collision retry — see this module's header for the production
// incident (jobs ed705ede-20c2-46a0-9f84-81f82cebfdc4/67567ad5-5ee7-4dd9-a60d-6546687d811e,
// 2026-09-02) this closes: admin/review-actions.ts's retryStage() resets a job's `attempt` column
// back to 1 for a fresh retry budget, which collides with the row already recorded at
// (job_id, stage, attempt=1) from the job's first pass at that stage.
// ---------------------------------------------------------------------------------------------

Deno.test("recordStageRun: retries with the next attempt number on a unique(job_id,stage,attempt) collision", async () => {
  const client = new FakeSupabaseClient();
  client.failNextInsert("recipe_generation_stage_runs", {
    code: "23505",
    message: 'duplicate key value violates unique constraint "recipe_generation_stage_runs_job_stage_attempt_key"',
  });

  const result = await recordStageRun(asClient(client), {
    jobId: "job-1",
    batchId: "batch-1",
    stage: "revise",
    status: "completed",
    attempt: 1,
    startedAt: new Date().toISOString(),
  });

  assert.ok(result?.id, "the stage run must still be recorded after bumping past the collision");
  const stored = client.getRow("recipe_generation_stage_runs", result!.id) as Record<string, unknown>;
  assert.equal(stored.attempt, 2, "recorded at the next free attempt number, not the original colliding one");
});

Deno.test("recordStageRun: a non-collision insert error is still swallowed as before, no retry", async () => {
  const client = new FakeSupabaseClient();
  client.failNextInsert("recipe_generation_stage_runs", { code: "23503", message: "foreign key violation" });

  const result = await recordStageRun(asClient(client), {
    jobId: "job-1",
    batchId: "batch-1",
    stage: "write",
    status: "completed",
    attempt: 1,
    startedAt: new Date().toISOString(),
  });

  assert.equal(result, null);
});
