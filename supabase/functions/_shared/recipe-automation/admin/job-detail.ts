// F2 Recipe Automation — Step 11: admin draft-detail view (PROMPT 11's "draft detail" — recipe
// content, ingredients, ordered steps, both images, QA and RPC validation results, revision
// history, frame warnings).
//
// Every loader here is read-only against tables Steps 03/09/10 already own; nothing in this file
// writes anything. `loadCurrentDraft` (../qa/context.ts) and `validateDraft`
// (../writer/validate-draft.ts) are REUSED as-is from the locked write/qa vertical slices — the
// same "current draft" resolution and Postgres RPC validation those stages already run, not
// reimplemented — per the F2-S11 task brief's "read-reference only" allowance for Steps 06-10.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import { loadCurrentDraft } from "../qa/context.ts";
import { validateDraft, type DraftValidationResult } from "../writer/validate-draft.ts";
import type {
  RecipeDraftPayload,
  RecipeErrorPayload,
  RecipeJobStage,
  RecipeJobStatus,
  RecipeQADecision,
  RecipeQAIssue,
  RecipeSafetyReview,
} from "../types.ts";

export interface JobSummary {
  id: string;
  batchId: string;
  briefId: string;
  workingTitle: string;
  focusCrop: string | null;
  angle: string | null;
  targetDifficulty: string | null;
  dietTags: string[];
  locale: string;
  stage: RecipeJobStage;
  status: RecipeJobStatus;
  revisionCount: number;
  attempt: number;
  maxAttempts: number;
  lastError: RecipeErrorPayload | null;
  recipeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FullQaResult {
  id: string;
  draftId: string;
  draftVersion: number;
  decision: RecipeQADecision;
  overallScore: number;
  scores: Record<string, number>;
  blockingIssues: RecipeQAIssue[];
  nonBlockingSuggestions: RecipeQAIssue[];
  safetyReview: RecipeSafetyReview;
  approvedForImaging: boolean;
  model: string | null;
  checkedAt: string;
}

export interface RecipeAssetView {
  id: string;
  assetType: "source" | "hero" | "square" | "step";
  stepNo: number | null;
  storageBucket: string;
  storagePath: string;
  publicUrl: string;
  contentType: string;
  widthPx: number | null;
  heightPx: number | null;
  quality: number | null;
  /** "Frame şüphesi" (RecipeAutomation.md §6) — 'warning'/'failed' surfaces here for the admin to
   * look at; never auto-corrected upstream (image-stage.ts's own frame-suspicion.ts), so this is
   * the FIRST point anything acts on a flagged frame. */
  validationStatus: "pending" | "passed" | "failed" | "warning" | null;
  validationResults: Record<string, unknown> | null;
  generatedAt: string;
}

export interface DraftVersionSummary {
  id: string;
  version: number;
  title: string;
  createdAt: string;
  qaResult: { decision: RecipeQADecision; overallScore: number; blockingIssueCount: number; checkedAt: string } | null;
}

export interface StageRunSummary {
  stage: RecipeJobStage;
  status: string;
  attempt: number;
  startedAt: string;
  finishedAt: string | null;
  error: RecipeErrorPayload | null;
}

export interface AdminReviewHistoryEntry {
  id: string;
  action: "approve" | "reject" | "request_revision" | "retry_stage";
  temperatureReviewed: boolean;
  timingReviewed: boolean;
  allergensReviewed: boolean;
  contentReviewed: boolean;
  imagesReviewed: boolean;
  notes: string | null;
  adminActor: string | null;
  fromStage: RecipeJobStage;
  fromStatus: RecipeJobStatus;
  toStage: RecipeJobStage;
  toStatus: RecipeJobStatus;
  createdAt: string;
}

export interface JobDetail {
  job: JobSummary;
  currentDraft: { id: string; version: number; payload: RecipeDraftPayload } | null;
  validation: DraftValidationResult | null;
  latestQaResult: FullQaResult | null;
  images: RecipeAssetView[];
  revisionHistory: DraftVersionSummary[];
  stageRuns: StageRunSummary[];
  reviewHistory: AdminReviewHistoryEntry[];
}

/**
 * A separate, injectable seam for turning (bucket, path) into a public URL — same rationale
 * `../image/storage.ts`'s own `ImageStorageUploader` documents: `FakeSupabaseClient`
 * (infra/testing/) has no `.storage` surface, and extending it for one caller's benefit would
 * touch shared Step 05 test infra out of this step's scope. Production wires
 * `defaultPublicUrlResolver` (a thin wrap of `client.storage.from(bucket).getPublicUrl(path)`,
 * which is a pure string-formatting call, not a network request); tests inject a fake.
 */
export type PublicUrlResolver = (bucket: string, path: string) => string;

export function defaultPublicUrlResolver(client: SupabaseClient): PublicUrlResolver {
  return (bucket, path) => client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function loadJobDetail(
  client: SupabaseClient,
  jobId: string,
  resolvePublicUrl: PublicUrlResolver = defaultPublicUrlResolver(client),
): Promise<JobDetail | null> {
  const { data: jobRow, error: jobError } = await client
    .from("recipe_generation_jobs")
    .select(
      "id, batch_id, brief_id, working_title, focus_crop, angle, target_difficulty, diet_tags, locale, stage, status, revision_count, attempt, max_attempts, last_error, recipe_id, created_at, updated_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_DETAIL_QUERY_FAILED",
      message: "failed to load recipe_generation_jobs row",
      retryable: true,
      details: { pgCode: (jobError as { code?: string }).code },
    });
  }
  if (!jobRow) return null;
  const row = jobRow as Record<string, unknown>;

