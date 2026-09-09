// DECOMMISSIONED — one-off `crop_config.default_photo_url` backfill for T4-CROP-PHOTO. Ran
// successfully against all 42 targetable crops missing a photo (one, `tıbbi bitkiler`, was
// deliberately skipped as a category name rather than a single photographable plant; one, "pamuk",
// needed a diagnosed Gemini-safety-filter workaround — see the PR description for the full
// skip/override log). `crop_config` now has `default_photo_url` set for 69/70 rows. Neutered since
// the MCP tooling available has no direct "delete function" call. Safe to delete via
// `supabase functions delete manual-crop-photo-backfill-a5c6wa` or the dashboard. See this file's
// git history for the working version.
Deno.serve(() => new Response(JSON.stringify({ status: "decommissioned" }), { status: 410, headers: { "content-type": "application/json" } }));
