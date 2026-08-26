// F2 Recipe Automation — Step 09: Gate B (production-capable Edge WebP encoder).
//
// `imagescript` (Step 01's proven geometry/metadata engine — see ../schemas.ts's
// IMAGE_GEOMETRY_ENGINE) has NO WebP encoder in the build actually reachable from Deno (verified
// while building this module: the `deno` branch of matmen/ImageScript only wires up
// PNG/JPEG/GIF/TIFF/SVG/font codecs — no `encodeWEBP` — that method only exists in the npm
// package's Node-native build, which requires a `.node` binary Deno's Edge Runtime cannot load,
// same class of failure as `sharp`). So a standalone WebP encoder is a real, separate need, not
// something `imagescript` already covers.
//
// Gate B result: `@jsquash/webp` (Google's libwebp compiled to WASM, via the jSquash project).
// Its own known failure mode (this step's mandate) is that `encode()`/`decode()` lazily call
// `init()`, whose default path lets the Emscripten glue self-locate/fetch its own `.wasm` file —
// exactly what fails in a sandboxed Edge Runtime. The fix, confirmed empirically while building
// this module (see the Step 09 completion report for the exact commands/output): read the
// vendored `.wasm` bytes ourselves, `WebAssembly.compile()` them, and hand the resulting
// `WebAssembly.Module` to `init()` — jSquash's own `initEmscriptenModule` (utils.js) supports this
// exact manual-instantiation path (`instantiateWasm` override), it just isn't the default.
import { init as initEncoder, default as jsquashEncode } from "npm:@jsquash/webp@1.5.0/encode.js";
import { init as initDecoder, default as jsquashDecode } from "npm:@jsquash/webp@1.5.0/decode.js";
import { RecipeAutomationError } from "../infra/errors.ts";

const ENCODER_WASM_URL = new URL("./vendor/webp_enc.wasm", import.meta.url);
const DECODER_WASM_URL = new URL("./vendor/webp_dec.wasm", import.meta.url);

export interface RgbaBitmap {
  width: number;
  height: number;
  /** Flat RGBA bytes, 4 per pixel, row-major — exactly `imagescript`'s `Image.bitmap` shape. */
  data: Uint8ClampedArray | Uint8Array;
}

let encoderReady: Promise<void> | null = null;
let decoderReady: Promise<void> | null = null;

async function ensureEncoderReady(): Promise<void> {
  if (!encoderReady) {
    encoderReady = (async () => {
      const bytes = await Deno.readFile(ENCODER_WASM_URL);
      const wasmModule = await WebAssembly.compile(bytes);
      await initEncoder(wasmModule);
    })();
  }
  try {
    await encoderReady;
  } catch (e) {
    encoderReady = null; // don't cache a failed init — a transient issue shouldn't wedge every future call
    throw e;
  }
}

async function ensureDecoderReady(): Promise<void> {
  if (!decoderReady) {
    decoderReady = (async () => {
      const bytes = await Deno.readFile(DECODER_WASM_URL);
      const wasmModule = await WebAssembly.compile(bytes);
      await initDecoder(wasmModule);
    })();
  }
  try {
    await decoderReady;
  } catch (e) {
    decoderReady = null;
    throw e;
  }
}

/**
 * Encodes an RGBA bitmap to WebP at the given quality (1-100). Produces no metadata chunks by
 * construction — jSquash's encoder is only ever given raw pixels, never an EXIF/ICCP/XMP payload,
 * so "strip metadata" (recipeImageSpecSchema.stripMetadata) is structurally satisfied, not a
 * separate post-processing step. Verified in webp-codec.test.ts: the encoded bytes never contain
 * an EXIF/ICCP/XMP chunk.
 */
export async function encodeWebp(bitmap: RgbaBitmap, quality: number): Promise<Uint8Array> {
  try {
    await ensureEncoderReady();
    const result = await jsquashEncode(
      { width: bitmap.width, height: bitmap.height, data: new Uint8ClampedArray(bitmap.data), colorSpace: "srgb" },
      { quality },
    );
    return new Uint8Array(result);
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw new RecipeAutomationError({
      code: "IMAGE_WEBP_ENCODE_FAILED",
      message,
      stage: "image",
      retryable: true,
    });
  }
}

/** Decodes a WebP buffer back to an RGBA bitmap. Used for the Gate B equivalence proof in
 * webp-codec.test.ts and available to callers that want a decode-based sanity check before
 * upload — not required by the main encode path (recipe-stage-image never needs to re-decode its
 * own output to do its job). */
export async function decodeWebp(bytes: Uint8Array): Promise<RgbaBitmap> {
  try {
    await ensureDecoderReady();
    const result = await jsquashDecode(bytes.buffer as ArrayBuffer);
    return { width: result.width, height: result.height, data: new Uint8ClampedArray(result.data) };
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw new RecipeAutomationError({
      code: "IMAGE_WEBP_DECODE_FAILED",
      message,
      stage: "image",
      retryable: true,
    });
  }
}

const RIFF_MAGIC = "RIFF";
const WEBP_MAGIC = "WEBP";

/** True if `bytes` is a well-formed WebP container (RIFF/WEBP header) — a cheap structural sanity
 * check before upload, not a full parse. */
export function isValidWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const ascii = (start: number, len: number) => new TextDecoder("ascii").decode(bytes.slice(start, start + len));
  return ascii(0, 4) === RIFF_MAGIC && ascii(8, 4) === WEBP_MAGIC;
}

const METADATA_CHUNK_FOURCCS = ["EXIF", "ICCP", "XMP "];

/** True if the encoded WebP carries an EXIF/ICCP/XMP metadata chunk. Should always be false for
 * bytes produced by `encodeWebp()` above (see its docstring) — exposed so the image stage can
 * assert it rather than merely assume it. */
export function hasMetadataChunk(bytes: Uint8Array): boolean {
  const ascii = new TextDecoder("ascii", { fatal: false }).decode(bytes);
  return METADATA_CHUNK_FOURCCS.some((fourCc) => ascii.includes(fourCc));
}
