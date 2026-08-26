// F2 Recipe Automation — Step 11: admin job/batch list view (PROMPT 11's "batch/job list" —
// stage, status, revision, last error and QA score for every job).
//
// Two independent read queries (jobs page, then the latest `recipe_qa_results` row per job on
// that page), merged in JS — same "Promise.all of independent view queries, merge client-side"
// shape `admin-kpi/index.ts` already uses for its own dashboard, rather than reaching for a
// PostgREST embedded-resource join this pipeline's tables were never designed around.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import type { RecipeErrorPayload, RecipeJobStage, RecipeJobStatus, RecipeQADecision } from "../types.ts";

export interface RecipeJobListItem {
  id: string;
  batchId: string;
  briefId: string;
  workingTitle: string;
  focusCrop: string | null;
  stage: RecipeJobStage;
  status: RecipeJobStatus;
  revisionCount: number;
  attempt: number;
  maxAttempts: number;
  lastError: RecipeErrorPayload | null;
  latestQaScore: number | null;
  latestQaDecision: RecipeQADecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListRecipeJobsParams {
  stage?: RecipeJobStage;
  status?: RecipeJobStatus;
  batchId?: string;
  /** Defaults to the jobs PROMPT 11's admin list actually needs to act on. Pass explicitly for a
   * broader view (e.g. `undefined` isn't accepted — callers filter by `status` for that). */
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListRecipeJobsResult {
  jobs: RecipeJobListItem[];
  total: number;
}

export async function listRecipeJobs(
  client: SupabaseClient,
  params: ListRecipeJobsParams = {},
): Promise<ListRecipeJobsResult> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = client
    .from("recipe_generation_jobs")
    .select(
      "id, batch_id, brief_id, working_title, focus_crop, stage, status, revision_count, attempt, max_attempts, last_error, created_at, updated_at",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.stage) query = query.eq("stage", params.stage);
  if (params.status) query = query.eq("status", params.status);
  if (params.batchId) query = query.eq("batch_id", params.batchId);

  const { data, error, count } = await query;
  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_LIST_QUERY_FAILED",
      message: "failed to list recipe_generation_jobs",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const rows = (data as Array<Record<string, unknown>>) ?? [];
  const jobIds = rows.map((r) => String(r.id));

  const latestQaByJob = await loadLatestQaScorePerJob(client, jobIds);

  const jobs: RecipeJobListItem[] = rows.map((row) => {
    const latest = latestQaByJob.get(String(row.id));
    return {
      id: String(row.id),
      batchId: String(row.batch_id),
      briefId: String(row.brief_id),
      workingTitle: String(row.working_title),
      focusCrop: (row.focus_crop as string | null) ?? null,
      stage: row.stage as RecipeJobStage,
      status: row.status as RecipeJobStatus,
      revisionCount: Number(row.revision_count),
      attempt: Number(row.attempt),
      maxAttempts: Number(row.max_attempts),
      lastError: (row.last_error as RecipeErrorPayload | null) ?? null,
      latestQaScore: latest?.score ?? null,
      latestQaDecision: latest?.decision ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });

  return { jobs, total: count ?? jobs.length };
}

/** Most recent `recipe_qa_results` row per job (by `checked_at`), for exactly the job ids on the
 * current list page — never a per-row N+1 query. */
async function loadLatestQaScorePerJob(
  client: SupabaseClient,
  jobIds: string[],
): Promise<Map<string, { score: number; decision: RecipeQADecision }>> {
  const result = new Map<string, { score: number; decision: RecipeQADecision }>();
  if (jobIds.length === 0) return result;

  const { data, error } = await client
    .from("recipe_qa_results")
    .select("job_id, overall_score, decision, checked_at")
    .in("job_id", jobIds)
    .order("checked_at", { ascending: false });

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_JOB_LIST_QA_QUERY_FAILED",
      message: "failed to load recipe_qa_results for job list",
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  for (const row of (data as Array<Record<string, unknown>>) ?? []) {
    const jobId = String(row.job_id);
    // Rows arrive most-recent-first; keep only the first (latest) seen per job.
    if (result.has(jobId)) continue;
    result.set(jobId, { score: Number(row.overall_score), decision: row.decision as RecipeQADecision });
  }
  return result;
}
