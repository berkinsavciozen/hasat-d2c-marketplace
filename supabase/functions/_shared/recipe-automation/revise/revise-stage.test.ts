// Deno.test suite for revise-stage.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/revise/revise-stage.test.ts
import assert from "node:assert/strict";
import { runReviseStage } from "./revise-stage.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import type { AgentRunner } from "../infra/agent-runner.ts";
import type { RecipeQAResult } from "../types.ts";
import {
  validKabakRecipeDraft,
  validQAResult,
  validQAResultRevisionRequired,
  validRevisedKabakRecipeDraft,
} from "../fixtures/valid-kabak-recipe.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

const PASS_ISSUES = { valid: true, issues: [] };

/** Happy-path stubs for every RPC revise-stage.ts/validate-draft.ts calls: structure/crop/coverage/
 * slug all pass, normalize_recipe_units passes ingredients through unchanged, and
 * dispatch_recipe_stage records a successful call. */
function registerHappyPathRpcs(client: FakeSupabaseClient) {
  client.onRpc("validate_recipe_structure", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_crop_values", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_ingredient_coverage", () => ({ data: PASS_ISSUES, error: null }));
  client.onRpc("validate_recipe_slug", () => ({ data: { valid: true, issues: [], slug: "test-slug" }, error: null }));
  client.onRpc("normalize_recipe_units", (args) => ({ data: args.p_ingredients, error: null }));
  client.onRpc("dispatch_recipe_stage", () => ({ data: null, error: null }));
}

function seedReviseJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
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
    stage: "revise",
    status: "queued",
    attempt: 1,
    max_attempts: 3,
    revision_count: 0,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  }]);
  return jobId;
}

function seedDraftVersion(
  client: FakeSupabaseClient,
  jobId: string,
  version: number,
  draft: typeof validKabakRecipeDraft,
  overrides: Record<string, unknown> = {},
) {
  const draftId = crypto.randomUUID();
  client.seed("recipe_drafts", [{
    id: draftId,
    job_id: jobId,
    version,
    title: draft.title,
    description: draft.description,
    cover_photo_url: draft.coverPhotoUrl,
    servings: draft.servings,
    prep_minutes: draft.prepMinutes,
    cook_minutes: draft.cookMinutes,
    rest_minutes: draft.restMinutes,
    difficulty: draft.difficulty,
    cuisine: draft.cuisine,
    diet_tags: draft.dietTags,
    allergen_labels: draft.allergenLabels,
    required_equipment: draft.requiredEquipment,
    source_type: draft.sourceType,
    author_type: draft.authorType,
    visibility: draft.visibility,
    owner_id: draft.ownerId,
    extraction_confidence: draft.extractionConfidence,
    ingredients: draft.ingredients,
    steps: draft.steps,
    ...overrides,
  }]);
  return draftId;
}

function seedQaResult(
  client: FakeSupabaseClient,
  params: { jobId: string; draftId: string; draftVersion: number },
  qa: typeof validQAResultRevisionRequired,
  overrides: Record<string, unknown> = {},
) {
  const qaResultId = crypto.randomUUID();
  client.seed("recipe_qa_results", [{
    id: qaResultId,
    job_id: params.jobId,
    draft_id: params.draftId,
    draft_version: params.draftVersion,
    decision: qa.decision,
    overall_score: qa.overallScore,
    scores: qa.scores,
    blocking_issues: qa.blockingIssues,
    non_blocking_suggestions: qa.nonBlockingSuggestions,
    safety_review: qa.safetyReview,
    checked_at: qa.checkedAt,
    ...overrides,
  }]);
  return qaResultId;
}

/** A fake AgentRunner returning a RecipeDraftPayload fixture (minus jobId/briefId — revise-stage.ts
 * always overrides those with trusted server-side values, same "override then re-validate" pattern
 * write-stage.test.ts/qa-stage.test.ts document). */
function fixtureAgentRunner(base: typeof validRevisedKabakRecipeDraft): AgentRunner {
  const { jobId: _jobId, briefId: _briefId, ...rest } = base;
  return {
    run: () => Promise.resolve({
      output: rest,
      provider: "openai",
      model: "test-revise-model",
      usage: { inputTokens: 60, outputTokens: 50, totalTokens: 110 },
      durationMs: 20,
    }),
  };
}

