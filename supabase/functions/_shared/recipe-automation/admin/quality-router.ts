// T10 + DQ-2 — the admin-recipe-quality Edge Function's router, separated from index.ts's
// Deno.serve shell so every route is unit-testable against a FakeSupabaseClient
// (quality-router.test.ts). index.ts keeps the auth gate and the unexpected-error catch; this module
// only ever sees an already-authenticated request and a service-role client handed to it.
//
// Routes (path after the function's own name):
//   GET    /                                      -> list (?mode=incomplete|issues|all, default
//                                                     incomplete; legacy ?incomplete=true|false)
//   GET    /draft-issues/:jobId                    -> DQ-2 issues for a job's latest draft
//   GET    /:recipeId                              -> one recipe's full quality detail (+ DQ-2 issues)
//   PATCH  /:recipeId/allergens                    -> admin_update_recipe_allergens
//   PATCH  /:recipeId/facts                        -> admin_update_recipe_facts
//   PATCH  /:recipeId/meta                         -> admin_update_recipe_meta (DQ-2)
//   PATCH  /:recipeId/ingredients/:ingredientId     -> admin_update_ingredient_nutrition (+ note)
//   POST   /:recipeId/recalculate-nutrition         -> calculate_recipe_nutrition (direct, explicit)
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import {
  getDraftQualityIssues,
  getRecipeQualityDetail,
  listRecipeQuality,
  recalculateNutrition,
  RECIPE_QUALITY_LIST_MODES,
  type RecipeQualityListMode,
  updateIngredientNutrition,
  updateRecipeAllergens,
  updateRecipeFacts,
  updateRecipeMeta,
  type QualityWriteResult,
} from "./quality.ts";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUNCTION_NAME = "admin-recipe-quality";

export function json(body: unknown, status = 200) {
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
export function routeSegments(pathname: string): string[] {
  const parts = pathname.split("/").filter(Boolean);
  const nameIdx = parts.indexOf(FUNCTION_NAME);
  return nameIdx === -1 ? parts : parts.slice(nameIdx + 1);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** `?mode=` wins; otherwise the T10-era `?incomplete=false` means "all" and anything else
 * (including no parameter, or the legacy `?incomplete=true`) means the default "incomplete".
 * Returns null for an unknown mode. */
export function parseListMode(params: URLSearchParams): RecipeQualityListMode | null {
  const mode = params.get("mode");
  if (mode !== null) {
    return (RECIPE_QUALITY_LIST_MODES as readonly string[]).includes(mode) ? (mode as RecipeQualityListMode) : null;
  }
  return params.get("incomplete") === "false" ? "all" : "incomplete";
}

const isNonNegativeIntOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);

/** Routes one already-authenticated request. Throws on unexpected errors (index.ts maps those to
 * a safe 500). */
export async function handleQualityRequest(req: Request, client: SupabaseClient): Promise<Response> {
  const url = new URL(req.url);
  const segments = routeSegments(url.pathname);

  // GET / — list, ?mode=incomplete|issues|all
  if (segments.length === 0) {
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const mode = parseListMode(url.searchParams);
    if (!mode) {
      return json({ error: "invalid_mode", detail: `mode must be one of ${RECIPE_QUALITY_LIST_MODES.join("|")}` }, 400);
    }
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const result = await listRecipeQuality(client, {
      mode,
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined,
    });
    return json(result, 200);
  }

  // GET /draft-issues/:jobId — DQ-2 issues for the latest recipe_drafts version of a job
  if (segments[0] === "draft-issues") {
    if (segments.length !== 2) return json({ error: "not_found" }, 404);
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const jobId = segments[1];
    if (!UUID_PATTERN.test(jobId)) {
      return json({ error: "invalid_job_id", detail: "jobId must be a UUID string" }, 400);
    }
    const issues = await getDraftQualityIssues(client, jobId);
    if (!issues) return json({ error: "not_found" }, 404);
    return json({ jobId, issues }, 200);
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

  // PATCH /:recipeId/meta
  if (rest.length === 1 && rest[0] === "meta") {
    if (req.method !== "PATCH") return json({ error: "method_not_allowed" }, 405);
    let body: { servings?: unknown; prepMinutes?: unknown; cookMinutes?: unknown; restMinutes?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json_body" }, 400);
    }
    if (typeof body.servings !== "number" || !Number.isInteger(body.servings) || body.servings <= 0) {
      return json({ error: "servings_required", detail: "servings must be a positive integer" }, 400);
    }
    if (
      !isNonNegativeIntOrNull(body.prepMinutes) || !isNonNegativeIntOrNull(body.cookMinutes) ||
      !isNonNegativeIntOrNull(body.restMinutes)
    ) {
      return json({
        error: "invalid_meta_body",
        detail: "prepMinutes/cookMinutes/restMinutes must each be a non-negative integer or null",
      }, 400);
    }
    const result = await updateRecipeMeta(client, {
      recipeId,
      servings: body.servings,
      prepMinutes: body.prepMinutes,
      cookMinutes: body.cookMinutes,
      restMinutes: body.restMinutes,
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
      note?: unknown;
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
    // note is optional (DQ-2): absent = unchanged, null = clear, string = set.
    if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
      return json({ error: "invalid_ingredient_body", detail: "note must be string|null when present" }, 400);
    }
    const note = body.note as string | null | undefined;
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
      note,
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
}
