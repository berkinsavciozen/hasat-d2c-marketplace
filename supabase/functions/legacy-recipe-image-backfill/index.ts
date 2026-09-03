// ONE-OFF BACKFILL — NOT part of the F2 Recipe Automation pipeline.
//
// Why this exists: 10 recipes published 2026-07-30 (before the F2 pipeline existed) have
// `cover_photo_url IS NULL` and zero `recipe_assets` rows — they were never routed through any
// `recipe_generation_jobs` row, so `recipe-stage-image` (image/image-stage.ts) can never be called
// for them: `claimJob({ expectedStage: 'image' })`, `loadApprovedQaResult` and
// `loadDraftForImaging` (image/context.ts) all hard-require an existing job/draft/QA-result row
// that these recipes never had and never will. The client's fallback chain (cover -> key
// ingredient's crop photo -> neutral placeholder) means they currently render a generic raw-crop
// stock photo, not a photo of the actual cooked dish.
//
// What this does NOT do: it never touches image-stage.ts, job-lock.ts, job-state.ts,
// stage-dispatch.ts or telemetry.ts (the real pipeline state machine), and never calls
// publish-stage.ts / the `publish_recipe_draft` RPC (that RPC creates a NEW `recipes` row from an
// approved draft; these 10 recipes already exist and are already published — only their
// `cover_photo_url` needs to change). It only reuses the pure/single-purpose image building blocks
// (prompt.ts, gemini-client.ts, geometry.ts, webp-codec.ts, storage.ts) directly, driven by an
// in-memory draft-shaped object built from each recipe's REAL live recipes/recipe_ingredients/
// recipe_steps rows — not from any recipe_drafts content.
//
// The `recipe_assets` NOT NULL job_id/draft_id FK (see 20260819120000_f2s03 migration) still has to
// be satisfied somehow. Rather than a migration loosening that constraint (a real schema change
// for a one-off), this creates ONE synthetic "legacy backfill" batch+job+draft row, shared by all
// 10 recipes' asset rows (each asset row still carries its own REAL recipe_id, so it is never
// ambiguous which recipe an asset belongs to — the synthetic job/draft only exist to satisfy the
// FK). That job is created with status='completed' (a TERMINAL status) specifically so
// `recipe-stage-sweep`'s three candidate queries (infra/sweep.ts: status='retryable',
// status='running' with an expired lock, or stage='awaiting_approval'+status='approved') can never
// match it — it is inert to the real pipeline by construction, not by convention.
//
// Auth: same shared-secret convention as admin-kpi/admin-recipe-*/RECIPE_STAGE_DISPATCH_SECRET
// stage-runners (infra/admin-auth.ts) — ADMIN_DASHBOARD_KEY via the `x-admin-key` header. Only a
// human operator with that key can trigger this, never an end-user client.
//
// Lifecycle: meant to run ONCE against the 10 recipes named below, then be neutered into a 410
// "decommissioned" stub (same pattern as manual-test-f2s16-plan-batch/index.ts and
// notify-admin-era one-offs) — see the git history of this file for the pre-decommission version
// if it ever needs to be consulted again. Not left live as a callable endpoint.
import { requireSharedSecret } from "../_shared/recipe-automation/infra/admin-auth.ts";
import { getSupabaseAdminClient, type SupabaseClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { buildImagePrompt } from "../_shared/recipe-automation/image/prompt.ts";
import type { ImageStageDraft } from "../_shared/recipe-automation/image/context.ts";
import { LovableGeminiImageGenerator } from "../_shared/recipe-automation/image/gemini-client.ts";
import { chopAndCrop, decodeSourceImage } from "../_shared/recipe-automation/image/geometry.ts";
import { encodeWebp, hasMetadataChunk } from "../_shared/recipe-automation/image/webp-codec.ts";
import { detectFrameSuspicion } from "../_shared/recipe-automation/image/frame-suspicion.ts";
import { SupabaseImageStorageUploader } from "../_shared/recipe-automation/image/storage.ts";
import { extensionForMimeType, sniffImageMimeType } from "../_shared/recipe-automation/image/mime-sniff.ts";
import {
  IMAGE_CHOP_FRACTION,
  IMAGE_DEFAULT_WEBP_QUALITY,
  IMAGE_GEOMETRY_ENGINE,
  IMAGE_STORAGE_BUCKET,
} from "../_shared/recipe-automation/schemas.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, content-type",
  "Access-Control-Max-Age": "86400",
};

