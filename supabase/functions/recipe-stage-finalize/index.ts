// F2 Recipe Automation — Step 10: recipe-stage-finalize Edge Function.
//
// The Finalize vertical slice's HTTP entrypoint. Thin by design, same pattern as
// recipe-stage-write/recipe-stage-qa/recipe-stage-revise — every real decision (claim, re-verify
// every PROMPT 10 precondition, atomically move the job to awaiting_approval) lives in
// ../_shared/recipe-automation/finalize/finalize-stage.ts so it can be unit-tested without an HTTP
// layer at all; this file only does request auth, input parsing, and response shaping.
//
// Auth: same shared-secret convention as every other stage-runner (P0 infra, admin-auth.ts) —
// `x-admin-key` compared against RECIPE_STAGE_DISPATCH_SECRET. Only ever invoked by
// `dispatch_recipe_stage` (server-to-server, dispatched by ../_shared/recipe-automation/image's
// runImageStage) or a human operator with that same key.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runFinalizeStage } from "../_shared/recipe-automation/finalize/finalize-stage.ts";
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

/** outcome -> HTTP status. Same convention as every other stage-runner's index.ts: content/
 * validation failures (job was safely failJob'd) are 200 — the dispatcher's HTTP call succeeded at
 * its actual job, "run the finalize stage"; the job's own stage/status columns are where a
 * downstream caller reads whether it succeeded. Only request-shape problems and genuine infra
 * failures are non-2xx. */
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
    const result = await runFinalizeStage(client, { jobId, workerId: "recipe-stage-finalize" });
    return json(result, statusFor(result.outcome));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "FINALIZE_STAGE_UNEXPECTED_ERROR", stage: "finalize", retryable: true });
    console.error("recipe-stage-finalize unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
