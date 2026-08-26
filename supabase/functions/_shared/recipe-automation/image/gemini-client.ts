// F2 Recipe Automation — Step 09: Gemini image generation via the Lovable AI Gateway.
//
// Same gateway/credential pattern already in production use elsewhere in this codebase
// (ai-box-insights/index.ts, ai-chat-stream/index.ts): `LOVABLE_API_KEY` against
// `https://ai.gateway.lovable.dev/v1/chat/completions`, an OpenAI-chat-completions-SHAPED proxy —
// not a direct call to Google's generativelanguage API. This is Gate A's decisive fact (see the
// Step 09 completion report): Google's native Gemini API exposes an `imageConfig.imageSize`
// request parameter ("1K"/"2K"/"4K") that can request a 2048x2048 ("2K") output, but that
// parameter is a Google-generativelanguage-API-specific extension with no equivalent field in the
// OpenAI chat-completions request shape this gateway (and every other caller in this repo) uses —
// there is no way to ask for it through this integration path without adding a second,
// gateway-bypassing HTTP client and a second credential (a raw GEMINI_API_KEY), which the mandate
// explicitly rules out ("Do not add new infrastructure merely to preserve 2048"). Source resolution
// is therefore whatever this gateway actually returns for `google/gemini-2.5-flash-image` — Step
// 01 observed 1024x1024; this module records the ACTUAL decoded width/height every call, never
// trusting the request, precisely so a future gateway change is detected from real data rather
// than assumed.
import { RecipeAutomationError } from "../infra/errors.ts";
import { decodeSourceImage } from "./geometry.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const API_KEY_ENV_VAR = "LOVABLE_API_KEY";

export interface GenerateImageParams {
  prompt: string;
  modelId: string;
}

export interface GeneratedImage {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  provider: "google-gemini";
  model: string;
  /** Gateway-reported request/response id, when present — stored on recipe_assets.trace_id for
   * audit/reproducibility (RecipeAutomation.md's "exact Gemini generation prompt used" intent). */
  requestId: string | null;
}

export interface ImageGenerator {
  generate(params: GenerateImageParams): Promise<GeneratedImage>;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Lovable's image-gen chat-completions response carries the image as a data: URI at
 * `choices[0].message.images[0].image_url.url` (the same OpenAI-compatible "images" message-part
 * convention other Gemini-via-gateway integrations use). Defensive about the exact shape — throws
 * a clear, specific error rather than an opaque `undefined` access if the gateway's response shape
 * ever changes. */
function extractImageDataUrl(payload: unknown): string {
  const message = (payload as { choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }> })
    ?.choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url;
  if (typeof url !== "string" || !url.startsWith("data:")) {
    throw new RecipeAutomationError({
      code: "IMAGE_GATEWAY_RESPONSE_SHAPE_UNEXPECTED",
      message: "Lovable AI Gateway response did not contain choices[0].message.images[0].image_url.url as a data: URI",
      stage: "image",
      retryable: false,
    });
  }
  return url;
}

function parseDataUrl(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new RecipeAutomationError({
      code: "IMAGE_GATEWAY_DATA_URL_MALFORMED",
      message: "image data: URI had no comma separator between header and payload",
      stage: "image",
      retryable: false,
    });
  }
  return decodeBase64(dataUrl.slice(commaIndex + 1));
}

export class LovableGeminiImageGenerator implements ImageGenerator {
  async generate(params: GenerateImageParams): Promise<GeneratedImage> {
    const apiKey = Deno.env.get(API_KEY_ENV_VAR);
    if (!apiKey) {
      throw new RecipeAutomationError({
        code: "IMAGE_GATEWAY_API_KEY_MISSING",
        message: `${API_KEY_ENV_VAR} is not set`,
        stage: "image",
        retryable: false,
      });
    }

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.modelId,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: params.prompt }],
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new RecipeAutomationError({
        code: "IMAGE_GATEWAY_CALL_FAILED",
        message: `Lovable AI Gateway returned HTTP ${response.status}`,
        stage: "image",
        // 429/5xx are transient; 4xx other than 429 (bad request/auth) are not.
        retryable: response.status === 429 || response.status >= 500,
        details: { status: response.status, bodySnippet: bodyText.slice(0, 500) },
      });
    }

    const payload = await response.json();
    const dataUrl = extractImageDataUrl(payload);
    const bytes = parseDataUrl(dataUrl);

    // Never trust the request for actual dimensions (Gate A's whole point) — decode what the
    // gateway actually sent back.
    const decoded = await decodeSourceImage(bytes);

    const requestId = typeof (payload as { id?: unknown })?.id === "string" ? (payload as { id: string }).id : null;

    return {
      bytes,
      widthPx: decoded.width,
      heightPx: decoded.height,
      provider: "google-gemini",
      model: params.modelId,
      requestId,
    };
  }
}
