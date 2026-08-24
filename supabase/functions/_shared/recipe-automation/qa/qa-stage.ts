// F2 Recipe Automation — Step 07: recipe-stage-qa orchestration (the QA vertical slice).
//
// Implements PROMPT 07 end to end for exactly one stage: claim a `qa`-stage job, resolve the
// exact current draft version, run the Step 04 deterministic Postgres validations against it, give
// the QA agent the immutable brief + draft + validation output + duplicate candidates + prior QA
// history, parse the RecipeQAResult structured output, store it linked to the exact draft, route
// the job (approved -> image, revision_required -> revise, manual_review_required -> stays at qa,
// status=awaiting_approval for a human queue), and record stage telemetry.
//
// QA restrictions enforced here (not just in the prompt), mirroring the Writer stage's own
// restrictions in ../writer/write-stage.ts: the agent is given ZERO tools (no `tools` field is
// ever passed to `agentRunner.run(...)` below) — every read (brief, current draft, deterministic
// validation, duplicates, prior QA) happens BEFORE the call via context.ts + validate-draft.ts
// (reused from the Writer stage — the checks are draft-shape checks, not Writer-specific), and the
// only write this stage ever performs is one `recipe_qa_results` insert, never `recipes` and never
// `recipe_qa_results.safety_approved`/`safety_reviewed_by`/`safety_reviewed_at` (those columns are
// left null here — untouched by this stage — a human sets them later; recipeQAResultSchema's own
// refine already prevents the agent's own output from setting `safetyReview.approved=true` without
// a reviewer identity/timestamp neither this stage nor the agent has).
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { claimJob, releaseLock } from "../infra/job-lock.ts";
import { advanceStage, failJob } from "../infra/job-state.ts";
import { advanceStageAndDispatch } from "../infra/stage-dispatch.ts";
import { recordStageRun } from "../infra/telemetry.ts";
import { createAgentRunner, type AgentRunner } from "../infra/agent-runner.ts";
import { RecipeAutomationError, toSafeErrorPayload } from "../infra/errors.ts";
import { recipeQAResultSchema } from "../schemas.ts";
import type { RecipeQADecision, RecipeQAIssue } from "../types.ts";
import { briefFromJobRow, type WriteStageBrief } from "../writer/context.ts";
import { slugifyTitle } from "../writer/slug.ts";
import { validateDraft } from "../writer/validate-draft.ts";
import { buildQaSystemPrompt } from "./system-prompt.ts";
import {
  loadCurrentDraft,
  loadDuplicateCandidates,
  loadPriorQaHistory,
  type CurrentDraft,
} from "./context.ts";

const QA_STAGE = "qa" as const;
const IMAGE_STAGE = "image" as const;
const REVISE_STAGE = "revise" as const;
const IMAGE_STAGE_FUNCTION_NAME = "recipe-stage-image";
const REVISE_STAGE_FUNCTION_NAME = "recipe-stage-revise";
const QA_MODEL_ENV_VAR = "RECIPE_QA_MODEL";
const PRIOR_QA_HISTORY_LIMIT = 5;
const DUPLICATE_CANDIDATE_LIMIT = 5;

export interface RunQAStageParams {
  jobId: string;
  /** Injectable for tests — defaults to createAgentRunner() (the real SDK-backed runner). */
  agentRunner?: AgentRunner;
  workerId?: string;
}

export type RunQAStageOutcome =
  | "not_claimed"
  | "no_current_draft"
  | "deterministic_validation_failed"
  | "agent_call_failed"
  | "invalid_output"
  | "stored_approved"
  | "stored_revision_required"
  | "stored_manual_review_required"
  | "already_reviewed";

export interface RunQAStageResult {
  outcome: RunQAStageOutcome;
  jobId: string;
  qaResultId?: string;
  draftId?: string;
  draftVersion?: number;
  decision?: RecipeQADecision;
  claimReason?: string;
  errorCode?: string;
}

