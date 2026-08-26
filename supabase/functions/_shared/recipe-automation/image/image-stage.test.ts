// Deno.test suite for image-stage.ts. Run with:
//   deno test --allow-net --allow-env --allow-read --node-modules-dir=none \
//     supabase/functions/_shared/recipe-automation/image/image-stage.test.ts
//
// KNOWN SANDBOX LIMITATION (see the Step 09 completion report): image-stage.ts imports
// geometry.ts, which imports `jsr:@matmen/imagescript` — this file could not be executed in the
// Claude Code session that wrote it because `jsr.io` is blocked by that session's org egress
// policy (same class of pre-existing limitation as `supabase-admin.test.ts` and `esm.sh`, Step 05,
// unrelated to this step). Re-run in an environment with jsr.io access before treating
// image-stage.ts's orchestration as verified. `webp-codec.test.ts` in this same directory (Gate B)
// and every assertion NOT touching geometry.ts's real crop math were fully verified.
import assert from "node:assert/strict";
import { runImageStage } from "./image-stage.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import type { GenerateImageParams, GeneratedImage, ImageGenerator } from "./gemini-client.ts";
import type { ImageStorageUploader } from "./storage.ts";
import { encodeWebp } from "./webp-codec.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function seedImageJob(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  const jobId = crypto.randomUUID();
  client.seed("recipe_generation_jobs", [{
    id: jobId,
    batch_id: crypto.randomUUID(),
    brief_id: crypto.randomUUID(),
    working_title: "Firinda Kabak Musakka",
    stage: "image",
    status: "queued",
    attempt: 1,
    max_attempts: 3,
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  }]);
  return jobId;
}

function seedApprovedDraft(client: FakeSupabaseClient, jobId: string, overrides: Record<string, unknown> = {}) {
  const draftId = crypto.randomUUID();
  client.seed("recipe_drafts", [{
    id: draftId,
    job_id: jobId,
    title: "Firinda Kabak Musakka",
    description: "Mevsimlik kabaklarla hazirlanan hafif bir aksam yemegi.",
    cuisine: "turk",
    ingredients: [
      { crop: "kabak", freeTextName: null, quantity: 3, unit: "adet", note: null, isKeyIngredient: true, ingredientClass: "tarimsal", sortOrder: 0 },
    ],
    steps: [
      { stepNo: 1, instruction: "Kabaklari dilimleyin.", photoUrl: null, timerSeconds: null },
    ],
    ...overrides,
  }]);
  client.seed("recipe_qa_results", [{
    id: crypto.randomUUID(),
    job_id: jobId,
    draft_id: draftId,
    draft_version: 1,
    recipe_id: null,
    decision: "approved",
    approved_for_imaging: true,
    checked_at: new Date().toISOString(),
  }]);
  return draftId;
}

/** A 40x40 flat-color RGBA source image, PNG-magic-prefixed just enough to sniff as image/png —
 * the fake generator/storage below never actually decode it via imagescript (that would require
 * jsr.io); every place this test needs real crop/encode output is built through the real
 * webp-codec.ts (Gate B, npm-only) against synthetic bitmaps instead. */
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fixtureGeneratedBytes(): Uint8Array {
  const body = new Uint8Array(64).fill(200);
  const out = new Uint8Array(PNG_MAGIC.length + body.length);
  out.set(PNG_MAGIC, 0);
  out.set(body, PNG_MAGIC.length);
  return out;
}

function fixtureImageGenerator(overrides: Partial<GeneratedImage> = {}): ImageGenerator {
  return {
    generate: async (_params: GenerateImageParams) => ({
      bytes: fixtureGeneratedBytes(),
      widthPx: 1024,
      heightPx: 1024,
      provider: "google-gemini",
      model: "google/gemini-2.5-flash-image",
      requestId: "req_test_123",
      ...overrides,
    }),
  };
}

function throwingImageGenerator(): ImageGenerator {
  return {
    generate: async () => {
      throw new Error("must not be called");
    },
  };
}

function fixtureStorage(): ImageStorageUploader & { uploads: Array<{ path: string; contentType: string }> } {
  const uploads: Array<{ path: string; contentType: string }> = [];
  const files = new Map<string, Uint8Array>();
  return {
    uploads,
    async upload(path, bytes, contentType) {
      uploads.push({ path, contentType });
      files.set(path, bytes);
      return { publicUrl: `https://example.test/crop-photos/${path}` };
    },
    async download(path) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`fixtureStorage: no file at ${path}`);
      return bytes;
    },
  };
}

