// T10 — Admin recipe data-quality overview + edit/approve actions.
//
// Same human-facing admin-dashboard auth convention as ../admin-recipe-jobs/index.ts and every
// other admin-recipe-* function: timing-safe `x-admin-key` compared against `ADMIN_DASHBOARD_KEY`,
// service-role internally, no `is_admin`, no RLS, no normal Lovable user session.
//
// Unlike its siblings (one function per action, query-param addressed), this function is a single
// small REST-ish router over one resource (a recipe's quality facts) — the dispatch's own spec —
// so the path after the function name is parsed by hand below rather than adding a routing
// dependency for 5 routes:
//   GET    /                                      -> list (optional ?incomplete=true filter)
//   GET    /:recipeId                              -> one recipe's full quality detail
//   PATCH  /:recipeId/allergens                    -> admin_update_recipe_allergens
//   PATCH  /:recipeId/facts                        -> admin_update_recipe_facts
//   PATCH  /:recipeId/ingredients/:ingredientId     -> admin_update_ingredient_nutrition
//   POST   /:recipeId/recalculate-nutrition         -> calculate_recipe_nutrition (direct, explicit)
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import {
  getRecipeQualityDetail,
  listRecipeQuality,
  recalculateNutrition,
  updateIngredientNutrition,
  updateRecipeAllergens,
  updateRecipeFacts,
  type QualityWriteResult,
} from "../_shared/recipe-automation/admin/quality.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUNCTION_NAME = "admin-recipe-quality";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

function writeResultResponse(result: QualityWriteResult) {
  if (result.ok) return json({ ok: true }, 200);
  return json({ ok: false, error: result.code, message: result.message }, result.status);
}

/** Path segments after the function's own name, whichever way Supabase hands the URL over
 * (`/admin-recipe-quality/...` locally, `/functions/v1/admin-recipe-quality/...` when the full
 * gateway path is preserved) — found by locating the function's own name rather than assuming a
 * fixed prefix depth. */
function routeSegments(pathname: string): string[] {
  const parts = pathname.split("/").filter(Boolean);
  const nameIdx = parts.indexOf(FUNCTION_NAME);
  return nameIdx === -1 ? parts : parts.slice(nameIdx + 1);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const segments = routeSegments(url.pathname);

  try {
    const client = getSupabaseAdminClient();

    // GET / — list, optional ?incomplete=true
    if (segments.length === 0) {
      if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const onlyIncomplete = url.searchParams.get("incomplete") === "true";
      const limitParam = url.searchParams.get("limit");
      const offsetParam = url.searchParams.get("offset");
      const result = await listRecipeQuality(client, {
        onlyIncomplete,
        limit: limitParam ? Number(limitParam) : undefined,
        offset: offsetParam ? Number(offsetParam) : undefined,
      });
      return json(result, 200);
    }

    const [recipeId, ...rest] = segments;
    if (!UUID_PATTERN.test(recipeId)) {
      return json({ error: "invalid_recipe_id", detail: "recipeId must be a UUID string" }, 400);
    }

    // GET /:recipeId — detail
    if (rest.length === 0) {
      if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const detail = await getRecipeQualityDetail(client, recipeId);
      if (!detail) return json({ error: "not_found" }, 404);
      return json(detail, 200);
    }

    // PATCH /:recipeId/allergens
    if (rest.length === 1 && rest[0] === "allergens") {
      if (req.method !== "PATCH") return json({ error: "method_not_allowed" }, 405);
      let body: { allergenLabels?: unknown; reviewed?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid_json_body" }, 400);
      }
      if (!isStringArray(body.allergenLabels)) {
        return json({ error: "allergenLabels_required", detail: "allergenLabels must be a string[]" }, 400);
      }
      if (typeof body.reviewed !== "boolean") {
        return json({ error: "reviewed_required", detail: "reviewed must be a boolean" }, 400);
      }
      const result = await updateRecipeAllergens(client, {
        recipeId,
        allergenLabels: body.allergenLabels,
        reviewed: body.reviewed,
      });
      return writeResultResponse(result);
    }

    // PATCH /:recipeId/facts
    if (rest.length === 1 && rest[0] === "facts") {
      if (req.method !== "PATCH") return json({ error: "method_not_allowed" }, 405);
      let body: { requiredEquipment?: unknown; dietTags?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid_json_body" }, 400);
      }
      if (!isStringArray(body.requiredEquipment)) {
        return json({ error: "requiredEquipment_required", detail: "requiredEquipment must be a string[]" }, 400);
      }
      if (!isStringArray(body.dietTags)) {
        return json({ error: "dietTags_required", detail: "dietTags must be a string[]" }, 400);
      }
      const result = await updateRecipeFacts(client, {
        recipeId,
        requiredEquipment: body.requiredEquipment,
        dietTags: body.dietTags,
      });
      return writeResultResponse(result);
    }

    // PATCH /:recipeId/ingredients/:ingredientId
    if (rest.length === 2 && rest[0] === "ingredients") {
      if (req.method !== "PATCH") return json({ error: "method_not_allowed" }, 405);
      const ingredientId = rest[1];
      if (!UUID_PATTERN.test(ingredientId)) {
        return json({ error: "invalid_ingredient_id", detail: "ingredientId must be a UUID string" }, 400);
      }
      let body: {
        crop?: unknown;
        freeTextName?: unknown;
        quantity?: unknown;
        unit?: unknown;
        nutritionFoodKey?: unknown;
        nutritionExclusionReason?: unknown;
      };
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid_json_body" }, 400);
      }
      const asNullableString = (v: unknown): string | null | undefined =>
        v === null ? null : typeof v === "string" ? v : undefined;
      const crop = asNullableString(body.crop);
      const freeTextName = asNullableString(body.freeTextName);
      const unit = asNullableString(body.unit);
      const nutritionFoodKey = asNullableString(body.nutritionFoodKey);
      const nutritionExclusionReason = asNullableString(body.nutritionExclusionReason);
      const quantity = body.quantity === null ? null : typeof body.quantity === "number" ? body.quantity : undefined;
      if (
        crop === undefined || freeTextName === undefined || unit === undefined ||
        nutritionFoodKey === undefined || nutritionExclusionReason === undefined || quantity === undefined
      ) {
        return json({
          error: "invalid_ingredient_body",
          detail: "crop/freeTextName/unit/nutritionFoodKey/nutritionExclusionReason must each be string|null, quantity must be number|null",
        }, 400);
      }
      const result = await updateIngredientNutrition(client, {
        ingredientId,
        crop,
        freeTextName,
        quantity,
        unit,
        nutritionFoodKey,
        nutritionExclusionReason,
      });
      return writeResultResponse(result);
    }

    // POST /:recipeId/recalculate-nutrition
    if (rest.length === 1 && rest[0] === "recalculate-nutrition") {
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const result = await recalculateNutrition(client, recipeId);
      if (!result) return json({ error: "not_found" }, 404);
      return json(result, 200);
    }

    return json({ error: "not_found" }, 404);
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_QUALITY_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-quality unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
