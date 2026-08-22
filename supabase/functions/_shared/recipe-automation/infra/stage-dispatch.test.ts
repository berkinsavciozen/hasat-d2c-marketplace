// Deno.test suite for stage-dispatch.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/infra/stage-dispatch.test.ts
import assert from "node:assert/strict";
import { dispatchNextStage } from "./stage-dispatch.ts";
import { FakeSupabaseClient } from "./testing/fake-supabase-client.ts";
import type { SupabaseClient } from "./supabase-admin.ts";

const ENV_VAR = "TEST_DISPATCH_KEY_" + crypto.randomUUID().replace(/-/g, "");

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

Deno.test("dispatchNextStage: missing dispatch key -> dispatched:false, never throws", async () => {
  Deno.env.delete(ENV_VAR);
  const client = new FakeSupabaseClient();
  const result = await dispatchNextStage(
    asClient(client),
    { jobId: crypto.randomUUID(), functionName: "recipe-writer" },
    { dispatchKeyEnvVar: ENV_VAR },
  );
  assert.equal(result.dispatched, false);
  assert.equal(result.error?.code, "STAGE_DISPATCH_KEY_MISSING");
});

Deno.test("dispatchNextStage: happy path calls the RPC with expected args", async () => {
  Deno.env.set(ENV_VAR, "dispatch-secret");
  try {
    const client = new FakeSupabaseClient();
    let capturedArgs: Record<string, unknown> | null = null;
    client.onRpc("dispatch_recipe_stage", (args) => {
      capturedArgs = args;
      return { data: null, error: null };
    });

    const jobId = crypto.randomUUID();
    const result = await dispatchNextStage(
      asClient(client),
      { jobId, functionName: "recipe-writer", payload: { batchId: "b1" } },
      { dispatchKeyEnvVar: ENV_VAR },
    );

    assert.equal(result.dispatched, true);
    assert.deepEqual(capturedArgs, {
      _job_id: jobId,
      _function_name: "recipe-writer",
      _dispatch_key: "dispatch-secret",
      _payload: { batchId: "b1" },
    });
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});

Deno.test("dispatchNextStage: failed next-stage dispatch followed by retry — first call fails safely, retry succeeds", async () => {
  Deno.env.set(ENV_VAR, "dispatch-secret");
  try {
    const client = new FakeSupabaseClient();
    let callCount = 0;
    client.onRpc("dispatch_recipe_stage", () => {
      callCount += 1;
      if (callCount === 1) {
        return { data: null, error: { message: "simulated network failure" } };
      }
      return { data: null, error: null };
    });

    const jobId = crypto.randomUUID();
    const dispatchParams = { jobId, functionName: "recipe-writer" };

    const first = await dispatchNextStage(asClient(client), dispatchParams, { dispatchKeyEnvVar: ENV_VAR });
    assert.equal(first.dispatched, false);
    assert.equal(first.error?.code, "STAGE_DISPATCH_RPC_FAILED");
    // The failed dispatch must not have thrown, and must not have mutated any job row — the job
    // stage/status advance already happened (job-state.ts) before dispatch was ever called, so a
    // dispatch failure has nothing to roll back.

    const retry = await dispatchNextStage(asClient(client), dispatchParams, { dispatchKeyEnvVar: ENV_VAR });
    assert.equal(retry.dispatched, true);
    assert.equal(callCount, 2);
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});

Deno.test("dispatchNextStage: same request invoked twice — both calls dispatch independently and safely", async () => {
  Deno.env.set(ENV_VAR, "dispatch-secret");
  try {
    const client = new FakeSupabaseClient();
    let callCount = 0;
    client.onRpc("dispatch_recipe_stage", () => {
      callCount += 1;
      return { data: null, error: null };
    });

    const dispatchParams = { jobId: crypto.randomUUID(), functionName: "recipe-writer" };
    const first = await dispatchNextStage(asClient(client), dispatchParams, { dispatchKeyEnvVar: ENV_VAR });
    const second = await dispatchNextStage(asClient(client), dispatchParams, { dispatchKeyEnvVar: ENV_VAR });

    assert.equal(first.dispatched, true);
    assert.equal(second.dispatched, true);
    assert.equal(callCount, 2);
    // Duplicate dispatches are safe by construction: the next stage's own claimJob() atomic claim
    // is what prevents double-processing, not this function refusing to fire twice.
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});

Deno.test("dispatchNextStage: a throwing rpc() call is caught, not propagated", async () => {
  Deno.env.set(ENV_VAR, "dispatch-secret");
  try {
    const client = new FakeSupabaseClient();
    client.onRpc("dispatch_recipe_stage", () => {
      throw new Error("supabase-js internal failure");
    });

    const result = await dispatchNextStage(
      asClient(client),
      { jobId: crypto.randomUUID(), functionName: "recipe-writer" },
      { dispatchKeyEnvVar: ENV_VAR },
    );
    assert.equal(result.dispatched, false);
    assert.equal(result.error?.code, "STAGE_DISPATCH_THREW");
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});