function throwingAgentRunner(): AgentRunner {
  return {
    run: () => {
      throw new Error("must not be called");
    },
  };
}

Deno.test("runReviseStage: not_claimed when the job isn't at the revise stage", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { stage: "qa" });
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });
  assert.equal(result.outcome, "not_claimed");
  assert.equal(result.claimReason, "wrong_stage");
});

Deno.test("runReviseStage: no recipe_qa_results row at all for the job -> failJob, outcome no_qa_result", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "no_qa_result");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "revise", "a failed job stays at its current stage, not advanced");
  assert.equal(job.locked_by, null, "lock is released on failure");
});

Deno.test("runReviseStage: QA result names a draft_version with no matching recipe_drafts row -> failJob, outcome no_current_draft", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client);
  // Deliberately no seedDraftVersion() call — the composite FK guarantees this can't happen live,
  // but the defensive branch is still exercised directly here.
  seedQaResult(client, { jobId, draftId: crypto.randomUUID(), draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "no_current_draft");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "revise");
  assert.equal(job.locked_by, null);
});

Deno.test("runReviseStage: QA decision on the current draft is not 'revision_required' -> failJob, outcome unexpected_qa_decision", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client);
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResult);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "unexpected_qa_decision");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.locked_by, null);
});

Deno.test("runReviseStage: correctable unused-ingredient issue -> stores version 2 with the fix applied, revision_count=1, routes revise -> qa", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixtureAgentRunner(validRevisedKabakRecipeDraft),
  });

  assert.equal(result.outcome, "revised");
  assert.equal(result.draftVersion, 2);
  assert.equal(result.revisionCount, 1);
  assert.ok(result.draftId);

  const draftRow = client.getRow("recipe_drafts", result.draftId!)!;
  assert.equal(draftRow.job_id, jobId);
  assert.equal(draftRow.version, 2);
  assert.equal((draftRow.ingredients as unknown[]).length, 1, "expected the unused 'kasar peyniri' ingredient to be removed");
  assert.equal(draftRow.title, validKabakRecipeDraft.title, "unrelated fields must be restated unchanged");

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa");
  assert.equal(job.status, "queued");
  assert.equal(job.revision_count, 1);
  assert.equal(job.locked_by, null);
});

Deno.test("runReviseStage: duplicate invocation — a pre-existing next-version draft skips the agent and re-drives routing", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  const existingV2Id = seedDraftVersion(client, jobId, 2, validRevisedKabakRecipeDraft);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "already_revised");
  assert.equal(result.draftId, existingV2Id);
  assert.equal(result.revisionCount, 1);
  // throwingAgentRunner would turn this into outcome "agent_call_failed" if it were ever invoked —
  // "already_revised" alone proves the agent call (and a second insert at version 2) was skipped.

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa", "routing must still be re-driven even on the idempotent path");
  assert.equal(job.revision_count, 1);
});

Deno.test("runReviseStage: retrying the SAME version twice never produces two draft rows at that version", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const first = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixtureAgentRunner(validRevisedKabakRecipeDraft),
  });
  assert.equal(first.outcome, "revised");

  // The job is now at stage='qa' — simulate a duplicate/retried dispatch of the ORIGINAL revise
  // call landing after the first one already fully completed and advanced the job. claimJob's own
  // CAS (expectedStage='revise') refuses this, so no second version-2 row can ever be created.
  const second = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });
  assert.equal(second.outcome, "not_claimed");
  assert.equal(second.claimReason, "wrong_stage");

  const { data: draftsAtVersion2 } = await client.from("recipe_drafts").select("id").eq("job_id", jobId).eq("version", 2);
  assert.equal(draftsAtVersion2!.length, 1, "expected exactly one version=2 draft row for this job");
});

Deno.test("runReviseStage: persistent failure — revision cap already reached (2 automatic revisions) -> no agent call, no new draft, routes to manual review", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 2 });
  const draftId = seedDraftVersion(client, jobId, 3, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 3 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "revision_limit_reached");
  assert.equal(result.revisionCount, 2);
  // throwingAgentRunner would turn this into outcome "agent_call_failed" if it were ever invoked —
  // "revision_limit_reached" alone proves the agent call was skipped entirely once the cap hit.

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa", "no next-stage function to dispatch to for a human decision — parked at qa, same resting state as QA's own manual_review_required");
  assert.equal(job.status, "awaiting_approval");
  assert.equal(job.revision_count, 2, "the cap is never exceeded — stays at 2, satisfying the DB CHECK");
  assert.equal(job.locked_by, null);

  const { data: draftsForJob } = await client.from("recipe_drafts").select("version").eq("job_id", jobId);
  const versions = (draftsForJob ?? []).map((r) => r.version);
  assert.deepEqual(versions.sort(), [3], "no version=4 draft must ever be created once the cap is reached");
});

