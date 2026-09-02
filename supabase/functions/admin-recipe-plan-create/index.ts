// F2 Recipe Automation — Step 15: admin-recipe-plan-create Edge Function.
//
// Lets an admin trigger a brand-new Planner batch by hand from the dashboard, instead of the only
// path that existed before this step: a direct, RECIPE_STAGE_DISPATCH_SECRET-authenticated HTTP
// call to recipe-stage-plan. Same human-facing admin-dashboard auth convention as every other
// admin-recipe-* function — timing-safe `x-admin-key` compared against `ADMIN_DASHBOARD_KEY`,
// never RECIPE_STAGE_DISPATCH_SECRET (that stays the narrower, stage-to-stage-only secret and must
// never reach a browser).
//
// Calls `runPlanStage` directly, in-process — the same shape recipe-stage-write/index.ts uses to
// call runWriteStage — so no extra HTTP hop through recipe-stage-plan itself is needed, and
// RECIPE_STAGE_DISPATCH_SECRET is never read by this function at all.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runPlanStage } from "../_shared/recipe-automation/plan/plan-stage.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

/** Same outcome -> HTTP status mapping as recipe-stage-plan/index.ts. */
function statusFor(outcome: string): number {
  if (outcome === "invalid_batch_input") return 400;
  if (outcome === "batch_not_reviewable") return 409;
  return 200;
}

interface RequestBody {
  targetCount?: unknown;
  focusCrops?: unknown;
  dietFocus?: unknown;
  locale?: unknown;
  notes?: unknown;
  adminActor?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }

  // Same free-text admin-actor convention admin-recipe-plan-review-action uses for its own
  // `adminActor` field — sanitized the same way (string, capped at 200 chars). It is logged only,
  // never written to `recipe_generation_batches.requested_by`: that column is a
  // `uuid references public.profiles(id)` FK (f2s03), and this surface, like every admin-recipe-*
  // function, deliberately has no authenticated `profiles.id` identity behind its shared
  // x-admin-key auth (see f2s11's own header for why) — there is no batch-creation-time column
  // this identity could safely land in without either breaking that FK or repurposing `notes`.
  const adminActor = typeof body.adminActor === "string" ? body.adminActor.slice(0, 200) : null;
  if (adminActor) {
    console.log("admin-recipe-plan-create triggered", { adminActor });
  }

  // recipeBatchInputSchema (schemas.ts) is `.strict()` — only forward the fields this endpoint's
  // own contract accepts (targetCount/focusCrops/dietFocus/locale/notes). batchId/requestedBy are
  // never caller-supplied here; runPlanStage's own resolveOrCreateBatch creates a fresh batch with
  // requestedBy left at the schema's default (null).
  const batchInput = {
    targetCount: body.targetCount,
    focusCrops: body.focusCrops,
    dietFocus: body.dietFocus,
    locale: body.locale,
    notes: body.notes,
  };

  try {
    const client = getSupabaseAdminClient();
    const result = await runPlanStage(client, { batchInput });
    return json(result, statusFor(result.outcome));
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "ADMIN_RECIPE_PLAN_CREATE_UNEXPECTED_ERROR",
      stage: "plan",
      retryable: true,
    });
    console.error("admin-recipe-plan-create unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
