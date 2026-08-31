// F2 Recipe Automation — Step 13: admin batch-plan review state transitions.
//
// PROMPT 13's admin-review requirement: "Admin, job fan-out'tan ÖNCE planı görüntüleyip düzenleyip
// onaylayabilmeli" (an admin must be able to view/edit/approve the plan BEFORE job fan-out). This
// module is that surface's logic layer — list/detail reads, per-brief edit/exclude, and the
// approve/reject/dispatch actions — mirroring the same CAS-update discipline
// `review-actions.ts` (Step 11) already uses for job-level review, applied here to
// `recipe_generation_batches`/`recipe_plan_briefs` instead.
//
// This module NEVER writes to `recipes`/`recipe_drafts`/`recipe_qa_results`/`recipe_assets` and
// NEVER creates a `recipe_generation_jobs` row directly — job creation happens ONLY inside the
// transactional `fan_out_recipe_plan_batch` RPC (f2s13 migration), called from `approvePlanBatch`
// below strictly AFTER the batch's `review_status` has actually become `'approved'`. Dispatching
// `recipe-stage-write` for each newly-fanned-out job reuses `../infra/stage-dispatch.ts`'s existing
// `dispatchNextStage` (best-effort, never the source of truth for job state — see that module's own
// header) with a small concurrency cap (PROMPT 13: "write'ı kontrollü concurrency ile dispatch et"),
// never all-at-once.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import { dispatchNextStage } from "../infra/stage-dispatch.ts";
import type { RecipeDifficulty, RecipeMealType, RecipeTargetAudience } from "../types.ts";

const WRITE_STAGE_FUNCTION_NAME = "recipe-stage-write";
/** PROMPT 13: "kontrollü concurrency" — a small, fixed fan-out dispatch cap. Not configurable via
 * request input (an admin action must not be able to turn this into an unbounded burst). */
const DISPATCH_CONCURRENCY = 5;

export interface PlanBatchListItem {
  id: string;
  targetCount: number;
  focusCrops: string[] | null;
  dietFocus: string[];
  locale: string;
  notes: string | null;
  plannerModel: string | null;
  plannedAt: string | null;
  reviewStatus: "pending_review" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  fannedOutAt: string | null;
  briefCount: number;
  excludedCount: number;
  createdAt: string;
}

const BATCH_LIST_COLUMNS =
  "id, target_count, focus_crops, diet_focus, locale, notes, planner_model, planned_at, " +
  "review_status, reviewed_by, reviewed_at, fanned_out_at, created_at";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListPlanBatchesParams {
  reviewStatus?: PlanBatchListItem["reviewStatus"];
  limit?: number;
  offset?: number;
}

