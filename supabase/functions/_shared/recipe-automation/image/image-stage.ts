// F2 Recipe Automation — Step 09: recipe-stage-image orchestration (the Image vertical slice).
//
// Implements PROMPT 09's flow: claim an `image`-stage job, load the exact QA-approved draft
// (context.ts), build the Gemini prompt (prompt.ts — see its header for why this is deterministic,
// not an agent-runner call), generate (or reuse) one square source image, chop 14% + center-crop
// 16:9/1:1 (geometry.ts, `imagescript`), encode WebP q82 with metadata stripped by construction
// (webp-codec.ts, Gate B), run frame-suspicion as a warning-only check (frame-suspicion.ts), upload
// to the existing `crop-photos` bucket (storage.ts), store `recipe_assets` rows, and advance to
// `finalize` via `advanceStageAndDispatch` (same structural ordering guarantee every other stage
// uses).
//
// Idempotency (this step's explicit requirement): reuse a valid existing source/variant for the
// same job+draft+asset_type instead of paying for another Gemini generation. Three levels, checked
// in order: (1) hero AND square already exist -> nothing to do, just re-drive routing; (2) a
// 'source' asset already exists -> download and reuse it, skip the Gemini call, still (re)compute
// missing hero/square; (3) nothing exists -> full generate+process+upload+store flow.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { claimJob, releaseLock } from "../infra/job-lock.ts";
import { failJob } from "../infra/job-state.ts";
import { advanceStageAndDispatch } from "../infra/stage-dispatch.ts";
import { recordStageRun } from "../infra/telemetry.ts";
import { RecipeAutomationError, toSafeErrorPayload } from "../infra/errors.ts";
import {
  IMAGE_CHOP_FRACTION,
  IMAGE_DEFAULT_WEBP_QUALITY,
  IMAGE_GEOMETRY_ENGINE,
  IMAGE_STORAGE_BUCKET,
} from "../schemas.ts";
import { slugifyTitle } from "../writer/slug.ts";
import {
  loadApprovedQaResult,
  loadDraftForImaging,
  loadExistingImageAssets,
  type ExistingImageAssets,
} from "./context.ts";
import { buildImagePrompt } from "./prompt.ts";
import { type GeneratedImage, type ImageGenerator, LovableGeminiImageGenerator } from "./gemini-client.ts";
import { chopAndCrop, decodeSourceImage } from "./geometry.ts";
import { encodeWebp, hasMetadataChunk, type RgbaBitmap } from "./webp-codec.ts";
import { detectFrameSuspicion } from "./frame-suspicion.ts";
import { type ImageStorageUploader, SupabaseImageStorageUploader } from "./storage.ts";
import { extensionForMimeType, sniffImageMimeType } from "./mime-sniff.ts";

const IMAGE_STAGE = "image" as const;
const NEXT_STAGE = "finalize" as const;
const NEXT_STAGE_FUNCTION_NAME = "recipe-stage-finalize";
const IMAGE_MODEL_ENV_VAR = "RECIPE_IMAGE_MODEL";
const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";

/**
 * Gate A decision (F2 Step 09 — see the completion report for the full evidence): adopt whatever
 * the Lovable AI Gateway's `google/gemini-2.5-flash-image` route actually returns (Step 01 and
 * this step's desk research both point to 1024x1024; gemini-client.ts never trusts this constant
 * for the real width/height it records — it always decodes the actual response). This constant
 * exists only as the documented intent/telemetry value, per "do not add new infrastructure merely
 * to preserve 2048" — there is no request parameter this integration path can set to change it.
 */
export const SOURCE_RESOLUTION_PX = 1024;

export interface RunImageStageParams {
  jobId: string;
  /** Injectable for tests — defaults to LovableGeminiImageGenerator (the real gateway call). */
  imageGenerator?: ImageGenerator;
  /** Injectable for tests — defaults to SupabaseImageStorageUploader(client). */
  storage?: ImageStorageUploader;
  workerId?: string;
}

export type RunImageStageOutcome =
  | "not_claimed"
  | "generation_failed"
  | "processing_failed"
  | "storage_failed"
  | "stored"
  | "already_stored";

export interface RunImageStageResult {
  outcome: RunImageStageOutcome;
  jobId: string;
  draftId?: string;
  heroUrl?: string;
  squareUrl?: string;
  claimReason?: string;
  errorCode?: string;
}

interface ProcessedVariant {
  bitmap: RgbaBitmap;
  webpBytes: Uint8Array;
  storagePath: string;
  frameSuspicion: ReturnType<typeof detectFrameSuspicion>;
}

async function obtainSource(
  storage: ImageStorageUploader,
  imageGenerator: ImageGenerator,
  existing: ExistingImageAssets,
  prompt: string,
  modelId: string,
): Promise<{ bytes: Uint8Array; widthPx: number; heightPx: number; generated: GeneratedImage | null }> {
  if (existing.source) {
    const bytes = await storage.download(existing.source.storagePath);
    const decoded = await decodeSourceImage(bytes);
    return { bytes, widthPx: decoded.width, heightPx: decoded.height, generated: null };
  }

  const generated = await imageGenerator.generate({ prompt, modelId });
  return { bytes: generated.bytes, widthPx: generated.widthPx, heightPx: generated.heightPx, generated };
}

