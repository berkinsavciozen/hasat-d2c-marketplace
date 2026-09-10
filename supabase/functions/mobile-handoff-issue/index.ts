// mobile-handoff-issue — T9. Called by `hasat-mobile` (`openWebWithSession()`), authenticated with
// the caller's own JWT (config.toml: verify_jwt = true, so the platform has already verified this
// token's signature/expiry before this handler ever runs). Stores the caller's own access_token +
// refresh_token server-side under a random, single-use, 60s-lived nonce (mobile_handoff_nonces,
// 20260910110000_t9_mobile_handoff_nonces.sql) and returns ONLY the opaque nonce — never the tokens
// themselves. This is the half of the fix that keeps the long-lived refresh_token out of the URL
// `hasat-mobile` hands to `Linking.openURL()` (see webLinks.ts / webLinksAccess.ts for the full
// writeup of why that URL used to be a persistent-session-takeover risk, not just a momentary one).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_REFRESH_TOKEN_CHARS = 4096;
const MAX_NEXT_PATH_CHARS = 500;
const NONCE_BYTES = 32;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// verify_jwt = true (config.toml) means the platform has already validated this token's signature
// and expiry before invoking this function — decoding the payload here only reads already-verified
// claims, it does not itself authenticate anything (same trust model as customize-recipe/index.ts).
function userIdFromAuth(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const tok = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : h.trim();
  const parts = tok.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad;
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

// 32 random bytes (256 bits) from the platform CSPRNG, base64url-encoded (~43 chars, no padding).
// crypto.randomUUID() would only be 122 bits from a fixed, partially-predictable structure — not
// enough headroom for something that, however short-lived, stands in for a live refresh_token.
export function generateNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const userId = userIdFromAuth(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const accessToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  if (!accessToken) return json({ error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const refreshToken = str(body?.refresh_token, MAX_REFRESH_TOKEN_CHARS);
  if (!refreshToken) return json({ error: "refresh_token_required" }, 400);
  const nextPath = str(body?.next_path, MAX_NEXT_PATH_CHARS);

  // service_role: mobile_handoff_nonces has zero RLS policies (deny-all for anon/authenticated) —
  // only service_role, which bypasses RLS, can write to it.
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nonce = generateNonce();
  const { error } = await serviceClient.from("mobile_handoff_nonces").insert({
    nonce,
    user_id: userId,
    access_token: accessToken,
    refresh_token: refreshToken,
    next_path: nextPath,
  });

  if (error) {
    console.error("[mobile-handoff-issue] insert failed", error);
    return json({ error: "issue_failed" }, 500);
  }

  return json({ nonce });
});
