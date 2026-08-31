// Deno.test suite for plan-stage.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/plan/plan-stage.test.ts
import assert from "node:assert/strict";
import { runPlanStage } from "./plan-stage.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import type { AgentRunner } from "../infra/agent-runner.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

const PASS = { valid: true, issues: [], briefCount: 0 };

/** Registers the happy-path stub for every narrow RPC plan-stage.ts calls: seasonal candidates
 * cover exactly "kabak"/"domates" (so a Planner fixture can legally choose either), recent mix and
 * existing-recipe sample are both empty, and both validation gates pass with no issues. */
function registerHappyPathRpcs(client: FakeSupabaseClient) {
  client.onRpc("get_seasonal_crop_candidates", () => ({
    data: [
      { crop: "kabak", display_name: "Kabak", category_group: "sebze", default_unit: "adet", harvest_window_start_month: 5, harvest_window_end_month: 9, in_season: true, is_edible: true, default_photo_url: null },
      { crop: "domates", display_name: "Domates", category_group: "sebze", default_unit: "kg", harvest_window_start_month: 6, harvest_window_end_month: 10, in_season: true, is_edible: true, default_photo_url: null },
    ],
    error: null,
  }));
  client.onRpc("get_recent_recipe_mix", () => ({ data: [], error: null }));
  client.onRpc("search_existing_recipes", () => ({ data: [], error: null }));
  client.onRpc("validate_recipe_plan", () => ({ data: PASS, error: null }));
  client.onRpc("validate_recipe_plan_diversity", () => ({ data: PASS, error: null }));
}

function makeBrief(batchId: string, i: number, overrides: Record<string, unknown> = {}) {
  return {
    briefId: crypto.randomUUID(),
    batchId,
    workingTitle: `Test Tarif #${i}`,
    focusCrop: i % 2 === 0 ? "kabak" : "domates",
    angle: "Test angle",
    targetDifficulty: "orta",
    dietTags: [],
    locale: "tr",
    audience: i % 2 === 0 ? "bireysel" : "horeca",
    mealType: "ana_yemek",
    selectionReason: `Sebep #${i}`,
    ...overrides,
  };
}

function fixtureAgentRunner(
  briefCount: number,
  briefOverrides: (i: number) => Record<string, unknown> = () => ({}),
): AgentRunner {
  return {
    run: async ({ input }) => {
      const batchId = (input as { batchId: string }).batchId;
      const briefs = Array.from({ length: briefCount }, (_, i) => makeBrief(batchId, i, briefOverrides(i)));
      return {
        output: { batchId, briefs, plannedAt: new Date().toISOString(), plannerModel: "test-model" },
        provider: "openai",
        model: "test-model",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        durationMs: 10,
      };
    },
  };
}

function throwingAgentRunner(): AgentRunner {
  return {
    run: async () => {
      throw new Error("must not be called");
    },
  };
}

function validBatchInput(overrides: Record<string, unknown> = {}) {
  return {
    targetCount: 4,
    focusCrops: null,
    dietFocus: [],
    locale: "tr",
    notes: null,
    ...overrides,
  };
}

Deno.test("runPlanStage: invalid_batch_input for a malformed batch input", async () => {
  const client = new FakeSupabaseClient();
  const result = await runPlanStage(asClient(client), { batchInput: { targetCount: -1 } });
  assert.equal(result.outcome, "invalid_batch_input");
});

Deno.test("runPlanStage: happy path stores exactly targetCount recipe_plan_briefs rows", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const runner = fixtureAgentRunner(4);

  const result = await runPlanStage(asClient(client), { batchInput: validBatchInput(), agentRunner: runner });

  assert.equal(result.outcome, "planned");
  assert.equal(result.briefCount, 4);
  assert.ok(result.batchId);
});

Deno.test("runPlanStage: brief_count_mismatch when the planner produces the wrong number of briefs", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const runner = fixtureAgentRunner(2); // batchInput asks for 4

  const result = await runPlanStage(asClient(client), { batchInput: validBatchInput(), agentRunner: runner });

  assert.equal(result.outcome, "brief_count_mismatch");
});

