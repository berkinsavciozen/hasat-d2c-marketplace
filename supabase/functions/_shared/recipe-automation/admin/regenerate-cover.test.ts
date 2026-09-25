// Deno.test suite for regenerate-cover.ts. Run with:
//   deno test --allow-net --allow-env --allow-read --node-modules-dir=none \
//     supabase/functions/_shared/recipe-automation/admin/regenerate-cover.test.ts
//
// Fake Gemini (returns a real square PNG built with imagescript) + fake storage (in-memory map) +
// FakeSupabaseClient (recipes / recipe_ingredients rows, admin_set_recipe_cover rpc). The crop /
// WebP encode / decode path is the real one, so dimensions and the asset contract are exercised
// for real. The RPC's own database behavior is covered by supabase/tests/admin_set_recipe_cover.
import assert from "node:assert/strict";
import { Image } from "jsr:@matmen/imagescript@1.3.1";
import { serveRegenerateCover } from "./regenerate-cover.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import type { GenerateImageParams, ImageGenerator } from "../image/gemini-client.ts";
import type { ImageStorageAdmin } from "../image/storage.ts";
import { decodeWebp } from "../image/webp-codec.ts";

const ADMIN_KEY = "test-admin-key";
Deno.env.set("ADMIN_DASHBOARD_KEY", ADMIN_KEY);

const ZERDE_ID = "68c14f46-4b47-4022-b4be-d07c3018c7f0";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const BASE = "https://example.test/storage/v1/object/public/crop-photos/";

function seedZerde(client: FakeSupabaseClient) {
  client.seed("recipes", [{
    id: ZERDE_ID,
    slug: "safranli-zerde",
    title: "Safranlı Zerde",
    description: "Safranla renklenen, pirinçli geleneksel bir tatlı",
    cuisine: "turk",
    cover_photo_url: `${BASE}safranli-zerde-1x1.webp`,
  }]);
  client.seed("recipe_ingredients", [
    { id: crypto.randomUUID(), recipe_id: ZERDE_ID, crop: null, free_text_name: "Pirinç", quantity: 1, unit: "su bardağı",
      note: null, is_key_ingredient: true, ingredient_class: "platform_disi", sort_order: 0 },
    { id: crypto.randomUUID(), recipe_id: ZERDE_ID, crop: "safran", free_text_name: null, quantity: 1, unit: "tutam",
      note: null, is_key_ingredient: true, ingredient_class: "tarimsal", sort_order: 1 },
  ]);
}

let squarePng: Uint8Array | null = null;
async function fixturePng(): Promise<Uint8Array> {
  if (!squarePng) {
    const image = new Image(256, 256);
    image.fill(0xe0a030ff);
    squarePng = await image.encode();
  }
  return squarePng;
}

function fakeGemini(): ImageGenerator & { calls: GenerateImageParams[] } {
  const calls: GenerateImageParams[] = [];
  return {
    calls,
    async generate(params) {
      calls.push(params);
      return {
        bytes: await fixturePng(),
        widthPx: 256,
        heightPx: 256,
        provider: "google-gemini",
        model: params.modelId,
        requestId: "req_test_1",
      };
    },
  };
}

function failingGemini(): ImageGenerator {
  return {
    generate: async () => {
      throw new Error("gateway down");
    },
  };
}

function fakeStorage(): ImageStorageAdmin & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async overwrite(path, bytes) {
      files.set(path, bytes);
      return { publicUrl: BASE + path };
    },
    async downloadIfExists(path) {
      return files.get(path) ?? null;
    },
    async remove(paths) {
      for (const p of paths) files.delete(p);
    },
    publicUrl(path) {
      return BASE + path;
    },
  };
}

function req(method: string, path: string, key: string | null = ADMIN_KEY): Request {
  const headers: Record<string, string> = {};
  if (key !== null) headers["x-admin-key"] = key;
  return new Request(`https://fn.test/functions/v1/admin-recipe-regenerate-cover${path}`, { method, headers });
}