export async function listPlanBatches(
  client: SupabaseClient,
  params: ListPlanBatchesParams = {},
): Promise<{ batches: PlanBatchListItem[]; total: number }> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = client
    .from("recipe_generation_batches")
    .select(BATCH_LIST_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (params.reviewStatus) query = query.eq("review_status", params.reviewStatus);

  const { data, error, count } = await query;
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BATCH_LIST_QUERY_FAILED",
      message: "failed to list recipe_generation_batches",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  const batchIds = rows.map((r) => String(r.id));
  const briefCounts = await loadBriefCountsPerBatch(client, batchIds);

  const batches: PlanBatchListItem[] = rows.map((row) => {
    const counts = briefCounts.get(String(row.id)) ?? { total: 0, excluded: 0 };
    return {
      id: String(row.id),
      targetCount: Number(row.target_count),
      focusCrops: (row.focus_crops as string[] | null) ?? null,
      dietFocus: (row.diet_focus as string[] | null) ?? [],
      locale: String(row.locale),
      notes: (row.notes as string | null) ?? null,
      plannerModel: (row.planner_model as string | null) ?? null,
      plannedAt: (row.planned_at as string | null) ?? null,
      reviewStatus: row.review_status as PlanBatchListItem["reviewStatus"],
      reviewedBy: (row.reviewed_by as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      fannedOutAt: (row.fanned_out_at as string | null) ?? null,
      briefCount: counts.total,
      excludedCount: counts.excluded,
      createdAt: String(row.created_at),
    };
  });

  return { batches, total: count ?? batches.length };
}

async function loadBriefCountsPerBatch(
  client: SupabaseClient,
  batchIds: string[],
): Promise<Map<string, { total: number; excluded: number }>> {
  const result = new Map<string, { total: number; excluded: number }>();
  if (batchIds.length === 0) return result;

  const { data, error } = await client
    .from("recipe_plan_briefs")
    .select("batch_id, excluded")
    .in("batch_id", batchIds);
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BRIEF_COUNT_QUERY_FAILED",
      message: "failed to load recipe_plan_briefs counts",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  for (const row of (data as Array<{ batch_id: string; excluded: boolean }>) ?? []) {
    const entry = result.get(row.batch_id) ?? { total: 0, excluded: 0 };
    entry.total += 1;
    if (row.excluded) entry.excluded += 1;
    result.set(row.batch_id, entry);
  }
  return result;
}

export interface PlanBriefItem {
  id: string;
  briefId: string;
  workingTitle: string;
  focusCrop: string;
  angle: string | null;
  targetDifficulty: RecipeDifficulty | null;
  dietTags: string[];
  locale: string;
  audience: RecipeTargetAudience;
  mealType: RecipeMealType | null;
  selectionReason: string;
  excluded: boolean;
  exclusionReason: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

const BRIEF_COLUMNS =
  "id, brief_id, working_title, focus_crop, angle, target_difficulty, diet_tags, locale, audience, " +
  "meal_type, selection_reason, excluded, exclusion_reason, job_id, created_at, updated_at";

function toBriefItem(row: Record<string, unknown>): PlanBriefItem {
  return {
    id: String(row.id),
    briefId: String(row.brief_id),
    workingTitle: String(row.working_title),
    focusCrop: String(row.focus_crop),
    angle: (row.angle as string | null) ?? null,
    targetDifficulty: (row.target_difficulty as RecipeDifficulty | null) ?? null,
    dietTags: Array.isArray(row.diet_tags) ? (row.diet_tags as string[]) : [],
    locale: String(row.locale),
    audience: row.audience as RecipeTargetAudience,
    mealType: (row.meal_type as RecipeMealType | null) ?? null,
    selectionReason: String(row.selection_reason),
    excluded: Boolean(row.excluded),
    exclusionReason: (row.exclusion_reason as string | null) ?? null,
    jobId: (row.job_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface PlanBatchDetail extends PlanBatchListItem {
  diversityReport: unknown;
  planError: unknown;
  briefs: PlanBriefItem[];
}

export async function getPlanBatchDetail(client: SupabaseClient, batchId: string): Promise<PlanBatchDetail | null> {
  const { data: batchRow, error: batchError } = await client
    .from("recipe_generation_batches")
    .select(`${BATCH_LIST_COLUMNS}, diversity_report, plan_error`)
    .eq("id", batchId)
    .maybeSingle();
  if (batchError) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BATCH_DETAIL_QUERY_FAILED",
      message: "failed to load recipe_generation_batches row",
      retryable: true,
      details: { pgCode: (batchError as { code?: string }).code },
    });
  }
  if (!batchRow) return null;

  const { data: briefRows, error: briefError } = await client
    .from("recipe_plan_briefs")
    .select(BRIEF_COLUMNS)
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (briefError) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BRIEF_LIST_QUERY_FAILED",
      message: "failed to load recipe_plan_briefs rows",
      retryable: true,
      details: { pgCode: (briefError as { code?: string }).code },
    });
  }

  const row = batchRow as Record<string, unknown>;
  const briefs = ((briefRows as unknown as Array<Record<string, unknown>>) ?? []).map(toBriefItem);
  return {
    id: String(row.id),
    targetCount: Number(row.target_count),
    focusCrops: (row.focus_crops as string[] | null) ?? null,
    dietFocus: (row.diet_focus as string[] | null) ?? [],
    locale: String(row.locale),
    notes: (row.notes as string | null) ?? null,
    plannerModel: (row.planner_model as string | null) ?? null,
    plannedAt: (row.planned_at as string | null) ?? null,
    reviewStatus: row.review_status as PlanBatchListItem["reviewStatus"],
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    fannedOutAt: (row.fanned_out_at as string | null) ?? null,
    briefCount: briefs.length,
    excludedCount: briefs.filter((b) => b.excluded).length,
    createdAt: String(row.created_at),
    diversityReport: row.diversity_report ?? null,
    planError: row.plan_error ?? null,
    briefs,
  };
}

export type PlanReviewFailureReason = "not_found" | "wrong_state" | "already_promoted" | "diversity_invalid";

