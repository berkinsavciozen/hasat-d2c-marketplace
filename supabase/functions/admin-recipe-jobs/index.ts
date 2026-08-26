// F2 Recipe Automation — Step 11: admin recipe-automation job list.
//
// PROMPT 11's "batch/job list" view (stage, status, revision, last error, QA score). Same
// human-facing admin-dashboard auth convention as `../admin-kpi/index.ts` — timing-safe
// `x-admin-key` compared against `ADMIN_DASHBOARD_KEY`, service-role internally, no `is_admin`, no
// RLS, no normal Lovable user session. Read-only: this function never mutates any table.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { listRecipeJobs, type ListRecipeJobsParams } from "../_shared/recipe-automation/admin/list-jobs.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";
import { RECIPE_JOB_STAGE_VALUES, RECIPE_JOB_STATUS_VALUES } from "../_shared/recipe-automation/schemas.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const STAGE_SET = new Set<string>(RECIPE_JOB_STAGE_VALUES);
const STATUS_SET = new Set<string>(RECIPE_JOB_STATUS_VALUES);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const stageParam = url.searchParams.get("stage");
  const statusParam = url.searchParams.get("status");
  const batchIdParam = url.searchParams.get("batchId");
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  if (stageParam && !STAGE_SET.has(stageParam)) {
    return json({ error: "invalid_stage", detail: `stage must be one of ${[...STAGE_SET].join(", ")}` }, 400);
  }
  if (statusParam && !STATUS_SET.has(statusParam)) {
    return json({ error: "invalid_status", detail: `status must be one of ${[...STATUS_SET].join(", ")}` }, 400);
  }

  const params: ListRecipeJobsParams = {
    stage: (stageParam as ListRecipeJobsParams["stage"]) ?? undefined,
    status: (statusParam as ListRecipeJobsParams["status"]) ?? undefined,
    batchId: batchIdParam ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
    offset: offsetParam ? Number(offsetParam) : undefined,
  };

  try {
    const client = getSupabaseAdminClient();
    const result = await listRecipeJobs(client, params);
    return json(result, 200);
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_JOBS_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-jobs unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