Deno.test("runImageStage: not_claimed when the job isn't at the image stage", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedImageJob(client, { stage: "write" });

  const result = await runImageStage(asClient(client), {
    jobId,
    imageGenerator: throwingImageGenerator(),
    storage: fixtureStorage(),
  });

  assert.equal(result.outcome, "not_claimed");
});

Deno.test("runImageStage: happy path — generates, stores hero+square, advances to finalize", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedImageJob(client);
  const draftId = seedApprovedDraft(client, jobId);
  client.onRpc("dispatch_recipe_stage", () => ({ data: null, error: null }));

  const storage = fixtureStorage();
  const result = await runImageStage(asClient(client), {
    jobId,
    imageGenerator: fixtureImageGenerator(),
    storage,
  });

  assert.equal(result.outcome, "stored");
  assert.equal(result.draftId, draftId);
  assert.ok(result.heroUrl?.endsWith("-16x9.webp"));
  assert.ok(result.squareUrl?.endsWith("-1x1.webp"));

  // source + hero + square uploaded and inserted
  assert.equal(storage.uploads.length, 3);
});

Deno.test("runImageStage: idempotent — pre-existing hero+square assets skip generation entirely", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedImageJob(client);
  const draftId = seedApprovedDraft(client, jobId);
  client.seed("recipe_assets", [
    { id: crypto.randomUUID(), job_id: jobId, draft_id: draftId, asset_type: "hero", storage_path: "x-16x9.webp" },
    { id: crypto.randomUUID(), job_id: jobId, draft_id: draftId, asset_type: "square", storage_path: "x-1x1.webp" },
  ]);
  client.onRpc("dispatch_recipe_stage", () => ({ data: null, error: null }));

  const result = await runImageStage(asClient(client), {
    jobId,
    imageGenerator: throwingImageGenerator(),
    storage: fixtureStorage(),
  });

  assert.equal(result.outcome, "already_stored");
});

Deno.test("runImageStage: idempotent — pre-existing source asset skips the paid Gemini call, still produces hero+square", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedImageJob(client);
  const draftId = seedApprovedDraft(client, jobId);
  client.onRpc("dispatch_recipe_stage", () => ({ data: null, error: null }));

  const storage = fixtureStorage();
  const sourceBytes = fixtureGeneratedBytes();
  // Pre-seed the storage double AND the recipe_assets row, simulating a prior attempt that
  // generated+uploaded the source, then crashed before hero/square.
  await storage.upload("firinda-kabak-musakka-source.png", sourceBytes, "image/png");
  client.seed("recipe_assets", [
    { id: crypto.randomUUID(), job_id: jobId, draft_id: draftId, asset_type: "source", storage_path: "firinda-kabak-musakka-source.png", width_px: 1024, height_px: 1024 },
  ]);

  const result = await runImageStage(asClient(client), {
    jobId,
    imageGenerator: throwingImageGenerator(), // must not be called — proves no duplicate spend
    storage,
  });

  assert.equal(result.outcome, "stored");
  // Only hero + square uploaded this time (source was reused from storage, not re-uploaded).
  assert.equal(storage.uploads.length, 2);
});

Deno.test("runImageStage: generation_failed -> failJob when the image generator throws", async () => {
  const client = new FakeSupabaseClient();
  const jobId = seedImageJob(client);
  seedApprovedDraft(client, jobId);

  const result = await runImageStage(asClient(client), {
    jobId,
    imageGenerator: { generate: async () => { throw new Error("gateway boom"); } },
    storage: fixtureStorage(),
  });

  assert.equal(result.outcome, "generation_failed");
  const jobRow = client.getRow("recipe_generation_jobs", jobId)!;
  assert.equal(jobRow.locked_by, null); // failJob always releases the lock
});

// Sanity check that the real Gate B encoder (not a fixture) is what the stage would use for
// quality/metadata — exercised directly here since image-stage.ts itself can't run in this
// sandbox (jsr.io block on geometry.ts), but webp-codec.ts has no such dependency.
Deno.test("Gate B sanity: webp-codec.ts used by image-stage.ts produces metadata-free q82 WebP", async () => {
  const bitmap = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4).fill(128) };
  const out = await encodeWebp(bitmap, 82);
  assert.equal(new TextDecoder().decode(out.slice(0, 4)), "RIFF");
});
