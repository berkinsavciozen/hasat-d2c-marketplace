// Deno.test suite for write-stage.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/writer/write-stage.test.ts
import assert from "node:assert/strict";
import { runWriteStage } from "./write-stage.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import type { AgentRunner } from "../infra/agent-runner.ts";
import { validKabakRecipeDraft } from "../fixtures/valid-kabak-recipe.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

const PASS_ISSUES = { valid: true, issues: [] };

/** Registers the happy-path stub for every RPC validate-draft.ts/context.ts call — structure/crop/
 * coverage/slug all pass, normalize_recipe_units passes ingredients through unchanged, crop
 * context reports kabak as found/in-season, and dispatch_recipe_stage records a successful call. */
function registerHappyPathRpcs(client: FakeSupabaseClient) {
  client.onRpc("get_crop_context", () => ({
    data: {
      crop: "kabak", found: true, displayName: "Kabak", defaultUnit: "adet",
      categoryGroup: "sebze", harvestWindowStartMonth: 5, harvestWindowEndMonth: 9,
      inSeason: true, isEdible: true, culinaryAliases: ["sakiz kabagi"],
    },
    error: null,
  }));
  client.onRpc("validate_recipe_structure", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_crop_values", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_ingredient_coverage", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_slug", () => ({ data: { valid: true, issues: [], slug: "test-slug" }, error: null }));
  client.onRpc("normalize_recipe_units", (args) => ({ data: args.p_ingredients, error: null }));
  client.onRpc("dispatch_recipe_stage", () => ({ data: null, error: null }));
}

function seedWriteJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    brief_id: crypto.randomUUID(),
    working_title: "Firinda Kabak Musakka",
    focus_crop: "kabak",
    angle: "Mevsimlik kabaklarla hafif bir aksam yemegi.",
    target_difficulty: "orta",
    diet_tags: ["vejetaryen"],
    locale: "tr",
    stage: "write",
    status: "queued",
    attempt: 1,
    max_attempts: 3,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  }]);
  return jobId;
}

/** A fake AgentRunner returning the kabak fixture draft (minus jobId/briefId — write-stage.ts
 * always overrides those with the real job's own values before parsing). */
function fixtureAgentRunner(overrides: Record<string, unknown> = {}): AgentRunner {
  const { jobId: _jobId, briefId: _briefId, ...rest } = validKabakRecipeDraft;
  return {
    run: async () => ({
      output: { ...rest, ...overrides },
      provider: "openai",
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 42,
    }),
  };
}

function throwingAgentRunner(): AgentRunner {
  return {
    run: async () => {
      throw new Error("must not be called");
    },
  };
}

Deno.test("runWriteStage: live-verified model quirk — placeholder photo URLs ('' and the literal string 'null') are normalized, not rejected", async () => {
  // F2 Step 06 (P1 preflight probe evidence): across multiple real OpenAI Structured Outputs
  // calls, the model reliably substitutes "" or the literal string "null" for
  // coverPhotoUrl/steps[].photoUrl instead of JSON null (image generation is a later stage — the
  // Writer never has a real photo). Proves write-stage.ts stores successfully for both observed
  // spellings instead of treating this expected, harmless case as invalid_output.
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);
  const runner = fixtureAgentRunner({
    coverPhotoUrl: "",
    steps: validKabakRecipeDraft.steps.map((s, i) => ({ ...s, photoUrl: i % 2 === 0 ? "" : "null" })),
  });

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: runner });

  assert.equal(result.outcome, "stored");
  const draft = client.getRow("recipe_drafts", result.draftId!)!;
  assert.equal(draft.cover_photo_url, null);
  const steps = draft.steps as Array<{ photoUrl: unknown }>;
  assert.ok(steps.every((s) => s.photoUrl === null));
});

Deno.test("runWriteStage: a genuinely malformed photoUrl (not a known placeholder) is still rejected", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);
  const runner = fixtureAgentRunner({ coverPhotoUrl: "not a url at all" });

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: runner });
  assert.equal(result.outcome, "invalid_output");
});