export type PlanBriefMutationResult =
  | { ok: true; brief: PlanBriefItem }
  | { ok: false; reason: PlanReviewFailureReason };

/** Editable fields an admin may change on a brief BEFORE it is promoted into a job. Never
 * `briefId`/`batchId` (stable identity) and never `jobId` (only `fan_out_recipe_plan_batch` sets
 * that). */
export interface EditPlanBriefPatch {
  workingTitle?: string;
  focusCrop?: string;
  angle?: string | null;
  targetDifficulty?: RecipeDifficulty | null;
  dietTags?: string[];
  locale?: string;
  audience?: RecipeTargetAudience;
  mealType?: RecipeMealType | null;
  selectionReason?: string;
}

/** Two independent queries merged in JS, never a PostgREST embedded-resource join — same
 * "Promise.all of independent view queries" shape ../admin/list-jobs.ts's own header documents for
 * this pipeline's tables, which were never designed around embedded-resource selects. */
async function loadEditableBrief(
  client: SupabaseClient,
  briefId: string,
): Promise<{ id: string; batchId: string; jobId: string | null; reviewStatus: PlanBatchListItem["reviewStatus"] } | null> {
  const { data: briefRow, error: briefError } = await client
    .from("recipe_plan_briefs")
    .select("id, batch_id, job_id")
    .eq("id", briefId)
    .maybeSingle();
  if (briefError) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BRIEF_LOOKUP_FAILED",
      message: "failed to load recipe_plan_briefs row for edit",
      retryable: true,
      details: { pgCode: (briefError as { code?: string }).code },
    });
  }
  if (!briefRow) return null;
  const brief = briefRow as { id: string; batch_id: string; job_id: string | null };

  const { data: batchRow, error: batchError } = await client
    .from("recipe_generation_batches")
    .select("review_status")
    .eq("id", brief.batch_id)
    .maybeSingle();
  if (batchError) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BRIEF_BATCH_LOOKUP_FAILED",
      message: "failed to load the brief's parent recipe_generation_batches row",
      retryable: true,
      details: { pgCode: (batchError as { code?: string }).code },
    });
  }
  const reviewStatus = (batchRow as { review_status: PlanBatchListItem["reviewStatus"] } | null)?.review_status ??
    "pending_review";

  return { id: brief.id, batchId: brief.batch_id, jobId: brief.job_id, reviewStatus };
}

/** Edits one brief's content — refused once its batch has left `pending_review`, or once the brief
 * has already been promoted into a job (`job_id` set) — either means it is no longer "the plan",
 * it is live pipeline state. */
export async function editPlanBrief(
  client: SupabaseClient,
  params: { briefId: string; patch: EditPlanBriefPatch },
): Promise<PlanBriefMutationResult> {
  const current = await loadEditableBrief(client, params.briefId);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.jobId) return { ok: false, reason: "already_promoted" };
  if (current.reviewStatus !== "pending_review") return { ok: false, reason: "wrong_state" };

  const patch: Record<string, unknown> = {};
  if (params.patch.workingTitle !== undefined) patch.working_title = params.patch.workingTitle;
  if (params.patch.focusCrop !== undefined) patch.focus_crop = params.patch.focusCrop;
  if (params.patch.angle !== undefined) patch.angle = params.patch.angle;
  if (params.patch.targetDifficulty !== undefined) patch.target_difficulty = params.patch.targetDifficulty;
  if (params.patch.dietTags !== undefined) patch.diet_tags = params.patch.dietTags;
  if (params.patch.locale !== undefined) patch.locale = params.patch.locale;
  if (params.patch.audience !== undefined) patch.audience = params.patch.audience;
  if (params.patch.mealType !== undefined) patch.meal_type = params.patch.mealType;
  if (params.patch.selectionReason !== undefined) patch.selection_reason = params.patch.selectionReason;

  const { data, error } = await client
    .from("recipe_plan_briefs")
    .update(patch)
    .eq("id", params.briefId)
    .is("job_id", null)
    .select(BRIEF_COLUMNS)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BRIEF_EDIT_FAILED",
      message: "recipe_plan_briefs edit update failed",
      retryable: false,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (!data) return { ok: false, reason: "already_promoted" };
  return { ok: true, brief: toBriefItem(data as unknown as Record<string, unknown>) };
}

