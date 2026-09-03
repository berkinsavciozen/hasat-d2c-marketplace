// F2 Recipe Automation — Step 08: recipe-stage-revise orchestration (the Writer in constrained
// revision mode).
//
// Implements PROMPT 08 end to end for exactly one stage: claim a `revise`-stage job, resolve the
// LATEST QA result for it and the exact draft version that result reviewed (see context.ts's
// header for why this is anchored on the QA result, not "the current highest-version draft"),
// enforce the two-automatic-revision cap (routing to manual review instead of looping once it's
// reached), run the Reviser agent (the Writer's own output contract, constrained to that draft +
// QA blocking issues only — see ../writer/write-stage.ts's header for why this is the same content
// agent, not a new one), store the result as the NEXT draft version (never a patch — a complete
// new RecipeDraftPayload, per PROMPT 08), record telemetry, and route back to `qa` via
// `advanceStageAndDispatch` with `revision_count` incremented atomically in the same CAS update.
//
// Reviser restrictions enforced here (not just in the prompt), mirroring write-stage.ts/
// qa-stage.ts: the agent is given ZERO tools — every read (brief, target draft, QA blocking
// issues) happens BEFORE the call via context.ts, and the only write this stage ever performs is
// one `recipe_drafts` insert, never `recipes` and never `recipe_qa_results` (routing back to `qa`
// re-runs QA fresh against the new version; this stage does not grade its own output).
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { claimJob, releaseLock } from "../infra/job-lock.ts";
import { advanceStage, failJob } from "../infra/job-state.ts";
import { advanceStageAndDispatch } from "../infra/stage-dispatch.ts";
import { recordStageRun } from "../infra/telemetry.ts";
import { createAgentRunner, type AgentRunner } from "../infra/agent-runner.ts";
import { RecipeAutomationError, toSafeErrorPayload } from "../infra/errors.ts";
import { recipeDraftPayloadSchema } from "../schemas.ts";
import type { RecipeDraftPayload, RecipeQAIssue } from "../types.ts";
import { briefFromJobRow, type WriteStageBrief } from "../writer/context.ts";
import { normalizeEmptyUrlFields } from "../writer/write-stage.ts";
import { validateDraft } from "../writer/validate-draft.ts";
import { buildReviserSystemPrompt } from "./system-prompt.ts";
import { loadDraftByVersion, loadLatestQaResult, type DraftAtVersion, type LatestQaResult } from "./context.ts";
import { computeAllowedChangeSurface, findOutOfScopeChanges, reconcileOutOfScopeChanges } from "./allowed-changes.ts";
import { sanitizeUnknownCropIngredients } from "../crop-slug-guard.ts";

const REVISE_STAGE = "revise" as const;
const NEXT_STAGE = "qa" as const;
const NEXT_STAGE_FUNCTION_NAME = "recipe-stage-qa";
const REVISER_MODEL_ENV_VAR = "RECIPE_REVISE_MODEL";

/** "Maximum two automatic revisions" (PROMPT 08) — matches
 * `recipe_generation_jobs.revision_count`'s own `check (revision_count >= 0 and revision_count <=
 * 2)` (20260819120000_f2s03_recipe_automation_schema.sql). Kept as a named constant here, not
 * re-derived from the DB constraint, so the business rule and its enforcement point are visible
 * together — the CHECK is the backstop, this is the actual routing decision. */
const MAX_AUTOMATIC_REVISIONS = 2;

export interface RunReviseStageParams {
  jobId: string;
  /** Injectable for tests — defaults to createAgentRunner() (the real SDK-backed runner). */
  agentRunner?: AgentRunner;
  workerId?: string;
}

export type RunReviseStageOutcome =
  | "not_claimed"
  | "no_current_draft"
  | "no_qa_result"
  | "unexpected_qa_decision"
  | "revision_limit_reached"
  | "unresolvable_blocking_issue"
  | "agent_call_failed"
  | "invalid_output"
  | "validation_failed"
  | "out_of_scope_change"
  | "revised"
  | "already_revised";