/** Fixed, hardcoded on purpose — this script must never touch any recipe outside this exact set,
 * regardless of what a request body says. `slugs` in the request body (see below) can only ever
 * narrow this list, never extend it. */
const TARGET_SLUGS = [
  "incir-receli",
  "kekikli-zeytinyagi-ezmesi",
  "koz-biber-patlican-ezmesi",
  "mercimek-corbasi",
  "nohut-falafel",
  "taze-uzum-cevizli-yesil-salata",
  "vegan-findik-kremasi",
  "zeytinyagli-bugday-salatasi",
  "zeytinyagli-mercimek-koftesi",
  "zeytinyagli-nohut-yemegi",
] as const;

const LEGACY_MARKER =
  "LEGACY IMAGE BACKFILL — F2 pre-pipeline recipes (published 2026-07-30, never had a " +
  "recipe_generation_jobs row). See supabase/functions/legacy-recipe-image-backfill/index.ts, " +
  "branch claude/legacy-recipe-image-generation-um9du2. This batch/job/draft exist ONLY to satisfy " +
  "recipe_assets' NOT NULL job_id/draft_id FK — they carry no real generation content and must " +
  "never be claimed or swept by the real pipeline (status is a terminal 'completed').";

const IMAGE_MODEL_ENV_VAR = "RECIPE_IMAGE_MODEL";
const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

interface LegacyContext {
  batchId: string;
  jobId: string;
  draftId: string;
}

/** Idempotent: safe to call on every invocation. Finds the existing synthetic batch/job/draft by
 * their marker text before creating new ones, so re-running this function never accumulates
 * duplicate legacy rows. */
async function getOrCreateLegacyContext(client: SupabaseClient): Promise<LegacyContext> {
  const nowIso = new Date().toISOString();

  let batchId: string;
  const { data: existingBatch, error: batchReadError } = await client
    .from("recipe_generation_batches")
    .select("id")
    .eq("notes", LEGACY_MARKER)
    .maybeSingle();
  if (batchReadError) throw new Error(`legacy batch lookup failed: ${batchReadError.message}`);

  if (existingBatch) {
    batchId = String((existingBatch as { id: string }).id);
  } else {
    const { data: batch, error } = await client
      .from("recipe_generation_batches")
      .insert({
        target_count: 1,
        diet_focus: [],
        notes: LEGACY_MARKER,
        status: "completed",
        started_at: nowIso,
        completed_at: nowIso,
      })
      .select("id")
      .single();
    if (error || !batch) throw new Error(`legacy batch create failed: ${error?.message}`);
    batchId = String((batch as { id: string }).id);
  }

  let jobId: string;
  const { data: existingJob, error: jobReadError } = await client
    .from("recipe_generation_jobs")
    .select("id")
    .eq("batch_id", batchId)
    .eq("working_title", LEGACY_MARKER)
    .maybeSingle();
  if (jobReadError) throw new Error(`legacy job lookup failed: ${jobReadError.message}`);

  if (existingJob) {
    jobId = String((existingJob as { id: string }).id);
  } else {
    const { data: job, error } = await client
      .from("recipe_generation_jobs")
      .insert({
        batch_id: batchId,
        brief_id: crypto.randomUUID(),
        working_title: LEGACY_MARKER,
        // Terminal stage+status pair — see this file's header for why 'completed' specifically
        // (recipe-stage-sweep's candidate queries only ever match 'retryable'/'running'/
        // ('awaiting_approval'+'approved'), never 'completed').
        stage: "publish",
        status: "completed",
        started_at: nowIso,
        finished_at: nowIso,
        completed_at: nowIso,
      })
      .select("id")
      .single();
    if (error || !job) throw new Error(`legacy job create failed: ${error?.message}`);
    jobId = String((job as { id: string }).id);
  }

  let draftId: string;
  const { data: existingDraft, error: draftReadError } = await client
    .from("recipe_drafts")
    .select("id")
    .eq("job_id", jobId)
    .eq("version", 1)
    .maybeSingle();
  if (draftReadError) throw new Error(`legacy draft lookup failed: ${draftReadError.message}`);

  if (existingDraft) {
    draftId = String((existingDraft as { id: string }).id);
  } else {
    const { data: draft, error } = await client
      .from("recipe_drafts")
      .insert({
        job_id: jobId,
        version: 1,
        title: LEGACY_MARKER,
        // Placeholder content only — satisfies the NOT NULL / jsonb-array-length>=1 CHECKs.
        // Never read by this script: each recipe's actual prompt is built in-memory from that
        // recipe's own real, live recipes/recipe_ingredients/recipe_steps rows (see
        // buildDraftForRecipe below), not from this row.
        ingredients: [{
          crop: null,
          freeTextName: "legacy-backfill-placeholder",
          quantity: null,
          unit: null,
          note: null,
          isKeyIngredient: false,
          ingredientClass: null,
          sortOrder: 0,
        }],
        steps: [{
          stepNo: 1,
          instruction: "Legacy image backfill placeholder draft — carries no real recipe content.",
          photoUrl: null,
          timerSeconds: null,
        }],
      })
      .select("id")
      .single();
    if (error || !draft) throw new Error(`legacy draft create failed: ${error?.message}`);
    draftId = String((draft as { id: string }).id);
  }

  return { batchId, jobId, draftId };
}

