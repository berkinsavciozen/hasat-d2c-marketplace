// F2 Recipe Automation — Step 15: admin-recipe-plan-schedule Edge Function.
//
// Lets an admin read/change how often the weekly Planner cron job (f2s15's
// `recipe-stage-plan-weekly`, pg_cron) fires. Same human-facing admin-dashboard auth convention as
// every other admin-recipe-* function — timing-safe `x-admin-key` compared against
// `ADMIN_DASHBOARD_KEY`. RECIPE_STAGE_DISPATCH_SECRET is never read or referenced here.
//
// POST never accepts a free-text cron expression: the request is checked against a fixed 3-preset
// allow-list (weekly / monthly / off) BEFORE it ever reaches Postgres, and the
// `set_recipe_plan_schedule` RPC (f2s15 migration) re-validates the exact same allow-list itself —
// this Edge Function is deliberately never the only thing standing between a caller and an
// arbitrary `cron.job` mutation. Reads/writes go through two narrow SECURITY DEFINER RPCs because
// `cron.job` lives in the `cron` extension schema, which service_role has no direct grant on
// (unlike every application table in `public`, where service_role's own `rolbypassrls` already
// covers access — see the f2s04 migration's own SECURITY INVOKER reasoning for the contrast).
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

/** The ONLY cron expressions this endpoint will ever apply, plus the "off" sentinel — mirrors the
 * `_allowed_schedules` allow-list inside `set_recipe_plan_schedule` (f2s15 migration) exactly. */
const PRESETS = {
  weekly: "0 6 * * 1",
  monthly: "0 6 1 * *",
  off: "off",
} as const;
type PresetKey = keyof typeof PRESETS;
const PRESET_CRON_VALUES = new Set<string>([PRESETS.weekly, PRESETS.monthly, PRESETS.off]);

function presetFor(schedule: string | null, active: boolean): PresetKey | "custom" {
  if (!active) return "off";
  if (schedule === PRESETS.weekly) return "weekly";
  if (schedule === PRESETS.monthly) return "monthly";
  return "custom";
}

type ScheduleRow = { schedule: string; active: boolean };

async function readSchedule(client: ReturnType<typeof getSupabaseAdminClient>) {
  const { data, error } = await client.rpc("get_recipe_plan_schedule");
  if (error) throw error;
  const row = (data as ScheduleRow[] | null)?.[0] ?? null;
  return {
    schedule: row?.schedule ?? null,
    active: row?.active ?? false,
    preset: row ? presetFor(row.schedule, row.active) : "off",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  try {
    const client = getSupabaseAdminClient();

    if (req.method === "GET") {
      return json(await readSchedule(client));
    }

    let body: { cronExpression?: unknown };
    try {
      body = (await req.json()) as { cronExpression?: unknown };
    } catch {
      return json({ error: "invalid_json_body" }, 400);
    }

    const cronExpression = body.cronExpression;
    if (typeof cronExpression !== "string" || !PRESET_CRON_VALUES.has(cronExpression)) {
      return json(
        { error: "invalid_cron_expression", detail: `cronExpression must be one of ${[...PRESET_CRON_VALUES].join(", ")}` },
        400,
      );
    }

    const active = cronExpression !== PRESETS.off;
    const { error: rpcError } = await client.rpc("set_recipe_plan_schedule", {
      _cron: active ? cronExpression : null,
      _active: active,
    });
    if (rpcError) throw rpcError;

    return json(await readSchedule(client));
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_PLAN_SCHEDULE_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-plan-schedule unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
});
