// Deno.test suite for geometry.ts. Run with:
//   deno test --allow-net --allow-env --allow-read --node-modules-dir=none \
//     supabase/functions/_shared/recipe-automation/image/geometry.test.ts
//
// KNOWN SANDBOX LIMITATION (see the Step 09 completion report): this file could not be executed
// in the Claude Code session that wrote it — `jsr.io`/`npm.jsr.io` are blocked by that session's
// org egress policy (confirmed via `curl -sS https://jsr.io/@matmen/imagescript/1.4.0/mod.ts` ->
// 403, and `/root/.ccr/README.md`'s explicit "do not retry or route around it" guidance), the same
// class of pre-existing limitation `supabase-admin.test.ts` already has with `esm.sh` (Step 05,
// unrelated to this step). Re-run this file in an environment with jsr.io access (CI, or the
// Supabase deploy pipeline itself) before treating geometry.ts as verified — `webp-codec.test.ts`
// in this same directory (Gate B) DID run successfully, since it depends only on the npm registry.
import assert from "node:assert/strict";
import { Image } from "jsr:@matmen/imagescript@1.4.0";
import { chopAndCrop, decodeSourceImage } from "./geometry.ts";

async function encodePngSquare(side: number): Promise<Uint8Array> {
  const img = new Image(side, side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const r = x < side / 2 ? 220 : 40;
      const g = y < side / 2 ? 200 : 60;
      img.setPixelAt(x + 1, y + 1, Image.rgbaToColor(r, g, 128, 255));
    }
  }
  return await img.encode();
}

Deno.test("decodeSourceImage: decodes a PNG back to the same dimensions", async () => {
  const bytes = await encodePngSquare(1024);
  const decoded = await decodeSourceImage(bytes);
  assert.equal(decoded.width, 1024);
  assert.equal(decoded.height, 1024);
});

Deno.test("chopAndCrop: chops exactly 14% off right and bottom, 1:1 needs no further crop", async () => {
  const bytes = await encodePngSquare(1024);
  const decoded = await decodeSourceImage(bytes);
  const { square, choppedWidthPx, choppedHeightPx } = chopAndCrop(decoded, 0.14);

  const expectedSide = Math.round(1024 * 0.86); // 881
  assert.equal(choppedWidthPx, expectedSide);
  assert.equal(choppedHeightPx, expectedSide);
  assert.equal(square.width, expectedSide);
  assert.equal(square.height, expectedSide);
});

Deno.test("chopAndCrop: 16:9 crop is centered vertically within the chopped square, no upscale", async () => {
  const bytes = await encodePngSquare(1024);
  const decoded = await decodeSourceImage(bytes);
  const { hero, choppedWidthPx } = chopAndCrop(decoded, 0.14);

  assert.equal(hero.width, choppedWidthPx);
  const expectedHeight = Math.round(choppedWidthPx * (9 / 16));
  assert.equal(hero.height, expectedHeight);
  assert.ok(hero.height < choppedWidthPx, "16:9 crop must be shorter than the square it was cropped from");
});

Deno.test("chopAndCrop: rejects a non-square source instead of silently distorting it", async () => {
  const wide = new Image(200, 100);
  await assert.rejects(() => Promise.resolve(chopAndCrop(wide, 0.14)));
});
