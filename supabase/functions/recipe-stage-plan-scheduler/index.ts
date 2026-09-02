// F2 Recipe Automation — Step 15: recipe-stage-plan-scheduler Edge Function.
//
// The periodic trigger for a brand-new Planner batch. pg_cron's `recipe-stage-plan-weekly` job
// (f2s15 migration) calls this on a schedule with a fixed default RecipeBatchInput — targetCount
// is intentionally not configurable from the admin dashboard yet (see f2s15's own header).
//
// Auth: deliberately the SAME convention as recipe-stage-sweep, not its `x-admin-key`-gated
// recipe-stage-* siblings. This keeps `verify_jwt` at the platform default (true — no entry in
// supabase/config.toml, same as recipe-stage-sweep itself) because its only intended caller is
// pg_cron's own `net.http_post`, authenticated with the project's anon API key. This avoids the
// same regression recipe-stage-sweep's own header documents: `cron.job.command` is plaintext,
// readable by anyone with SELECT on `cron.job`, so RECIPE_STAGE_DISPATCH_SECRET must never be
// embedded there — this function never reads that env var at all, and calls `runPlanStage`
// directly, in-process, the same shape admin-recipe-plan-create/recipe-stage-write use.
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { runPlanStage } from "../_shared/recipe-automation/plan/plan-stage.ts";
import { toSafeErrorPayload } from "../_shared/recipe-automation/infra/errors.ts";

// Fixed weekly default — deliberately not read from the request body (pg_cron's own call carries
// no payload beyond '{}'). targetCount stays hard-coded at 5 this round; parametrizing it from the
// admin dashboard is explicitly out of scope for this step (see the task brief).
const DEFAULT_WEEKLY_BATCH_INPUT = {
  targetCount: 5,
  focusCrops: null,
  dietFocus: [] as string[],
  locale: "tr",
  notes: "Haftalık otomatik plan",
};

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const client = getSupabaseAdminClient();
    const result = await runPlanStage(client, { batchInput: DEFAULT_WEEKLY_BATCH_INPUT });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "RECIPE_STAGE_PLAN_SCHEDULER_UNEXPECTED_ERROR",
      stage: "plan",
      retryable: true,
    });
    console.error("recipe-stage-plan-scheduler unexpected error", error);
    return new Response(JSON.stringify({ error: error.code, message: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