Deno.test("runReviseStage: agent call failure -> failJob, outcome agent_call_failed", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: { run: () => { throw new Error("provider timeout"); } },
  });

  assert.equal(result.outcome, "agent_call_failed");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "revise");
  assert.equal(job.locked_by, null);
});

Deno.test("runReviseStage: structurally invalid agent output -> failJob, outcome invalid_output", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const { jobId: _jobId, briefId: _briefId, title: _title, ...rest } = validRevisedKabakRecipeDraft;
  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: { run: () => Promise.resolve({ output: rest, provider: "openai", model: "test", usage: null, durationMs: 5 }) },
  });

  assert.equal(result.outcome, "invalid_output");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.locked_by, null);
});

Deno.test("runReviseStage: a blocking Postgres validation issue on the revised draft -> failJob, outcome validation_failed, no draft stored", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);
  client.onRpc("validate_recipe_structure", () => ({
    data: {
      valid: false,
      issues: [{ code: "TITLE_MISSING", field: "title", severity: "blocking", message: "title is required", requiredChange: null }],
    },
    error: null,
  }));

  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixtureAgentRunner(validRevisedKabakRecipeDraft),
  });

  assert.equal(result.outcome, "validation_failed");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "revise");
  assert.equal(job.locked_by, null);
});

// ---------------------------------------------------------------------------------------------
// Step 08A: constrained revision boundary enforcement
// ---------------------------------------------------------------------------------------------

/** A fake AgentRunner returning a RAW draft object as-is (no jobId/briefId stripping) — used where
 * the test itself already built the exact candidate shape it wants the "agent" to have produced. */
function fixedOutputAgentRunner(output: Record<string, unknown>): AgentRunner {
  return {
    run: () => Promise.resolve({
      output,
      provider: "openai",
      model: "test-revise-model",
      usage: { inputTokens: 60, outputTokens: 50, totalTokens: 110 },
      durationMs: 20,
    }),
  };
}

/** The Reviser's own valid fix (kasar peyniri removed, matching validQAResultRevisionRequired's
 * ingredients[1] issue) minus jobId/briefId, as a plain object other tests below can spread onto to
 * layer an ADDITIONAL, out-of-scope change alongside an otherwise-correct revision. */
const { jobId: _validFixJobId, briefId: _validFixBriefId, ...validFixWithoutIds } = validRevisedKabakRecipeDraft;

Deno.test("runReviseStage: an unrelated title change alongside a valid fix is rejected, outcome out_of_scope_change, no draft stored", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixedOutputAgentRunner({ ...validFixWithoutIds, title: "Baska Bir Baslik" }),
  });

  assert.equal(result.outcome, "out_of_scope_change");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "revise", "an out-of-scope candidate must stay at revise, not advance to qa");
  assert.equal(job.revision_count, 0, "a rejected candidate must not consume a revision");
  assert.equal(job.locked_by, null);

  const { data: draftsAtVersion2 } = await client.from("recipe_drafts").select("id").eq("job_id", jobId).eq("version", 2);
  assert.equal(draftsAtVersion2!.length, 0, "no version=2 draft may ever be stored for a rejected candidate");
});

Deno.test("runReviseStage: an unrelated servings change alongside a valid fix is rejected, outcome out_of_scope_change", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixedOutputAgentRunner({ ...validFixWithoutIds, servings: 8 }),
  });

  assert.equal(result.outcome, "out_of_scope_change");
  const { data: draftsAtVersion2 } = await client.from("recipe_drafts").select("id").eq("job_id", jobId).eq("version", 2);
  assert.equal(draftsAtVersion2!.length, 0);
});

