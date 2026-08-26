// F2 Recipe Automation — Step 09: outer-pixel frame-suspicion detection (WARNING ONLY).
//
// Per this step's mandate: "Do not silently repair frame warnings" and "Do not build general
// watermark/logo detection" — this is deliberately a narrow, cheap heuristic that flags a
// candidate for human review, never blocks upload/storage, and never attempts to auto-correct
// anything. It looks only at the outermost pixel ring for near-uniform color (the signature of a
// solid-color letterbox/border/frame artifact a generative model occasionally produces around the
// intended subject) — not a general artifact/content classifier.
import type { RgbaBitmap } from "./webp-codec.ts";

export interface FrameSuspicionResult {
  suspicious: boolean;
  reason: string | null;
  /** 0-1: fraction of the sampled outer-ring pixels within COLOR_TOLERANCE of the ring's own
   * average color. Stored for audit even when not suspicious. */
  uniformity: number;
}

const COLOR_TOLERANCE = 10; // per-channel, out of 255
const SUSPICION_THRESHOLD = 0.92; // fraction of ring pixels that must match to flag

function pixelAt(bitmap: RgbaBitmap, x: number, y: number): [number, number, number] {
  const i = (y * bitmap.width + x) * 4;
  return [bitmap.data[i], bitmap.data[i + 1], bitmap.data[i + 2]];
}

function collectRingPixels(bitmap: RgbaBitmap): Array<[number, number, number]> {
  const { width, height } = bitmap;
  const pixels: Array<[number, number, number]> = [];
  for (let x = 0; x < width; x++) {
    pixels.push(pixelAt(bitmap, x, 0));
    pixels.push(pixelAt(bitmap, x, height - 1));
  }
  for (let y = 1; y < height - 1; y++) {
    pixels.push(pixelAt(bitmap, 0, y));
    pixels.push(pixelAt(bitmap, width - 1, y));
  }
  return pixels;
}

/**
 * Samples the outermost 1px ring of a crop and flags it (warning only) when it is suspiciously
 * uniform in color — a plausible frame/border/letterbox artifact rather than genuine photo
 * content, which real food photography essentially never produces at the exact image boundary.
 */
export function detectFrameSuspicion(bitmap: RgbaBitmap): FrameSuspicionResult {
  if (bitmap.width < 3 || bitmap.height < 3) {
    return { suspicious: false, reason: null, uniformity: 0 };
  }

  const ring = collectRingPixels(bitmap);
  const [sumR, sumG, sumB] = ring.reduce(
    ([r, g, b], [pr, pg, pb]) => [r + pr, g + pg, b + pb],
    [0, 0, 0],
  );
  const avg: [number, number, number] = [sumR / ring.length, sumG / ring.length, sumB / ring.length];

  const matching = ring.filter(([r, g, b]) =>
    Math.abs(r - avg[0]) <= COLOR_TOLERANCE &&
    Math.abs(g - avg[1]) <= COLOR_TOLERANCE &&
    Math.abs(b - avg[2]) <= COLOR_TOLERANCE
  ).length;

  const uniformity = matching / ring.length;
  const suspicious = uniformity >= SUSPICION_THRESHOLD;

  return {
    suspicious,
    reason: suspicious
      ? `outer pixel ring is ${(uniformity * 100).toFixed(1)}% uniform in color (possible frame/border artifact)`
      : null,
    uniformity,
  };
}
