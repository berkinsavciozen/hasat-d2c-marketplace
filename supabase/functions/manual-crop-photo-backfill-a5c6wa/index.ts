// [T4-CROP-PHOTO] ONE-OFF BACKFILL — NOT part of the F2 Recipe Automation pipeline.
//
// Why this exists: `crop_config` has 70 rows, 27 of which already have `default_photo_url` set
// (all named `${slugifyTitle(crop)}.webp` in the existing `crop-photos` bucket — verified against
// live data). The remaining ~43 have no default catalog photo. Berkin asked for all of them (not
// just the ones with real UI impact) to be closed, following the same discipline T4-A3 used for
// sumac/rice/pul_biber: fill what can be filled with a real, trustworthy single photo; explicitly
// skip and document what can't (see SKIP_CROPS below).
//
// What this does NOT do: it never touches the F2 job/draft/recipe_generation_* state machine
// (job-lock.ts, job-state.ts, stage-dispatch.ts, telemetry.ts, image-stage.ts), never writes
// `recipe_assets` rows (that table's schema is recipe-scoped, not crop-scoped, and out of this
// task's touchable-paths list), and never modifies a `crop_config` row that already has a photo —
// every write is a guarded `UPDATE ... WHERE crop = $1 AND default_photo_url IS NULL`, so this is
// safe to re-run: an already-filled crop is always skipped, never overwritten, and a
// half-finished run can simply be invoked again with the remaining crops.
//
// Reuses the F2 image pipeline's pure/single-purpose building blocks (prompt.ts's new
// `buildCropDefaultPhotoPrompt`, gemini-client.ts, geometry.ts, webp-codec.ts,
// frame-suspicion.ts, storage.ts, writer/slug.ts) via pinned raw.githubusercontent.com imports at
// a fixed commit on this task's own branch — never the mutable local/relative path, so this
// function's behavior can't silently drift if the pipeline files change under it before this is
// decommissioned. Only a single 1:1 square crop is produced per crop (not the recipe pipeline's
// 16:9 hero + 1:1 square pair) — a crop's default catalog photo has no hero-image use case.
//
// Auth: two independent gates, since this triggers real paid Gemini calls and writes to
// `crop_config` + the `crop-photos` bucket:
//   1. `verify_jwt=true` at the Supabase Edge Functions layer (a valid anon/service-role JWT).
//   2. An `x-backfill-token` header, checked here as a SHA-256 hash comparison — this function was
//      deployed with only the *hash* of a token generated once for this task; the plaintext was
//      never committed anywhere and lives only with whoever generated it. This sidesteps needing
//      access to (or minting) a new long-lived `ADMIN_DASHBOARD_KEY`-style project secret for a
//      script meant to run a handful of times and then be neutered — see the decommission stub
//      this file will be replaced with when the task is done (same pattern as
//      manual-test-f2s16-plan-batch/index.ts and legacy-recipe-image-backfill/index.ts).
//
// Lifecycle: run once as a 5-crop pilot batch (dryRun, then real) for review, then — after
// orchestrator/Berkin sign-off — against the remaining crops, then neutered into a 410
// "decommissioned" stub. Not left live as a callable endpoint.
import { getSupabaseAdminClient } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/infra/supabase-admin.ts";
import { buildCropDefaultPhotoPrompt } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/image/prompt.ts";
import { LovableGeminiImageGenerator } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/image/gemini-client.ts";
import { chopAndCrop, decodeSourceImage } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/image/geometry.ts";
import { encodeWebp, hasMetadataChunk } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/image/webp-codec.ts";
import { detectFrameSuspicion } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/image/frame-suspicion.ts";
import { SupabaseImageStorageUploader } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/image/storage.ts";
import { slugifyTitle } from "https://raw.githubusercontent.com/berkinsavciozen/hasat-d2c-marketplace/bed7648fa7f50f07a401a0d87116bbf4ab3514f7/supabase/functions/_shared/recipe-automation/writer/slug.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-backfill-token, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

// Mirrors recipeImageSpecSchema's fixed Gate-A-decided constants (schemas.ts) — duplicated here
// as literals rather than importing schemas.ts (a large shared zod-schema module with many
// unrelated exports) purely to keep this one-off's dependency surface minimal.
const IMAGE_CHOP_FRACTION = 0.14;
const IMAGE_DEFAULT_WEBP_QUALITY = 82;

const IMAGE_MODEL_ENV_VAR = "RECIPE_IMAGE_MODEL";
const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";

/** SHA-256 of a one-off invocation token generated for this task and never committed in
 * plaintext. See this file's header — this is the second of two independent auth gates. */
const TOKEN_SHA256_HEX = "28d945431453854ee6cfec3228ad8ba9ad872559a672feaa26eabd68475d5bdd";

/** Category/collective names, not a single photographable plant or product — per the task's
 * explicit "skip ambiguous crops, don't fabricate a representative photo" instruction (same
 * family as T4-A3 leaving sumac/rice/pul_biber deliberately blank for "no trustworthy data"). */
