// F2-S18 — admin-recipe-nutrition-resolve: Besin Değeri Eksikliği, Sınıf A + C için tek çözüm
// yolu. Aynı admin-dashboard auth konvansiyonu (`requireSharedSecret` / `x-admin-key` /
// `ADMIN_DASHBOARD_KEY`, service-role internally, aynı CORS deseni) —
// admin-recipe-review-action/index.ts ile birebir aynı. Gerçek yazma mantığı
// `../_shared/recipe-automation/admin/nutrition-resolve.ts`'te (o da tamamen
// `admin_resolve_nutrition_unresolved` Postgres RPC'sine devrediyor); bu dosya yalnızca auth,
// girdi doğrulama ve HTTP durum kodu eşlemesi yapıyor.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import {
  resolveNutritionUnresolved,
  type NutritionResolution,
  type ResolveNutritionUnresolvedFailureReason,
  type ResolveNutritionUnresolvedResult,
} from "../_shared/recipe-automation/admin/nutrition-resolve.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOLUTION_KINDS = ["add_measure", "alias_to_existing", "new_reference", "mark_unquantified"] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const FAILURE_STATUS: Record<ResolveNutritionUnresolvedFailureReason, number> = {
  already_exists: 409,
  ingredient_not_found: 422,
};

function statusFor(result: ResolveNutritionUnresolvedResult): number {
  return result.ok ? 200 : FAILURE_STATUS[result.reason];
}

interface RequestBody {
  jobId?: unknown;
  ingredientLabel?: unknown;
  resolution?: unknown;
  notes?: unknown;
  adminActor?: unknown;
}

/** Gövdedeki `resolution` alanını `kind`'a göre doğrular — spec §2.2'nin dört varyantı. Yalnızca
 * şekil kontrolü yapar (tip + zorunlu alan varlığı); asıl iş kuralları (çakışma, draft var mı,
 * makroların tam olması vs.) RPC'nin kendisinde. */
function parseResolution(input: unknown): { ok: true; value: NutritionResolution } | { ok: false; detail: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, detail: "resolution must be an object" };
  }
  const r = input as Record<string, unknown>;
  const kind = r.kind;
  if (typeof kind !== "string" || !RESOLUTION_KINDS.includes(kind as (typeof RESOLUTION_KINDS)[number])) {
    return { ok: false, detail: `resolution.kind must be one of ${RESOLUTION_KINDS.join(", ")}` };
  }

  switch (kind) {
    case "add_measure": {
      const scope = r.scope;
      const scopeOk =
        typeof scope === "object" && scope !== null &&
        ((typeof (scope as Record<string, unknown>).crop === "string" && (scope as Record<string, unknown>).crop !== "") ||
          (typeof (scope as Record<string, unknown>).foodKey === "string" && (scope as Record<string, unknown>).foodKey !== ""));
      if (!scopeOk) return { ok: false, detail: "add_measure requires resolution.scope.crop or resolution.scope.foodKey" };
      if (typeof r.unit !== "string" || r.unit === "") return { ok: false, detail: "add_measure requires resolution.unit" };
      if (typeof r.gramsPerUnit !== "number" || !Number.isFinite(r.gramsPerUnit) || r.gramsPerUnit <= 0) {
        return { ok: false, detail: "add_measure requires a positive resolution.gramsPerUnit" };
      }
      return {
        ok: true,
        value: {
          kind: "add_measure",
          scope: scope as { crop: string } | { foodKey: string },
          unit: r.unit,
          gramsPerUnit: r.gramsPerUnit,
        },
      };
    }
    case "alias_to_existing": {
      if (r.targetKind !== "crop" && r.targetKind !== "food") {
        return { ok: false, detail: "alias_to_existing requires resolution.targetKind to be 'crop' or 'food'" };
      }
      if (typeof r.targetKey !== "string" || r.targetKey === "") {
        return { ok: false, detail: "alias_to_existing requires resolution.targetKey" };
      }
      return { ok: true, value: { kind: "alias_to_existing", targetKind: r.targetKind, targetKey: r.targetKey } };
    }
    case "new_reference": {
      if (typeof r.foodKey !== "string" || r.foodKey === "") return { ok: false, detail: "new_reference requires resolution.foodKey" };
      if (typeof r.displayName !== "string" || r.displayName === "") {
        return { ok: false, detail: "new_reference requires resolution.displayName" };
      }
      const macroFields = ["caloriesKcal", "proteinG", "carbsG", "fatG", "fiberG"] as const;
      for (const field of macroFields) {
        const value = r[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          return { ok: false, detail: `new_reference requires a non-negative numeric resolution.${field}` };
        }
      }
      return {
        ok: true,
        value: {
          kind: "new_reference",
          foodKey: r.foodKey,
          displayName: r.displayName,
          caloriesKcal: r.caloriesKcal as number,
          proteinG: r.proteinG as number,
          carbsG: r.carbsG as number,
          fatG: r.fatG as number,
          fiberG: r.fiberG as number,
        },
      };
    }
    case "mark_unquantified":
      return { ok: true, value: { kind: "mark_unquantified" } };
    default:
      return { ok: false, detail: "unreachable" };
  }
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

  const ingredientLabel = body.ingredientLabel;
  if (typeof ingredientLabel !== "string" || ingredientLabel.trim() === "") {
    return json({ error: "ingredientLabel_required", detail: "ingredientLabel must be a non-empty string" }, 400);
  }

  const parsedResolution = parseResolution(body.resolution);
  if (!parsedResolution.ok) {
    return json({ error: "resolution_invalid", detail: parsedResolution.detail }, 400);
  }

  const notes = typeof body.notes === "string" ? body.notes.slice(0, 4000) : null;
  const adminActor = typeof body.adminActor === "string" ? body.adminActor.slice(0, 200) : null;

  try {
    const client = getSupabaseAdminClient();
    const result = await resolveNutritionUnresolved(client, {
      jobId,
      ingredientLabel,
      resolution: parsedResolution.value,
      notes,
      adminActor,
    });
    return json(result, statusFor(result));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_NUTRITION_RESOLVE_UNEXPECTED_ERROR", retryable: true });
    const notFound = error.message.includes("ADMIN_NUTRITION_RESOLVE_NO_DRAFT");
    console.error("admin-recipe-nutrition-resolve unexpected error", error);
    return json({ error: error.code, message: error.message }, notFound ? 404 : 500);
  }
});
