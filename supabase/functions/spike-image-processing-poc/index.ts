// spike-image-processing-poc — Step 01 / Spike C (Hasat Recipe Automation, Prompt 01).
//
// PURPOSE (throwaway, isolated, removable): determine whether `sharp` can run
// on the Supabase Edge (Deno) runtime, and if not, validate a Deno/WASM
// replacement that reproduces the exact recipe-photo contract:
//   1. chop 14% off the right and 14% off the bottom of a 2048x2048 source
//   2. center-crop the result to 16:9 AND to 1:1
//   3. encode both outputs as WebP quality 82
//   4. strip metadata
// hasat-webp.sh does not exist anywhere in this repo (confirmed in Step 00 —
// `find . -iname "*hasat-webp*"` returns nothing on `main`), so this spike's
// output dimensions/format are compared directly against the invariant's
// written spec above rather than against a script.
//
// NOT production code — safe to delete this directory once the GO/NO-GO
// decision in docs/recipe-automation/01-runtime-feasibility-spikes.md is
// acted on. No secrets are used by this function.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

const SOURCE_SIZE = 2048;
const CHOP_FRACTION = 0.14; // chop 14% off right and bottom

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma); // "image/png;base64"
  const mime = meta.split(";")[0] || "image/png";
  const b64 = dataUrl.slice(comma + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

// Builds a synthetic 2048x2048 RGBA PNG test source when no real Gemini
// sample is supplied (e.g. spike B was blocked by a missing secret). Clearly
// flagged as synthetic in the report — never silently substituted.
async function makeSyntheticSource(Image: any): Promise<any> {
  const img = new Image(SOURCE_SIZE, SOURCE_SIZE);
  for (let y = 0; y < SOURCE_SIZE; y++) {
    for (let x = 0; x < SOURCE_SIZE; x++) {
      const r = Math.floor((x / SOURCE_SIZE) * 255);
      const g = Math.floor((y / SOURCE_SIZE) * 255);
      const b = 128;
      img.setPixelAt(x + 1, y + 1, Image.rgbaToColor(r, g, b, 255));
    }
  }
  return img;
}

async function trySharp(): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  try {
    // Dynamic import so a hard failure (native binding load error) doesn't
    // crash the whole function/module — we want the failure captured, not fatal.
    const sharpModule: any = await import("npm:sharp@0.33.5");
    const sharp = sharpModule.default ?? sharpModule;
    // Try the smallest possible real operation: create a 4x4 buffer in memory.
    const testBuf = new Uint8Array(4 * 4 * 3).fill(200);
    const out = await sharp(testBuf, { raw: { width: 4, height: 4, channels: 3 } })
      .png()
      .toBuffer();
    return { attempted: true, ok: true, durationMs: Date.now() - startedAt, outputBytes: out.length };
  } catch (e) {
    return {
      attempted: true,
      ok: false,
      durationMs: Date.now() - startedAt,
      errorName: (e as Error)?.name ?? typeof e,
      errorMessage: String((e as Error)?.message ?? e),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const report: Record<string, unknown> = { spike: "spike-image-processing-poc" };

  // ── 1. sharp compatibility test (expected to fail on Deno Edge — no native
  //       binding/dynamic library loading available in the isolate sandbox) ──
  report.sharpTest = await trySharp();

  // ── 2. Parse input: real Gemini sample from the request body if provided,
  //       else a clearly-labeled synthetic 2048x2048 fallback. ──────────────
  let inputDataUrl: string | null = null;
  let inputSource = "synthetic_fallback_gemini_unavailable";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (typeof body?.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:")) {
        inputDataUrl = body.imageDataUrl;
        inputSource = "real_gemini_sample_from_spike_b";
      }
    } catch {
      // fall through to synthetic
    }
  }
  report.inputSource = inputSource;

  // ── 3. Decode + crop + encode via imagescript (pure Deno/WASM, no native
  //       bindings) — the sharp replacement candidate. ─────────────────────
  let ImageScript: any;
  try {
    ImageScript = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
  } catch (e) {
    report.imagescriptImportError = String((e as Error)?.message ?? e);
    report.status = "no_go_no_replacement_loaded";
    return json(report);
  }
  const { Image } = ImageScript;

  let source: any;
  let decodedWidth: number, decodedHeight: number;
  try {
    if (inputDataUrl) {
      const { bytes } = dataUrlToBytes(inputDataUrl);
      source = await Image.decode(bytes);
    } else {
      source = await makeSyntheticSource(Image);
    }
    decodedWidth = source.width;
    decodedHeight = source.height;
  } catch (e) {
    report.decodeError = String((e as Error)?.message ?? e);
    report.status = "no_go_decode_failed";
    return json(report);
  }

  report.decodedDimensions = { width: decodedWidth, height: decodedHeight };
  if (decodedWidth !== SOURCE_SIZE || decodedHeight !== SOURCE_SIZE) {
    report.dimensionWarning = `Expected a ${SOURCE_SIZE}x${SOURCE_SIZE} source per the spec; got ${decodedWidth}x${decodedHeight}. Crop math below still runs against the actual decoded size.`;
  }

  try {
    // Step A: chop 14% off the right and 14% off the bottom.
    const chopW = Math.round(decodedWidth * (1 - CHOP_FRACTION));
    const chopH = Math.round(decodedHeight * (1 - CHOP_FRACTION));
    const chopped = source.clone().crop(0, 0, chopW, chopH);

    // Step B: center-crop to 1:1 — the chopped frame is already square when
    // the source was square (2048x2048 chopped 14%/14% -> chopW === chopH),
    // so the 1:1 output is the chopped frame itself, no further crop needed.
    // Guard the general case anyway (non-square chopped input) with a real
    // center-crop to min(chopW, chopH).
    const squareSide = Math.min(chopW, chopH);
    const sqX = Math.floor((chopW - squareSide) / 2);
    const sqY = Math.floor((chopH - squareSide) / 2);
    const square = chopped.clone().crop(sqX, sqY, squareSide, squareSide);

    // Step C: center-crop the chopped frame to 16:9 (keep width, crop height).
    const targetH169 = Math.round(chopW * (9 / 16));
    let crop169: any;
    let dims169: { width: number; height: number };
    if (targetH169 <= chopH) {
      const yOff = Math.floor((chopH - targetH169) / 2);
      crop169 = chopped.clone().crop(0, yOff, chopW, targetH169);
      dims169 = { width: chopW, height: targetH169 };
    } else {
      // chopped frame is wider-than-tall relative to 16:9 target height budget
      // (shouldn't happen from a square source, but handled for robustness):
      // crop width instead, keep full height.
      const targetW169 = Math.round(chopH * (16 / 9));
      const xOff = Math.floor((chopW - targetW169) / 2);
      crop169 = chopped.clone().crop(xOff, 0, targetW169, chopH);
      dims169 = { width: targetW169, height: chopH };
    }

    report.cropMath = {
      chopFraction: CHOP_FRACTION,
      choppedDimensions: { width: chopW, height: chopH },
      square1x1Dimensions: { width: square.width, height: square.height },
      crop16x9Dimensions: dims169,
      aspect16x9Actual: Number((dims169.width / dims169.height).toFixed(4)),
      aspect16x9Target: Number((16 / 9).toFixed(4)),
    };

    // ── 4. Encode. imagescript encodes PNG/JPEG natively; WebP needs a
    //       separate WASM codec (jSquash) since imagescript itself does not
    //       encode WebP. Try it for real; report exactly what happens rather
    //       than assuming success. ─────────────────────────────────────────
    const pngSquare = await square.encode(); // PNG, imagescript default
    const png169 = await crop169.encode();
    report.pngFallbackEncode = {
      ok: true,
      square1x1Bytes: pngSquare.length,
      crop16x9Bytes: png169.length,
      note: "imagescript's own .encode() only produces PNG — used here purely to prove the decode+crop pipeline is correct, not as the final format.",
    };

    let webpResult: Record<string, unknown>;
    try {
      const webpEncodeMod: any = await import("npm:@jsquash/webp@1.4.0/encode");
      const encodeWebp = webpEncodeMod.default ?? webpEncodeMod.encode ?? webpEncodeMod;
      const rgbaSquare = { data: new Uint8ClampedArray(square.bitmap), width: square.width, height: square.height };
      const rgba169 = { data: new Uint8ClampedArray(crop169.bitmap), width: crop169.width, height: crop169.height };
      const webpSquare: ArrayBuffer = await encodeWebp(rgbaSquare, { quality: 82 });
      const webp169: ArrayBuffer = await encodeWebp(rgba169, { quality: 82 });
      webpResult = {
        ok: true,
        square1x1Bytes: webpSquare.byteLength,
        crop16x9Bytes: webp169.byteLength,
        quality: 82,
      };
    } catch (e) {
      webpResult = {
        ok: false,
        errorName: (e as Error)?.name ?? typeof e,
        errorMessage: String((e as Error)?.message ?? e),
        note: "@jsquash/webp failed to load/run its WASM codec in this environment (a known friction point outside bundler-managed asset resolution). Crop pipeline itself is proven via the PNG fallback above; WebP-specific encoding needs a follow-up spike (e.g. explicit init() with a fetched .wasm ArrayBuffer, or evaluating wasm-vips) before this is fully GO for the WebP leg specifically.",
      };
    }
    report.webpEncode = webpResult;

    // Metadata stripping: imagescript's Image object is raw RGBA pixel data
    // only (no EXIF/ICC/XMP fields exist on it to begin with), so every
    // encode from it — PNG here, WebP above — is metadata-free by
    // construction, not by an extra strip step.
    report.metadataStripping = {
      mechanism: "inherent — imagescript decodes to raw RGBA pixels with no metadata fields carried over; nothing to strip because nothing survives decode.",
    };

    report.status = webpResult.ok ? "go_full_pipeline" : "go_crop_pipeline_webp_needs_followup";
  } catch (e) {
    report.cropOrEncodeError = String((e as Error)?.message ?? e);
    report.status = "no_go_crop_or_encode_failed";
  }

  return json(report);
});
