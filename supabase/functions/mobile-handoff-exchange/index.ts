// mobile-handoff-exchange — T9. Called by the web app's `/auth/mobile-handoff` route BEFORE the
// visitor has any session (config.toml: verify_jwt = false — there is no user JWT to verify yet).
// Takes only the opaque nonce (from the URL fragment, never the query string — see
// auth.mobile-handoff.tsx / mobileHandoffAccess.ts) and redeems it exactly once, inside its 60s
// window, via `rpc_consume_mobile_handoff_nonce` (20260910110000_t9_mobile_handoff_nonces.sql). A
// missing/expired/already-consumed nonce returns 404 so the web route falls through to the same
// `/login` path it already used when the old direct-token flow had no tokens in the fragment.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_NONCE_CHARS = 128;

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

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const nonce = str(body?.nonce, MAX_NONCE_CHARS);
  if (!nonce) return json({ error: "invalid_nonce" }, 400);

  // service_role: mobile_handoff_nonces has zero RLS policies — the RPC's own EXECUTE grant is
  // restricted to service_role too (belt-and-suspenders, since RLS alone already blocks the table).
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await serviceClient.rpc("rpc_consume_mobile_handoff_nonce", { p_nonce: nonce });

  if (error) {
    console.error("[mobile-handoff-exchange] rpc failed", error);
    return json({ error: "exchange_failed" }, 500);
  }

  // The RPC returns a table (0 or 1 row): 0 rows means not found / expired / already consumed —
  // all three collapse to the same response so a caller can't distinguish them by timing/shape.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json({ error: "invalid_or_expired_nonce" }, 404);

  return json({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    next_path: row.next_path ?? null,
  });
});