function setup() {
  const client = new FakeSupabaseClient();
  seedZerde(client);
  const rpcCalls: Array<Record<string, unknown>> = [];
  client.onRpc("admin_set_recipe_cover", (args) => {
    rpcCalls.push(args);
    return {
      data: { coverPhotoUrl: `${BASE}safranli-zerde-16x9.webp`, jobId: "j", draftId: "d", createdSyntheticJob: true },
      error: null,
    };
  });
  const storage = fakeStorage();
  const gemini = fakeGemini();
  const call = (r: Request, deps: Record<string, unknown> = {}) =>
    serveRegenerateCover(r, () => client as unknown as SupabaseClient, { imageGenerator: gemini, storage, ...deps });
  return { client, storage, gemini, rpcCalls, call };
}

const CANDIDATE_FILES = [
  "safranli-zerde-candidate-source.png",
  "safranli-zerde-candidate-16x9.webp",
  "safranli-zerde-candidate-1x1.webp",
  "safranli-zerde-candidate-meta.json",
];

// ---- auth -----------------------------------------------------------------------------------------

Deno.test("regenerate-cover: 401 without x-admin-key, 403 with a wrong one — nothing generated", async () => {
  const { call, gemini, storage } = setup();
  for (const [method, path] of [["POST", `/${ZERDE_ID}/generate`], ["POST", `/${ZERDE_ID}/apply`], ["DELETE", `/${ZERDE_ID}/candidate`]]) {
    assert.equal((await call(req(method, path, null))).status, 401);
    assert.equal((await call(req(method, path, "wrong-key"))).status, 403);
  }
  assert.equal(gemini.calls.length, 0);
  assert.equal(storage.files.size, 0);
});

// ---- routing --------------------------------------------------------------------------------------

Deno.test("regenerate-cover: 404 for an unknown recipe on every action", async () => {
  const { call, gemini } = setup();
  for (const [method, path] of [
    ["POST", `/${UNKNOWN_ID}/generate`],
    ["POST", `/${UNKNOWN_ID}/apply`],
    ["GET", `/${UNKNOWN_ID}/candidate`],
    ["DELETE", `/${UNKNOWN_ID}/candidate`],
  ]) {
    const res = await call(req(method, path));
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.equal((await res.json()).error, "not_found");
  }
  assert.equal(gemini.calls.length, 0);
});

Deno.test("regenerate-cover: 400 for a non-uuid recipe id, 405 for a wrong method, 404 for an unknown action", async () => {
  const { call } = setup();
  assert.equal((await call(req("POST", "/zerde/generate"))).status, 400);
  assert.equal((await call(req("GET", `/${ZERDE_ID}/generate`))).status, 405);
  assert.equal((await call(req("GET", `/${ZERDE_ID}/apply`))).status, 405);
  assert.equal((await call(req("POST", `/${ZERDE_ID}/candidate`))).status, 405);
  assert.equal((await call(req("POST", `/${ZERDE_ID}/publish`))).status, 404);
  assert.equal((await call(req("POST", `/${ZERDE_ID}`))).status, 404);
});

// ---- generate -------------------------------------------------------------------------------------

Deno.test("regenerate-cover: generate writes only candidate files and returns their URLs", async () => {
  const { call, gemini, storage, rpcCalls } = setup();
  storage.files.set("safranli-zerde-1x1.webp", new Uint8Array([1, 2, 3]));

  const res = await call(req("POST", `/${ZERDE_ID}/generate`));
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(gemini.calls.length, 1);
  const prompt = gemini.calls[0].prompt;
  assert.match(prompt, /Safranlı Zerde/);
  assert.match(prompt, /Safranla renklenen, pirinçli geleneksel bir tatlı\./);
  assert.match(prompt, /Pirinç, safran/);

  assert.deepEqual([...storage.files.keys()].sort(), [...CANDIDATE_FILES, "safranli-zerde-1x1.webp"].sort());
  assert.deepEqual(storage.files.get("safranli-zerde-1x1.webp"), new Uint8Array([1, 2, 3]), "live cover untouched");
  assert.equal(rpcCalls.length, 0, "no DB write on generate");

  assert.ok(body.candidate.heroUrl.startsWith(`${BASE}safranli-zerde-candidate-16x9.webp?v=`));
  assert.ok(body.candidate.squareUrl.startsWith(`${BASE}safranli-zerde-candidate-1x1.webp?v=`));
  assert.ok(body.candidate.sourceUrl.startsWith(`${BASE}safranli-zerde-candidate-source.png?v=`));
  assert.equal(body.candidate.prompt, prompt);

  const hero = await decodeWebp(storage.files.get("safranli-zerde-candidate-16x9.webp")!);
  const square = await decodeWebp(storage.files.get("safranli-zerde-candidate-1x1.webp")!);
  assert.equal(square.width, square.height);
  assert.ok(Math.abs(hero.width / hero.height - 16 / 9) < 0.02);
});

