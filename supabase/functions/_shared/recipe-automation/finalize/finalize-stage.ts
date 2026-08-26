// F2 Recipe Automation — Step 10: recipe-stage-finalize orchestration (the Finalize vertical
// slice).
//
// Implements PROMPT 10: a deterministic, non-agent gate. Claims a `finalize`-stage job, re-derives
// every precondition PROMPT 10 lists from first principles instead of trusting upstream stage
// state, and — only if every check passes — atomically moves the job to the `awaiting_approval`
// STAGE (not merely a status: RECIPE_JOB_STAGE_VALUES in ../schemas.ts lists `awaiting_approval`
// as its own pipeline node, distinct from `finalize`, matching RecipeAutomation.md's canonical
// `plan -> write -> qa -> revise? -> image -> finalize -> awaiting_approval -> publish` order).
// This stage NEVER writes to `recipes` and NEVER calls a publish RPC — creating a live recipe row
// is Step 12's job, not this one's.
//
// Unlike every content-agent stage before it (write/qa/revise), finalize never calls an
// AgentRunner — there is nothing here for a model to judge, only Postgres/asset facts to
// re-verify. It is closer in shape to ../image/image-stage.ts (deterministic processing, no LLM
// call) than to qa-stage.ts, minus any image generation of its own.
//
// Check order below mirrors PROMPT 10's own bullet list:
//   1. QA approval references the current draft version
//   2. no blocking issue remains
//   3. safety review requirements for temperature, timing and allergens are present
//   4. Postgres validations still pass
//   5. hero_16x9 and square_1x1 assets exist and are valid, and match the Step 09 contract
//   6. no unresolved stage error remains
// A job only needs to fail its FIRST unmet check to be reported and parked as `retryable`/`failed`
// — later checks are simply never reached that attempt, same short-circuit convention every other
// stage-runner in this pipeline uses.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { claimJob, releaseLock } from "../infra/job-lock.ts";
import { advanceStage, failJob } from "../infra/job-state.ts";
import { recordStageRun } from "../infra/telemetry.ts";
import { toSafeErrorPayload } from "../infra/errors.ts";
import type { RecipeQAIssue } from "../types.ts";
import { loadCurrentDraft, type CurrentDraft } from "../qa/context.ts";
import { validateDraft } from "../writer/validate-draft.ts";
import { slugifyTitle } from "../writer/slug.ts";
import {
  loadFinalizeImageAssets,
  loadLatestQaResult,
  loadLatestUpstreamStageRun,
  type LatestQaResult,
} from "./context.ts";
import { validateAssetContract } from "./asset-contract.ts";
import { validateSafetyReviewPresence } from "./safety-review.ts";

const FINALIZE_STAGE = "finalize" as const;
const AWAITING_APPROVAL_STAGE = "awaiting_approval" as const;

export interface RunFinalizeStageParams {
  jobId: string;
  workerId?: string;
}

export type RunFinalizeStageOutcome =
  | "not_claimed"
  | "no_current_draft"
  | "no_approved_qa_result"
  | "stale_qa_version"
  | "blocking_issues_remain"
  | "safety_review_incomplete"
  | "postgres_validation_failed"
  | "missing_image_assets"
  | "invalid_image_assets"
  | "unresolved_stage_error"
  | "finalized";

export interface RunFinalizeStageResult {
  outcome: RunFinalizeStageOutcome;
  jobId: string;
  draftId?: string;
  draftVersion?: number;
  claimReason?: string;
  errorCode?: string;
  issues?: RecipeQAIssue[];
}

interface FailParams {
  jobId: string;
  lockToken: string;
  batchId: string;
  attempt: number;
  startedAt: string;
  outcome: RunFinalizeStageOutcome;
  code: string;
  message: string;
  retryable: boolean;
  draftId?: string;
  draftVersion?: number;
  issues?: RecipeQAIssue[];
}

/** Records the failed stage run + calls failJob, same convention every other stage-runner in this
 * pipeline uses (see qa-stage.ts/revise-stage.ts/image-stage.ts's own inline failure blocks) —
 * factored out here purely because finalize-stage.ts has more distinct failure branches than any
 * prior stage (PROMPT 10 lists seven independent preconditions), and repeating the same five-line
 * recordStageRun+failJob+return block seven times would obscure the actual check logic above it. */