async function findExistingQaResult(
  client: SupabaseClient,
  params: { jobId: string; draftId: string; draftVersion: number },
): Promise<{ id: string; decision: RecipeQADecision } | null> {
  const { data, error } = await client
    .from("recipe_qa_results")
    .select("id, decision")
    .eq("job_id", params.jobId)
    .eq("draft_id", params.draftId)
    .eq("draft_version", params.draftVersion)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "QA_RESULT_EXISTENCE_CHECK_FAILED",
      message: "failed to check for an existing QA result against this draft",
      stage: QA_STAGE,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as { id: string; decision: RecipeQADecision } | null) ?? null;
}

function qaResultToInsertRow(params: {
  jobId: string;
  recipeId: string | null;
  draft: CurrentDraft;
  qa: import("../types.ts").RecipeQAResult;
  model: string;
  checkedAt: string;
}) {
  const { jobId, recipeId, draft, qa, model, checkedAt } = params;
  return {
    job_id: jobId,
    draft_id: draft.id,
    draft_version: draft.version,
    recipe_id: recipeId,
    decision: qa.decision,
    overall_score: qa.overallScore,
    scores: qa.scores,
    blocking_issues: qa.blockingIssues,
    non_blocking_suggestions: qa.nonBlockingSuggestions,
    safety_review: qa.safetyReview,
    // Deliberately left unset here — safety sign-off is a human action at a later gate (see the
    // module header and recipeQAResultSchema's own refine). This automated pass never writes them.
    safety_reviewed_by: null,
    safety_reviewed_at: null,
    safety_approved: null,
    approved_for_imaging: qa.approvedForImaging,
    model,
    checked_at: checkedAt,
  };
}

function runQaAgent(
  agentRunner: AgentRunner,
  params: {
    jobId: string;
    brief: WriteStageBrief;
    draft: CurrentDraft;
    validation: { valid: boolean; issues: RecipeQAIssue[] };
    duplicateCandidates: Awaited<ReturnType<typeof loadDuplicateCandidates>>;
    priorQaHistory: Awaited<ReturnType<typeof loadPriorQaHistory>>;
  },
) {
  return agentRunner.run({
    agentName: "recipe-qa",
    systemPrompt: buildQaSystemPrompt(),
    // Deliberately no `tools` field — same zero-tools restriction as the Writer agent (see the
    // module header): every read this agent needs is already folded into `input` below.
    input: {
      jobId: params.jobId,
      brief: params.brief,
      draft: params.draft.payload,
      draftVersion: params.draft.version,
      validation: params.validation,
      duplicateCandidates: params.duplicateCandidates,
      priorQaHistory: params.priorQaHistory,
    },
    outputSchema: recipeQAResultSchema,
    model: Deno.env.get(QA_MODEL_ENV_VAR) || undefined,
  });
}

/**
 * Routes an already-decided job: advances stage+dispatches the next stage-runner for
 * approved/revision_required, or parks the job at `qa` with status=awaiting_approval (a manual
 * review queue — there is no dedicated next-stage function to dispatch to for a human decision,
 * so `advanceStage` is called directly here rather than `advanceStageAndDispatch`; see the Step 07
 * completion report's "technical alignment" notes for why this one path differs from Step 06's
 * "always call advanceStageAndDispatch" convention). Shared by both the fresh-decision path and the
 * idempotent already-reviewed path, so a retried call re-drives routing the same way either time.
 */
async function routeDecision(
  client: SupabaseClient,
  params: { jobId: string; lockToken: string; batchId: string; decision: RecipeQADecision },
): Promise<void> {
  const { jobId, lockToken, batchId, decision } = params;
  if (decision === "approved") {
    const result = await advanceStageAndDispatch(
      client,
      { jobId, lockToken, fromStage: QA_STAGE, toStage: IMAGE_STAGE, toStatus: "queued" },
      { functionName: IMAGE_STAGE_FUNCTION_NAME, payload: { batchId } },
    );
    void result; // best-effort — see advanceStageAndDispatch's own contract
    return;
  }
  if (decision === "revision_required") {
    const result = await advanceStageAndDispatch(
      client,
      { jobId, lockToken, fromStage: QA_STAGE, toStage: REVISE_STAGE, toStatus: "queued" },
      { functionName: REVISE_STAGE_FUNCTION_NAME, payload: { batchId } },
    );
    void result; // best-effort — see advanceStageAndDispatch's own contract
    return;
  }
  // manual_review_required: stays at `qa`, parked for a human to look at.
  const result = await advanceStage(client, {
    jobId,
    lockToken,
    fromStage: QA_STAGE,
    toStage: QA_STAGE,
    toStatus: "awaiting_approval",
  });
  void result; // best-effort, same CAS-refusal-is-a-safe-no-op contract as every other advanceStage call
}