/** Toggles a brief's `excluded` flag — same "not yet promoted, batch still pending_review"
 * refusal as `editPlanBrief`. Excluding a brief takes it out of `fan_out_recipe_plan_batch`'s scope
 * entirely; it is never deleted, so the admin plan-review record stays complete. */
export async function setPlanBriefExclusion(
  client: SupabaseClient,
  params: { briefId: string; excluded: boolean; exclusionReason?: string | null },
): Promise<PlanBriefMutationResult> {
  const current = await loadEditableBrief(client, params.briefId);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.jobId) return { ok: false, reason: "already_promoted" };
  if (current.reviewStatus !== "pending_review") return { ok: false, reason: "wrong_state" };

  const { data, error } = await client
    .from("recipe_plan_briefs")
    .update({
      excluded: params.excluded,
      exclusion_reason: params.excluded ? (params.exclusionReason ?? null) : null,
    })
    .eq("id", params.briefId)
    .is("job_id", null)
    .select(BRIEF_COLUMNS)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BRIEF_EXCLUSION_FAILED",
      message: "recipe_plan_briefs exclusion update failed",
      retryable: false,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (!data) return { ok: false, reason: "already_promoted" };
  return { ok: true, brief: toBriefItem(data as unknown as Record<string, unknown>) };
}

export interface RejectPlanBatchResult {
  ok: boolean;
  reason?: PlanReviewFailureReason;
}

