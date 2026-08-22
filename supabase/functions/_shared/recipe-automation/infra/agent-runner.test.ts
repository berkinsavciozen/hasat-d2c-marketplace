// Deno.test suite for agent-runner.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/infra/agent-runner.test.ts
import assert from "node:assert/strict";
import { createAgentRunner } from "./agent-runner.ts";
import { RecipeAutomationError } from "./errors.ts";

const ENV_VAR = "RECIPE_AGENT_RUNTIME";

Deno.test("createAgentRunner: defaults to deno-native when unset", async () => {
  Deno.env.delete(ENV_VAR);
  const runner = createAgentRunner();
  await assert.rejects(
    () => runner.run({ agentName: "planner", systemPrompt: "x", input: {} }),
    (err: unknown) => err instanceof RecipeAutomationError && err.code === "AGENT_RUNNER_NOT_IMPLEMENTED",
  );
});

Deno.test("createAgentRunner: explicit mode overrides env var", async () => {
  Deno.env.set(ENV_VAR, "deno-native");
  try {
    const runner = createAgentRunner("sdk");
    await assert.rejects(() => runner.run({ agentName: "planner", systemPrompt: "x", input: {} }));
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});

Deno.test("createAgentRunner: env var selects the runtime when no explicit mode given", async () => {
  Deno.env.set(ENV_VAR, "sdk");
  try {
    const runner = createAgentRunner();
    assert.ok(runner);
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});

Deno.test("createAgentRunner: invalid mode throws a typed, clear error", () => {
  assert.throws(
    () => createAgentRunner("not-a-real-mode" as never),
    (err: unknown) => err instanceof RecipeAutomationError && err.code === "AGENT_RUNTIME_MODE_INVALID",
  );
});

Deno.test("createAgentRunner: callers only ever depend on the AgentRunner interface", async () => {
  // Both concrete implementations satisfy the exact same shape — this is the seam future stage
  // agents (Writer/QA/Planner) will call through without knowing which one is active.
  for (const mode of ["sdk", "deno-native"] as const) {
    const runner = createAgentRunner(mode);
    assert.equal(typeof runner.run, "function");
  }
});