export interface RunReviseStageResult {
  outcome: RunReviseStageOutcome;
  jobId: string;
  draftId?: string;
  draftVersion?: number;
  revisionCount?: number;
  claimReason?: string;
  errorCode?: string;
}

function draftToInsertRow(jobId: string, version: number, draft: RecipeDraftPayload, normalizedIngredients: RecipeDraftPayload["ingredients"]) {
  return {
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
    ingredients: normalizedIngredients,
    steps: draft.steps,
  };
}

async function findExistingDraftVersion(
  client: SupabaseClient,
  jobId: string,
  version: number,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("recipe_drafts")
    .select("id")
    .eq("job_id", jobId)
    .eq("version", version)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "REVISE_DRAFT_EXISTENCE_CHECK_FAILED",
      message: "failed to check for an existing next-version draft",
      stage: REVISE_STAGE,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as { id: string } | null) ?? null;
}

function runReviserAgent(
  agentRunner: AgentRunner,
  params: {
    jobId: string;
    brief: WriteStageBrief;
    previousDraft: DraftAtVersion;
    blockingIssues: RecipeQAIssue[];
    revisionNumber: number;
  },
) {
  return agentRunner.run({
    agentName: "recipe-reviser",
    systemPrompt: buildReviserSystemPrompt(),
    // Deliberately no `tools` field — same zero-tools restriction as the Writer/QA agents (see the
    // module header): every read this agent needs is already folded into `input` below. Note this
    // is deliberately NARROWER than the Writer's own input (no cropContext) and the QA agent's
    // input (blockingIssues only, never the full RecipeQAResult — no scores, no
    // nonBlockingSuggestions, no safetyReview) — PROMPT 08 asks for "structured QA blocking issues
    // only", not a full QA report, to keep this a targeted fix rather than a second-guessing pass.
    input: {
      jobId: params.jobId,
      brief: params.brief,
      previousDraft: params.previousDraft.payload,
      blockingIssues: params.blockingIssues,
      revisionNumber: params.revisionNumber,
      maxAutomaticRevisions: MAX_AUTOMATIC_REVISIONS,
    },
    outputSchema: recipeDraftPayloadSchema,
    model: Deno.env.get(REVISER_MODEL_ENV_VAR) || undefined,
  });
}

/**
 * Parks a job at the human review queue — same resting state QA's own `manual_review_required`
 * routes to (stage='qa', status='awaiting_approval'; see qa/qa-stage.ts's `routeDecision`). There
 * is no next-stage function to dispatch to for a human decision, so `advanceStage` is called
 * directly, not `advanceStageAndDispatch` — same rationale as QA's own manual-review path.
 */
async function routeToManualReview(
  client: SupabaseClient,
  params: { jobId: string; lockToken: string },
): Promise<void> {
  const result = await advanceStage(client, {
    jobId: params.jobId,
    lockToken: params.lockToken,
    fromStage: REVISE_STAGE,
    toStage: NEXT_STAGE,
    toStatus: "awaiting_approval",
  });
  void result; // best-effort, same CAS-refusal-is-a-safe-no-op contract as every other advanceStage call
}

/**
 * Runs the revise stage for one job. Never throws for an ordinary content/provider failure — those
 * are reported via `failJob` and reflected in the returned `outcome`; only an unexpected
 * infrastructure error (a DB call that itself failed) throws, the same convention write-stage.ts/
 * qa-stage.ts use.
 */