function buildVariant(bitmap: RgbaBitmap, slug: string, suffix: "16x9" | "1x1"): Promise<ProcessedVariant> {
  return encodeWebp(bitmap, IMAGE_DEFAULT_WEBP_QUALITY).then((webpBytes) => ({
    bitmap,
    webpBytes,
    storagePath: `${slug}-${suffix}.webp`,
    frameSuspicion: detectFrameSuspicion(bitmap),
  }));
}

/**
 * Runs the image stage for one job. Same never-throws-for-ordinary-failure convention as
 * write-stage.ts/qa-stage.ts/revise-stage.ts: content/provider/processing failures are reported
 * via failJob and reflected in `outcome`; only an unexpected infra error throws.
 */
export async function runImageStage(
  client: SupabaseClient,
  params: RunImageStageParams,
): Promise<RunImageStageResult> {
  const claim = await claimJob(client, {
    jobId: params.jobId,
    expectedStage: IMAGE_STAGE,
    workerId: params.workerId,
  });
  if (!claim.claimed) {
    return { outcome: "not_claimed", jobId: params.jobId, claimReason: claim.reason };
  }

  const { lockToken } = claim.job;
  const attempt = Number(claim.job.row.attempt ?? 1);
  const batchId = String(claim.job.row.batch_id);
  const imageGenerator = params.imageGenerator ?? new LovableGeminiImageGenerator();
  const storage = params.storage ?? new SupabaseImageStorageUploader(client);
  const startedAt = new Date().toISOString();

  let qaResult;
  let draft;
  let existing;
  try {
    qaResult = await loadApprovedQaResult(client, params.jobId);
    draft = await loadDraftForImaging(client, params.jobId, qaResult.draftId);
    existing = await loadExistingImageAssets(client, params.jobId, qaResult.draftId);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  // Idempotency level 1: both variants already stored — nothing left to do, just re-drive routing
  // (a prior attempt stored everything and crashed/timed out before advancing).
  if (existing.hero && existing.square) {
    const advanceResult = await advanceStageAndDispatch(
      client,
      { jobId: params.jobId, lockToken, fromStage: IMAGE_STAGE, toStage: NEXT_STAGE, toStatus: "queued" },
      { functionName: NEXT_STAGE_FUNCTION_NAME, payload: { batchId } },
    );
    void advanceResult; // best-effort — see advanceStageAndDispatch's own contract
    return { outcome: "already_stored", jobId: params.jobId, draftId: draft.id };
  }

  const slug = slugifyTitle(draft.title) || params.jobId;
  const prompt = buildImagePrompt(draft);
  const modelId = Deno.env.get(IMAGE_MODEL_ENV_VAR) || DEFAULT_MODEL_ID;

  let source;
  try {
    source = await obtainSource(storage, imageGenerator, existing, prompt, modelId);
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "IMAGE_GENERATION_FAILED",
      stage: IMAGE_STAGE,
      retryable: e instanceof RecipeAutomationError ? e.retryable : true,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId, recipeId: qaResult.recipeId, stage: IMAGE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: IMAGE_STAGE, error });
    return { outcome: "generation_failed", jobId: params.jobId, errorCode: error.code };
  }

  let hero: ProcessedVariant;
  let square: ProcessedVariant;
  try {
    const decodedSource = await decodeSourceImage(source.bytes);
    const crops = chopAndCrop(decodedSource, IMAGE_CHOP_FRACTION);
    [square, hero] = await Promise.all([
      buildVariant(crops.square, slug, "1x1"),
      buildVariant(crops.hero, slug, "16x9"),
    ]);

    for (const variant of [square, hero]) {
      if (hasMetadataChunk(variant.webpBytes)) {
        throw new RecipeAutomationError({
          code: "IMAGE_METADATA_STRIP_VERIFICATION_FAILED",
          message: "encoded WebP unexpectedly carries a metadata chunk",
          stage: IMAGE_STAGE,
          retryable: false,
        });
      }
    }
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "IMAGE_PROCESSING_FAILED",
      stage: IMAGE_STAGE,
      retryable: e instanceof RecipeAutomationError ? e.retryable : false,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId, recipeId: qaResult.recipeId, stage: IMAGE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: IMAGE_STAGE, error });
    return { outcome: "processing_failed", jobId: params.jobId, errorCode: error.code };
  }

  const processingParams = {
    chopFraction: IMAGE_CHOP_FRACTION,
    cropAlignment: "center",
    geometryEngine: IMAGE_GEOMETRY_ENGINE,
    webpEncoder: "jsquash-webp",
    outputQuality: IMAGE_DEFAULT_WEBP_QUALITY,
  };

  try {
    const sourceMimeType = sniffImageMimeType(source.bytes);
    const sourceExt = extensionForMimeType(sourceMimeType);
    const sourcePath = `${slug}-source.${sourceExt}`;

    const heroUpload = await storage.upload(hero.storagePath, hero.webpBytes, "image/webp");
    const squareUpload = await storage.upload(square.storagePath, square.webpBytes, "image/webp");

    const insertAsset = async (row: Record<string, unknown>) => {
      const { error } = await client.from("recipe_assets").insert(row);
      if (error) {
        throw new RecipeAutomationError({
          code: "IMAGE_ASSET_INSERT_FAILED",
          message: "recipe_assets insert failed",
          stage: IMAGE_STAGE,
          retryable: true,
          details: { assetType: String(row.asset_type), pgCode: (error as { code?: string }).code },
        });
      }
    };

    if (!existing.source) {
      await storage.upload(sourcePath, source.bytes, sourceMimeType);
      await insertAsset({
        job_id: params.jobId,
        draft_id: draft.id,
        recipe_id: qaResult.recipeId,
        asset_type: "source",
        storage_bucket: IMAGE_STORAGE_BUCKET,
        storage_path: sourcePath,
        content_type: sourceMimeType,
        width_px: source.widthPx,
        height_px: source.heightPx,
        source_width_px: source.widthPx,
        source_height_px: source.heightPx,
        prompt,
        processing_params: processingParams,
        provider: source.generated?.provider ?? "google-gemini",
        model: source.generated?.model ?? modelId,
        trace_id: source.generated?.requestId ?? null,
      });
    }

    if (!existing.hero) {
      await insertAsset({
        job_id: params.jobId,
        draft_id: draft.id,
        recipe_id: qaResult.recipeId,
        asset_type: "hero",
        storage_bucket: IMAGE_STORAGE_BUCKET,
        storage_path: hero.storagePath,
        content_type: "image/webp",
        width_px: hero.bitmap.width,
        height_px: hero.bitmap.height,
        source_width_px: source.widthPx,
        source_height_px: source.heightPx,
        quality: IMAGE_DEFAULT_WEBP_QUALITY,
        prompt,
        processing_params: processingParams,
        validation_status: hero.frameSuspicion.suspicious ? "warning" : "passed",
        validation_results: hero.frameSuspicion,
        provider: source.generated?.provider ?? "google-gemini",
        model: source.generated?.model ?? modelId,
        trace_id: source.generated?.requestId ?? null,
      });
    }

    if (!existing.square) {
      await insertAsset({
        job_id: params.jobId,
        draft_id: draft.id,
        recipe_id: qaResult.recipeId,
        asset_type: "square",
        storage_bucket: IMAGE_STORAGE_BUCKET,
        storage_path: square.storagePath,
        content_type: "image/webp",
        width_px: square.bitmap.width,
        height_px: square.bitmap.height,
        source_width_px: source.widthPx,
        source_height_px: source.heightPx,
        quality: IMAGE_DEFAULT_WEBP_QUALITY,
        prompt,
        processing_params: processingParams,
        validation_status: square.frameSuspicion.suspicious ? "warning" : "passed",
        validation_results: square.frameSuspicion,
        provider: source.generated?.provider ?? "google-gemini",
        model: source.generated?.model ?? modelId,
        trace_id: source.generated?.requestId ?? null,
      });
    }

    await recordStageRun(client, {
      jobId: params.jobId, batchId, recipeId: qaResult.recipeId, stage: IMAGE_STAGE, status: "completed",
      attempt, startedAt, finishedAt: new Date().toISOString(),
      output: {
        draftId: draft.id,
        sourceWidthPx: source.widthPx,
        sourceHeightPx: source.heightPx,
        heroFrameSuspicious: hero.frameSuspicion.suspicious,
        squareFrameSuspicious: square.frameSuspicion.suspicious,
      },
      provider: source.generated?.provider ?? "google-gemini",
      model: source.generated?.model ?? modelId,
      usage: null,
    });

    const advanceResult = await advanceStageAndDispatch(
      client,
      { jobId: params.jobId, lockToken, fromStage: IMAGE_STAGE, toStage: NEXT_STAGE, toStatus: "queued" },
      { functionName: NEXT_STAGE_FUNCTION_NAME, payload: { batchId } },
    );
    void advanceResult; // best-effort — see advanceStageAndDispatch's own contract

    return {
      outcome: "stored",
      jobId: params.jobId,
      draftId: draft.id,
      heroUrl: heroUpload.publicUrl,
      squareUrl: squareUpload.publicUrl,
    };
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "IMAGE_STORAGE_STAGE_FAILED",
      stage: IMAGE_STAGE,
      retryable: e instanceof RecipeAutomationError ? e.retryable : true,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId, recipeId: qaResult.recipeId, stage: IMAGE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: IMAGE_STAGE, error });
    return { outcome: "storage_failed", jobId: params.jobId, errorCode: error.code };
  }
}
