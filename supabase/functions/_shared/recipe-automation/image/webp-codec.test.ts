// Deno.test suite for webp-codec.ts (F2 Step 09 — Gate B evidence). Run with:
//   deno test --allow-net --allow-env --allow-read --node-modules-dir=none \
//     supabase/functions/_shared/recipe-automation/image/webp-codec.test.ts
//
// These are the tests behind the Step 09 completion report's Gate B evidence: manual WASM
// instantiation from the vendored bytes succeeds (no self-locate/fetch failure), q82 encoding
// intent is honored (pixel fidelity improves monotonically with quality), dimensions round-trip
// exactly through decode, and no EXIF/ICCP/XMP metadata chunk is ever present.
import assert from "node:assert/strict";
import { decodeWebp, encodeWebp, hasMetadataChunk, isValidWebp, type RgbaBitmap } from "./webp-codec.ts";

function makeBitmap(width: number, height: number): RgbaBitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x < width / 2 ? 220 : 40;
      data[i + 1] = y < height / 2 ? 200 : 60;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

Deno.test("encodeWebp: produces a well-formed WebP container (manual WASM init succeeds)", async () => {
  const out = await encodeWebp(makeBitmap(64, 64), 82);
  assert.equal(isValidWebp(out), true);
});

Deno.test("encodeWebp: never emits an EXIF/ICCP/XMP metadata chunk", async () => {
  const out = await encodeWebp(makeBitmap(64, 64), 82);
  assert.equal(hasMetadataChunk(out), false);
});

Deno.test("encodeWebp + decodeWebp: dimensions round-trip exactly for 16:9 and 1:1 target shapes", async () => {
  const hero = makeBitmap(881, 496); // matches geometry.ts's chop(1024)->16:9 math
  const square = makeBitmap(881, 881);

  const heroWebp = await encodeWebp(hero, 82);
  const squareWebp = await encodeWebp(square, 82);

  const decodedHero = await decodeWebp(heroWebp);
  const decodedSquare = await decodeWebp(squareWebp);

  assert.equal(decodedHero.width, 881);
  assert.equal(decodedHero.height, 496);
  assert.equal(decodedSquare.width, 881);
  assert.equal(decodedSquare.height, 881);
});

Deno.test("encodeWebp: q82 sits at the documented default and produces a decode-stable image (visual equivalence proxy)", async () => {
  const bitmap = makeBitmap(200, 200);
  const encoded = await encodeWebp(bitmap, 82);
  const decoded = await decodeWebp(encoded);

  // Corner pixel (solid-color region, no compression-boundary noise) should decode very close to
  // the original at q82 — this is the "visual equivalence" proxy this step's mandate asks for,
  // in the absence of a real hasat-webp.sh reference file to diff against (not present in any
  // repo this session has access to — see the completion report's known-limitations section).
  const srcIdx = 0, dstIdx = 0;
  const diff = Math.abs(bitmap.data[srcIdx] - decoded.data[dstIdx]) +
    Math.abs(bitmap.data[srcIdx + 1] - decoded.data[dstIdx + 1]) +
    Math.abs(bitmap.data[srcIdx + 2] - decoded.data[dstIdx + 2]);
  assert.ok(diff <= 12, `expected small per-channel drift at q82, got total diff ${diff}`);
});

Deno.test("encodeWebp: quality controls fidelity — q95 decodes closer to source than q10 (monotonic quality intent)", async () => {
  const bitmap = makeBitmap(200, 200);
  const lowQ = await decodeWebp(await encodeWebp(bitmap, 10));
  const highQ = await decodeWebp(await encodeWebp(bitmap, 95));

  const diffAt = (decoded: RgbaBitmap) =>
    Math.abs(bitmap.data[0] - decoded.data[0]) +
    Math.abs(bitmap.data[1] - decoded.data[1]) +
    Math.abs(bitmap.data[2] - decoded.data[2]);

  assert.ok(diffAt(highQ) < diffAt(lowQ), "higher quality must decode closer to the source than lower quality");
});

Deno.test("isValidWebp: rejects non-WebP bytes", () => {
  assert.equal(isValidWebp(new Uint8Array([0, 1, 2, 3])), false);
  assert.equal(isValidWebp(new TextEncoder().encode("not a webp file at all, just text")), false);
});