export async function runReviseStage(
  client: SupabaseClient,
  params: RunReviseStageParams,
): Promise<RunReviseStageResult> {
  const claim = await claimJob(client, {
    jobId: params.jobId,
    expectedStage: REVISE_STAGE,
    workerId: params.workerId,
  });
  if (!claim.claimed) {
    return { outcome: "not_claimed", jobId: params.jobId, claimReason: claim.reason };
  }

  const { row, lockToken } = claim.job;
  const brief = briefFromJobRow(row);
  const attempt = Number(row.attempt ?? 1);
  const revisionCount = Number(row.revision_count ?? 0);
  const agentRunner = params.agentRunner ?? createAgentRunner();
  const startedAt = new Date().toISOString();

  // Anchor on the LATEST QA result for this job, not "the current highest-version draft" — see
  // context.ts's module header for why: this stage creates new draft versions itself, so a retry
  // after a partial completion (a new draft already stored, crash before advancing) must not
  // re-resolve to that not-yet-QA'd draft as if it were the one to revise.
  let qaResult: LatestQaResult | null;
  try {
    qaResult = await loadLatestQaResult(client, params.jobId);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (!qaResult) {
    // A job reached `revise` with no recipe_qa_results row at all — an upstream invariant
    // violation (a job can only reach `revise` from `qa`, which never routes here without storing
    // a result first), not an ordinary content failure. Retryable in case this is a genuine
    // read-visibility race rather than real corruption — mirrors qa-stage.ts's own
    // "no_current_draft" handling exactly.
    const error = toSafeErrorPayload("no recipe_qa_results row found for this job", {
      code: "REVISE_NO_QA_RESULT",
      stage: REVISE_STAGE,
      retryable: true,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: REVISE_STAGE, error });
    return { outcome: "no_qa_result", jobId: params.jobId, errorCode: error.code };
  }

  if (qaResult.decision !== "revision_required") {
    // A job can only be routed to `revise` by qa-stage.ts's own `revision_required` branch — any
    // other decision reaching here is a routing bug upstream, not something a revision pass can
    // meaningfully act on. Not retryable: re-running this exact job/QA-result combination would
    // hit the same mismatch every time.
    const error = toSafeErrorPayload(
      `job reached revise with a QA decision of '${qaResult.decision}', expected 'revision_required'`,
      { code: "REVISE_UNEXPECTED_QA_DECISION", stage: REVISE_STAGE, retryable: false },
    );
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { qaResultId: qaResult.id, draftVersion: qaResult.draftVersion },
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: REVISE_STAGE, error });
    return { outcome: "unexpected_qa_decision", jobId: params.jobId, errorCode: error.code };
  }

  // The two-automatic-revision cap (PROMPT 08): `revisionCount` was read from the job row AT CLAIM
  // TIME, before this attempt does any work — so if it's already at the cap, this would be the
  // THIRD automatic revision attempt. Route to manual review instead of looping, without spending
  // an agent call or creating a new draft version at all.
  if (revisionCount >= MAX_AUTOMATIC_REVISIONS) {
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "completed",
      attempt, startedAt, finishedAt: new Date().toISOString(),
      output: {
        reason: "revision_limit_reached", revisionCount, maxAutomaticRevisions: MAX_AUTOMATIC_REVISIONS,
        draftId: qaResult.draftId, draftVersion: qaResult.draftVersion, qaResultId: qaResult.id,
      },
    });
    await routeToManualReview(client, { jobId: params.jobId, lockToken });
    return {
      outcome: "revision_limit_reached", jobId: params.jobId,
      draftId: qaResult.draftId, draftVersion: qaResult.draftVersion, revisionCount,
    };
  }

  // The EXACT draft the QA result above reviewed — never "the current highest version" (see this
  // function's opening comment).
  let targetDraft: DraftAtVersion | null;
  try {
    targetDraft = await loadDraftByVersion(client, params.jobId, qaResult.draftVersion);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (!targetDraft) {
    // Should be unreachable — recipe_qa_results.draft_id/draft_version carry a composite FK to
    // recipe_drafts(job_id, id, version) — but handled defensively, same retryable-invariant-
    // violation treatment as every other "should never happen" branch in this stage.
    const error = toSafeErrorPayload(
      `recipe_qa_results named draft_version ${qaResult.draftVersion} but no matching recipe_drafts row exists`,
      { code: "REVISE_QA_RESULT_DRAFT_MISSING", stage: REVISE_STAGE, retryable: true },
    );
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { qaResultId: qaResult.id, draftVersion: qaResult.draftVersion },
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: REVISE_STAGE, error });
    return { outcome: "no_current_draft", jobId: params.jobId, errorCode: error.code };
  }

  const nextVersion = targetDraft.version + 1;
  const nextRevisionCount = revisionCount + 1;

  // Idempotency (mirrors write-stage.ts's own "already_stored" check, qa-stage.ts's
  // "already_reviewed" check): a version=nextVersion draft may already exist from a prior attempt
  // that produced and stored a valid revision, then crashed/timed out BEFORE advancing the job
  // (leaving it still claimable at `revise`). Detect that first and skip the agent call entirely —
  // no duplicate spend, no attempt to insert a second row at the same version.
  let existing: { id: string } | null;
  try {
    existing = await findExistingDraftVersion(client, params.jobId, nextVersion);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (existing) {
    const advanceResult = await advanceStageAndDispatch(
      client,
      {
        jobId: params.jobId, lockToken, fromStage: REVISE_STAGE, toStage: NEXT_STAGE, toStatus: "queued",
        patch: { revision_count: nextRevisionCount },
      },
      { functionName: NEXT_STAGE_FUNCTION_NAME, payload: { batchId: brief.batchId } },
    );
    void advanceResult; // best-effort — see advanceStageAndDispatch's own contract
    return {
      outcome: "already_revised", jobId: params.jobId, draftId: existing.id,
      draftVersion: nextVersion, revisionCount: nextRevisionCount,
    };
  }

  // Step 08A: the mechanical form of revise-rules.ts item 2 ("do not change anything the blocking
  // issues did not flag") — derive an explicit, deterministic allowed-change surface from
  // `qaResult.blockingIssues` BEFORE ever spending an agent call. If any blocking issue's `field`
  // cannot be mapped to a safe, in-scope target, this job is not one a targeted revision can safely
  // act on at all — route straight to manual review, the same resting state the revision-cap branch
  // above uses, without running the Reviser or storing a new draft version (see
  // allowed-changes.ts's own module header for why "route to manual review" rather than "grant a
  // broad mutation scope" or "silently drop the unresolvable issue and proceed").
  const surfaceResult = computeAllowedChangeSurface(qaResult.blockingIssues);
  if (!surfaceResult.ok) {
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "completed",
      attempt, startedAt, finishedAt: new Date().toISOString(),
      output: {
        reason: "unresolvable_blocking_issue",
        unresolvedIssueCode: surfaceResult.unresolvedIssue.code,
        unresolvedIssueField: surfaceResult.unresolvedIssue.field,
        draftId: targetDraft.id, draftVersion: targetDraft.version, qaResultId: qaResult.id,
      },
    });
    await routeToManualReview(client, { jobId: params.jobId, lockToken });
    return {
      outcome: "unresolvable_blocking_issue", jobId: params.jobId,
      draftId: targetDraft.id, draftVersion: targetDraft.version, revisionCount,
    };
  }

  let agentResult;
  try {
    agentResult = await runReviserAgent(agentRunner, {
      jobId: params.jobId,
      brief,
      previousDraft: targetDraft,
      blockingIssues: qaResult.blockingIssues,
      revisionNumber: nextRevisionCount,
    });
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "REVISER_AGENT_CALL_FAILED",
      stage: REVISE_STAGE,
      retryable: e instanceof RecipeAutomationError ? e.retryable : true,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { draftId: targetDraft.id, draftVersion: targetDraft.version },
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: REVISE_STAGE, error });
    return { outcome: "agent_call_failed", jobId: params.jobId, errorCode: error.code };
  }

  // Trusted/server-controlled fields are forced onto the agent's raw output BEFORE parsing — same
  // pattern write-stage.ts/qa-stage.ts use: the agent's own output for jobId/briefId is never
  // trusted, even if it happened to (correctly) restate them per revise-rules.ts item 3.
  const parsed = recipeDraftPayloadSchema.safeParse({
    ...normalizeEmptyUrlFields(agentResult.output as Record<string, unknown>),
    jobId: params.jobId,
    briefId: brief.briefId,
  });

  if (!parsed.success) {
    const error = toSafeErrorPayload(parsed.error, {
      code: "REVISER_OUTPUT_SCHEMA_INVALID",
      stage: REVISE_STAGE,
      retryable: false,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { draftId: targetDraft.id, draftVersion: targetDraft.version },
      provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: REVISE_STAGE, error });
    return { outcome: "invalid_output", jobId: params.jobId, errorCode: error.code };
  }

  const revisedDraft = parsed.data;

  // Step 08A: the mechanical enforcement half of the boundary — diff the candidate against the
  // EXACT previous draft (never "the current highest version"; see this function's opening
  // comment) against the surface computed above. Any out-of-scope change is force-reverted to
  // `previous`'s own value, server-side, rather than rejecting the whole candidate outright — a
  // Reviser call that both fixed the flagged issue AND drifted on an unrelated field (the common
  // real-world failure mode; see allowed-changes.ts's own module header) now still gets the fix it
  // was asked for, with the drift silently corrected instead of discarding the good part too.
  const outOfScopeChanges = findOutOfScopeChanges(targetDraft.payload, revisedDraft, surfaceResult.surface);
  let finalDraft = revisedDraft;
  if (outOfScopeChanges.length > 0) {
    finalDraft = reconcileOutOfScopeChanges(targetDraft.payload, revisedDraft, surfaceResult.surface);

    // Defensive re-check: reconcileOutOfScopeChanges mirrors findOutOfScopeChanges's own allow/deny
    // logic field for field, so this should always come back empty. A non-empty result here means
    // that mirroring itself failed to close every violation (e.g. `previous` — a known-valid stored
    // draft — somehow still reads as out-of-scope against its own surface) — fail the job rather
    // than silently ship a not-fully-reconciled draft. REVISER_OUT_OF_SCOPE_CHANGE stays wired for
    // exactly this fallback even though the normal path no longer reaches it.
    const remainingOutOfScopeChanges = findOutOfScopeChanges(targetDraft.payload, finalDraft, surfaceResult.surface);
    if (remainingOutOfScopeChanges.length > 0) {
      const error = toSafeErrorPayload(
        `revised draft changed fields outside the blocking-issue-derived allowed surface, and forcing them back to the previous draft's values did not fully resolve it: ${remainingOutOfScopeChanges.join(", ")}`,
        { code: "REVISER_OUT_OF_SCOPE_CHANGE", stage: REVISE_STAGE, retryable: true },
      );
      await recordStageRun(client, {
        jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "failed",
        attempt, startedAt, finishedAt: new Date().toISOString(), error,
        output: { draftId: targetDraft.id, draftVersion: targetDraft.version, outOfScopeChanges, remainingOutOfScopeChanges },
        provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
      });
      await failJob(client, { jobId: params.jobId, lockToken, stage: REVISE_STAGE, error });
      return { outcome: "out_of_scope_change", jobId: params.jobId, errorCode: error.code };
    }
  }

  let validation = await validateDraft(client, finalDraft);
  let blockingValidationIssues = validation.issues.filter((issue) => issue.severity === "blocking");

  // Step 08B: an invented, not-in-crop_config crop slug on an otherwise in-scope ingredient change
  // (see crop-slug-guard.ts's own module header for the exact gap and the job — 67567ad5-5ee7-
  // 4dd9-a60d-6546687d811e — that surfaced it) is force-corrected server-side rather than sinking
  // the whole job. Never touches validate_recipe_crop_values' own logic — just reacts to what it
  // already reported, then re-runs the full Postgres validation pass exactly once against the
  // corrected draft, the same "override then re-validate" shape used everywhere else in this stage.
  const unknownCropIssues = blockingValidationIssues.filter((issue) => issue.code === "INGREDIENT_CROP_UNKNOWN");
  let sanitizedCropIndices: number[] = [];
  if (unknownCropIssues.length > 0) {
    const sanitized = sanitizeUnknownCropIngredients(finalDraft, unknownCropIssues);
    finalDraft = sanitized.draft;
    sanitizedCropIndices = sanitized.sanitizedIngredientIndices;
    validation = await validateDraft(client, finalDraft);
    blockingValidationIssues = validation.issues.filter((issue) => issue.severity === "blocking");
  }

  if (!validation.valid || blockingValidationIssues.length > 0) {
    const error = toSafeErrorPayload(
      `revised draft failed Postgres validation: ${blockingValidationIssues.map((i) => i.code).join(", ")}`,
      { code: "REVISER_DRAFT_VALIDATION_FAILED", stage: REVISE_STAGE, retryable: false },
    );
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: {
        draftId: targetDraft.id, draftVersion: targetDraft.version, issues: blockingValidationIssues,
        forcedCropFallbackIndices: sanitizedCropIndices.length > 0 ? sanitizedCropIndices : undefined,
      },
      provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: REVISE_STAGE, error });
    return { outcome: "validation_failed", jobId: params.jobId, errorCode: error.code };
  }

  const insertResult = await client
    .from("recipe_drafts")
    .insert(draftToInsertRow(params.jobId, nextVersion, finalDraft, validation.normalizedIngredients))
    .select("id")
    .single();

  let draftId: string;
  if (insertResult.error) {
    // A unique(job_id, version) collision means a concurrent/duplicate invocation already stored
    // this version between our existence check and this insert — same idempotent-success handling
    // as write-stage.ts's own version-1 insert, one version number later.
    const raced = await findExistingDraftVersion(client, params.jobId, nextVersion);
    if (!raced) {
      throw new RecipeAutomationError({
        code: "REVISE_DRAFT_INSERT_FAILED",
        message: "recipe_drafts insert failed",
        stage: REVISE_STAGE,
        retryable: true,
        details: { pgCode: (insertResult.error as { code?: string }).code },
      });
    }
    draftId = raced.id;
  } else {
    draftId = (insertResult.data as { id: string }).id;
  }

  await recordStageRun(client, {
    jobId: params.jobId, batchId: brief.batchId, stage: REVISE_STAGE, status: "completed",
    attempt, startedAt, finishedAt: new Date().toISOString(),
    output: {
      draftId, version: nextVersion, revisionCount: nextRevisionCount,
      resolvedIssueCodes: qaResult.blockingIssues.map((issue) => issue.code),
      // Present only when the Reviser's own candidate touched something outside the blocking-issue
      // surface and had it force-reverted — see the reconciliation above.
      forcedRevertFields: outOfScopeChanges.length > 0 ? outOfScopeChanges : undefined,
      // Present only when the Reviser invented a not-in-crop_config slug and it was force-corrected
      // to crop:null/freeTextName — see crop-slug-guard.ts and the Step 08B block above.
      forcedCropFallbackIndices: sanitizedCropIndices.length > 0 ? sanitizedCropIndices : undefined,
    },
    provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
  });

  const advanceResult = await advanceStageAndDispatch(
    client,
    {
      jobId: params.jobId, lockToken, fromStage: REVISE_STAGE, toStage: NEXT_STAGE, toStatus: "queued",
      patch: { revision_count: nextRevisionCount },
    },
    { functionName: NEXT_STAGE_FUNCTION_NAME, payload: { batchId: brief.batchId } },
  );
  void advanceResult; // best-effort — see advanceStageAndDispatch's own contract

  return {
    outcome: "revised", jobId: params.jobId, draftId,
    draftVersion: nextVersion, revisionCount: nextRevisionCount,
  };
}
