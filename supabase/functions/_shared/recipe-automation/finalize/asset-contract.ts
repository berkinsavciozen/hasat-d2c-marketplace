// F2 Recipe Automation — Step 10: deterministic contract check for a finalized hero/square asset.
//
// PROMPT 10: "filenames, formats, bucket and processing metadata match contract" — re-derives what
// `../image/image-stage.ts` (Step 09) is supposed to have written (its own `buildVariant()` /
// `insertAsset()` calls, and the shared constants in `../schemas.ts`) and compares that against
// what is actually stored in `recipe_assets`, rather than trusting the row blindly. Pure
// functions — no I/O — so this contract is exhaustively unit-testable without a fake DB.
import {
  IMAGE_CHOP_FRACTION,
  IMAGE_DEFAULT_WEBP_QUALITY,
  IMAGE_GEOMETRY_ENGINE,
  IMAGE_STORAGE_BUCKET,
} from "../schemas.ts";
import type { RecipeQAIssue } from "../types.ts";
import type { FinalizeAsset } from "./context.ts";

const EXPECTED_CONTENT_TYPE = "image/webp";

/** `validation_status` values `../image/image-stage.ts` can leave a hero/square asset in that
 * finalize accepts. 'warning' (frame-suspicion flagged — RecipeAutomation.md: "frame şüphesi
 * varsa otomatik düzeltme yapma; human-review flag koy") is deliberately NOT a finalize-blocking
 * state — image-stage.ts never silently repairs a suspicious frame, and finalize must not silently
 * re-block on the same warning that stage already surfaced; only an unrecorded ('pending'/null) or
 * explicitly 'failed' validation is unresolved. */
const ACCEPTABLE_VALIDATION_STATUSES = new Set(["passed", "warning"]);

/** Aspect-ratio tolerance for the 16:9 hero crop. `../image/geometry.ts`'s `chopAndCrop()` derives
 * hero height as `Math.round(choppedSide * (9 / 16))` — an exact 16/9 ratio is not guaranteed for
 * every `choppedSide` value once rounded to a whole pixel, so this bound absorbs that rounding
 * without accepting a genuinely wrong crop (e.g. an un-cropped square mistakenly stored as hero). */
const HERO_ASPECT_RATIO_TOLERANCE = 0.02;

export type AssetKind = "hero" | "square";

function issue(code: string, field: string, message: string): RecipeQAIssue {
  return { code, field, severity: "blocking", message, requiredChange: null };
}

/** `${slug}-16x9.webp` / `${slug}-1x1.webp` — verbatim from `../image/image-stage.ts`'s
 * `buildVariant()` (`storagePath: `${slug}-${suffix}.webp``, suffix `"16x9"` | `"1x1"`). */
export function expectedAssetFilename(slug: string, kind: AssetKind): string {
  const suffix = kind === "hero" ? "16x9" : "1x1";
  return `${slug}-${suffix}.webp`;
}

/**
 * Validates one hero or square `recipe_assets` row against the Step 09 contract: bucket, content
 * type, filename, presence/shape of `processing_params` + `quality`, dimensions present and
 * aspect-ratio-correct, and an acceptable `validation_status`. Returns an empty array iff the
 * asset fully matches contract — every mismatch is reported (not just the first), so a caller can
 * surface the complete set of problems in one pass, same convention the Step 04 validation RPCs
 * use for `issues[]`.
 */