const SKIP_CROPS: Record<string, string> = {
  "tıbbi bitkiler": "Category name ('medicinal herbs'), not a single plant — no one photo can " +
    "honestly represent it. Left for a human to either pick a specific representative species or " +
    "leave uncatalogued.",
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

interface CropRow {
  crop: string;
  display_name: string;
}

type CropOutcome =
  | { crop: string; outcome: "skipped_category"; reason: string }
  | { crop: string; outcome: "dry_run_would_generate"; prompt: string }
  | { crop: string; outcome: "skipped_already_has_photo" }
  | {
    crop: string;
    outcome: "generated";
    publicUrl: string;
    storagePath: string;
    prompt: string;
    sourceWidthPx: number;
    sourceHeightPx: number;
    frameSuspicious: boolean;
    frameSuspicionReason: string | null;
    frameUniformity: number;
    provider: string;
    model: string;
    requestId: string | null;
  }
  | { crop: string; outcome: "error"; error: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const providedToken = req.headers.get("x-backfill-token") ?? "";
  if (!providedToken) return json({ error: "unauthorized" }, 401);
  const providedHash = await sha256Hex(providedToken);
  if (!timingSafeEqual(providedHash, TOKEN_SHA256_HEX)) return json({ error: "forbidden" }, 403);

  let body: unknown = {};
  const rawBody = await req.text();
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid_json_body" }, 400);
    }
  }

  const dryRun = (body as { dryRun?: unknown })?.dryRun === true;
  const requestedCrops = (body as { crops?: unknown })?.crops;
  const cropFilter = Array.isArray(requestedCrops) && requestedCrops.every((c) => typeof c === "string")
    ? new Set(requestedCrops as string[])
    : null; // null = no narrowing, run every crop currently missing a photo

  try {
    const client = getSupabaseAdminClient();

    // Always the live, current null-set — never a hardcoded list — so a re-run naturally picks up
    // exactly what's still missing, including crops filled by a previous partial run.
    const { data: nullRows, error: readError } = await client
      .from("crop_config")
      .select("crop, display_name")
      .is("default_photo_url", null)
      .order("crop");
    if (readError) throw new Error(`crop_config null-set read failed: ${readError.message}`);

    const candidateRows = (nullRows as CropRow[]).filter((row) => cropFilter === null || cropFilter.has(row.crop));

    const imageGenerator = new LovableGeminiImageGenerator();
    const storage = new SupabaseImageStorageUploader(client);
    const modelId = Deno.env.get(IMAGE_MODEL_ENV_VAR) || DEFAULT_MODEL_ID;

    const results: CropOutcome[] = [];
    let totalGeminiCalls = 0;

    for (const row of candidateRows) {
      const skipReason = SKIP_CROPS[row.crop];
      if (skipReason) {
        results.push({ crop: row.crop, outcome: "skipped_category", reason: skipReason });
        continue;
      }

      try {
        const prompt = buildCropDefaultPhotoPrompt(row.crop, row.display_name);

        if (dryRun) {
          results.push({ crop: row.crop, outcome: "dry_run_would_generate", prompt });
          continue;
        }

        const generated = await imageGenerator.generate({ prompt, modelId });
        totalGeminiCalls++;

        const decodedSource = await decodeSourceImage(generated.bytes);
        const crops = chopAndCrop(decodedSource, IMAGE_CHOP_FRACTION);
        const squareWebp = await encodeWebp(crops.square, IMAGE_DEFAULT_WEBP_QUALITY);
        if (hasMetadataChunk(squareWebp)) {
          throw new Error(`encoded WebP for ${row.crop} unexpectedly carries a metadata chunk`);
        }

        const frame = detectFrameSuspicion(crops.square);
        const storagePath = `${slugifyTitle(row.crop)}.webp`;
        const upload = await storage.upload(storagePath, squareWebp, "image/webp");

        // The idempotency + never-overwrite guarantee lives in this WHERE clause, not in a
        // separate pre-check: if another invocation filled this crop between the read above and
        // this write, zero rows match and this crop is reported as already handled instead of
        // silently overwriting a value someone else just set.
        const { data: updated, error: updateError } = await client
          .from("crop_config")
          .update({ default_photo_url: upload.publicUrl })
          .eq("crop", row.crop)
          .is("default_photo_url", null)
          .select("crop");
        if (updateError) throw new Error(`crop_config update failed for ${row.crop}: ${updateError.message}`);

        if (!updated || updated.length === 0) {
          results.push({ crop: row.crop, outcome: "skipped_already_has_photo" });
          continue;
        }

        results.push({
          crop: row.crop,
          outcome: "generated",
          publicUrl: upload.publicUrl,
          storagePath,
          prompt,
          sourceWidthPx: generated.widthPx,
          sourceHeightPx: generated.heightPx,
          frameSuspicious: frame.suspicious,
          frameSuspicionReason: frame.reason,
          frameUniformity: frame.uniformity,
          provider: generated.provider,
          model: generated.model,
          requestId: generated.requestId,
        });
      } catch (e) {
        results.push({ crop: row.crop, outcome: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({
      dryRun,
      modelId,
      candidateCount: candidateRows.length,
      totalGeminiCalls,
      results,
    });
  } catch (e) {
    console.error("manual-crop-photo-backfill-a5c6wa unexpected error", e);
    return json({ error: "unexpected_error", message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