Deno.test("runPlanStage: structural_validation_failed when validate_recipe_plan rejects the plan", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  client.onRpc("validate_recipe_plan", () => ({
    data: { valid: false, issues: [{ code: "BRIEF_CROP_UNKNOWN", field: "briefs[0].focusCrop", severity: "blocking", message: "x", requiredChange: null }], briefCount: 4 },
    error: null,
  }));
  const runner = fixtureAgentRunner(4);

  const result = await runPlanStage(asClient(client), { batchInput: validBatchInput(), agentRunner: runner });

  assert.equal(result.outcome, "structural_validation_failed");
});

Deno.test("runPlanStage: diversity_validation_failed when the plan repeats a primary crop", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  client.onRpc("validate_recipe_plan_diversity", () => ({
    data: {
      valid: false,
      issues: [{ code: "DIVERSITY_CROP_REPEATED", field: "briefs[1].focusCrop", severity: "blocking", message: "x", requiredChange: null }],
      briefCount: 4,
    },
    error: null,
  }));
  const runner = fixtureAgentRunner(4);

  const result = await runPlanStage(asClient(client), { batchInput: validBatchInput(), agentRunner: runner });

  assert.equal(result.outcome, "diversity_validation_failed");
  // No briefs must have been persisted when the diversity gate rejects the plan.
  const { data } = await client.from("recipe_plan_briefs").select("id");
  assert.equal((data as unknown[]).length, 0);
});

Deno.test("runPlanStage: primary crop outside crop_config is rejected via the diversity gate", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  client.onRpc("validate_recipe_plan_diversity", () => ({
    data: {
      valid: false,
      issues: [{ code: "DIVERSITY_CROP_NOT_IN_CONFIG", field: "briefs[0].focusCrop", severity: "blocking", message: "x", requiredChange: null }],
      briefCount: 4,
    },
    error: null,
  }));
  const runner = fixtureAgentRunner(4, () => ({ focusCrop: "unknown_crop_slug" }));

  const result = await runPlanStage(asClient(client), { batchInput: validBatchInput(), agentRunner: runner });

  assert.equal(result.outcome, "diversity_validation_failed");
});

Deno.test("runPlanStage: already_planned short-circuits and never calls the agent again", async () => {
  const client = new FakeSupabaseClient();
  const batchId = crypto.randomUUID();
  client.seed("recipe_generation_batches", [{
    id: batchId, target_count: 4, focus_crops: null, diet_focus: [], locale: "tr", notes: null,
    review_status: "pending_review",
  }]);
  client.seed("recipe_plan_briefs", [{
    id: crypto.randomUUID(), batch_id: batchId, brief_id: crypto.randomUUID(), working_title: "x",
    focus_crop: "kabak", excluded: false,
  }]);
  registerHappyPathRpcs(client);

  const result = await runPlanStage(asClient(client), {
    batchInput: validBatchInput({ batchId }),
    agentRunner: throwingAgentRunner(),
  });

  assert.equal(result.outcome, "already_planned");
  assert.equal(result.briefCount, 1);
});

Deno.test("runPlanStage: batch_not_reviewable refuses to (re)plan an already-decided batch", async () => {
  const client = new FakeSupabaseClient();
  const batchId = crypto.randomUUID();
  client.seed("recipe_generation_batches", [{
    id: batchId, target_count: 4, focus_crops: null, diet_focus: [], locale: "tr", notes: null,
    review_status: "approved",
  }]);
  registerHappyPathRpcs(client);

  const result = await runPlanStage(asClient(client), {
    batchInput: validBatchInput({ batchId }),
    agentRunner: throwingAgentRunner(),
  });

  assert.equal(result.outcome, "batch_not_reviewable");
});

Deno.test("runPlanStage: agent_call_failed records plan_error and never stores briefs", async () => {
  const client = new FakeSupabaseClient();
  registerHappyPathRpcs(client);
  const runner: AgentRunner = { run: async () => { throw new Error("provider timeout"); } };

  const result = await runPlanStage(asClient(client), { batchInput: validBatchInput(), agentRunner: runner });

  assert.equal(result.outcome, "agent_call_failed");
  const batch = client.getRow("recipe_generation_batches", result.batchId!)!;
  assert.ok(batch.plan_error);
});