/**
 * Runs the QA stage for one job. Never throws for an ordinary content/provider failure — those are
 * reported via `failJob` and reflected in the returned `outcome`; only an unexpected infrastructure
 * error (a DB call that itself failed) throws, the same convention write-stage.ts uses.
 */
export async function runQAStage(
  client: SupabaseClient,
  params: RunQAStageParams,
): Promise<RunQAStageResult> {
  const claim = await claimJob(client, {
    jobId: params.jobId,
    expectedStage: QA_STAGE,
    workerId: params.workerId,
  });
  if (!claim.claimed) {
    return { outcome: "not_claimed", jobId: params.jobId, claimReason: claim.reason };
  }

  const { row, lockToken } = claim.job;
  const brief = briefFromJobRow(row);
  const recipeId = (row.recipe_id as string | null) ?? null;
  const attempt = Number(row.attempt ?? 1);
  const agentRunner = params.agentRunner ?? createAgentRunner();
  const startedAt = new Date().toISOString();

  let currentDraft: CurrentDraft | null;
  try {
    currentDraft = await loadCurrentDraft(client, params.jobId);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (!currentDraft) {
    // A job reached `qa` with no recipe_drafts row at all — an upstream invariant violation
    // (write-stage.ts only advances a job to `qa` after its draft insert has committed), not an
    // ordinary content failure. Treated as retryable in case this is a genuine read-visibility
    // race rather than real corruption; failJob's own max_attempts logic still terminates it.
    const error = toSafeErrorPayload("no recipe_drafts row found for this job", {
      code: "QA_NO_CURRENT_DRAFT",
      stage: QA_STAGE,
      retryable: true,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: QA_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: QA_STAGE, error });
    return { outcome: "no_current_draft", jobId: params.jobId, errorCode: error.code };
  }

  // Idempotency (mirrors write-stage.ts's own "already_stored" check): a QA result may already
  // exist for this EXACT draft from a prior attempt that finished storing but crashed/timed out
  // before routing. Detect that first and skip the agent call entirely — no duplicate spend, no
  // second recipe_qa_results row for the same (job_id, draft_id, draft_version) — then re-drive
  // routing off the already-stored decision.
  let existing: { id: string; decision: RecipeQADecision } | null;
  try {
    existing = await findExistingQaResult(client, {
      jobId: params.jobId,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
    });
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (existing) {
    await routeDecision(client, {
      jobId: params.jobId, lockToken, batchId: brief.batchId, decision: existing.decision,
    });
    return {
      outcome: "already_reviewed",
      jobId: params.jobId,
      qaResultId: existing.id,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
      decision: existing.decision,
    };
  }

  // Deterministic Postgres validations FIRST (PROMPT 07 step 3), same RPCs and same
  // structure/crop/slug/coverage aggregation the Writer stage already runs — reused, not
  // reimplemented (see the module header). A blocking finding here means the stored draft itself
  // is structurally broken; that is not something the QA agent's judgment call should paper over,
  // so the agent is never invoked in that case — mirrors write-stage.ts's own
  // "validation_failed" gate exactly, one stage later.
  const validation = await validateDraft(client, currentDraft.payload);
  const blockingValidationIssues = validation.issues.filter((issue) => issue.severity === "blocking");

  if (!validation.valid || blockingValidationIssues.length > 0) {
    const error = toSafeErrorPayload(
      `current draft failed Postgres validation: ${blockingValidationIssues.map((i) => i.code).join(", ")}`,
      { code: "QA_DRAFT_VALIDATION_FAILED", stage: QA_STAGE, retryable: false },
    );
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: QA_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { draftId: currentDraft.id, draftVersion: currentDraft.version, issues: blockingValidationIssues },
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: QA_STAGE, error });
    return {
      outcome: "deterministic_validation_failed",
      jobId: params.jobId,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
      errorCode: error.code,
    };
  }

  const candidateSlug = slugifyTitle(currentDraft.payload.title);
  const [duplicateCandidates, priorQaHistory] = await Promise.all([
    loadDuplicateCandidates(client, {
      title: currentDraft.payload.title,
      crop: brief.focusCrop,
      slug: candidateSlug,
      limit: DUPLICATE_CANDIDATE_LIMIT,
    }),
    loadPriorQaHistory(client, params.jobId, PRIOR_QA_HISTORY_LIMIT),
  ]);

  let agentResult;
  try {
    agentResult = await runQaAgent(agentRunner, {
      jobId: params.jobId,
      brief,
      draft: currentDraft,
      validation: { valid: validation.valid, issues: validation.issues },
      duplicateCandidates,
      priorQaHistory,
    });
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "QA_AGENT_CALL_FAILED",
      stage: QA_STAGE,
      retryable: e instanceof RecipeAutomationError ? e.retryable : true,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: QA_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { draftId: currentDraft.id, draftVersion: currentDraft.version },
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: QA_STAGE, error });
    return {
      outcome: "agent_call_failed", jobId: params.jobId,
      draftId: currentDraft.id, draftVersion: currentDraft.version, errorCode: error.code,
    };
  }

  const checkedAt = new Date().toISOString();
  // Trusted/server-controlled fields are forced onto the agent's raw output BEFORE parsing — same
  // pattern write-stage.ts uses for jobId/briefId: the agent's own output for these is never
  // trusted, even if it happened to guess correctly.
  const parsed = recipeQAResultSchema.safeParse({
    ...(agentResult.output as Record<string, unknown>),
    jobId: params.jobId,
    draftId: currentDraft.id,
    draftVersion: currentDraft.version,
    recipeId,
    checkedAt,
    model: agentResult.model,
  });

  if (!parsed.success) {
    const error = toSafeErrorPayload(parsed.error, {
      code: "QA_OUTPUT_SCHEMA_INVALID",
      stage: QA_STAGE,
      retryable: false,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: QA_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { draftId: currentDraft.id, draftVersion: currentDraft.version },
      provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: QA_STAGE, error });
    return {
      outcome: "invalid_output", jobId: params.jobId,
      draftId: currentDraft.id, draftVersion: currentDraft.version, errorCode: error.code,
    };
  }

  const qa = parsed.data;
  const insertResult = await client
    .from("recipe_qa_results")
    .insert(qaResultToInsertRow({ jobId: params.jobId, recipeId, draft: currentDraft, qa, model: agentResult.model, checkedAt }))
    .select("id")
    .single();

  if (insertResult.error) {
    throw new RecipeAutomationError({
      code: "QA_RESULT_INSERT_FAILED",
      message: "recipe_qa_results insert failed",
      stage: QA_STAGE,
      retryable: true,
      details: { pgCode: (insertResult.error as { code?: string }).code },
    });
  }
  const qaResultId = (insertResult.data as { id: string }).id;

  await recordStageRun(client, {
    jobId: params.jobId, batchId: brief.batchId, stage: QA_STAGE, status: "completed",
    attempt, startedAt, finishedAt: new Date().toISOString(),
    output: {
      qaResultId, draftId: currentDraft.id, draftVersion: currentDraft.version,
      decision: qa.decision, overallScore: qa.overallScore,
    },
    provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
  });

  await routeDecision(client, {
    jobId: params.jobId, lockToken, batchId: brief.batchId, decision: qa.decision,
  });

  const outcome: RunQAStageOutcome = qa.decision === "approved"
    ? "stored_approved"
    : qa.decision === "revision_required"
    ? "stored_revision_required"
    : "stored_manual_review_required";

  return {
    outcome, jobId: params.jobId, qaResultId,
    draftId: currentDraft.id, draftVersion: currentDraft.version, decision: qa.decision,
  };
}
