// F2 Recipe Automation — admin recipe-guidance dashboard endpoint.
//
// PROMPT: gives the admin panel, at brief-authoring time, the same read-only signal the Planner/QA
// agents already have ahead of drafting — "what's already published for this crop" (mode=catalog)
// and "does this working title look like a duplicate" (mode=duplicates) — so a human editing a
// brief sees it BEFORE the Writer ever runs, not only after QA flags it. Same human-facing
// admin-dashboard auth convention as ../admin-recipe-jobs/index.ts and every other
// admin-recipe-plan-* function: timing-safe `x-admin-key` compared against `ADMIN_DASHBOARD_KEY`,
// service-role internally, no `is_admin`, no RLS, no normal Lovable user session. Read-only: this
// function never mutates any table (see ../_shared/recipe-automation/admin/plan-guidance.ts's own
// header — every call is an existing narrow RPC, never a new one, never a raw table scan).
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { checkTitleDuplicates, getCatalogGuidance } from "../_shared/recipe-automation/admin/plan-guidance.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

function parseFocusCrops(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((c) => c.trim()).filter(Boolean);
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");

  if (mode !== "catalog" && mode !== "duplicates") {
    return json({ error: "invalid_mode", detail: "mode query param must be 'catalog' or 'duplicates'" }, 400);
  }

  const workingTitle = url.searchParams.get("workingTitle") ?? "";
  if (mode === "duplicates" && !workingTitle.trim()) {
    return json({ error: "workingTitle_required", detail: "workingTitle query param is required for mode=duplicates" }, 400);
  }

  try {
    const client = getSupabaseAdminClient();

    if (mode === "catalog") {
      const focusCrops = parseFocusCrops(url.searchParams.get("focusCrops"));
      const result = await getCatalogGuidance(client, { focusCrops });
      return json(result, 200);
    }

    const focusCrop = url.searchParams.get("focusCrop");
    const duplicates = await checkTitleDuplicates(client, { workingTitle, focusCrop });
    return json({ duplicates }, 200);
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_GUIDANCE_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-guidance unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
}

// Exposed for index.test.ts — same convention recipe-stage-write/recipe-stage-revise's own
// index.test.ts use: every early-return path above the two mode branches returns BEFORE ever
// constructing a Supabase client, so the auth-gate/method/mode-validation tests need no network/DB
// double, just the handler function itself.
(globalThis as unknown as { __denoServeHandler?: (req: Request) => Promise<Response> }).__denoServeHandler = handleRequest;

Deno.serve(handleRequest);
