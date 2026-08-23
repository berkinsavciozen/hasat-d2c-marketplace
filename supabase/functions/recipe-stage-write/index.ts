// F2 Recipe Automation — Step 06: recipe-stage-write Edge Function.
//
// The Writer vertical slice's HTTP entrypoint. Thin by design — every real decision (claim, load
// context, call the agent, validate, store, advance+dispatch) lives in
// ../_shared/recipe-automation/writer/write-stage.ts so it can be unit-tested without an HTTP
// layer at all; this file only does request auth, input parsing, and response shaping.
//
// Auth: gated by the SAME shared-secret convention dispatch_recipe_stage's caller uses (P0 infra,
// admin-auth.ts) — `x-admin-key` compared against RECIPE_STAGE_DISPATCH_SECRET, the narrower,
// stage-dispatch-only secret (never ADMIN_DASHBOARD_KEY). This function is only ever meant to be
// invoked by `dispatch_recipe_stage` (server-to-server) or a human operator with that same key —
// never by an end-user client.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runWriteStage } from "../_shared/recipe-automation/writer/write-stage.ts";
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

/** outcome -> HTTP status. Content/validation failures (job was safely failJob'd) are 200 — the
 * dispatcher's HTTP call succeeded at its actual job, "run the write stage"; the job's own status
 * column (not this HTTP status) is where a downstream caller reads whether it succeeded. Only
 * request-shape problems and genuine infra failures are non-2xx. */
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
    const result = await runWriteStage(client, { jobId, workerId: "recipe-stage-write" });
    return json(result, statusFor(result.outcome));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "WRITE_STAGE_UNEXPECTED_ERROR", stage: "write", retryable: true });
    console.error("recipe-stage-write unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
