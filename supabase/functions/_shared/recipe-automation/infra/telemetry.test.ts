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
