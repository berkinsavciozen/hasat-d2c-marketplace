// spike-gemini-image-poc — Step 01 / Spike B (Hasat Recipe Automation, Prompt 01).
//
// PURPOSE (throwaway, isolated, removable): call the current Google Gemini
// "nano banana" image model (gemini-2.5-flash-image) from an Edge Function and
// generate/retrieve a 2048x2048 square source image, to feed spike C's image
// processing test. NOT production code — safe to delete once the GO/NO-GO
// decision is recorded.
//
// Secret naming: this repo's existing AI functions (extract-recipe,
// ai-chat-stream, ai-box-insights, whatsapp-ai-webhook) all route through the
// Lovable AI Gateway using LOVABLE_API_KEY, model ids like
// "google/gemini-3-flash-preview" — NOT a direct Google/OpenAI key anywhere in
// this repo. This spike therefore tries, in order:
//   1. Lovable AI Gateway (LOVABLE_API_KEY) with the gateway's nano-banana
//      image model id, matching the existing repo convention.
//   2. A direct Google Generative Language API call (GEMINI_API_KEY, falling
//      back to GOOGLE_API_KEY) as the alternative if the gateway path is
//      unavailable or doesn't support image output.
// Every secret is checked only via `!!Deno.env.get(...)` — values are never
// logged or returned.
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

const LOVABLE_MODEL = "google/gemini-2.5-flash-image-preview"; // "nano banana" via Lovable AI Gateway
const GEMINI_MODEL = "gemini-2.5-flash-image"; // "nano banana" via direct Google API
const PROMPT =
  "A simple, flat, minimal illustration of a single ripe red apple on a plain " +
  "white background, centered, square composition. No text, no watermark.";

function b64Length(s: string): number {
  return Math.floor((s.length * 3) / 4);
}

async function tryLovableGateway(): Promise<Record<string, unknown>> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return { attempted: false, reason: "LOVABLE_API_KEY not set" };
  }
  const startedAt = Date.now();
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: LOVABLE_MODEL,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: `${PROMPT} Output a 2048x2048 image.` }],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    const durationMs = Date.now() - startedAt;
    const requestId = resp.headers.get("x-request-id") ?? resp.headers.get("x-amzn-requestid") ?? null;

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        attempted: true,
        path: "lovable_gateway",
        model: LOVABLE_MODEL,
        httpStatus: resp.status,
        requestId,
        durationMs,
        ok: false,
        errorBodySnippet: errText.slice(0, 400),
      };
    }

    const payload = await resp.json();
    const message = payload?.choices?.[0]?.message;
    // Lovable's image-capable models return image content either as an
    // `images` array (data URLs) or inline content parts — check both shapes.
    const imageDataUrl: string | null =
      message?.images?.[0]?.image_url?.url ??
      (Array.isArray(message?.content)
        ? message.content.find((c: any) => c?.type === "image_url")?.image_url?.url
        : null) ??
      null;

    return {
      attempted: true,
      path: "lovable_gateway",
      model: LOVABLE_MODEL,
      httpStatus: resp.status,
      requestId,
      durationMs,
      ok: !!imageDataUrl,
      gotImage: !!imageDataUrl,
      approxImageBytes: imageDataUrl ? b64Length(imageDataUrl.split(",").pop() ?? "") : 0,
      imageDataUrl: imageDataUrl, // small enough (single test image) to return for spike C to consume
      finishReason: payload?.choices?.[0]?.finish_reason ?? null,
      responseTopLevelKeys: Object.keys(payload ?? {}),
    };
  } catch (e) {
    return {
      attempted: true,
      path: "lovable_gateway",
      model: LOVABLE_MODEL,
      ok: false,
      durationMs: Date.now() - startedAt,
      errorName: (e as Error)?.name ?? typeof e,
      errorMessage: String((e as Error)?.message ?? e),
    };
  }
}

async function tryDirectGemini(): Promise<Record<string, unknown>> {
  const key = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
  const keyVarUsed = Deno.env.get("GEMINI_API_KEY")
    ? "GEMINI_API_KEY"
    : Deno.env.get("GOOGLE_API_KEY")
      ? "GOOGLE_API_KEY"
      : null;
  if (!key) {
    return {
      attempted: false,
      reason: "Neither GEMINI_API_KEY nor GOOGLE_API_KEY is set",
    };
  }
  const startedAt = Date.now();
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${PROMPT} Output a 2048x2048 image.` }] }],
        }),
      },
    );
    const durationMs = Date.now() - startedAt;
    const requestId = resp.headers.get("x-request-id");

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        attempted: true,
        path: "direct_google_api",
        keyVarUsed,
        model: GEMINI_MODEL,
        httpStatus: resp.status,
        requestId,
        durationMs,
        ok: false,
        errorBodySnippet: errText.slice(0, 400),
      };
    }

    const payload = await resp.json();
    const inline = payload?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData)?.inlineData;

    return {
      attempted: true,
      path: "direct_google_api",
      keyVarUsed,
      model: GEMINI_MODEL,
      httpStatus: resp.status,
      requestId,
      durationMs,
      ok: !!inline,
      gotImage: !!inline,
      mimeType: inline?.mimeType ?? null,
      approxImageBytes: inline?.data ? b64Length(inline.data) : 0,
      imageDataUrl: inline?.data ? `data:${inline.mimeType};base64,${inline.data}` : null,
      modelVersion: payload?.modelVersion ?? null,
    };
  } catch (e) {
    return {
      attempted: true,
      path: "direct_google_api",
      keyVarUsed,
      ok: false,
      durationMs: Date.now() - startedAt,
      errorName: (e as Error)?.name ?? typeof e,
      errorMessage: String((e as Error)?.message ?? e),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const testRateLimit = url.searchParams.get("mode") === "bad_model"; // deliberately trigger a provider error

  const report: Record<string, unknown> = {
    spike: "spike-gemini-image-poc",
    secrets: {
      LOVABLE_API_KEY_present: !!Deno.env.get("LOVABLE_API_KEY"),
      GEMINI_API_KEY_present: !!Deno.env.get("GEMINI_API_KEY"),
      GOOGLE_API_KEY_present: !!Deno.env.get("GOOGLE_API_KEY"),
    },
  };

  if (testRateLimit) {
    // Provider-error-handling test: call with an intentionally invalid model
    // name to observe how the gateway/API reports the error, without needing
    // to actually exhaust a real rate limit.
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      report.badModelTest = { attempted: false, reason: "LOVABLE_API_KEY not set" };
    } else {
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "google/this-model-does-not-exist-spike-test",
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        const body = await resp.text().catch(() => "");
        report.badModelTest = {
          attempted: true,
          httpStatus: resp.status,
          bodySnippet: body.slice(0, 300),
        };
      } catch (e) {
        report.badModelTest = { attempted: true, errorMessage: String((e as Error)?.message ?? e) };
      }
    }
    return json(report);
  }

  report.lovableGateway = await tryLovableGateway();
  report.directGoogleApi = await tryDirectGemini();

  const gotImage =
    (report.lovableGateway as any)?.gotImage === true || (report.directGoogleApi as any)?.gotImage === true;
  report.status = gotImage ? "ok" : "blocked_or_failed";

  return json(report);
});
