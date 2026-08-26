// F2 Recipe Automation — Step 11: admin recipe-automation review actions.
//
// PROMPT 11's four required actions: approve / reject / request revision / retry failed stage.
// Same admin-dashboard auth convention as `../admin-kpi/index.ts` (timing-safe `x-admin-key` /
// `ADMIN_DASHBOARD_KEY`, service-role internally) — no `is_admin`, no RLS, no normal Lovable user
// session. All real state-transition logic lives in
// `../_shared/recipe-automation/admin/review-actions.ts` so it stays unit-testable without an HTTP
// layer; this file only does request auth, input parsing, and response-status shaping.
//
// Never invokes any `recipe-stage-*` Edge Function and never deploys/redeploys/calls a live
// function — see review-actions.ts's own header for why a state-only transition is sufficient here.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import {
  approveJob,
  rejectJob,
  requestRevisionJob,
  retryStage,
  type ReviewActionFailureReason,
  type ReviewActionResult,
} from "../_shared/recipe-automation/admin/review-actions.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["approve", "reject", "request_revision", "retry_stage"] as const;
type Action = (typeof ACTIONS)[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const FAILURE_STATUS: Record<ReviewActionFailureReason, number> = {
  not_found: 404,
  wrong_state: 409,
  revision_limit_reached: 422,
  checklist_incomplete: 400,
};

function statusFor(result: ReviewActionResult): number {
  return result.ok ? 200 : FAILURE_STATUS[result.reason];
}

interface RequestBody {
  jobId?: unknown;
  action?: unknown;
  draftId?: unknown;
  draftVersion?: unknown;
  checklist?: unknown;
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

  const jobId = body.jobId;
  if (typeof jobId !== "string" || !UUID_PATTERN.test(jobId)) {
    return json({ error: "jobId_required", detail: "jobId must be a UUID string" }, 400);
  }

  const action = body.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    return json({ error: "action_required", detail: `action must be one of ${ACTIONS.join(", ")}` }, 400);
  }

  const draftId = typeof body.draftId === "string" ? body.draftId : null;
  const draftVersion = typeof body.draftVersion === "number" ? body.draftVersion : null;
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 4000) : null;
  const adminActor = typeof body.adminActor === "string" ? body.adminActor.slice(0, 200) : null;

  if ((action === "approve") && (typeof draftId !== "string" || draftVersion === null)) {
    return json({ error: "draft_required", detail: "approve requires draftId and draftVersion" }, 400);
  }

  try {
    const client = getSupabaseAdminClient();
    let result: ReviewActionResult;

    switch (action as Action) {
      case "approve":
        result = await approveJob(client, {
          jobId,
          draftId: draftId as string,
          draftVersion: draftVersion as number,
          checklist: body.checklist,
          notes,
          adminActor,
        });
        break;
      case "reject":
        result = await rejectJob(client, { jobId, draftId, draftVersion, checklist: body.checklist, notes, adminActor });
        break;
      case "request_revision":
        result = await requestRevisionJob(client, { jobId, draftId, draftVersion, checklist: body.checklist, notes, adminActor });
        break;
      case "retry_stage":
        result = await retryStage(client, { jobId, draftId, draftVersion, notes, adminActor });
        break;
    }

    return json(result, statusFor(result));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_REVIEW_ACTION_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-review-action unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