Deno.test("runReviseStage: a non-blocking suggestion never grants mutation permission — the matching change is rejected", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  const qaWithSuggestion: RecipeQAResult = {
    ...validQAResultRevisionRequired,
    nonBlockingSuggestions: [
      {
        code: "STEP_WORDING",
        field: "steps[2].instruction",
        severity: "warning",
        message: "Daha net yazilabilir.",
        requiredChange: null,
      },
    ],
  };
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, qaWithSuggestion);
  registerHappyPathRpcs(client);

  const candidate = {
    ...validFixWithoutIds,
    steps: validFixWithoutIds.steps.map((s, i) => i === 1 ? { ...s, instruction: "Degistirilmis talimat." } : s),
  };

  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixedOutputAgentRunner(candidate),
  });

  assert.equal(result.outcome, "out_of_scope_change", "a nonBlockingSuggestion-only change must never be accepted, even though QA itself suggested it");
});

Deno.test("runReviseStage: identity/server-owned fields are rejected as out-of-scope even alongside a valid fix", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixedOutputAgentRunner({ ...validFixWithoutIds, authorType: "kullanici", visibility: "public" }),
  });

  assert.equal(result.outcome, "out_of_scope_change");
  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.revision_count, 0);
  const { data: draftsAtVersion2 } = await client.from("recipe_drafts").select("id").eq("job_id", jobId).eq("version", 2);
  assert.equal(draftsAtVersion2!.length, 0);
});

Deno.test("runReviseStage: an unlocatable blocking issue routes to manual review without calling the agent or storing a new draft", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  const qaWithUnresolvableIssue: RecipeQAResult = {
    ...validQAResultRevisionRequired,
    blockingIssues: [
      {
        code: "STEP_NO_NOT_NUMBER",
        field: "steps[].stepNo",
        severity: "blocking",
        message: "Bir adimin stepNo degeri sayisal degil.",
        requiredChange: null,
      },
    ],
  };
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, qaWithUnresolvableIssue);
  registerHappyPathRpcs(client);

  const result = await runReviseStage(asClient(client), { jobId, agentRunner: throwingAgentRunner() });

  assert.equal(result.outcome, "unresolvable_blocking_issue");
  // throwingAgentRunner would turn this into outcome "agent_call_failed" if it were ever invoked —
  // "unresolvable_blocking_issue" alone proves the agent call was skipped entirely.

  const job = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(job.stage, "qa", "no next-stage function to dispatch to for a human decision — parked at qa, same resting state as the revision-cap branch");
  assert.equal(job.status, "awaiting_approval");
  assert.equal(job.revision_count, 0, "routing to manual review must never consume a revision");
  assert.equal(job.locked_by, null);

  const { data: draftsForJob } = await client.from("recipe_drafts").select("version").eq("job_id", jobId);
  const versions = (draftsForJob ?? []).map((r) => r.version);
  assert.deepEqual(versions.sort(), [1], "no new draft version may ever be created when a blocking issue cannot be located");
});

Deno.test("runReviseStage: retrying after a rejected out-of-scope candidate does not consume a draft version or revision count", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedReviseJob(client, { revision_count: 0 });
  const draftId = seedDraftVersion(client, jobId, 1, validKabakRecipeDraft);
  seedQaResult(client, { jobId, draftId, draftVersion: 1 }, validQAResultRevisionRequired);
  registerHappyPathRpcs(client);

  const first = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixedOutputAgentRunner({ ...validFixWithoutIds, title: "Baska Bir Baslik" }),
  });
  assert.equal(first.outcome, "out_of_scope_change");

  const jobAfterFirst = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(jobAfterFirst.stage, "revise");
  assert.equal(jobAfterFirst.status, "retryable", "a retryable error leaves the job re-claimable at the same stage");
  assert.equal(jobAfterFirst.revision_count, 0);

  const second = await runReviseStage(asClient(client), {
    jobId,
    agentRunner: fixtureAgentRunner(validRevisedKabakRecipeDraft),
  });

  assert.equal(second.outcome, "revised", "the SAME job must still be revisable normally after an earlier rejected candidate");
  assert.equal(second.draftVersion, 2);
  assert.equal(second.revisionCount, 1, "the rejected attempt must not have pre-incremented revision_count");

  const { data: draftsAtVersion2 } = await client.from("recipe_drafts").select("id").eq("job_id", jobId).eq("version", 2);
  assert.equal(draftsAtVersion2!.length, 1, "exactly one version=2 draft after the retry succeeds — the earlier rejected candidate stored nothing");
});
