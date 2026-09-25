// Admin cover regeneration — the admin-recipe-regenerate-cover Edge Function's whole request
// handler (auth gate, router, actions), separated from index.ts's one-line Deno.serve shell so
// everything — including the 401/403 gate — is unit-testable against a FakeSupabaseClient with a
// fake Gemini generator and fake storage (regenerate-cover.test.ts).
//
// Why: DQ-2's COVER_NOT_HERO flags recipes whose cover is not a stored `-16x9.webp` hero (live:
// Safranlı Zerde, only `safranli-zerde-1x1.webp` exists). The only earlier way to fix a cover was
// the one-off legacy-recipe-image-backfill (decommissioned, 10 fixed recipes). This is the
// permanent, admin-approved version of the same idea.
//
// Two steps, because an admin must see the image before it goes live:
//   POST   /:recipeId/generate   -> Gemini generates a candidate; written ONLY to
//                                   `{slug}-candidate-source.{png|jpg}`, `{slug}-candidate-16x9.webp`,
//                                   `{slug}-candidate-1x1.webp` (+ `{slug}-candidate-meta.json`,
//                                   see below). The live cover is untouched.
//   GET    /:recipeId/candidate  -> the pending candidate's preview URLs, or 404 no_candidate.
//   POST   /:recipeId/apply      -> copies the candidate over `{slug}-source.*`, `{slug}-16x9.webp`,
//                                   `{slug}-1x1.webp`, then admin_set_recipe_cover (one
//                                   transaction: recipe_assets rows + recipes.cover_photo_url),
//                                   then deletes the candidate. 409 no_candidate when none exists.
//   DELETE /:recipeId/candidate  -> discards the candidate (idempotent).
//
// Building blocks: only the single-purpose F2 image pieces — prompt.ts, gemini-client.ts,
// geometry.ts, webp-codec.ts, frame-suspicion.ts, mime-sniff.ts, storage.ts — never image-stage.ts,
// job-lock.ts, job-state.ts or stage-dispatch.ts (no job/draft state machine). File names and the
// hero/square contract come from finalize/asset-contract.ts; processing params and bucket from
// schemas.ts, so an applied cover is indistinguishable from one the image stage wrote.
//
// The meta file: recipe_assets rows carry prompt/provider/model/trace_id, which only exist at
// generate time. `{slug}-candidate-meta.json` carries them to apply, and doubles as the "candidate
// is complete" marker (written last). Dimensions are NOT trusted from it — apply decodes the real
// candidate files.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { requireSharedSecret } from "../infra/admin-auth.ts";
import { RecipeAutomationError, toSafeErrorPayload } from "../infra/errors.ts";
import {
  IMAGE_CHOP_FRACTION,
  IMAGE_DEFAULT_WEBP_QUALITY,
  IMAGE_GEOMETRY_ENGINE,
  IMAGE_STORAGE_BUCKET,
} from "../schemas.ts";
import type { RecipeIngredientDraft } from "../types.ts";
import type { ImageStageDraft } from "../image/context.ts";
import { buildImagePrompt } from "../image/prompt.ts";
import { type ImageGenerator, LovableGeminiImageGenerator } from "../image/gemini-client.ts";
import { chopAndCrop, decodeSourceImage } from "../image/geometry.ts";
import { decodeWebp, encodeWebp, hasMetadataChunk } from "../image/webp-codec.ts";
import { detectFrameSuspicion, type FrameSuspicionResult } from "../image/frame-suspicion.ts";
import { extensionForMimeType, sniffImageMimeType } from "../image/mime-sniff.ts";
import { type ImageStorageAdmin, SupabaseImageStorageAdmin } from "../image/storage.ts";
import { expectedAssetFilename, validateAssetContract } from "../finalize/asset-contract.ts";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "x-admin-key, x-client-info, content-type, authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const FUNCTION_NAME = "admin-recipe-regenerate-cover";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** publish_recipe_draft's own slug rule — a slug outside it can't be a storage file-name prefix. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IMAGE_MODEL_ENV_VAR = "RECIPE_IMAGE_MODEL";
const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";
const SOURCE_EXTENSIONS = ["png", "jpg"] as const;