interface RecipeRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cuisine: string | null;
  cover_photo_url: string | null;
  status: string;
}

interface IngredientRow {
  crop: string | null;
  free_text_name: string | null;
  quantity: string | number | null;
  unit: string | null;
  note: string | null;
  is_key_ingredient: boolean;
  ingredient_class: string | null;
  sort_order: number;
}

interface StepRow {
  step_no: number;
  instruction: string;
  photo_url: string | null;
  timer_seconds: number | null;
}

/** Builds the exact `ImageStageDraft` shape `buildImagePrompt()` expects, from a recipe's REAL
 * live rows — not from the synthetic legacy draft row (which is only an FK placeholder, see
 * getOrCreateLegacyContext's comment). `draftId` here is the synthetic draft's id purely because
 * `ImageStageDraft.id` has to be some string; buildImagePrompt() never reads it. */
function buildDraftForRecipe(
  recipe: RecipeRow,
  draftId: string,
  ingredientRows: IngredientRow[],
  stepRows: StepRow[],
): ImageStageDraft {
  return {
    id: draftId,
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    ingredients: ingredientRows.map((row) => ({
      crop: row.crop,
      freeTextName: row.free_text_name,
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: row.unit,
      note: row.note,
      isKeyIngredient: row.is_key_ingredient,
      ingredientClass: row.ingredient_class as never,
      sortOrder: row.sort_order,
    })),
    steps: stepRows.map((row) => ({
      stepNo: row.step_no,
      instruction: row.instruction,
      photoUrl: row.photo_url,
      timerSeconds: row.timer_seconds,
    })),
  };
}

type RecipeOutcome =
  | { slug: string; outcome: "recipe_not_found" }
  | { slug: string; outcome: "skipped_not_published"; status: string }
  | { slug: string; outcome: "skipped_already_has_cover"; coverPhotoUrl: string }
  | { slug: string; outcome: "skipped_assets_exist"; existingAssetTypes: string[] }
  | { slug: string; outcome: "skipped_missing_ingredients_or_steps" }
  | { slug: string; outcome: "dry_run_would_generate"; recipeId: string; prompt: string }
  | {
    slug: string;
    outcome: "generated";
    recipeId: string;
    heroUrl: string;
    squareUrl: string;
    sourcePath: string;
    heroFrameSuspicious: boolean;
    squareFrameSuspicious: boolean;
  }
  | { slug: string; outcome: "error"; error: string };

