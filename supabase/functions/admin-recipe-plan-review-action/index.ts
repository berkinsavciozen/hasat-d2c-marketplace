// F2 Recipe Automation — Step 13: admin batch-plan review actions.
//
// PROMPT 13's "düzenleyip onaylayabilmeli" (edit and approve) actions: edit_brief, exclude_brief,
// include_brief, approve_batch, reject_batch. Same admin-dashboard auth convention as every other
// admin-recipe-* function. All real state-transition logic lives in
// ../_shared/recipe-automation/admin/plan-review.ts so it stays unit-testable without an HTTP
// layer; this file only does request auth, input parsing, and response-status shaping.
//
// approve_batch is the ONLY action in this pipeline that ever creates a `recipe_generation_jobs`
// row (via `fan_out_recipe_plan_batch`, called from `approvePlanBatch`) and the ONLY one that ever
// dispatches a `recipe-stage-*` Edge Function — never done by any other admin action, and never
// without an approved batch (see plan-review.ts's own header).
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import {
  approvePlanBatch,
  editPlanBrief,
  rejectPlanBatch,
  setPlanBriefExclusion,
  type ApprovePlanBatchResult,
  type EditPlanBriefPatch,
  type PlanBriefMutationResult,
  type PlanReviewFailureReason,
  type RejectPlanBatchResult,
} from "../_shared/recipe-automation/admin/plan-review.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";
import { RECIPE_MEAL_TYPE_VALUES, RECIPE_TARGET_AUDIENCE_VALUES } from "../_shared/recipe-automation/schemas.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["edit_brief", "exclude_brief", "include_brief", "approve_batch", "reject_batch"] as const;
type Action = (typeof ACTIONS)[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const FAILURE_STATUS: Record<PlanReviewFailureReason, number> = {
  not_found: 404,
  wrong_state: 409,
  already_promoted: 409,
  diversity_invalid: 422,
};

function briefMutationStatus(result: PlanBriefMutationResult): number {
  return result.ok ? 200 : FAILURE_STATUS[result.reason];
}
function batchResultStatus(result: ApprovePlanBatchResult | RejectPlanBatchResult): number {
  return result.ok ? 200 : FAILURE_STATUS[result.reason ?? "not_found"];
}

interface RequestBody {
  action?: unknown;
  batchId?: unknown;
  briefId?: unknown;
  patch?: unknown;
  exclusionReason?: unknown;
  adminActor?: unknown;
}

function parseEditPatch(raw: unknown): EditPlanBriefPatch {
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const patch: EditPlanBriefPatch = {};
  if (typeof p.workingTitle === "string") patch.workingTitle = p.workingTitle.slice(0, 200);
  if (typeof p.focusCrop === "string") patch.focusCrop = p.focusCrop;
  if (p.angle === null || typeof p.angle === "string") patch.angle = p.angle as string | null;
  if (p.targetDifficulty === null || ["kolay", "orta", "zor"].includes(p.targetDifficulty as string)) {
    patch.targetDifficulty = p.targetDifficulty as EditPlanBriefPatch["targetDifficulty"];
  }
  if (Array.isArray(p.dietTags) && p.dietTags.every((t) => typeof t === "string")) {
    patch.dietTags = p.dietTags as string[];
  }
  if (typeof p.locale === "string") patch.locale = p.locale;
  if (typeof p.audience === "string" && (RECIPE_TARGET_AUDIENCE_VALUES as readonly string[]).includes(p.audience)) {
    patch.audience = p.audience as EditPlanBriefPatch["audience"];
  }
  if (p.mealType === null || (typeof p.mealType === "string" && (RECIPE_MEAL_TYPE_VALUES as readonly string[]).includes(p.mealType))) {
    patch.mealType = p.mealType as EditPlanBriefPatch["mealType"];
  }
  if (typeof p.selectionReason === "string") patch.selectionReason = p.selectionReason.slice(0, 1000);
  return patch;
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

  const action = body.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    return json({ error: "action_required", detail: `action must be one of ${ACTIONS.join(", ")}` }, 400);
  }

  const adminActor = typeof body.adminActor === "string" ? body.adminActor.slice(0, 200) : null;

  try {
    const client = getSupabaseAdminClient();

    if (action === "edit_brief" || action === "exclude_brief" || action === "include_brief") {
      const briefId = body.briefId;
      if (typeof briefId !== "string" || !UUID_PATTERN.test(briefId)) {
        return json({ error: "briefId_required", detail: "briefId must be a UUID string" }, 400);
      }
      let result: PlanBriefMutationResult;
      if (action === "edit_brief") {
        result = await editPlanBrief(client, { briefId, patch: parseEditPatch(body.patch) });
      } else {
        const exclusionReason = typeof body.exclusionReason === "string" ? body.exclusionReason.slice(0, 500) : null;
        result = await setPlanBriefExclusion(client, {
          briefId,
          excluded: action === "exclude_brief",
          exclusionReason,
        });
      }
      return json(result, briefMutationStatus(result));
    }

    const batchId = body.batchId;
    if (typeof batchId !== "string" || !UUID_PATTERN.test(batchId)) {
      return json({ error: "batchId_required", detail: "batchId must be a UUID string" }, 400);
    }

    if (action === "reject_batch") {
      const result = await rejectPlanBatch(client, { batchId, adminActor });
      return json(result, batchResultStatus(result));
    }

    // approve_batch
    const result = await approvePlanBatch(client, { batchId, adminActor });
    return json(result, batchResultStatus(result));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_PLAN_REVIEW_ACTION_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-plan-review-action unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
