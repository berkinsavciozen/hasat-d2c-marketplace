// DECOMMISSIONED — one-off legacy image backfill for the 10 pre-F2 recipes published 2026-07-30
// (incir-receli, kekikli-zeytinyagi-ezmesi, koz-biber-patlican-ezmesi, mercimek-corbasi,
// nohut-falafel, taze-uzum-cevizli-yesil-salata, vegan-findik-kremasi, zeytinyagli-bugday-salatasi,
// zeytinyagli-mercimek-koftesi, zeytinyagli-nohut-yemegi). None of them ever had a
// recipe_generation_jobs row, so recipe-stage-image (the real F2 pipeline's image stage) could
// never run for them — they were falling back to their key ingredient's generic crop photo instead
// of a real photo of the cooked dish. This function reused the pure/single-purpose image building
// blocks from the F2 image pipeline (prompt.ts, gemini-client.ts, geometry.ts, webp-codec.ts,
// storage.ts — imported via pinned raw.githubusercontent.com URLs, never the job/draft state
// machine itself) to generate, crop, encode and store a real cover photo for each of the 10, then
// set recipes.cover_photo_url directly. It ran successfully against all 10 recipes (one real Gemini
// call each; three recipe_assets rows — source/hero/square — per recipe, all in the crop-photos
// bucket) and has been decommissioned since — see the git history of this file for the working
// version.
//
// Also decommissioned/dropped: its one-off bearer-token auth table,
// public.legacy_recipe_image_backfill_auth (20260904090000, dropped in 20260904093000) — see this
// file's git history for why it existed (the operator had full service-role Postgres access but no
// way to read or provision an Edge Function secret to gate this endpoint the usual way).
//
// Neutered since the MCP tooling available has no direct "delete function" call. Safe to delete via
// `supabase functions delete legacy-recipe-image-backfill` or the dashboard.
Deno.serve(() => new Response(JSON.stringify({ status: "decommissioned" }), { status: 410, headers: { "content-type": "application/json" } }));
