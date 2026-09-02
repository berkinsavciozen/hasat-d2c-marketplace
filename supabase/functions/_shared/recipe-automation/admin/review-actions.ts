// F2 Recipe Automation — Step 11: admin review-surface state transitions.
//
// Implements PROMPT 11's four required actions (approve / reject / request revision / retry
// failed stage) as atomic compare-and-set updates on `recipe_generation_jobs`, mirroring the same
// "single UPDATE with every precondition in its WHERE clause" discipline `infra/job-lock.ts` and
// `infra/job-state.ts` already use for the automated pipeline — of two concurrent admin actions
// against the same job, exactly one UPDATE matches and returns a row.
//
// Deliberately NOT built on `infra/job-lock.ts`'s `claimJob()`: that helper only ever claims a job
// FROM a runnable status (`queued`/`retryable`, plus stale-lock `running` recovery) at a given
// stage, for a stage-RUNNER to do automated work. An admin action targets a job sitting at
// `awaiting_approval` (unlocked — `finalize-stage.ts`'s own advanceStage call clears
// locked_by/locked_at/lock_expires_at when it parks a job there) or `failed` (also unlocked once
// `failJob()` finishes) — a different precondition shape entirely, so this module has its own
// small CAS helper (`transitionJob`) rather than forcing an ill-fitting reuse.
//
// This module NEVER writes to `recipe_drafts` / `recipe_qa_results` / `recipe_assets` — only
// `recipe_generation_jobs` (the state machine) and this pipeline's own `recipe_admin_reviews`
// audit table. Requeuing a job into the AUTOMATED pipeline (request_revision -> revise/queued,
// retry_stage -> <current stage>/queued) does NOT dispatch here — those stages are all covered by
// `infra/sweep.ts`'s periodic reconciliation (every 5 minutes) even if this module never nudges
// them, matching the F2-S11 task brief's original "do not invoke live Edge Functions" constraint.
//
// `approveJob()` is the one exception, added to close a real production gap (job
// 451234c7-cdc0-4322-b201-9b4d62fe4cc9 approved 2026-09-02, never published): unlike every other
// action here, approve moves a job to `status='approved'` while `stage` stays `awaiting_approval`
// — and `sweep.ts` deliberately treats `awaiting_approval` as never a sweep candidate (see its own
// header), so an approved-but-unpublished job had NO path to ever being redispatched, automatic or
// periodic. `approveJob()` below fires the same best-effort `dispatchNextStage` call every other
// stage-runner's successful advance already fires (see stage-dispatch.ts's own header) right after
// its transition + audit insert succeed, targeting `recipe-stage-publish` — which itself performs
// the one-time `awaiting_approval`+`approved` -> `publish`+`queued` transition on receipt (see
// `publish/context.ts`'s `enterPublishStage`). `sweep.ts` also now redispatches any job still stuck
// at `awaiting_approval`/`approved` as a fallback in case this best-effort call is dropped
// (network blip, cold start) — the same "immediate nudge + periodic reconciliation net" shape this
// codebase already uses everywhere else.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import { dispatchNextStage } from "../infra/stage-dispatch.ts";
import type { RecipeJobStage, RecipeJobStatus } from "../types.ts";
import { approvalChecklistSchema, checklistToRow, partialChecklistSchema, type PartialChecklist } from "./checklist.ts";

/** Target of the best-effort post-approve dispatch — see this module's header. Matches
 * `infra/sweep.ts`'s own `STAGE_FUNCTION_NAMES.publish` value exactly. */
const PUBLISH_FUNCTION_NAME = "recipe-stage-publish";

/** Mirrors `recipe_generation_jobs.revision_count`'s own CHECK (0..2) — see revise-stage.ts's own
 * MAX_AUTOMATIC_REVISIONS for the automated-loop half of this same cap. An admin-requested
 * revision counts against the identical budget: both paths produce one more `recipe_drafts`
 * version via the same `revise` stage. */
const MAX_REVISIONS = 2;

export interface JobRow {
  id: string;
  batch_id: string;
  stage: RecipeJobStage;
  status: RecipeJobStatus;
  revision_count: number;
}

export type ReviewActionFailureReason =
  | "not_found"
  | "wrong_state"
  | "revision_limit_reached"
  | "checklist_incomplete";