  const job: JobSummary = {
    id: String(row.id),
    batchId: String(row.batch_id),
    briefId: String(row.brief_id),
    workingTitle: String(row.working_title),
    focusCrop: (row.focus_crop as string | null) ?? null,
    angle: (row.angle as string | null) ?? null,
    targetDifficulty: (row.target_difficulty as string | null) ?? null,
    dietTags: Array.isArray(row.diet_tags) ? (row.diet_tags as string[]) : [],
    locale: String(row.locale),
    stage: row.stage as RecipeJobStage,
    status: row.status as RecipeJobStatus,
    revisionCount: Number(row.revision_count),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    lastError: (row.last_error as RecipeErrorPayload | null) ?? null,
    recipeId: (row.recipe_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };

  const currentDraft = await loadCurrentDraft(client, jobId);
  const validation = currentDraft ? await validateDraft(client, currentDraft.payload) : null;

  const [latestQaResult, images, revisionHistory, stageRuns, reviewHistory] = await Promise.all([
    loadLatestFullQaResult(client, jobId),
    currentDraft ? loadAssets(client, jobId, currentDraft.id, resolvePublicUrl) : Promise.resolve([]),
    loadRevisionHistory(client, jobId),
    loadStageRuns(client, jobId),
    loadReviewHistory(client, jobId),
  ]);

  return {
    job,
    currentDraft: currentDraft ? { id: currentDraft.id, version: currentDraft.version, payload: currentDraft.payload } : null,
    validation,
    latestQaResult,
    images,
    revisionHistory,
    stageRuns,
    reviewHistory,
  };
}

async function loadLatestFullQaResult(client: SupabaseClient, jobId: string): Promise<FullQaResult | null> {
  const { data, error } = await client
    .from("recipe_qa_results")
    .select(
      "id, draft_id, draft_version, decision, overall_score, scores, blocking_issues, non_blocking_suggestions, safety_review, approved_for_imaging, model, checked_at",
    )
    .eq("job_id", jobId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_DETAIL_QA_QUERY_FAILED",
      message: "failed to load latest recipe_qa_results row",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  const row = data as Record<string, unknown> | null;
  if (!row) return null;

  return {
    id: String(row.id),
    draftId: String(row.draft_id),
    draftVersion: Number(row.draft_version),
    decision: row.decision as RecipeQADecision,
    overallScore: Number(row.overall_score),
    scores: (row.scores as Record<string, number>) ?? {},
    blockingIssues: (row.blocking_issues as RecipeQAIssue[] | null) ?? [],
    nonBlockingSuggestions: (row.non_blocking_suggestions as RecipeQAIssue[] | null) ?? [],
    safetyReview: row.safety_review as RecipeSafetyReview,
    approvedForImaging: Boolean(row.approved_for_imaging),
    model: (row.model as string | null) ?? null,
    checkedAt: String(row.checked_at),
  };
}

async function loadAssets(
  client: SupabaseClient,
  jobId: string,
  draftId: string,
  resolvePublicUrl: PublicUrlResolver,
): Promise<RecipeAssetView[]> {
  const { data, error } = await client
    .from("recipe_assets")
    .select(
      "id, asset_type, step_no, storage_bucket, storage_path, content_type, width_px, height_px, quality, validation_status, validation_results, generated_at",
    )
    .eq("job_id", jobId)
    .eq("draft_id", draftId)
    .order("generated_at", { ascending: true });

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_DETAIL_ASSETS_QUERY_FAILED",
      message: "failed to load recipe_assets rows",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => {
    const bucket = String(row.storage_bucket);
    const path = String(row.storage_path);
    return {
      id: String(row.id),
      assetType: row.asset_type as RecipeAssetView["assetType"],
      stepNo: (row.step_no as number | null) ?? null,
      storageBucket: bucket,
      storagePath: path,
      publicUrl: resolvePublicUrl(bucket, path),
      contentType: String(row.content_type),
      widthPx: (row.width_px as number | null) ?? null,
      heightPx: (row.height_px as number | null) ?? null,
      quality: (row.quality as number | null) ?? null,
      validationStatus: (row.validation_status as RecipeAssetView["validationStatus"]) ?? null,
      validationResults: (row.validation_results as Record<string, unknown> | null) ?? null,
      generatedAt: String(row.generated_at),
    };
  });
}

async function loadRevisionHistory(client: SupabaseClient, jobId: string): Promise<DraftVersionSummary[]> {
  const [draftsResult, qaResult] = await Promise.all([
    client
      .from("recipe_drafts")
      .select("id, version, title, created_at")
      .eq("job_id", jobId)
      .order("version", { ascending: true }),
    client
      .from("recipe_qa_results")
      .select("draft_id, decision, overall_score, blocking_issues, checked_at")
      .eq("job_id", jobId)
      .order("checked_at", { ascending: false }),
  ]);

  if (draftsResult.error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_DETAIL_DRAFTS_QUERY_FAILED",
      message: "failed to load recipe_drafts rows",
      retryable: true,
      details: { pgCode: (draftsResult.error as { code?: string }).code },
    });
  }
  if (qaResult.error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_DETAIL_DRAFTS_QA_QUERY_FAILED",
      message: "failed to load recipe_qa_results rows for revision history",
      retryable: true,
      details: { pgCode: (qaResult.error as { code?: string }).code },
    });
  }

  const qaByDraftId = new Map<string, { decision: RecipeQADecision; overallScore: number; blockingIssueCount: number; checkedAt: string }>();
  for (const row of (qaResult.data as Array<Record<string, unknown>>) ?? []) {
    const draftId = String(row.draft_id);
    if (qaByDraftId.has(draftId)) continue; // most-recent-first; keep first seen per draft
    qaByDraftId.set(draftId, {
      decision: row.decision as RecipeQADecision,
      overallScore: Number(row.overall_score),
      blockingIssueCount: Array.isArray(row.blocking_issues) ? (row.blocking_issues as unknown[]).length : 0,
      checkedAt: String(row.checked_at),
    });
  }

  return ((draftsResult.data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    id: String(row.id),
    version: Number(row.version),
    title: String(row.title),
    createdAt: String(row.created_at),
    qaResult: qaByDraftId.get(String(row.id)) ?? null,
  }));
}