export function validateAssetContract(
  asset: FinalizeAsset,
  params: { kind: AssetKind; slug: string },
): RecipeQAIssue[] {
  const { kind, slug } = params;
  const field = `assets.${kind}`;
  const issues: RecipeQAIssue[] = [];

  if (asset.storageBucket !== IMAGE_STORAGE_BUCKET) {
    issues.push(issue(
      "FINALIZE_ASSET_BUCKET_MISMATCH",
      field,
      `${kind} asset is in bucket "${asset.storageBucket}", expected "${IMAGE_STORAGE_BUCKET}"`,
    ));
  }

  if (asset.contentType !== EXPECTED_CONTENT_TYPE) {
    issues.push(issue(
      "FINALIZE_ASSET_CONTENT_TYPE_MISMATCH",
      field,
      `${kind} asset content_type is "${asset.contentType}", expected "${EXPECTED_CONTENT_TYPE}"`,
    ));
  }

  const expectedFilename = expectedAssetFilename(slug, kind);
  if (asset.storagePath !== expectedFilename) {
    issues.push(issue(
      "FINALIZE_ASSET_FILENAME_MISMATCH",
      field,
      `${kind} asset storage_path is "${asset.storagePath}", expected "${expectedFilename}"`,
    ));
  }

  if (asset.widthPx === null || asset.heightPx === null || asset.widthPx <= 0 || asset.heightPx <= 0) {
    issues.push(issue(
      "FINALIZE_ASSET_DIMENSIONS_MISSING",
      field,
      `${kind} asset is missing valid width_px/height_px`,
    ));
  } else if (kind === "square") {
    if (asset.widthPx !== asset.heightPx) {
      issues.push(issue(
        "FINALIZE_ASSET_ASPECT_RATIO_MISMATCH",
        field,
        `square asset is ${asset.widthPx}x${asset.heightPx}, expected an exact 1:1 aspect ratio`,
      ));
    }
  } else {
    const actualRatio = asset.widthPx / asset.heightPx;
    if (Math.abs(actualRatio - 16 / 9) > HERO_ASPECT_RATIO_TOLERANCE) {
      issues.push(issue(
        "FINALIZE_ASSET_ASPECT_RATIO_MISMATCH",
        field,
        `hero asset is ${asset.widthPx}x${asset.heightPx} (ratio ${actualRatio.toFixed(3)}), expected ~16:9`,
      ));
    }
  }

  const p = asset.processingParams;
  if (!p) {
    issues.push(issue(
      "FINALIZE_ASSET_PROCESSING_PARAMS_MISSING",
      field,
      `${kind} asset has no processing_params recorded`,
    ));
  } else {
    if (p.chopFraction !== IMAGE_CHOP_FRACTION) {
      issues.push(issue(
        "FINALIZE_ASSET_CHOP_FRACTION_MISMATCH",
        field,
        `${kind} asset processing_params.chopFraction is ${JSON.stringify(p.chopFraction)}, expected ${IMAGE_CHOP_FRACTION}`,
      ));
    }
    if (p.geometryEngine !== IMAGE_GEOMETRY_ENGINE) {
      issues.push(issue(
        "FINALIZE_ASSET_GEOMETRY_ENGINE_MISMATCH",
        field,
        `${kind} asset processing_params.geometryEngine is ${JSON.stringify(p.geometryEngine)}, expected "${IMAGE_GEOMETRY_ENGINE}"`,
      ));
    }
    if (p.cropAlignment !== "center") {
      issues.push(issue(
        "FINALIZE_ASSET_CROP_ALIGNMENT_MISMATCH",
        field,
        `${kind} asset processing_params.cropAlignment is ${JSON.stringify(p.cropAlignment)}, expected "center"`,
      ));
    }
    if (p.outputQuality !== IMAGE_DEFAULT_WEBP_QUALITY) {
      issues.push(issue(
        "FINALIZE_ASSET_QUALITY_MISMATCH",
        field,
        `${kind} asset processing_params.outputQuality is ${JSON.stringify(p.outputQuality)}, expected ${IMAGE_DEFAULT_WEBP_QUALITY}`,
      ));
    }
  }

  if (asset.quality !== null && asset.quality !== IMAGE_DEFAULT_WEBP_QUALITY) {
    issues.push(issue(
      "FINALIZE_ASSET_QUALITY_MISMATCH",
      field,
      `${kind} asset quality column is ${asset.quality}, expected ${IMAGE_DEFAULT_WEBP_QUALITY}`,
    ));
  }

  if (asset.validationStatus === null || !ACCEPTABLE_VALIDATION_STATUSES.has(asset.validationStatus)) {
    issues.push(issue(
      "FINALIZE_ASSET_VALIDATION_STATUS_UNRESOLVED",
      field,
      `${kind} asset validation_status is ${JSON.stringify(asset.validationStatus)}, expected "passed" or "warning"`,
    ));
  }

  return issues;
}
