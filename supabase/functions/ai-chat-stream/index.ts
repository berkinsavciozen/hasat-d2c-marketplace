// Streaming AI chat proxy for in-app farmer chat.
// Forwards SSE chunks from Lovable AI Gateway to the browser.
// Auth: requires verified Supabase JWT (verify_jwt = true).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatMsg { role: "system" | "user" | "assistant"; content: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: { messages?: ChatMsg[]; systemPrompt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const sys = (body.systemPrompt ?? "").trim();
  const fullMessages: ChatMsg[] = sys
    ? [{ role: "system", content: sys }, ...messages]
    : messages;

  const upstream = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: fullMessages,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    const code = upstream.status === 402 ? "credits_exhausted"
               : upstream.status === 429 ? "rate_limited"
               : "ai_error";
    console.error("[ai-chat-stream] upstream error", upstream.status, txt);
    return new Response(JSON.stringify({ error: code, status: upstream.status }), {
      status: upstream.status === 402 || upstream.status === 429 ? upstream.status : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pass through SSE stream untouched.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
});