async function loadStageRuns(client: SupabaseClient, jobId: string): Promise<StageRunSummary[]> {
  const { data, error } = await client
    .from("recipe_generation_stage_runs")
    .select("stage, status, attempt, started_at, finished_at, error")
    .eq("job_id", jobId)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_DETAIL_STAGE_RUNS_QUERY_FAILED",
      message: "failed to load recipe_generation_stage_runs rows",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    stage: row.stage as RecipeJobStage,
    status: String(row.status),
    attempt: Number(row.attempt),
    startedAt: String(row.started_at),
    finishedAt: (row.finished_at as string | null) ?? null,
    error: (row.error as RecipeErrorPayload | null) ?? null,
  }));
}

async function loadReviewHistory(client: SupabaseClient, jobId: string): Promise<AdminReviewHistoryEntry[]> {
  const { data, error } = await client
    .from("recipe_admin_reviews")
    .select(
      "id, action, temperature_reviewed, timing_reviewed, allergens_reviewed, content_reviewed, images_reviewed, notes, admin_actor, from_stage, from_status, to_stage, to_status, created_at",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_DETAIL_REVIEW_HISTORY_QUERY_FAILED",
      message: "failed to load recipe_admin_reviews rows",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    id: String(row.id),
    action: row.action as AdminReviewHistoryEntry["action"],
    temperatureReviewed: Boolean(row.temperature_reviewed),
    timingReviewed: Boolean(row.timing_reviewed),
    allergensReviewed: Boolean(row.allergens_reviewed),
    contentReviewed: Boolean(row.content_reviewed),
    imagesReviewed: Boolean(row.images_reviewed),
    notes: (row.notes as string | null) ?? null,
    adminActor: (row.admin_actor as string | null) ?? null,
    fromStage: row.from_stage as RecipeJobStage,
    fromStatus: row.from_status as RecipeJobStatus,
    toStage: row.to_stage as RecipeJobStage,
    toStatus: row.to_status as RecipeJobStatus,
    createdAt: String(row.created_at),
  }));
}