async function fail(client: SupabaseClient, params: FailParams): Promise<RunFinalizeStageResult> {
  const error = toSafeErrorPayload(params.message, {
    code: params.code,
    stage: FINALIZE_STAGE,
    retryable: params.retryable,
  });
  await recordStageRun(client, {
    jobId: params.jobId,
    batchId: params.batchId,
    stage: FINALIZE_STAGE,
    status: "failed",
    attempt: params.attempt,
    startedAt: params.startedAt,
    finishedAt: new Date().toISOString(),
    error,
    output: {
      draftId: params.draftId ?? null,
      draftVersion: params.draftVersion ?? null,
      ...(params.issues ? { issues: params.issues } : {}),
    },
  });
  await failJob(client, {
    jobId: params.jobId,
    lockToken: params.lockToken,
    stage: FINALIZE_STAGE,
    error,
  });
  return {
    outcome: params.outcome,
    jobId: params.jobId,
    draftId: params.draftId,
    draftVersion: params.draftVersion,
    errorCode: error.code,
    issues: params.issues,
  };
}

/**
 * Runs the finalize stage for one job. Never throws for an ordinary content/state failure — those
 * are reported via `failJob` and reflected in the returned `outcome`; only an unexpected
 * infrastructure error (a DB call that itself failed) throws, the same convention every other
 * stage-runner in this pipeline (write/qa/revise/image) uses.
 */