/** Same object image-stage.ts stores on every source/hero/square row — asset-contract.ts checks it. */
const PROCESSING_PARAMS = {
  chopFraction: IMAGE_CHOP_FRACTION,
  cropAlignment: "center",
  geometryEngine: IMAGE_GEOMETRY_ENGINE,
  webpEncoder: "jsquash-webp",
  outputQuality: IMAGE_DEFAULT_WEBP_QUALITY,
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

// ---------------------------------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------------------------------

export function candidatePaths(slug: string) {
  return {
    sources: SOURCE_EXTENSIONS.map((ext) => `${slug}-candidate-source.${ext}`),
    source: (ext: string) => `${slug}-candidate-source.${ext}`,
    hero: `${slug}-candidate-16x9.webp`,
    square: `${slug}-candidate-1x1.webp`,
    meta: `${slug}-candidate-meta.json`,
  };
}

export function livePaths(slug: string, sourceExt: string) {
  return {
    source: `${slug}-source.${sourceExt}`,
    hero: expectedAssetFilename(slug, "hero"),
    square: expectedAssetFilename(slug, "square"),
  };
}

// ---------------------------------------------------------------------------------------------------
// Recipe loading
// ---------------------------------------------------------------------------------------------------

interface CoverRecipe {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cuisine: string | null;
}

async function loadRecipe(client: SupabaseClient, recipeId: string): Promise<CoverRecipe | null> {
  const { data, error } = await client
    .from("recipes")
    .select("id, slug, title, description, cuisine")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({ code: "COVER_RECIPE_LOAD_FAILED", message: "recipes lookup failed", retryable: true });
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    description: (row.description as string | null) ?? null,
    cuisine: (row.cuisine as string | null) ?? null,
  };
}

/** The prompt builder's draft shape, from the recipe's LIVE rows (there is no draft to read —
 * same approach the legacy backfill used). Steps are irrelevant to buildImagePrompt. */
async function loadPromptDraft(client: SupabaseClient, recipe: CoverRecipe): Promise<ImageStageDraft> {
  const { data, error } = await client
    .from("recipe_ingredients")
    .select("crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class, sort_order")
    .eq("recipe_id", recipe.id)
    .order("sort_order");
  if (error) {
    throw new RecipeAutomationError({
      code: "COVER_INGREDIENTS_LOAD_FAILED",
      message: "recipe_ingredients lookup failed",
      retryable: true,
    });
  }
  const ingredients: RecipeIngredientDraft[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    crop: (row.crop as string | null) ?? null,
    freeTextName: (row.free_text_name as string | null) ?? null,
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    unit: (row.unit as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    isKeyIngredient: Boolean(row.is_key_ingredient),
    ingredientClass: (row.ingredient_class ?? null) as RecipeIngredientDraft["ingredientClass"],
    sortOrder: Number(row.sort_order ?? 0),
  }));
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    ingredients,
    steps: [],
  };
}

// ---------------------------------------------------------------------------------------------------
// Candidate meta
// ---------------------------------------------------------------------------------------------------

export interface CandidateMeta {
  recipeId: string;
  slug: string;
  sourceExt: string;
  sourceContentType: string;
  prompt: string;
  provider: string;
  model: string;
  traceId: string | null;
  heroFrameSuspicion: FrameSuspicionResult;
  squareFrameSuspicion: FrameSuspicionResult;
  generatedAt: string;
}

