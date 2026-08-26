// F2 Recipe Automation — Step 08: recipe-stage-revise Edge Function.
//
// The revise-loop vertical slice's HTTP entrypoint. Thin by design, same pattern as
// recipe-stage-write/recipe-stage-qa — every real decision (claim, resolve current draft + QA
// result, enforce the two-automatic-revision cap, run the Reviser agent, parse, validate, store,
// route, dispatch) lives in ../_shared/recipe-automation/revise/revise-stage.ts so it can be
// unit-tested without an HTTP layer at all; this file only does request auth, input parsing, and
// response shaping.
//
// Auth: same shared-secret convention as recipe-stage-write/recipe-stage-qa (P0 infra,
// admin-auth.ts) — `x-admin-key` compared against RECIPE_STAGE_DISPATCH_SECRET. Only ever invoked
// by `dispatch_recipe_stage` (server-to-server) or a human operator with that same key.
// `dispatch_recipe_stage`'s function-name allow-list already includes "recipe-stage-revise" (added
// pre-emptively in the f2s05 migration alongside "recipe-stage-write"/"recipe-stage-qa" — see that
// migration's own comment: "Add a new name here ONLY when that stage-runner Edge Function actually
// exists") — no migration change was needed to enable dispatch to this function.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runReviseStage } from "../_shared/recipe-automation/revise/revise-stage.ts";
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

/** outcome -> HTTP status. Same convention as recipe-stage-write/recipe-stage-qa: content/
 * validation failures (job was safely failJob'd, or safely routed on an idempotent replay, or
 * safely parked at manual review once the revision cap was reached) are 200 — the dispatcher's
 * HTTP call succeeded at its actual job, "run the revise stage"; the job's own status column is
 * where a downstream caller reads whether it succeeded. Only request-shape problems and genuine
 * infra failures are non-2xx. */
function statusFor(outcome: string): number {
  if (outcome === "not_claimed") return 409;
  return 200;
}

async function handleRequest(req: Request): Promise<Response> {
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
    const result = await runReviseStage(client, { jobId, workerId: "recipe-stage-revise" });
    return json(result, statusFor(result.outcome));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "REVISE_STAGE_UNEXPECTED_ERROR", stage: "revise", retryable: true });
    console.error("recipe-stage-revise unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
}

// Exposed for index.test.ts, which exercises this entrypoint's request-shape logic (auth gate,
// JSON/jobId parsing, method handling) directly — every early-return path in `handleRequest` above
// returns BEFORE ever constructing a Supabase client or calling runReviseStage, so the test needs
// no network/DB double, just the handler function itself.
(globalThis as unknown as { __denoServeHandler?: (req: Request) => Promise<Response> }).__denoServeHandler = handleRequest;

Deno.serve(handleRequest);