export type ReviewActionResult =
  | { ok: true; job: JobRow; reviewId: string }
  | { ok: false; reason: ReviewActionFailureReason; job?: JobRow };

interface TransitionParams {
  jobId: string;
  fromStage: RecipeJobStage;
  fromStatuses: readonly RecipeJobStatus[];
  toStage: RecipeJobStage;
  toStatus: RecipeJobStatus;
  /** Extra columns beyond stage/status (e.g. revision_count increment, last_error reset). */
  patch?: Record<string, unknown>;
}

/** The one CAS primitive every action below builds on: an UPDATE whose WHERE clause encodes the
 * exact precondition, so a lost race (two admins, or a double-click) matches zero rows on the
 * loser instead of double-applying a transition. */
async function transitionJob(client: SupabaseClient, params: TransitionParams): Promise<JobRow | null> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .update({ stage: params.toStage, status: params.toStatus, ...(params.patch ?? {}) })
    .eq("id", params.jobId)
    .eq("stage", params.fromStage)
    .in("status", params.fromStatuses)
    .select("id, batch_id, stage, status, revision_count")
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_REVIEW_TRANSITION_FAILED",
      message: "admin review job transition update failed",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as JobRow | null) ?? null;
}

async function loadJobState(client: SupabaseClient, jobId: string): Promise<JobRow | null> {
  const { data, error } = await client
    .from("recipe_generation_jobs")
    .select("id, batch_id, stage, status, revision_count")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_REVIEW_JOB_LOOKUP_FAILED",
      message: "failed to load recipe_generation_jobs row for admin review",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as JobRow | null) ?? null;
}

/** Records one `recipe_admin_reviews` audit row. This insert is where the mechanical
 * "approval impossible without a complete checklist" gate actually lives at the DB layer (see
 * the migration's own CHECK constraint) — `approveJob()` below relies on this throwing for an
 * incomplete checklist even if its own Zod pre-check (belt) were somehow bypassed (suspenders). */
async function recordReview(
  client: SupabaseClient,
  params: {
    jobId: string;
    batchId: string;
    draftId: string | null;
    draftVersion: number | null;
    action: "approve" | "reject" | "request_revision" | "retry_stage";
    checklist: PartialChecklist;
    fromStage: RecipeJobStage;
    fromStatus: RecipeJobStatus;
    toStage: RecipeJobStage;
    toStatus: RecipeJobStatus;
    notes: string | null;
    adminActor: string | null;
  },
): Promise<string> {
  const { data, error } = await client
    .from("recipe_admin_reviews")
    .insert({
      job_id: params.jobId,
      batch_id: params.batchId,
      draft_id: params.draftId,
      draft_version: params.draftVersion,
      action: params.action,
      ...checklistToRow(params.checklist),
      from_stage: params.fromStage,
      from_status: params.fromStatus,
      to_stage: params.toStage,
      to_status: params.toStatus,
      notes: params.notes,
      admin_actor: params.adminActor,
    })
    .select("id")
    .single();

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_REVIEW_AUDIT_INSERT_FAILED",
      message: "failed to insert recipe_admin_reviews row",
      retryable: false,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return String((data as { id: string }).id);
}

export interface ApproveJobParams {
  jobId: string;
  draftId: string;
  draftVersion: number;
  checklist: unknown;
  notes?: string | null;
  adminActor?: string | null;
}

/**
 * Approves a job at `awaiting_approval`. The FIVE-item human checklist (PROMPT 11) must be
 * complete — validated here with Zod (fast, readable failure) AND enforced again by
 * `recipe_admin_reviews`'s own CHECK constraint on the insert below (the real backstop; see that
 * migration's header for why the mechanical gate lives there and not on
 * `recipe_qa_results.safety_approved`). Moves the job to `status='approved'` — `stage` stays
 * `awaiting_approval` (Step 12/publish is the next stage transition, not this one).
 */