async function processRecipe(
  client: SupabaseClient,
  slug: string,
  context: LegacyContext,
  imageGenerator: LovableGeminiImageGenerator,
  storage: SupabaseImageStorageUploader,
  modelId: string,
  dryRun: boolean,
): Promise<{ outcome: RecipeOutcome; geminiCalls: number }> {
  const { data: recipe, error: recipeError } = await client
    .from("recipes")
    .select("id, slug, title, description, cuisine, cover_photo_url, status")
    .eq("slug", slug)
    .maybeSingle();
  if (recipeError) throw new Error(`recipes lookup failed for ${slug}: ${recipeError.message}`);
  if (!recipe) return { outcome: { slug, outcome: "recipe_not_found" }, geminiCalls: 0 };

  const recipeRow = recipe as RecipeRow;
  if (recipeRow.status !== "published") {
    return { outcome: { slug, outcome: "skipped_not_published", status: recipeRow.status }, geminiCalls: 0 };
  }
  if (recipeRow.cover_photo_url) {
    return {
      outcome: { slug, outcome: "skipped_already_has_cover", coverPhotoUrl: recipeRow.cover_photo_url },
      geminiCalls: 0,
    };
  }

  const { data: existingAssets, error: assetsReadError } = await client
    .from("recipe_assets")
    .select("asset_type")
    .eq("recipe_id", recipeRow.id)
    .in("asset_type", ["source", "hero", "square"]);
  if (assetsReadError) throw new Error(`recipe_assets lookup failed for ${slug}: ${assetsReadError.message}`);
  if (existingAssets && existingAssets.length >= 3) {
    return {
      outcome: {
        slug,
        outcome: "skipped_assets_exist",
        existingAssetTypes: (existingAssets as Array<{ asset_type: string }>).map((r) => r.asset_type),
      },
      geminiCalls: 0,
    };
  }

  const { data: ingredientRows, error: ingredientsError } = await client
    .from("recipe_ingredients")
    .select("crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class, sort_order")
    .eq("recipe_id", recipeRow.id)
    .order("sort_order");
  if (ingredientsError) throw new Error(`recipe_ingredients lookup failed for ${slug}: ${ingredientsError.message}`);

  const { data: stepRows, error: stepsError } = await client
    .from("recipe_steps")
    .select("step_no, instruction, photo_url, timer_seconds")
    .eq("recipe_id", recipeRow.id)
    .order("step_no");
  if (stepsError) throw new Error(`recipe_steps lookup failed for ${slug}: ${stepsError.message}`);

  if (!ingredientRows?.length || !stepRows?.length) {
    return { outcome: { slug, outcome: "skipped_missing_ingredients_or_steps" }, geminiCalls: 0 };
  }

  const draft = buildDraftForRecipe(
    recipeRow,
    context.draftId,
    ingredientRows as IngredientRow[],
    stepRows as StepRow[],
  );
  const prompt = buildImagePrompt(draft);

  if (dryRun) {
    return { outcome: { slug, outcome: "dry_run_would_generate", recipeId: recipeRow.id, prompt }, geminiCalls: 0 };
  }

  const generated = await imageGenerator.generate({ prompt, modelId });

  const decodedSource = await decodeSourceImage(generated.bytes);
  const crops = chopAndCrop(decodedSource, IMAGE_CHOP_FRACTION);
  const [heroWebp, squareWebp] = await Promise.all([
    encodeWebp(crops.hero, IMAGE_DEFAULT_WEBP_QUALITY),
    encodeWebp(crops.square, IMAGE_DEFAULT_WEBP_QUALITY),
  ]);
  for (const bytes of [heroWebp, squareWebp]) {
    if (hasMetadataChunk(bytes)) {
      throw new Error(`encoded WebP for ${slug} unexpectedly carries a metadata chunk`);
    }
  }

  const sourceMimeType = sniffImageMimeType(generated.bytes);
  const sourceExt = extensionForMimeType(sourceMimeType);
  const sourcePath = `${slug}-source.${sourceExt}`;
  const heroPath = `${slug}-16x9.webp`;
  const squarePath = `${slug}-1x1.webp`;

  await storage.upload(sourcePath, generated.bytes, sourceMimeType);
  const heroUpload = await storage.upload(heroPath, heroWebp, "image/webp");
  const squareUpload = await storage.upload(squarePath, squareWebp, "image/webp");

  const processingParams = {
    chopFraction: IMAGE_CHOP_FRACTION,
    cropAlignment: "center",
    geometryEngine: IMAGE_GEOMETRY_ENGINE,
    webpEncoder: "jsquash-webp",
    outputQuality: IMAGE_DEFAULT_WEBP_QUALITY,
  };
  const heroFrame = detectFrameSuspicion(crops.hero);
  const squareFrame = detectFrameSuspicion(crops.square);

  const insertAsset = async (row: Record<string, unknown>) => {
    const { error } = await client.from("recipe_assets").insert(row);
    if (error) throw new Error(`recipe_assets insert failed for ${slug}/${row.asset_type}: ${error.message}`);
  };

  await insertAsset({
    job_id: context.jobId,
    draft_id: context.draftId,
    recipe_id: recipeRow.id,
    asset_type: "source",
    storage_bucket: IMAGE_STORAGE_BUCKET,
    storage_path: sourcePath,
    content_type: sourceMimeType,
    width_px: generated.widthPx,
    height_px: generated.heightPx,
    source_width_px: generated.widthPx,
    source_height_px: generated.heightPx,
    prompt,
    processing_params: processingParams,
    provider: generated.provider,
    model: generated.model,
    trace_id: generated.requestId,
  });
  await insertAsset({
    job_id: context.jobId,
    draft_id: context.draftId,
    recipe_id: recipeRow.id,
    asset_type: "hero",
    storage_bucket: IMAGE_STORAGE_BUCKET,
    storage_path: heroPath,
    content_type: "image/webp",
    width_px: crops.hero.width,
    height_px: crops.hero.height,
    source_width_px: generated.widthPx,
    source_height_px: generated.heightPx,
    quality: IMAGE_DEFAULT_WEBP_QUALITY,
    prompt,
    processing_params: processingParams,
    validation_status: heroFrame.suspicious ? "warning" : "passed",
    validation_results: heroFrame,
    provider: generated.provider,
    model: generated.model,
    trace_id: generated.requestId,
  });
  await insertAsset({
    job_id: context.jobId,
    draft_id: context.draftId,
    recipe_id: recipeRow.id,
    asset_type: "square",
    storage_bucket: IMAGE_STORAGE_BUCKET,
    storage_path: squarePath,
    content_type: "image/webp",
    width_px: crops.square.width,
    height_px: crops.square.height,
    source_width_px: generated.widthPx,
    source_height_px: generated.heightPx,
    quality: IMAGE_DEFAULT_WEBP_QUALITY,
    prompt,
    processing_params: processingParams,
    validation_status: squareFrame.suspicious ? "warning" : "passed",
    validation_results: squareFrame,
    provider: generated.provider,
    model: generated.model,
    trace_id: generated.requestId,
  });

  const { error: updateError } = await client
    .from("recipes")
    .update({ cover_photo_url: heroUpload.publicUrl })
    .eq("id", recipeRow.id);
  if (updateError) throw new Error(`recipes.cover_photo_url update failed for ${slug}: ${updateError.message}`);

  return {
    outcome: {
      slug,
      outcome: "generated",
      recipeId: recipeRow.id,
      heroUrl: heroUpload.publicUrl,
      squareUrl: squareUpload.publicUrl,
      sourcePath,
      heroFrameSuspicious: heroFrame.suspicious,
      squareFrameSuspicious: squareFrame.suspicious,
    },
    geminiCalls: 1,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

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
  const requestedSlugs = (body as { slugs?: unknown })?.slugs;
  // `slugs` in the request body can only ever NARROW the fixed target list — never extend it to
  // an arbitrary recipe. Anything not in TARGET_SLUGS is silently dropped, never processed.
  const slugsToRun = Array.isArray(requestedSlugs) && requestedSlugs.every((s) => typeof s === "string")
    ? TARGET_SLUGS.filter((s) => (requestedSlugs as string[]).includes(s))
    : TARGET_SLUGS;

  try {
    const client = getSupabaseAdminClient();
    const context = await getOrCreateLegacyContext(client);
    const imageGenerator = new LovableGeminiImageGenerator();
    const storage = new SupabaseImageStorageUploader(client);
    const modelId = Deno.env.get(IMAGE_MODEL_ENV_VAR) || DEFAULT_MODEL_ID;

    const results: RecipeOutcome[] = [];
    let totalGeminiCalls = 0;

    for (const slug of slugsToRun) {
      try {
        const { outcome, geminiCalls } = await processRecipe(
          client,
          slug,
          context,
          imageGenerator,
          storage,
          modelId,
          dryRun,
        );
        results.push(outcome);
        totalGeminiCalls += geminiCalls;
      } catch (e) {
        results.push({ slug, outcome: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({ context, dryRun, totalGeminiCalls, results });
  } catch (e) {
    console.error("legacy-recipe-image-backfill unexpected error", e);
    return json({ error: "unexpected_error", message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
