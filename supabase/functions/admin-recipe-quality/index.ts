// T10 + DQ-2 — Admin recipe data-quality overview + edit/approve actions.
//
// Same human-facing admin-dashboard auth convention as ../admin-recipe-jobs/index.ts and every
// other admin-recipe-* function: timing-safe `x-admin-key` compared against `ADMIN_DASHBOARD_KEY`,
// service-role internally, no `is_admin`, no RLS, no normal Lovable user session.
//
// Unlike its siblings (one function per action, query-param addressed), this function is a single
// small REST-ish router over one resource (a recipe's quality facts). The routes themselves live in
// ../_shared/recipe-automation/admin/quality-router.ts (see its header for the list) so they are
// unit-testable; this file is only the auth gate + unexpected-error shell.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { CORS, handleQualityRequest, json } from "../_shared/recipe-automation/admin/quality-router.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  try {
    return await handleQualityRequest(req, getSupabaseAdminClient());
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_QUALITY_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-quality unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