function parseMeta(bytes: Uint8Array): CandidateMeta | null {
  try {
    const meta = JSON.parse(new TextDecoder().decode(bytes)) as CandidateMeta;
    if (typeof meta?.recipeId !== "string" || typeof meta.slug !== "string" || typeof meta.sourceExt !== "string") {
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

/** Cache-busting for previews: candidate paths are rewritten in place on every regenerate. */
function previewUrl(storage: ImageStorageAdmin, path: string, version: string): string {
  return `${storage.publicUrl(path)}?v=${encodeURIComponent(version)}`;
}

function candidateUrls(storage: ImageStorageAdmin, slug: string, meta: CandidateMeta) {
  const paths = candidatePaths(slug);
  return {
    sourceUrl: previewUrl(storage, paths.source(meta.sourceExt), meta.generatedAt),
    heroUrl: previewUrl(storage, paths.hero, meta.generatedAt),
    squareUrl: previewUrl(storage, paths.square, meta.generatedAt),
  };
}

// ---------------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------------

export interface RegenerateCoverDeps {
  imageGenerator?: ImageGenerator;
  storage?: ImageStorageAdmin;
  now?: () => Date;
}

type ActionResult = { status: number; body: Record<string, unknown> };

function slugProblem(recipe: CoverRecipe): ActionResult | null {
  if (SLUG_PATTERN.test(recipe.slug)) return null;
  return {
    status: 422,
    body: { error: "recipe_slug_invalid", detail: `slug "${recipe.slug}" cannot be used as a storage file-name prefix` },
  };
}

export async function generateCandidate(
  client: SupabaseClient,
  recipeId: string,
  deps: RegenerateCoverDeps = {},
): Promise<ActionResult> {
  const recipe = await loadRecipe(client, recipeId);
  if (!recipe) return { status: 404, body: { error: "not_found" } };
  const bad = slugProblem(recipe);
  if (bad) return bad;

  const imageGenerator = deps.imageGenerator ?? new LovableGeminiImageGenerator();
  const storage = deps.storage ?? new SupabaseImageStorageAdmin(client);
  const now = deps.now ?? (() => new Date());

  const draft = await loadPromptDraft(client, recipe);
  const prompt = buildImagePrompt(draft, { includeDescription: true });
  const modelId = Deno.env.get(IMAGE_MODEL_ENV_VAR) || DEFAULT_MODEL_ID;

  let generated;
  try {
    generated = await imageGenerator.generate({ prompt, modelId });
  } catch (e) {
    const code = e instanceof RecipeAutomationError ? e.code : "IMAGE_GENERATION_FAILED";
    console.error("admin-recipe-regenerate-cover generation failed", { recipeId, code });
    return { status: 502, body: { error: "generation_failed", code, retryable: true } };
  }

  // Same processing as image-stage.ts: chop 14%, center-crop 16:9 / 1:1, WebP q82, no metadata.
  const decoded = await decodeSourceImage(generated.bytes);
  const crops = chopAndCrop(decoded, IMAGE_CHOP_FRACTION);
  const [heroWebp, squareWebp] = await Promise.all([
    encodeWebp(crops.hero, IMAGE_DEFAULT_WEBP_QUALITY),
    encodeWebp(crops.square, IMAGE_DEFAULT_WEBP_QUALITY),
  ]);
  for (const bytes of [heroWebp, squareWebp]) {
    if (hasMetadataChunk(bytes)) {
      throw new RecipeAutomationError({
        code: "IMAGE_METADATA_STRIP_VERIFICATION_FAILED",
        message: "encoded WebP unexpectedly carries a metadata chunk",
        retryable: false,
      });
    }
  }

  const sourceContentType = sniffImageMimeType(generated.bytes);
  const sourceExt = extensionForMimeType(sourceContentType);
  if (!(SOURCE_EXTENSIONS as readonly string[]).includes(sourceExt)) {
    return { status: 502, body: { error: "generation_failed", code: "IMAGE_SOURCE_FORMAT_UNSUPPORTED", retryable: true } };
  }

  const meta: CandidateMeta = {
    recipeId: recipe.id,
    slug: recipe.slug,
    sourceExt,
    sourceContentType,
    prompt,
    provider: generated.provider,
    model: generated.model,
    traceId: generated.requestId ?? null,
    heroFrameSuspicion: detectFrameSuspicion(crops.hero),
    squareFrameSuspicion: detectFrameSuspicion(crops.square),
    generatedAt: now().toISOString(),
  };

  const paths = candidatePaths(recipe.slug);
  // A previous candidate may have had the other source extension — never leave two behind.
  const staleSources = paths.sources.filter((p) => p !== paths.source(sourceExt));
  await storage.remove(staleSources);
  await storage.overwrite(paths.source(sourceExt), generated.bytes, sourceContentType);
  await storage.overwrite(paths.hero, heroWebp, "image/webp");
  await storage.overwrite(paths.square, squareWebp, "image/webp");
  // Written last: its presence means the three image files above are complete.
  await storage.overwrite(paths.meta, new TextEncoder().encode(JSON.stringify(meta)), "application/json");

  return {
    status: 200,
    body: {
      recipeId: recipe.id,
      slug: recipe.slug,
      candidate: {
        ...candidateUrls(storage, recipe.slug, meta),
        prompt,
        model: meta.model,
        generatedAt: meta.generatedAt,
        heroFrameSuspicious: meta.heroFrameSuspicion.suspicious,
        squareFrameSuspicious: meta.squareFrameSuspicion.suspicious,
      },
    },
  };
}

async function loadCandidateMeta(storage: ImageStorageAdmin, recipe: CoverRecipe): Promise<CandidateMeta | null> {
  const bytes = await storage.downloadIfExists(candidatePaths(recipe.slug).meta);
  if (!bytes) return null;
  const meta = parseMeta(bytes);
  // A meta for another recipe id (slug reused after a delete) is not this recipe's candidate.
  if (!meta || meta.recipeId !== recipe.id || meta.slug !== recipe.slug) return null;
  return meta;
}

export async function getCandidate(
  client: SupabaseClient,
  recipeId: string,
  deps: RegenerateCoverDeps = {},
): Promise<ActionResult> {
  const recipe = await loadRecipe(client, recipeId);
  if (!recipe) return { status: 404, body: { error: "not_found" } };
  const bad = slugProblem(recipe);
  if (bad) return bad;
  const storage = deps.storage ?? new SupabaseImageStorageAdmin(client);
  const meta = await loadCandidateMeta(storage, recipe);
  if (!meta) return { status: 404, body: { error: "no_candidate" } };
  return {
    status: 200,
    body: {
      recipeId: recipe.id,
      slug: recipe.slug,
      candidate: {
        ...candidateUrls(storage, recipe.slug, meta),
        prompt: meta.prompt,
        model: meta.model,
        generatedAt: meta.generatedAt,
        heroFrameSuspicious: meta.heroFrameSuspicion.suspicious,
        squareFrameSuspicious: meta.squareFrameSuspicion.suspicious,
      },
    },
  };
}

export async function applyCandidate(
  client: SupabaseClient,
  recipeId: string,
  deps: RegenerateCoverDeps = {},
): Promise<ActionResult> {
  const recipe = await loadRecipe(client, recipeId);
  if (!recipe) return { status: 404, body: { error: "not_found" } };
  const bad = slugProblem(recipe);
  if (bad) return bad;
  const storage = deps.storage ?? new SupabaseImageStorageAdmin(client);

  const noCandidate: ActionResult = {
    status: 409,
    body: { error: "no_candidate", detail: "generate a candidate before applying it" },
  };
  const meta = await loadCandidateMeta(storage, recipe);
  if (!meta) return noCandidate;

  const cPaths = candidatePaths(recipe.slug);
  const [sourceBytes, heroBytes, squareBytes] = await Promise.all([
    storage.downloadIfExists(cPaths.source(meta.sourceExt)),
    storage.downloadIfExists(cPaths.hero),
    storage.downloadIfExists(cPaths.square),
  ]);
  if (!sourceBytes || !heroBytes || !squareBytes) return noCandidate;

  // Real dimensions from the files themselves, never from the meta.
  const [source, hero, square] = await Promise.all([
    decodeSourceImage(sourceBytes),
    decodeWebp(heroBytes),
    decodeWebp(squareBytes),
  ]);

  const live = livePaths(recipe.slug, meta.sourceExt);
  const common = {
    source_width_px: source.width,
    source_height_px: source.height,
    prompt: meta.prompt,
    processing_params: PROCESSING_PARAMS,
    provider: meta.provider,
    model: meta.model,
    trace_id: meta.traceId,
  };
  const heroRow = {
    ...common,
    asset_type: "hero",
    storage_path: live.hero,
    content_type: "image/webp",
    width_px: hero.width,
    height_px: hero.height,
    quality: IMAGE_DEFAULT_WEBP_QUALITY,
    validation_status: meta.heroFrameSuspicion.suspicious ? "warning" : "passed",
    validation_results: meta.heroFrameSuspicion,
  };
  const squareRow = {
    ...common,
    asset_type: "square",
    storage_path: live.square,
    content_type: "image/webp",
    width_px: square.width,
    height_px: square.height,
    quality: IMAGE_DEFAULT_WEBP_QUALITY,
    validation_status: meta.squareFrameSuspicion.suspicious ? "warning" : "passed",
    validation_results: meta.squareFrameSuspicion,
  };
  const sourceRow = {
    ...common,
    asset_type: "source",
    storage_path: live.source,
    content_type: meta.sourceContentType,
    width_px: source.width,
    height_px: source.height,
  };

  // The same contract finalize enforces on pipeline covers — refuse to publish anything it would reject.
  const contractIssues = [
    ...validateAssetContract(toFinalizeAsset(heroRow), { kind: "hero", slug: recipe.slug }),
    ...validateAssetContract(toFinalizeAsset(squareRow), { kind: "square", slug: recipe.slug }),
  ];
  if (contractIssues.length > 0) {
    return { status: 422, body: { error: "asset_contract_violation", issues: contractIssues } };
  }

  // Files first, then the DB: the cover URL must never point at a file that isn't there yet.
  await storage.overwrite(live.source, sourceBytes, meta.sourceContentType);
  await storage.overwrite(live.hero, heroBytes, "image/webp");
  await storage.overwrite(live.square, squareBytes, "image/webp");

  const { data, error } = await client.rpc("admin_set_recipe_cover", {
    p_recipe_id: recipe.id,
    p_assets: [sourceRow, heroRow, squareRow],
  });
  if (error) {
    const message = (error as { message?: string }).message ?? "";
    if (message.startsWith("ADMIN_SET_COVER_RECIPE_NOT_FOUND")) return { status: 404, body: { error: "not_found" } };
    throw new RecipeAutomationError({
      code: "COVER_APPLY_RPC_FAILED",
      message: "admin_set_recipe_cover failed",
      retryable: true,
      details: { rpcError: message.split(":")[0] },
    });
  }

  let candidateRemoved = true;
  try {
    await storage.remove([...cPaths.sources, cPaths.hero, cPaths.square, cPaths.meta]);
  } catch {
    // The cover is live; a leftover candidate is harmless and DELETE /candidate can clear it.
    candidateRemoved = false;
    console.error("admin-recipe-regenerate-cover candidate cleanup failed", { recipeId });
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    status: 200,
    body: {
      recipeId: recipe.id,
      slug: recipe.slug,
      coverPhotoUrl: result.coverPhotoUrl ?? storage.publicUrl(live.hero),
      heroUrl: storage.publicUrl(live.hero),
      squareUrl: storage.publicUrl(live.square),
      sourceUrl: storage.publicUrl(live.source),
      candidateRemoved,
    },
  };
}

function toFinalizeAsset(row: Record<string, unknown>) {
  return {
    id: "candidate",
    storageBucket: IMAGE_STORAGE_BUCKET,
    storagePath: String(row.storage_path),
    contentType: String(row.content_type),
    widthPx: row.width_px as number,
    heightPx: row.height_px as number,
    quality: (row.quality as number | undefined) ?? null,
    validationStatus: (row.validation_status as string | undefined) ?? null,
    processingParams: row.processing_params as Record<string, unknown>,
  };
}

export async function discardCandidate(
  client: SupabaseClient,
  recipeId: string,
  deps: RegenerateCoverDeps = {},
): Promise<ActionResult> {
  const recipe = await loadRecipe(client, recipeId);
  if (!recipe) return { status: 404, body: { error: "not_found" } };
  const bad = slugProblem(recipe);
  if (bad) return bad;
  const storage = deps.storage ?? new SupabaseImageStorageAdmin(client);
  const paths = candidatePaths(recipe.slug);
  await storage.remove([...paths.sources, paths.hero, paths.square, paths.meta]);
  return { status: 200, body: { recipeId: recipe.id, slug: recipe.slug, discarded: true } };
}

// ---------------------------------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------------------------------

/** Path segments after the function's own name — same convention as quality-router.ts. */
export function routeSegments(pathname: string): string[] {
  const parts = pathname.split("/").filter(Boolean);
  const nameIdx = parts.indexOf(FUNCTION_NAME);
  return nameIdx === -1 ? parts : parts.slice(nameIdx + 1);
}

/** Routes one already-authenticated request. Throws on unexpected errors (index.ts maps those to
 * a safe 500). */
export async function handleRegenerateCoverRequest(
  req: Request,
  client: SupabaseClient,
  deps: RegenerateCoverDeps = {},
): Promise<Response> {
  const segments = routeSegments(new URL(req.url).pathname);
  if (segments.length !== 2) return json({ error: "not_found" }, 404);

  const [recipeId, action] = segments;
  if (!UUID_PATTERN.test(recipeId)) {
    return json({ error: "invalid_recipe_id", detail: "recipeId must be a UUID string" }, 400);
  }

  let handler: ((c: SupabaseClient, id: string, d: RegenerateCoverDeps) => Promise<ActionResult>) | null = null;
  if (action === "generate") {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    handler = generateCandidate;
  } else if (action === "apply") {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    handler = applyCandidate;
  } else if (action === "candidate") {
    if (req.method === "GET") handler = getCandidate;
    else if (req.method === "DELETE") handler = discardCandidate;
    else return json({ error: "method_not_allowed" }, 405);
  } else {
    return json({ error: "not_found" }, 404);
  }

  const result = await handler(client, recipeId, deps);
  return json(result.body, result.status);
}

/** The whole Edge Function: CORS preflight, the shared `x-admin-key` / ADMIN_DASHBOARD_KEY gate
 * (same as every admin-recipe-* function — 401 no key, 403 wrong key), routing, and a safe 500
 * for anything unexpected. The client is only built after auth passes. */
export async function serveRegenerateCover(
  req: Request,
  getClient: () => SupabaseClient,
  deps: RegenerateCoverDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const auth = requireSharedSecret(req, { responseHeaders: CORS });
  if (!auth.ok) return auth.response;

  try {
    return await handleRegenerateCoverRequest(req, getClient(), deps);
  } catch (e) {
    const error = toSafeErrorPayload(e, { code: "ADMIN_RECIPE_REGENERATE_COVER_UNEXPECTED_ERROR", retryable: true });
    console.error("admin-recipe-regenerate-cover unexpected error", error);
    return json({ error: error.code, message: error.message }, 500);
  }
}
