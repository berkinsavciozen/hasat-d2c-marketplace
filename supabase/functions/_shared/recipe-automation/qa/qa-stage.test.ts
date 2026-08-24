// Deno.test suite for qa-stage.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/qa/qa-stage.test.ts
import assert from "node:assert/strict";
import { runQAStage } from "./qa-stage.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import type { AgentRunner } from "../infra/agent-runner.ts";
import {
  validKabakRecipeDraft,
  validQAResult,
  validQAResultManualReviewRequired,
  validQAResultRevisionRequired,
} from "../fixtures/valid-kabak-recipe.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

const PASS_ISSUES = { valid: true, issues: [] };

/** Happy-path stubs for every RPC qa-stage.ts/validate-draft.ts calls: structure/crop/coverage/
 * slug all pass, normalize_recipe_units passes ingredients through unchanged, no duplicate
 * candidates found, and dispatch_recipe_stage records a successful call. */
function registerHappyPathRpcs(client: FakeSupabaseClient) {
  client.onRpc("validate_recipe_structure", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_crop_values", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_ingredient_coverage", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_slug", () => ({ data: { valid: true, issues: [], slug: "test-slug" }, error: null }));
  client.onRpc("normalize_recipe_units", (args) => ({ data: args.p_ingredients, error: null }));
  client.onRpc("find_recipe_duplicates", () => ({ data: [], error: null }));
  client.onRpc("dispatch_recipe_stage", () => ({ data: null, error: null }));
}

function seedQaJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    brief_id: crypto.randomUUID(),
    recipe_id: null,
    working_title: "Firinda Kabak Musakka",
    focus_crop: "kabak",
    angle: "Mevsimlik kabaklarla hafif bir aksam yemegi.",
    target_difficulty: "orta",
    diet_tags: ["vejetaryen"],
    locale: "tr",
    stage: "qa",
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

function seedCurrentDraft(
  client: FakeSupabaseClient,
  jobId: string,
  overrides: Record<string, unknown> = {},
) {
  const draftId = crypto.randomUUID();
  client.seed("recipe_drafts", [{
    id: draftId,
    job_id: jobId,
    version: 1,
    title: validKabakRecipeDraft.title,
    description: validKabakRecipeDraft.description,
    cover_photo_url: validKabakRecipeDraft.coverPhotoUrl,
    servings: validKabakRecipeDraft.servings,
    prep_minutes: validKabakRecipeDraft.prepMinutes,
    cook_minutes: validKabakRecipeDraft.cookMinutes,
    rest_minutes: validKabakRecipeDraft.restMinutes,
    difficulty: validKabakRecipeDraft.difficulty,
    cuisine: validKabakRecipeDraft.cuisine,
    diet_tags: validKabakRecipeDraft.dietTags,
    allergen_labels: validKabakRecipeDraft.allergenLabels,
    required_equipment: validKabakRecipeDraft.requiredEquipment,
    source_type: validKabakRecipeDraft.sourceType,
    author_type: validKabakRecipeDraft.authorType,
    visibility: validKabakRecipeDraft.visibility,
    owner_id: validKabakRecipeDraft.ownerId,
    extraction_confidence: validKabakRecipeDraft.extractionConfidence,
    ingredients: validKabakRecipeDraft.ingredients,
    steps: validKabakRecipeDraft.steps,
    ...overrides,
  }]);
  return draftId;
}

/** A fake AgentRunner returning a RecipeQAResult fixture (minus the fields qa-stage.ts always
 * overrides with trusted server-side values — jobId/draftId/draftVersion/recipeId/checkedAt/
 * model — same "override then re-validate" pattern write-stage.test.ts's fixtureAgentRunner
 * documents). */
function fixtureAgentRunner(base: typeof validQAResult, overrides: Record<string, unknown> = {}): AgentRunner {
  const { jobId: _jobId, draftId: _draftId, draftVersion: _draftVersion, recipeId: _recipeId, checkedAt: _checkedAt, model: _model, ...rest } = base;
  return {
    run: async () => ({
      output: { ...rest, ...overrides },
      provider: "openai",
      model: "test-qa-model",
      usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
      durationMs: 30,
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

Deno.test("runQAStage: not_claimed when the job isn't at the qa stage", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedQaJob(client, { stage: "write" });
  registerHappyPathRpcs(client);

  const result = await runQAStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });
  assert.equal(result.outcome, "not_claimed");
  assert.equal(result.claimReason, "wrong_stage");
});

Deno.test("runQAStage: no recipe_drafts row for the job -> failJob, outcome no_current_draft", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedQaJob(client);
  registerHappyPathRpcs(client);

  const result = await runQAStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "no_current_draft");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa", "a failed job stays at its current stage, not advanced");
  assert.equal(job.locked_by, null, "lock is released on failure");
});

