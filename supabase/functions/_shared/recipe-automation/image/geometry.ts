// F2 Recipe Automation — Step 09: chop + center-crop geometry, on top of Step 01's proven
// `imagescript` decode/crop/metadata-strip path (see ../schemas.ts IMAGE_GEOMETRY_ENGINE /
// IMAGE_CHOP_FRACTION — this module does not re-decide those, it implements them).
//
// Imported via JSR (`jsr:@matmen/imagescript`), not the plain `https://deno.land/x/...` URL: the
// package's own `deno.json` (upstream `matmen/ImageScript`, `deno` branch) declares an internal
// import alias (`"env": "./utils/wasm/env.js"`, needed by its Emscripten SVG/GIF/font glue) that
// only a package-manager-aware specifier (JSR or npm) resolves automatically — a bare remote HTTP
// import does not apply a dependency's own import map, so it fails with `Relative import path
// "env" not prefixed with / or ./ or ../` (reproduced while building this module). JSR is the
// documented, current distribution channel for this package (`@matmen/imagescript`).
import { Image } from "jsr:@matmen/imagescript@1.4.0";
import { RecipeAutomationError } from "../infra/errors.ts";
import type { RgbaBitmap } from "./webp-codec.ts";

export interface ChoppedCrops {
  /** The 1:1 target — per this step's crop math, a square source chopped by the same fraction on
   * both axes is ALREADY square, so this is the chopped image itself, no further crop needed. */
  square: RgbaBitmap;
  /** The 16:9 target — center-cropped (vertically) out of the chopped square; never upscaled, per
   * the canonical flow ("chop, then crop" — no resize step). */
  hero: RgbaBitmap;
  choppedWidthPx: number;
  choppedHeightPx: number;
}

function toRgbaBitmap(image: InstanceType<typeof Image>): RgbaBitmap {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.bitmap) };
}

/** Decodes a source image (the raw Gemini output — PNG or JPEG) via `imagescript`. Metadata
 * stripping is structural here: `imagescript`'s decode -> bitmap -> re-encode round-trip carries
 * only pixel data, no source EXIF/ICC survives (recipeImageSpecSchema.stripMetadata's contract). */
export async function decodeSourceImage(bytes: Uint8Array): Promise<InstanceType<typeof Image>> {
  try {
    const decoded = await Image.decode(bytes);
    if (Array.isArray(decoded)) {
      throw new RecipeAutomationError({
        code: "IMAGE_SOURCE_DECODE_UNEXPECTED_ANIMATION",
        message: "source image decoded as a multi-frame animation, expected a single still frame",
        stage: "image",
        retryable: false,
      });
    }
    return decoded;
  } catch (e) {
    if (e instanceof RecipeAutomationError) throw e;
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw new RecipeAutomationError({
      code: "IMAGE_SOURCE_DECODE_FAILED",
      message,
      stage: "image",
      retryable: false,
    });
  }
}

/**
 * Chops `chopFraction` off the right and bottom edges of a square source image, then derives the
 * 1:1 and 16:9 crop targets from what's left — pure crop, no resize (see `ChoppedCrops`'s
 * docstring for why 1:1 needs no separate crop step). `sourceImage.width` must equal
 * `sourceImage.height` (recipeImageSpecSchema enforces this on the generation request; this
 * function re-asserts it defensively rather than silently producing a non-square "square" crop).
 */
export function chopAndCrop(sourceImage: InstanceType<typeof Image>, chopFraction: number): ChoppedCrops {
  const { width, height } = sourceImage;
  if (width !== height) {
    throw new RecipeAutomationError({
      code: "IMAGE_SOURCE_NOT_SQUARE",
      message: `source image must be square to chop+crop deterministically, got ${width}x${height}`,
      stage: "image",
      retryable: false,
    });
  }

  const choppedSide = Math.round(width * (1 - chopFraction));
  const chopped = sourceImage.clone().crop(0, 0, choppedSide, choppedSide);

  const heroHeight = Math.round(choppedSide * (9 / 16));
  const heroY = Math.round((choppedSide - heroHeight) / 2);
  const hero = chopped.clone().crop(0, heroY, choppedSide, heroHeight);

  return {
    square: toRgbaBitmap(chopped),
    hero: toRgbaBitmap(hero),
    choppedWidthPx: choppedSide,
    choppedHeightPx: choppedSide,
  };
}
