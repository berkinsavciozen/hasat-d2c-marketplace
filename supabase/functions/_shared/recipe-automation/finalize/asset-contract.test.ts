// Deno.test suite for asset-contract.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/finalize/asset-contract.test.ts
import assert from "node:assert/strict";
import { expectedAssetFilename, validateAssetContract } from "./asset-contract.ts";
import type { FinalizeAsset } from "./context.ts";

const SLUG = "firinda-kabak-musakka";

function validHeroAsset(overrides: Partial<FinalizeAsset> = {}): FinalizeAsset {
  return {
    id: crypto.randomUUID(),
    storageBucket: "crop-photos",
    storagePath: `${SLUG}-16x9.webp`,
    contentType: "image/webp",
    widthPx: 878,
    heightPx: 494, // 878 * 9/16 ≈ 493.875, rounded to 494 — matches geometry.ts's own rounding
    quality: 82,
    validationStatus: "passed",
    processingParams: {
      chopFraction: 0.14,
      cropAlignment: "center",
      geometryEngine: "imagescript",
      webpEncoder: "jsquash-webp",
      outputQuality: 82,
    },
    ...overrides,
  };
}

function validSquareAsset(overrides: Partial<FinalizeAsset> = {}): FinalizeAsset {
  return {
    ...validHeroAsset(),
    storagePath: `${SLUG}-1x1.webp`,
    widthPx: 878,
    heightPx: 878,
    ...overrides,
  };
}

Deno.test("expectedAssetFilename: hero -> -16x9.webp, square -> -1x1.webp", () => {
  assert.equal(expectedAssetFilename(SLUG, "hero"), `${SLUG}-16x9.webp`);
  assert.equal(expectedAssetFilename(SLUG, "square"), `${SLUG}-1x1.webp`);
});

Deno.test("validateAssetContract: a fully-conformant hero asset has no issues", () => {
  const issues = validateAssetContract(validHeroAsset(), { kind: "hero", slug: SLUG });
  assert.deepEqual(issues, []);
});

Deno.test("validateAssetContract: a fully-conformant square asset has no issues", () => {
  const issues = validateAssetContract(validSquareAsset(), { kind: "square", slug: SLUG });
  assert.deepEqual(issues, []);
});

Deno.test("validateAssetContract: warning validation_status (frame suspicion) is accepted, not blocking", () => {
  const issues = validateAssetContract(
    validHeroAsset({ validationStatus: "warning" }),
    { kind: "hero", slug: SLUG },
  );
  assert.deepEqual(issues, []);
});

Deno.test("validateAssetContract: wrong bucket is reported", () => {
  const issues = validateAssetContract(
    validHeroAsset({ storageBucket: "recipe-photos" }),
    { kind: "hero", slug: SLUG },
  );
  assert.ok(issues.some((i) => i.code === "FINALIZE_ASSET_BUCKET_MISMATCH"));
});

Deno.test("validateAssetContract: wrong content type is reported", () => {
  const issues = validateAssetContract(
    validHeroAsset({ contentType: "image/png" }),
    { kind: "hero", slug: SLUG },
  );
  assert.ok(issues.some((i) => i.code === "FINALIZE_ASSET_CONTENT_TYPE_MISMATCH"));
});

Deno.test("validateAssetContract: filename not matching the slug is reported", () => {
  const issues = validateAssetContract(
    validHeroAsset({ storagePath: "wrong-slug-16x9.webp" }),
    { kind: "hero", slug: SLUG },
  );
  assert.ok(issues.some((i) => i.code === "FINALIZE_ASSET_FILENAME_MISMATCH"));
});

Deno.test("validateAssetContract: missing dimensions are reported", () => {
  const issues = validateAssetContract(
    validHeroAsset({ widthPx: null, heightPx: null }),
    { kind: "hero", slug: SLUG },
  );
  assert.ok(issues.some((i) => i.code === "FINALIZE_ASSET_DIMENSIONS_MISSING"));
});

Deno.test("validateAssetContract: a non-square square asset is reported", () => {
  const issues = validateAssetContract(
    validSquareAsset({ widthPx: 900, heightPx: 878 }),
    { kind: "square", slug: SLUG },
  );
  assert.ok(issues.some((i) => i.code === "FINALIZE_ASSET_ASPECT_RATIO_MISMATCH"));
});

Deno.test("validateAssetContract: a hero asset far from 16:9 is reported", () => {
  const issues = validateAssetContract(
    validHeroAsset({ widthPx: 878, heightPx: 878 }), // square dims mistakenly stored as hero
    { kind: "hero", slug: SLUG },
  );
  assert.ok(issues.some((i) => i.code === "FINALIZE_ASSET_ASPECT_RATIO_MISMATCH"));
});

Deno.test("validateAssetContract: missing processing_params is reported", () => {
  const issues = validateAssetContract(
    validHeroAsset({ processingParams: null }),
    { kind: "hero", slug: SLUG },
  );
  assert.ok(issues.some((i) => i.code === "FINALIZE_ASSET_PROCESSING_PARAMS_MISSING"));
});

Deno.test("validateAssetContract: wrong chopFraction/geometryEngine/cropAlignment/quality in processing_params are each reported", () => {
  const issues = validateAssetContract(
    validHeroAsset({
      processingParams: {
        chopFraction: 0.2,
        cropAlignment: "top-left",
        geometryEngine: "sharp",
        webpEncoder: "jsquash-webp",
        outputQuality: 60,
      },
    }),
    { kind: "hero", slug: SLUG },
  );
  const codes = issues.map((i) => i.code);
  assert.ok(codes.includes("FINALIZE_ASSET_CHOP_FRACTION_MISMATCH"));
  assert.ok(codes.includes("FINALIZE_ASSET_GEOMETRY_ENGINE_MISMATCH"));
  assert.ok(codes.includes("FINALIZE_ASSET_CROP_ALIGNMENT_MISMATCH"));
  assert.ok(codes.includes("FINALIZE_ASSET_QUALITY_MISMATCH"));
});

Deno.test("validateAssetContract: an unresolved validation_status ('pending'/null/'failed') is reported", () => {
  for (const status of [null, "pending", "failed"] as const) {
    const issues = validateAssetContract(
      validHeroAsset({ validationStatus: status }),
      { kind: "hero", slug: SLUG },
    );
    assert.ok(
      issues.some((i) => i.code === "FINALIZE_ASSET_VALIDATION_STATUS_UNRESOLVED"),
      `expected an issue for validation_status=${JSON.stringify(status)}`,
    );
  }
});