Deno.test("runQAStage: deterministic Postgres validation failure -> failJob, no agent call, outcome deterministic_validation_failed", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedQaJob(client);
  seedCurrentDraft(client, jobId);
  registerHappyPathRpcs(client);
  client.onRpc("validate_recipe_structure", () => ({
    data: {
      valid: false,
      issues: [{ code: "TITLE_MISSING", field: "title", severity: "blocking", message: "title is required", requiredChange: null }],
    },
    error: null,
  }));

  const result = await runQAStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "deterministic_validation_failed");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa");
  assert.equal(job.locked_by, null);
});

Deno.test("runQAStage: agent decision 'approved' -> stores QA result, routes qa -> image", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedQaJob(client);
  const draftId = seedCurrentDraft(client, jobId);
  registerHappyPathRpcs(client);

  const result = await runQAStage(asClient(client), {
    jobId,
    agentRunner: fixtureAgentRunner(validQAResult),
  });

  assert.equal(result.outcome, "stored_approved");
  assert.equal(result.decision, "approved");
  assert.ok(result.qaResultId);

  const qaRow = client.getRow("recipe_qa_results", result.qaResultId!)!;
  assert.equal(qaRow.job_id, jobId);
  assert.equal(qaRow.draft_id, draftId);
  assert.equal(qaRow.draft_version, 1);
  assert.equal(qaRow.decision, "approved");
  assert.equal(qaRow.approved_for_imaging, true);
  assert.equal(qaRow.safety_approved, null, "an automated QA pass never sets safety_approved itself");
  assert.equal(qaRow.safety_reviewed_by, null);
  assert.equal(qaRow.safety_reviewed_at, null);

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "image");
  assert.equal(job.status, "queued");
  assert.equal(job.locked_by, null);
});

Deno.test("runQAStage: agent decision 'revision_required' (blocking issues) -> stores QA result, routes qa -> revise", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedQaJob(client);
  seedCurrentDraft(client, jobId);
  registerHappyPathRpcs(client);

  const result = await runQAStage(asClient(client), {
    jobId,
    agentRunner: fixtureAgentRunner(validQAResultRevisionRequired),
  });

  assert.equal(result.outcome, "stored_revision_required");
  assert.equal(result.decision, "revision_required");

  const qaRow = client.getRow("recipe_qa_results", result.qaResultId!)!;
  assert.equal(qaRow.decision, "revision_required");
  assert.equal(qaRow.approved_for_imaging, false);
  assert.ok((qaRow.blocking_issues as unknown[]).length > 0);

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "revise");
  assert.equal(job.status, "queued");
  assert.equal(job.locked_by, null);
});

Deno.test("runQAStage: agent decision 'manual_review_required' -> stores QA result, stays at qa with status awaiting_approval", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedQaJob(client);
  seedCurrentDraft(client, jobId);
  registerHappyPathRpcs(client);

  const result = await runQAStage(asClient(client), {
    jobId,
    agentRunner: fixtureAgentRunner(validQAResultManualReviewRequired),
  });

  assert.equal(result.outcome, "stored_manual_review_required");
  assert.equal(result.decision, "manual_review_required");

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa", "manual review has no next-stage function to dispatch to — job stays at qa");
  assert.equal(job.status, "awaiting_approval");
  assert.equal(job.locked_by, null, "lock is still released even though the stage didn't change");
});

Deno.test("runQAStage: duplicate invocation — a pre-existing QA result for the current draft skips the agent and re-drives routing", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedQaJob(client);
  const draftId = seedCurrentDraft(client, jobId);
  registerHappyPathRpcs(client);

  const existingQaResultId = crypto.randomUUID();
  client.seed("recipe_qa_results", [{
    id: existingQaResultId,
    job_id: jobId,
    draft_id: draftId,
    draft_version: 1,
    decision: "approved",
    overall_score: 88,
    scores: validQAResult.scores,
    blocking_issues: [],
    non_blocking_suggestions: [],
    safety_review: validQAResult.safetyReview,
    approved_for_imaging: true,
  }]);

  const result = await runQAStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "already_reviewed");
  assert.equal(result.qaResultId, existingQaResultId);
  // throwingAgentRunner would turn this into outcome "agent_call_failed" if it were ever invoked
  // — "already_reviewed" alone proves the agent call (and a second insert) was skipped entirely.

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "image", "routing must still be re-driven even on the idempotent path");
});