Deno.test("regenerate-cover: GET candidate returns the pending candidate, 404 no_candidate otherwise", async () => {
  const { call } = setup();
  const none = await call(req("GET", `/${ZERDE_ID}/candidate`));
  assert.equal(none.status, 404);
  assert.equal((await none.json()).error, "no_candidate");

  await call(req("POST", `/${ZERDE_ID}/generate`));
  const res = await call(req("GET", `/${ZERDE_ID}/candidate`));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).candidate.heroUrl.includes("safranli-zerde-candidate-16x9.webp"));
});

Deno.test("regenerate-cover: a Gemini failure is a 502 and writes nothing", async () => {
  const { call, storage } = setup();
  const res = await call(req("POST", `/${ZERDE_ID}/generate`), { imageGenerator: failingGemini() });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, "generation_failed");
  assert.equal(storage.files.size, 0);
});

// ---- apply ----------------------------------------------------------------------------------------

Deno.test("regenerate-cover: apply before generate is a 409 and touches nothing", async () => {
  const { call, rpcCalls, storage } = setup();
  const res = await call(req("POST", `/${ZERDE_ID}/apply`));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "no_candidate");
  assert.equal(rpcCalls.length, 0);
  assert.equal(storage.files.size, 0);
});

Deno.test("regenerate-cover: apply with an incomplete candidate (meta but no hero) is a 409", async () => {
  const { call, rpcCalls, storage } = setup();
  await call(req("POST", `/${ZERDE_ID}/generate`));
  storage.files.delete("safranli-zerde-candidate-16x9.webp");
  assert.equal((await call(req("POST", `/${ZERDE_ID}/apply`))).status, 409);
  assert.equal(rpcCalls.length, 0);
});

Deno.test("regenerate-cover: a candidate meta written for another recipe id is not this recipe's candidate", async () => {
  const { call, rpcCalls, storage } = setup();
  await call(req("POST", `/${ZERDE_ID}/generate`));
  const meta = JSON.parse(new TextDecoder().decode(storage.files.get("safranli-zerde-candidate-meta.json")!));
  meta.recipeId = UNKNOWN_ID;
  storage.files.set("safranli-zerde-candidate-meta.json", new TextEncoder().encode(JSON.stringify(meta)));
  assert.equal((await call(req("POST", `/${ZERDE_ID}/apply`))).status, 409);
  assert.equal(rpcCalls.length, 0);
});