export async function approveJob(client: SupabaseClient, params: ApproveJobParams): Promise<ReviewActionResult> {
  const parsedChecklist = approvalChecklistSchema.safeParse(params.checklist);
  if (!parsedChecklist.success) {
    const job = await loadJobState(client, params.jobId);
    return { ok: false, reason: "checklist_incomplete", job: job ?? undefined };
  }

  const fromStage: RecipeJobStage = "awaiting_approval";
  const fromStatus: RecipeJobStatus = "awaiting_approval";
  const toStatus: RecipeJobStatus = "approved";

  const updated = await transitionJob(client, {
    jobId: params.jobId,
    fromStage,
    fromStatuses: [fromStatus],
    toStage: fromStage,
    toStatus,
  });
  if (!updated) {
    const job = await loadJobState(client, params.jobId);
    return { ok: false, reason: job ? "wrong_state" : "not_found", job: job ?? undefined };
  }

  const reviewId = await recordReview(client, {
    jobId: params.jobId,
    batchId: updated.batch_id,
    draftId: params.draftId,
    draftVersion: params.draftVersion,
    action: "approve",
    checklist: parsedChecklist.data,
    fromStage,
    fromStatus,
    toStage: fromStage,
    toStatus,
    notes: params.notes ?? null,
    adminActor: params.adminActor ?? null,
  });

  // Best-effort — awaited so the call actually fires before this Edge Function invocation ends,
  // but its outcome never affects the approve response (dispatchNextStage never throws); see this
  // module's header and stage-dispatch.ts's own contract. `sweep.ts` is the fallback if this is
  // ever dropped.
  const dispatchResult = await dispatchNextStage(client, {
    jobId: updated.id,
    functionName: PUBLISH_FUNCTION_NAME,
    payload: { batchId: updated.batch_id },
  });
  void dispatchResult;

  return { ok: true, job: updated, reviewId };
}

export interface RejectJobParams {
  jobId: string;
  draftId?: string | null;
  draftVersion?: number | null;
  checklist?: unknown;
  notes?: string | null;
  adminActor?: string | null;
}

/** Rejects a job at `awaiting_approval` — `status='rejected'`, stage unchanged. Non-terminal by
 * design (`recipe_generation_jobs`'s own CHECK deliberately excludes 'rejected' from its terminal
 * `completed_at` set) — parks it for a human/ops decision on what happens next, distinct from
 * `requestRevisionJob` below, which immediately re-queues the job into the automated revise loop. */
export async function rejectJob(client: SupabaseClient, params: RejectJobParams): Promise<ReviewActionResult> {
  const checklist = partialChecklistSchema.parse(params.checklist ?? {});
  const fromStage: RecipeJobStage = "awaiting_approval";
  const fromStatus: RecipeJobStatus = "awaiting_approval";
  const toStatus: RecipeJobStatus = "rejected";

  const updated = await transitionJob(client, {
    jobId: params.jobId,
    fromStage,
    fromStatuses: [fromStatus],
    toStage: fromStage,
    toStatus,
  });
  if (!updated) {
    const job = await loadJobState(client, params.jobId);
    return { ok: false, reason: job ? "wrong_state" : "not_found", job: job ?? undefined };
  }

  const reviewId = await recordReview(client, {
    jobId: params.jobId,
    batchId: updated.batch_id,
    draftId: params.draftId ?? null,
    draftVersion: params.draftVersion ?? null,
    action: "reject",
    checklist,
    fromStage,
    fromStatus,
    toStage: fromStage,
    toStatus,
    notes: params.notes ?? null,
    adminActor: params.adminActor ?? null,
  });

  return { ok: true, job: updated, reviewId };
}

export interface RequestRevisionJobParams {
  jobId: string;
  draftId?: string | null;
  draftVersion?: number | null;
  checklist?: unknown;
  notes?: string | null;
  adminActor?: string | null;
}

/**
 * Sends a job at `awaiting_approval` back into the automated revise loop: `stage='revise'`,
 * `status='queued'`, `revision_count` incremented by the SAME CAS update (never a separate
 * read-then-write — same discipline `revise-stage.ts`'s own `advanceStageAndDispatch` patch
 * uses). Refuses with `revision_limit_reached` before even attempting the UPDATE once the job is
 * already at the two-revision cap — an admin should reject or approve-with-manual-fix instead of
 * looping a job the automated pipeline itself would never loop again.
 */
