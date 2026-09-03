// DECOMMISSIONED — one-off verification proxy for F2-S16 (PR #83, real-world market signals for
// the Recipe Planner), used to manually trigger runPlanStage() in-process with a hardcoded
// targetCount of 3. It was protected only by verify_jwt=true — any valid Supabase anon/service
// key, a platform-level credential — rather than an app-level shared secret like x-admin-key or
// RECIPE_STAGE_DISPATCH_SECRET, so anyone holding a valid anon key could trigger a real, costly
// LLM recipe-planning batch. Neutered since the MCP tooling available has no direct "delete
// function" call. Safe to delete via `supabase functions delete manual-test-f2s16-plan-batch` or
// the dashboard.
Deno.serve(() => new Response(JSON.stringify({ status: "decommissioned" }), { status: 410, headers: { "content-type": "application/json" } }));