export async function runFinalizeStage(
  client: SupabaseClient,
  params: RunFinalizeStageParams,
): Promise<RunFinalizeStageResult> {
  const claim = await claimJob(client, {
    jobId: params.jobId,
    expectedStage: FINALIZE_STAGE,
    workerId: params.workerId,
  });
  if (!claim.claimed) {
    return { outcome: "not_claimed", jobId: params.jobId, claimReason: claim.reason };
  }

  const { row, lockToken } = claim.job;
  const batchId = String(row.batch_id);
  const attempt = Number(row.attempt ?? 1);
  const startedAt = new Date().toISOString();

  let currentDraft: CurrentDraft | null;
  let qaResult: LatestQaResult | null;
  try {
    currentDraft = await loadCurrentDraft(client, params.jobId);
    qaResult = currentDraft ? await loadLatestQaResult(client, params.jobId) : null;
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (!currentDraft) {
    // A job reached `finalize` with no recipe_drafts row at all — an upstream invariant violation
    // (the image stage only advances here after loading a draft of its own), not an ordinary
    // content failure. Retryable in case this is a genuine read-visibility race — mirrors
    // qa-stage.ts's own "no_current_draft" handling exactly.
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "no_current_draft",
      code: "FINALIZE_NO_CURRENT_DRAFT",
      message: "no recipe_drafts row found for this job",
      retryable: true,
    });
  }

  // "QA approval references the current draft version" (PROMPT 10) — re-derived independently of
  // whatever routed the job here: the most recent QA result must be an approved, imaging-cleared
  // verdict...
  if (!qaResult || qaResult.decision !== "approved" || !qaResult.approvedForImaging) {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "no_approved_qa_result",
      code: "FINALIZE_NO_APPROVED_QA_RESULT",
      message: "job reached finalize without an approved+approved_for_imaging QA result",
      retryable: false,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
    });
  }

  // ...AND it must name the SAME draft version this job's current draft actually is. A mismatch
  // means either an upstream invariant broke or a newer draft exists that was never QA'd — either
  // way, not something a retry of this deterministic gate can resolve on its own.
  if (qaResult.draftVersion !== currentDraft.version) {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "stale_qa_version",
      code: "FINALIZE_STALE_QA_VERSION",
      message:
        `latest QA result reviewed draft version ${qaResult.draftVersion}, but the current draft is version ${currentDraft.version}`,
      retryable: false,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
    });
  }

  // "no blocking issue remains" — re-checked directly off the QA row rather than trusted via
  // approvedForImaging alone (defense in depth; the live DB CHECK on recipe_qa_results already
  // guarantees these agree, but finalize is the last deterministic gate before a human ever sees
  // the job, so it re-verifies rather than assumes).
  if (qaResult.blockingIssues.length > 0) {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "blocking_issues_remain",
      code: "FINALIZE_BLOCKING_ISSUES_REMAIN",
      message: `QA result still has ${qaResult.blockingIssues.length} blocking issue(s)`,
      retryable: false,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
      issues: qaResult.blockingIssues,
    });
  }

  // "safety review requirements for temperature, timing and allergens are present" — structural
  // completeness, not human sign-off (see safety-review.ts's own header for the distinction).
  const safetyIssues = validateSafetyReviewPresence(qaResult.safetyReview);
  if (safetyIssues.length > 0) {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "safety_review_incomplete",
      code: "FINALIZE_SAFETY_REVIEW_INCOMPLETE",
      message: "QA result's safety review is missing required temperature/timing/allergens findings",
      retryable: false,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
      issues: safetyIssues,
    });
  }

  // "Postgres validations still pass" — re-run structure/crop/slug/coverage against the CURRENT
  // draft, same RPCs write-stage.ts/qa-stage.ts/revise-stage.ts already use (../writer/validate-draft.ts).
  // Nothing after `qa` ever creates a new draft version this job's current one could differ from,
  // so this should always re-pass what QA already saw — re-deriving instead of trusting is this
  // stage's whole purpose.
  const validation = await validateDraft(client, currentDraft.payload);
  const blockingValidationIssues = validation.issues.filter((issue) => issue.severity === "blocking");
  if (!validation.valid || blockingValidationIssues.length > 0) {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "postgres_validation_failed",
      code: "FINALIZE_POSTGRES_VALIDATION_FAILED",
      message: `current draft failed Postgres validation: ${blockingValidationIssues.map((i) => i.code).join(", ")}`,
      retryable: false,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
      issues: blockingValidationIssues,
    });
  }

  // "hero_16x9 and square_1x1 assets exist and are valid" + "filenames, formats, bucket and
  // processing metadata match contract" — loaded and checked together since both bullets act on
  // the same two recipe_assets rows.
  let assets;
  try {
    assets = await loadFinalizeImageAssets(client, params.jobId, currentDraft.id);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (!assets.hero || !assets.square) {
    const missing = [!assets.hero ? "hero" : null, !assets.square ? "square" : null]
      .filter((v): v is string => v !== null);
    // Retryable: under normal operation the image stage never advances a job to `finalize` until
    // BOTH rows are written (../image/image-stage.ts only calls advanceStageAndDispatch once hero
    // AND square exist), so a missing row here is most plausibly a read-visibility race rather
    // than a permanently missing asset — the job's own max_attempts still terminates it if not.
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "missing_image_assets",
      code: "FINALIZE_MISSING_IMAGE_ASSETS",
      message: `missing required recipe_assets row(s): ${missing.join(", ")}`,
      retryable: true,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
    });
  }

  const slug = slugifyTitle(currentDraft.payload.title) || params.jobId;
  const assetIssues = [
    ...validateAssetContract(assets.hero, { kind: "hero", slug }),
    ...validateAssetContract(assets.square, { kind: "square", slug }),
  ];
  if (assetIssues.length > 0) {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "invalid_image_assets",
      code: "FINALIZE_INVALID_IMAGE_ASSETS",
      message: `hero/square assets do not match the Step 09 contract: ${assetIssues.map((i) => i.code).join(", ")}`,
      retryable: false,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
      issues: assetIssues,
    });
  }

  // "no unresolved stage error remains" — see context.ts's loadLatestUpstreamStageRun header for
  // exactly what this checks and why it deliberately excludes finalize's own retry history.
  let latestUpstreamRun;
  try {
    latestUpstreamRun = await loadLatestUpstreamStageRun(client, params.jobId);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }
  if (latestUpstreamRun?.status === "failed") {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "unresolved_stage_error",
      code: "FINALIZE_UNRESOLVED_STAGE_ERROR",
      message: `most recent recorded stage attempt (${latestUpstreamRun.stage}) for this job ended in failure`,
      retryable: false,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
    });
  }

  // Every check passed. Record success FIRST, then atomically move the job to the
  // `awaiting_approval` stage — same ordering qa-stage.ts's happy path uses (store the durable
  // result, then route). No dispatch: there is no next-stage Edge Function to nudge for a human
  // decision — Step 11's admin surface polls/lists `awaiting_approval` jobs directly, it is not
  // itself dispatched to (same rationale qa-stage.ts's manual_review_required path and
  // revise-stage.ts's routeToManualReview use for their own human-queue parking states).
  await recordStageRun(client, {
    jobId: params.jobId,
    batchId,
    stage: FINALIZE_STAGE,
    status: "completed",
    attempt,
    startedAt,
    finishedAt: new Date().toISOString(),
    output: { draftId: currentDraft.id, draftVersion: currentDraft.version, qaResultId: qaResult.id },
  });

  const advanceResult = await advanceStage(client, {
    jobId: params.jobId,
    lockToken,
    fromStage: FINALIZE_STAGE,
    toStage: AWAITING_APPROVAL_STAGE,
    toStatus: "awaiting_approval",
  });
  void advanceResult; // best-effort CAS — a lost race here is a safe no-op, same as every advanceStage call in this pipeline

  return {
    outcome: "finalized",
    jobId: params.jobId,
    draftId: currentDraft.id,
    draftVersion: currentDraft.version,
  };
}