export async function rejectPlanBatch(
  client: SupabaseClient,
  params: { batchId: string; adminActor?: string | null },
): Promise<RejectPlanBatchResult> {
  const { data, error } = await client
    .from("recipe_generation_batches")
    .update({
      review_status: "rejected",
      reviewed_by: params.adminActor ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.batchId)
    .eq("review_status", "pending_review")
    .select("id")
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BATCH_REJECT_FAILED",
      message: "recipe_generation_batches reject update failed",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  if (data) return { ok: true };
  const { data: existing } = await client.from("recipe_generation_batches").select("id").eq("id", params.batchId).maybeSingle();
  return { ok: false, reason: existing ? "wrong_state" : "not_found" };
}

/** Runs a bounded number of async jobs concurrently — PROMPT 13's "write'ı kontrollü concurrency
 * ile dispatch et". Never rejects: each `worker` call's own failure is caught by the caller
 * (`dispatchNextStage` itself never throws — see ../infra/stage-dispatch.ts). */
async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    const index = nextIndex++;
    if (index >= items.length) return;
    results[index] = await worker(items[index]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}

export interface FannedOutJobSummary {
  briefId: string;
  jobId: string;
  workingTitle: string;
  focusCrop: string;
  created: boolean;
  dispatched: boolean;
}

export type ApprovePlanBatchResult =
  | { ok: true; batchId: string; jobs: FannedOutJobSummary[] }
  | { ok: false; reason: PlanReviewFailureReason; issues?: unknown[] };

/**
 * Approves a batch's plan and immediately fans it out: re-validates diversity over the CURRENT
 * (possibly admin-edited) set of non-excluded briefs (an edit made after planning could reintroduce
 * a violation — e.g. editing two briefs to the same focusCrop — so this is re-checked here, not
 * just trusted from plan-stage.ts's own earlier pass), moves `review_status` to `'approved'`
 * (a no-op CAS if already approved — see below), then calls `fan_out_recipe_plan_batch` (creates one
 * idempotent job per non-excluded brief) and dispatches `recipe-stage-write` for each with bounded
 * concurrency. Safe to call again for an already-approved batch: the CAS update simply matches zero
 * rows and is skipped, while fan-out/dispatch still runs — this is the batch's own retry path after
 * a partial dispatch failure (PROMPT 13: idempotent job creation).
 */
export async function approvePlanBatch(
  client: SupabaseClient,
  params: { batchId: string; adminActor?: string | null },
): Promise<ApprovePlanBatchResult> {
  const { data: batchRow, error: batchError } = await client
    .from("recipe_generation_batches")
    .select("id, review_status")
    .eq("id", params.batchId)
    .maybeSingle();
  if (batchError) {
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BATCH_APPROVE_LOOKUP_FAILED",
      message: "failed to load recipe_generation_batches row",
      retryable: true,
      details: { pgCode: (batchError as { code?: string }).code },
    });
  }
  if (!batchRow) return { ok: false, reason: "not_found" };
  const reviewStatus = (batchRow as { review_status: PlanBatchListItem["reviewStatus"] }).review_status;
  if (reviewStatus === "rejected") return { ok: false, reason: "wrong_state" };

  if (reviewStatus === "pending_review") {
    const { data: nonExcluded, error: briefError } = await client
      .from("recipe_plan_briefs")
      .select(BRIEF_COLUMNS)
      .eq("batch_id", params.batchId)
      .eq("excluded", false);
    if (briefError) {
      throw new RecipeAutomationError({
        code: "ADMIN_PLAN_BATCH_APPROVE_BRIEF_QUERY_FAILED",
        message: "failed to load recipe_plan_briefs rows for approval",
        retryable: true,
        details: { pgCode: (briefError as { code?: string }).code },
      });
    }
    const briefs = ((nonExcluded as unknown as Array<Record<string, unknown>>) ?? []).map(toBriefItem);
    const planJson = {
      briefs: briefs.map((b) => ({
        briefId: b.briefId,
        batchId: params.batchId,
        workingTitle: b.workingTitle,
        focusCrop: b.focusCrop,
        angle: b.angle,
        targetDifficulty: b.targetDifficulty,
        dietTags: b.dietTags,
        locale: b.locale,
        audience: b.audience,
        mealType: b.mealType,
        selectionReason: b.selectionReason,
      })),
    };

    const { data: diversity, error: diversityError } = await client.rpc("validate_recipe_plan_diversity", {
      p_plan: planJson,
      p_options: {},
    });
    if (diversityError) {
      throw new RecipeAutomationError({
        code: "ADMIN_PLAN_BATCH_APPROVE_DIVERSITY_RPC_FAILED",
        message: "validate_recipe_plan_diversity RPC failed",
        retryable: true,
        details: { pgCode: (diversityError as { code?: string }).code },
      });
    }
    const diversityResult = diversity as { valid: boolean; issues: unknown[] };
    await client.from("recipe_generation_batches").update({ diversity_report: diversityResult }).eq("id", params.batchId);
    if (!diversityResult.valid) {
      return { ok: false, reason: "diversity_invalid", issues: diversityResult.issues };
    }

    const { data: approved, error: approveError } = await client
      .from("recipe_generation_batches")
      .update({
        review_status: "approved",
        reviewed_by: params.adminActor ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", params.batchId)
      .eq("review_status", "pending_review")
      .select("id")
      .maybeSingle();
    if (approveError) {
      throw new RecipeAutomationError({
        code: "ADMIN_PLAN_BATCH_APPROVE_FAILED",
        message: "recipe_generation_batches approve update failed",
        retryable: true,
        details: { pgCode: (approveError as { code?: string }).code },
      });
    }
    // Lost a race against a concurrent approve/reject — fall through to the fan-out call below
    // regardless; it re-derives review_status='approved' from the DB itself (FANOUT_BATCH_NOT_APPROVED
    // otherwise), so this is never a silent inconsistency.
    void approved;
  }

  const { data: fanOutResult, error: fanOutError } = await client.rpc("fan_out_recipe_plan_batch", {
    _batch_id: params.batchId,
  });
  if (fanOutError) {
    const message = String((fanOutError as { message?: string }).message ?? fanOutError);
    if (message.includes("FANOUT_BATCH_NOT_APPROVED")) return { ok: false, reason: "wrong_state" };
    if (message.includes("FANOUT_BATCH_NOT_FOUND")) return { ok: false, reason: "not_found" };
    throw new RecipeAutomationError({
      code: "ADMIN_PLAN_BATCH_FAN_OUT_RPC_FAILED",
      message: "fan_out_recipe_plan_batch RPC failed",
      retryable: true,
      details: { pgCode: (fanOutError as { code?: string }).code },
    });
  }

  const jobs = (fanOutResult as { jobs: Array<{ briefId: string; jobId: string; workingTitle: string; focusCrop: string; created: boolean }> }).jobs;

  const dispatched = await runWithConcurrency(jobs, DISPATCH_CONCURRENCY, async (job) => {
    const result = await dispatchNextStage(client, {
      jobId: job.jobId,
      functionName: WRITE_STAGE_FUNCTION_NAME,
      payload: { batchId: params.batchId },
    });
    return { ...job, dispatched: result.dispatched } satisfies FannedOutJobSummary;
  });

  return { ok: true, batchId: params.batchId, jobs: dispatched };
}