export async function requestRevisionJob(
  client: SupabaseClient,
  params: RequestRevisionJobParams,
): Promise<ReviewActionResult> {
  const checklist = partialChecklistSchema.parse(params.checklist ?? {});
  const fromStage: RecipeJobStage = "awaiting_approval";
  const fromStatus: RecipeJobStatus = "awaiting_approval";
  const toStage: RecipeJobStage = "revise";
  const toStatus: RecipeJobStatus = "queued";

  const current = await loadJobState(client, params.jobId);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.stage !== fromStage || current.status !== fromStatus) {
    return { ok: false, reason: "wrong_state", job: current };
  }
  if (current.revision_count >= MAX_REVISIONS) {
    return { ok: false, reason: "revision_limit_reached", job: current };
  }

  const updated = await transitionJob(client, {
    jobId: params.jobId,
    fromStage,
    fromStatuses: [fromStatus],
    toStage,
    toStatus,
    patch: { revision_count: current.revision_count + 1 },
  });
  if (!updated) {
    const job = await loadJobState(client, params.jobId);
    // Lost a race (or the cap check above went stale) — report the more specific reason.
    if (job && job.revision_count >= MAX_REVISIONS) return { ok: false, reason: "revision_limit_reached", job };
    return { ok: false, reason: job ? "wrong_state" : "not_found", job: job ?? undefined };
  }

  const reviewId = await recordReview(client, {
    jobId: params.jobId,
    batchId: updated.batch_id,
    draftId: params.draftId ?? null,
    draftVersion: params.draftVersion ?? null,
    action: "request_revision",
    checklist,
    fromStage,
    fromStatus,
    toStage,
    toStatus,
    notes: params.notes ?? null,
    adminActor: params.adminActor ?? null,
  });

  return { ok: true, job: updated, reviewId };
}

export interface RetryStageParams {
  jobId: string;
  draftId?: string | null;
  draftVersion?: number | null;
  notes?: string | null;
  adminActor?: string | null;
}

/**
 * Re-queues a job stuck at `status='failed'` for another attempt AT ITS CURRENT STAGE —
 * `status='queued'`, `attempt` reset to 1 (a fresh budget, not appended to the exhausted one),
 * `last_error`/`next_attempt_at` cleared. Stage is read from the job's own current row rather than
 * asserted by the caller (unlike the other three actions, which all only apply at
 * `awaiting_approval`) — a failed job could be stuck at ANY of write/qa/revise/image/finalize.
 * Never invokes the corresponding `recipe-stage-*` function itself — see this module's header.
 */
export async function retryStage(client: SupabaseClient, params: RetryStageParams): Promise<ReviewActionResult> {
  const current = await loadJobState(client, params.jobId);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status !== "failed") return { ok: false, reason: "wrong_state", job: current };

  const toStatus: RecipeJobStatus = "queued";
  const updated = await transitionJob(client, {
    jobId: params.jobId,
    fromStage: current.stage,
    fromStatuses: ["failed"],
    toStage: current.stage,
    toStatus,
    // `failed` is a TERMINAL status (job-state.ts's failJob/advanceStage both set completed_at
    // when landing a job on it) — recipe_generation_jobs' own CHECK
    // (`completed_at is null or status = any(array['completed','failed','cancelled'])`) means
    // moving to the non-terminal `queued` WITHOUT also clearing completed_at is a constraint
    // violation, not just stale data. Verified against a real Postgres database (this repo's
    // f2_recipe_automation SQL test suite reproduces exactly this failure without this line).
    patch: { attempt: 1, last_error: null, next_attempt_at: null, completed_at: null },
  });
  if (!updated) {
    const job = await loadJobState(client, params.jobId);
    return { ok: false, reason: job ? "wrong_state" : "not_found", job: job ?? undefined };
  }

  const reviewId = await recordReview(client, {
    jobId: params.jobId,
    batchId: updated.batch_id,
    draftId: params.draftId ?? null,
    draftVersion: params.draftVersion ?? null,
    action: "retry_stage",
    checklist: partialChecklistSchema.parse({}),
    fromStage: current.stage,
    fromStatus: "failed",
    toStage: current.stage,
    toStatus,
    notes: params.notes ?? null,
    adminActor: params.adminActor ?? null,
  });

  return { ok: true, job: updated, reviewId };
}
