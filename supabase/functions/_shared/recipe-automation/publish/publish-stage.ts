// F2 Recipe Automation — Step 12: recipe-stage-publish orchestration (the Publish vertical slice).
//
// Implements PROMPT 12: a deterministic, idempotent publish that creates the live
// recipes/recipe_ingredients/recipe_steps rows from an approved draft, inside one Postgres
// transaction, then marks the job completed. Almost every precondition and every write lives in
// ../../migrations/20260826130000_f2s12_recipe_publish_rpc.sql's `publish_recipe_draft` RPC —
// that is the actual transaction boundary "on failure, rollback all partial writes" requires,
// which a sequence of separate PostgREST calls from this file could never provide. This
// orchestrator's own job is narrower than finalize-stage.ts's: claim the job, resolve the one
// input the RPC cannot derive itself (the candidate slug — slugifyTitle is TypeScript-only, no SQL
// equivalent), call the RPC, and translate its result into the same typed-outcome/telemetry/
// failJob shape every other stage-runner in this pipeline uses.
//
// Idempotency: `loadJobSummary` is checked BEFORE any claim is attempted, so a repeated publish
// call for an already-completed job returns the existing recipe without ever touching
// `locked_by` — see context.ts's own doc comment for why a job's `recipe_id` column alone is a
// sufficient, race-free signal for this.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { claimJob, releaseLock } from "../infra/job-lock.ts";
import { failJob } from "../infra/job-state.ts";
import { recordStageRun } from "../infra/telemetry.ts";
import { toSafeErrorPayload } from "../infra/errors.ts";
import { loadCurrentDraft, type CurrentDraft } from "../qa/context.ts";
import { slugifyTitle } from "../writer/slug.ts";
import { enterPublishStage, loadJobSummary, loadPublishedRecipeSummary } from "./context.ts";
import { parsePublishRpcError } from "./rpc-error.ts";

const PUBLISH_STAGE = "publish" as const;

export interface RunPublishStageParams {
  jobId: string;
  workerId?: string;
}

export type RunPublishStageOutcome =
  | "job_not_found"
  | "already_published"
  | "not_claimed"
  | "no_current_draft"
  | "no_approved_qa_result"
  | "safety_checklist_incomplete"
  | "missing_assets"
  | "postgres_validation_failed"
  | "slug_invalid"
  | "slug_already_used"
  | "final_validation_failed"
  | "lock_lost"
  | "unexpected_error"
  | "published";

export interface RunPublishStageResult {
  outcome: RunPublishStageOutcome;
  jobId: string;
  draftId?: string;
  draftVersion?: number;
  recipeId?: string;
  slug?: string;
  claimReason?: string;
  errorCode?: string;
}

interface FailParams {
  jobId: string;
  lockToken: string;
  batchId: string;
  attempt: number;
  startedAt: string;
  outcome: RunPublishStageOutcome;
  code: string;
  message: string;
  retryable: boolean;
  draftId?: string;
  draftVersion?: number;
}

/** Same convention every other stage-runner uses: record the failed stage run, release the job
 * via failJob (retryable-vs-terminal decided the same way as everywhere else), return a typed
 * result. Never throws for an ordinary content/state failure. */
async function fail(client: SupabaseClient, params: FailParams): Promise<RunPublishStageResult> {
  const error = toSafeErrorPayload(params.message, {
    code: params.code,
    stage: PUBLISH_STAGE,
    retryable: params.retryable,
  });
  await recordStageRun(client, {
    jobId: params.jobId,
    batchId: params.batchId,
    stage: PUBLISH_STAGE,
    status: "failed",
    attempt: params.attempt,
    startedAt: params.startedAt,
    finishedAt: new Date().toISOString(),
    error,
    output: { draftId: params.draftId ?? null, draftVersion: params.draftVersion ?? null },
  });
  await failJob(client, {
    jobId: params.jobId,
    lockToken: params.lockToken,
    stage: PUBLISH_STAGE,
    error,
  });
  return {
    outcome: params.outcome,
    jobId: params.jobId,
    draftId: params.draftId,
    draftVersion: params.draftVersion,
    errorCode: error.code,
  };
}

export async function runPublishStage(
  client: SupabaseClient,
  params: RunPublishStageParams,
): Promise<RunPublishStageResult> {
  // Idempotency short-circuit — no lock touched, safe to check before anything else.
  const jobSummary = await loadJobSummary(client, params.jobId);
  if (!jobSummary) {
    return { outcome: "job_not_found", jobId: params.jobId };
  }
  if (jobSummary.stage === "publish" && jobSummary.status === "completed" && jobSummary.recipeId) {
    const recipe = await loadPublishedRecipeSummary(client, jobSummary.recipeId);
    return {
      outcome: "already_published",
      jobId: params.jobId,
      recipeId: jobSummary.recipeId,
      slug: recipe?.slug,
    };
  }

  // One-time awaiting_approval/approved -> publish/queued transition. A no-op on every call after
  // the first for this job — see context.ts's own doc comment.
  await enterPublishStage(client, params.jobId);

  const claim = await claimJob(client, {
    jobId: params.jobId,
    expectedStage: PUBLISH_STAGE,
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
  try {
    currentDraft = await loadCurrentDraft(client, params.jobId);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (!currentDraft) {
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: "no_current_draft",
      code: "PUBLISH_NO_CURRENT_DRAFT",
      message: "no recipe_drafts row found for this job",
      retryable: true,
    });
  }

  const slug = slugifyTitle(currentDraft.payload.title) || params.jobId;

  const { data, error } = await client.rpc("publish_recipe_draft", {
    _job_id: params.jobId,
    _lock_token: lockToken,
    _slug: slug,
  });

  if (error) {
    const parsed = parsePublishRpcError(error);
    return await fail(client, {
      jobId: params.jobId,
      lockToken,
      batchId,
      attempt,
      startedAt,
      outcome: parsed.outcome,
      code: parsed.code,
      message: parsed.message,
      retryable: parsed.retryable,
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
    });
  }

  const result = data as { ok: boolean; recipeId: string; slug: string; alreadyPublished: boolean };

  await recordStageRun(client, {
    jobId: params.jobId,
    batchId,
    recipeId: result.recipeId,
    stage: PUBLISH_STAGE,
    status: "completed",
    attempt,
    startedAt,
    finishedAt: new Date().toISOString(),
    output: {
      draftId: currentDraft.id,
      draftVersion: currentDraft.version,
      recipeId: result.recipeId,
      slug: result.slug,
      alreadyPublished: result.alreadyPublished,
    },
  });

  return {
    outcome: result.alreadyPublished ? "already_published" : "published",
    jobId: params.jobId,
    draftId: currentDraft.id,
    draftVersion: currentDraft.version,
    recipeId: result.recipeId,
    slug: result.slug,
  };
}
