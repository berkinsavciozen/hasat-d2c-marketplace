// F2 Recipe Automation — Step 13: admin plan-batch list.
//
// PROMPT 13's "planı görüntüleyip" (view the plan) list view — every recipe_generation_batches row
// with its review_status, target/brief counts, and planner metadata. Same human-facing
// admin-dashboard auth convention as ../admin-kpi/index.ts and ../admin-recipe-jobs/index.ts —
// timing-safe `x-admin-key` compared against `ADMIN_DASHBOARD_KEY`, service-role internally, no
// `is_admin`, no RLS, no normal Lovable user session. Read-only: this function never mutates any
// table.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { listPlanBatches, type ListPlanBatchesParams } from "../_shared/recipe-automation/admin/plan-review.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const REVIEW_STATUS_SET = new Set(["pending_review", "approved", "rejected"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const reviewStatusParam = url.searchParams.get("reviewStatus");
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  if (reviewStatusParam && !REVIEW_STATUS_SET.has(reviewStatusParam)) {
    return json({ error: "invalid_review_status", detail: `reviewStatus must be one of ${[...REVIEW_STATUS_SET].join(", ")}` }, 400);
  }

  const params: ListPlanBatchesParams = {
    reviewStatus: (reviewStatusParam as ListPlanBatchesParams["reviewStatus"]) ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
    offset: offsetParam ? Number(offsetParam) : undefined,
  };

  try {
    const client = getSupabaseAdminClient();
    const result = await listPlanBatches(client, params);
    return json(result, 200);
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_PLAN_BATCHES_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-plan-batches unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