Deno.test("regenerate-cover: generate -> apply copies the candidate live, writes via the RPC, removes the candidate", async () => {
  const { call, storage, rpcCalls } = setup();
  storage.files.set("safranli-zerde-1x1.webp", new Uint8Array([1, 2, 3]));
  await call(req("POST", `/${ZERDE_ID}/generate`));
  const candidateHero = storage.files.get("safranli-zerde-candidate-16x9.webp")!;
  const candidateSquare = storage.files.get("safranli-zerde-candidate-1x1.webp")!;
  const candidateSource = storage.files.get("safranli-zerde-candidate-source.png")!;

  const res = await call(req("POST", `/${ZERDE_ID}/apply`));
  assert.equal(res.status, 200);
  const body = await res.json();

  // Files: live names overwritten with the exact candidate bytes; candidate gone.
  assert.deepEqual(
    [...storage.files.keys()].sort(),
    ["safranli-zerde-16x9.webp", "safranli-zerde-1x1.webp", "safranli-zerde-source.png"],
  );
  assert.deepEqual(storage.files.get("safranli-zerde-16x9.webp"), candidateHero);
  assert.deepEqual(storage.files.get("safranli-zerde-1x1.webp"), candidateSquare);
  assert.deepEqual(storage.files.get("safranli-zerde-source.png"), candidateSource);

  // DB: exactly one RPC call, image-stage-shaped rows.
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].p_recipe_id, ZERDE_ID);
  const rows = rpcCalls[0].p_assets as Array<Record<string, unknown>>;
  const byType = Object.fromEntries(rows.map((r) => [r.asset_type, r]));
  assert.deepEqual(Object.keys(byType).sort(), ["hero", "source", "square"]);
  assert.equal(byType.hero.storage_path, "safranli-zerde-16x9.webp");
  assert.equal(byType.square.storage_path, "safranli-zerde-1x1.webp");
  assert.equal(byType.source.storage_path, "safranli-zerde-source.png");
  assert.equal(byType.hero.content_type, "image/webp");
  assert.equal(byType.source.content_type, "image/png");
  assert.equal(byType.hero.quality, 82);
  assert.equal(byType.source.quality, undefined);
  assert.equal(byType.square.width_px, byType.square.height_px);
  assert.ok(Math.abs(Number(byType.hero.width_px) / Number(byType.hero.height_px) - 16 / 9) < 0.02);
  assert.equal(byType.hero.source_width_px, 256);
  assert.deepEqual(byType.hero.processing_params, {
    chopFraction: 0.14,
    cropAlignment: "center",
    geometryEngine: "imagescript",
    webpEncoder: "jsquash-webp",
    outputQuality: 82,
  });
  assert.ok(["passed", "warning"].includes(String(byType.hero.validation_status)));
  assert.equal(byType.hero.trace_id, "req_test_1");
  assert.equal(byType.hero.provider, "google-gemini");
  assert.match(String(byType.hero.prompt), /Safranlı Zerde/);

  assert.equal(body.coverPhotoUrl, `${BASE}safranli-zerde-16x9.webp`);
  assert.equal(body.candidateRemoved, true);

  // A second apply has nothing left to apply.
  assert.equal((await call(req("POST", `/${ZERDE_ID}/apply`))).status, 409);
  assert.equal(rpcCalls.length, 1);
});

Deno.test("regenerate-cover: an RPC NOT_FOUND (recipe deleted mid-flight) maps to 404", async () => {
  const { call, client } = setup();
  client.onRpc("admin_set_recipe_cover", () => ({
    data: null,
    error: { message: "ADMIN_SET_COVER_RECIPE_NOT_FOUND: recipe x does not exist" },
  }));
  await call(req("POST", `/${ZERDE_ID}/generate`));
  assert.equal((await call(req("POST", `/${ZERDE_ID}/apply`))).status, 404);
});

Deno.test("regenerate-cover: any other RPC error is a safe 500 and leaves the candidate in place", async () => {
  const { call, client, storage } = setup();
  client.onRpc("admin_set_recipe_cover", () => ({ data: null, error: { message: "boom", code: "XX000" } }));
  await call(req("POST", `/${ZERDE_ID}/generate`));
  const res = await call(req("POST", `/${ZERDE_ID}/apply`));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, "COVER_APPLY_RPC_FAILED");
  assert.ok(storage.files.has("safranli-zerde-candidate-meta.json"), "admin can retry apply");
});

// ---- discard --------------------------------------------------------------------------------------

Deno.test("regenerate-cover: generate -> discard removes only the candidate; apply is then a 409", async () => {
  const { call, storage, rpcCalls } = setup();
  storage.files.set("safranli-zerde-1x1.webp", new Uint8Array([1, 2, 3]));
  await call(req("POST", `/${ZERDE_ID}/generate`));

  const res = await call(req("DELETE", `/${ZERDE_ID}/candidate`));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).discarded, true);
  assert.deepEqual([...storage.files.keys()], ["safranli-zerde-1x1.webp"]);

  assert.equal((await call(req("POST", `/${ZERDE_ID}/apply`))).status, 409);
  assert.equal(rpcCalls.length, 0);

  // Idempotent.
  assert.equal((await call(req("DELETE", `/${ZERDE_ID}/candidate`))).status, 200);
});
