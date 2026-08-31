// F2 Recipe Automation — Step 13: admin plan-batch detail (batch + every brief).
//
// Same admin-dashboard auth convention as ../admin-recipe-plan-batches/index.ts. Read-only.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { getPlanBatchDetail } from "../_shared/recipe-automation/admin/plan-review.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  const batchId = new URL(req.url).searchParams.get("batchId");
  if (!batchId || !UUID_PATTERN.test(batchId)) {
    return json({ error: "batchId_required", detail: "batchId query param must be a UUID string" }, 400);
  }

  try {
    const client = getSupabaseAdminClient();
    const detail = await getPlanBatchDetail(client, batchId);
    if (!detail) return json({ error: "not_found" }, 404);
    return json(detail, 200);
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_PLAN_BATCH_DETAIL_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-plan-batch-detail unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
