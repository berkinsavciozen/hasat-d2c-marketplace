// F2 Recipe Automation — recipe-stage-sweep Edge Function.
//
// Periodic retry/stale-lock reconciliation. Thin by design, same convention as every other
// stage-runner entrypoint: the real logic lives in
// ../_shared/recipe-automation/infra/sweep.ts so it can be unit-tested without an HTTP layer at
// all; this file only does request handling and response shaping. See sweep.ts's own header for
// exactly what gap this closes and why.
//
// Auth: deliberately DIFFERENT from its recipe-stage-* siblings. Those are gated by
// RECIPE_STAGE_DISPATCH_SECRET (an Edge-Function-only secret, read via Deno.env, never duplicated
// into Postgres) compared against a caller-supplied `x-admin-key` header. This function instead
// keeps `verify_jwt: true` (Supabase's own platform-level JWT check) because its ONLY intended
// caller is pg_cron's own `net.http_post`, authenticated with the project's anon/service-role API
// key — the exact same pattern the pre-existing `sync-izmir-hal-prices` cron job already uses to
// call an Edge Function on a schedule. This avoids a real regression the alternative (embedding
// RECIPE_STAGE_DISPATCH_SECRET directly in cron.job.command so pg_cron could pass it as
// `x-admin-key`) would introduce: `cron.job.command` is plaintext, readable by anyone with SELECT
// on `cron.job` — that secret lives in exactly one place today (Edge Function env), and it should
// stay there.
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runRetrySweep } from "../_shared/recipe-automation/infra/sweep.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const client = getSupabaseAdminClient();
    const result = await runRetrySweep(client);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "RETRY_SWEEP_UNEXPECTED_ERROR", retryable: true });
    console.error("recipe-stage-sweep unexpected error", error);
    return new Response(JSON.stringify({ error: error.code, message: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
