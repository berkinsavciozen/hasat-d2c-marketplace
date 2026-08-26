// F2 Recipe Automation — Step 09: recipe-stage-image Edge Function.
//
// The Image vertical slice's HTTP entrypoint. Thin by design, same convention as
// recipe-stage-write/qa/revise: every real decision lives in
// ../_shared/recipe-automation/image/image-stage.ts so it can be unit-tested without an HTTP layer
// at all; this file only does request auth, input parsing, and response shaping.
//
// Auth: same shared-secret convention every stage-runner in this pipeline uses (admin-auth.ts,
// RECIPE_STAGE_DISPATCH_SECRET) — only ever invoked by `dispatch_recipe_stage` or a human operator
// with that key, never by an end-user client.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runImageStage } from "../_shared/recipe-automation/image/image-stage.ts";
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

/** outcome -> HTTP status. Same convention as recipe-stage-write/index.ts: content/processing
 * failures (job was safely failJob'd) are 200 — the dispatcher's HTTP call succeeded at its actual
 * job, "run the image stage"; the job's own status column is where a downstream caller reads
 * whether it succeeded. Only request-shape problems and genuine infra failures are non-2xx. */
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
    const result = await runImageStage(client, { jobId, workerId: "recipe-stage-image" });
    return json(result, statusFor(result.outcome));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "IMAGE_STAGE_UNEXPECTED_ERROR", stage: "image", retryable: true });
    console.error("recipe-stage-image unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
