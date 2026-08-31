// F2 Recipe Automation — Step 13: recipe-stage-plan Edge Function.
//
// The Planner vertical slice's HTTP entrypoint. Thin by design — every real decision (resolve/
// create batch, load context, call the agent, validate, store) lives in
// ../_shared/recipe-automation/plan/plan-stage.ts so it can be unit-tested without an HTTP layer at
// all; this file only does request auth, input parsing, and response shaping.
//
// Unlike every other `recipe-stage-*` function, this one is NEVER reached via
// `dispatch_recipe_stage` from a PRECEDING pipeline stage — planning is the first node, there is no
// earlier stage to dispatch it. It is invoked directly by an admin/operator action (same
// "human operator with the dispatch key, or server-to-server" auth convention as every other
// `recipe-stage-*` function — see recipe-stage-write/index.ts's own header) with a `RecipeBatchInput`
// body, not a `{ jobId }` body — there is no job at plan time (see plan-stage.ts's header).
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runPlanStage } from "../_shared/recipe-automation/plan/plan-stage.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/** outcome -> HTTP status. Content/validation failures are 200 — the caller's HTTP request
 * succeeded at its actual job, "run the plan stage"; the batch's own review_status/plan_error
 * columns (not this HTTP status) are where a downstream caller reads whether it succeeded. Only
 * request-shape problems and genuine infra failures are non-2xx. */
function statusFor(outcome: string): number {
  if (outcome === "invalid_batch_input") return 400;
  if (outcome === "batch_not_reviewable") return 409;
  return 200;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const auth = requireSharedSecret(req, {
    envVarName: "RECIPE_STAGE_DISPATCH_SECRET",
    responseHeaders: CORS,
  });
  if (!auth.ok) return auth.response;

  let batchInput: unknown;
  try {
    batchInput = await req.json();
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }

  try {
    const client = getSupabaseAdminClient();
    const result = await runPlanStage(client, { batchInput });
    return json(result, statusFor(result.outcome));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "PLAN_STAGE_UNEXPECTED_ERROR", stage: "plan", retryable: true });
    console.error("recipe-stage-plan unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
