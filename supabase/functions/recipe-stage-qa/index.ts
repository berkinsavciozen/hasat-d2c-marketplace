// F2 Recipe Automation — Step 07: recipe-stage-qa Edge Function.
//
// The QA vertical slice's HTTP entrypoint. Thin by design, same pattern as recipe-stage-write —
// every real decision (claim, resolve current draft, run deterministic validations, call the QA
// agent, parse, store, route, dispatch) lives in
// ../_shared/recipe-automation/qa/qa-stage.ts so it can be unit-tested without an HTTP layer at
// all; this file only does request auth, input parsing, and response shaping.
//
// Auth: same shared-secret convention as recipe-stage-write (P0 infra, admin-auth.ts) —
// `x-admin-key` compared against RECIPE_STAGE_DISPATCH_SECRET. Only ever invoked by
// `dispatch_recipe_stage` (server-to-server) or a human operator with that same key.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runQAStage } from "../_shared/recipe-automation/qa/qa-stage.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, content-type",
  "Access-Control-Max-Age": "86400",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/** outcome -> HTTP status. Same convention as recipe-stage-write/index.ts: content/validation
 * failures (job was safely failJob'd, or safely routed on an idempotent replay) are 200 — the
 * dispatcher's HTTP call succeeded at its actual job, "run the QA stage"; the job's own status
 * column is where a downstream caller reads whether it succeeded. Only request-shape problems and
 * genuine infra failures are non-2xx. */
function statusFor(outcome: string): number {
  if (outcome === "not_claimed") return 409;
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }

  const jobId = (body as { jobId?: unknown } | null)?.jobId;
  if (typeof jobId !== "string" || !UUID_PATTERN.test(jobId)) {
    return json({ error: "jobId_required", detail: "jobId must be a UUID string" }, 400);
  }

  try {
    const client = getSupabaseAdminClient();
    const result = await runQAStage(client, { jobId, workerId: "recipe-stage-qa" });
    return json(result, statusFor(result.outcome));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "QA_STAGE_UNEXPECTED_ERROR", stage: "qa", retryable: true });
    console.error("recipe-stage-qa unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