Deno.test("runWriteStage: not_claimed when the job isn't at the write stage", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client, { stage: "qa" });
  registerHappyPathRpcs(client);

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: fixtureAgentRunner() });
  assert.equal(result.outcome, "not_claimed");
  assert.equal(result.claimReason, "wrong_stage");
});

Deno.test("runWriteStage: happy path — stores draft v1, records telemetry, advances to qa", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: fixtureAgentRunner() });

  assert.equal(result.outcome, "stored");
  assert.ok(result.draftId);

  const draft = client.getRow("recipe_drafts", result.draftId!)!;
  assert.equal(draft.job_id, jobId);
  assert.equal(draft.version, 1);
  assert.equal(draft.title, validKabakRecipeDraft.title);

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa");
  assert.equal(job.status, "queued");
  assert.equal(job.locked_by, null);
});

Deno.test("runWriteStage: idempotent — a pre-existing version-1 draft skips the agent entirely (no duplicate spend)", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);

  const existingDraftId = crypto.randomUUID();
  client.seed("recipe_drafts", [{
    id: existingDraftId, job_id: jobId, version: 1, title: "Already written",
    ingredients: [], steps: [],
  }]);

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "already_stored");
  assert.equal(result.draftId, existingDraftId);
  // throwingAgentRunner would turn this into outcome "agent_call_failed" if it were ever invoked
  // (see the agent-call-failure test below) — "already_stored" alone proves it was skipped
  // entirely, i.e. no duplicate agent spend on the idempotent path.

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa", "job must still advance even on the idempotent path");
});

Deno.test("runWriteStage: agent call failure -> failJob, outcome agent_call_failed", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);
  const failingRunner: AgentRunner = { run: async () => { throw new Error("provider timeout"); } };

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: failingRunner });

  assert.equal(result.outcome, "agent_call_failed");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "write", "a failed job stays at its current stage, not advanced");
  assert.notEqual(job.last_error, undefined);
  assert.equal(job.locked_by, null, "lock is released on failure");
});

Deno.test("runWriteStage: structurally invalid agent output -> failJob, outcome invalid_output", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);
  // Missing required 'title' and empty ingredients/steps — fails recipeDraftPayloadSchema.
  const badRunner: AgentRunner = {
    run: async () => ({
      output: { description: null, ingredients: [], steps: [] },
      provider: "openai", model: "test-model", usage: null, durationMs: 10,
    }),
  };

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: badRunner });

  assert.equal(result.outcome, "invalid_output");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "write");
});

Deno.test("runWriteStage: a blocking Postgres validation issue -> failJob, outcome validation_failed, no draft stored", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);
  client.onRpc("validate_recipe_structure", () => ({
    data: {
      valid: false,
      issues: [{ code: "TITLE_MISSING", field: "title", severity: "blocking", message: "title is required", requiredChange: null }],
    },
    error: null,
  }));

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: fixtureAgentRunner() });

  assert.equal(result.outcome, "validation_failed");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "write");
  assert.equal(job.locked_by, null);
});

Deno.test("runWriteStage: difficulty outside kolay/orta/zor is rejected before any DB write (schema-level restriction)", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);
  const runner = fixtureAgentRunner({ difficulty: "medium" as never });

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: runner });
  assert.equal(result.outcome, "invalid_output");
});

Deno.test("runWriteStage: an ingredient carrying crop_id is rejected (crop text only, never crop_id)", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedWriteJob(client);
  registerHappyPathRpcs(client);
  const runner = fixtureAgentRunner({
    ingredients: [{ ...validKabakRecipeDraft.ingredients[0], crop_id: "abc-123" } as never],
  });

  const result = await runWriteStage(asClient(client), { jobId, agentRunner: runner });
  assert.equal(result.outcome, "invalid_output");
});
