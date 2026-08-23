// F2 Recipe Automation — Step 05: shared-secret request authentication.
//
// Mirrors `supabase/functions/admin-kpi/index.ts` exactly: an `x-admin-key` header, compared to
// an env var with the same timing-safe algorithm, no information about *why* a request was
// denied leaked in the response body. Generalized only in that the env var (and, for a
// non-dashboard caller, the header name) is a parameter — this same module secures both the
// human-facing admin dashboard (`ADMIN_DASHBOARD_KEY`) and the internal stage-to-stage dispatch
// call (a separate, narrower-blast-radius secret; see stage-dispatch.ts) without two copies of
// the comparison logic.
//
// Status codes: 401 when no key was presented at all, or when the server itself is misconfigured
// (fail closed — never reveal "the server has no key configured" to a caller, admin-kpi collapses
// both into the same case for the same reason). 403 when a key was presented and did not match.

const DEFAULT_HEADER = "x-admin-key";
const DEFAULT_ENV_VAR = "ADMIN_DASHBOARD_KEY";

export interface AdminAuthOptions {
  /** Env var holding the expected key. Defaults to ADMIN_DASHBOARD_KEY (admin-kpi's own var). */
  envVarName?: string;
  /** Request header carrying the caller's key. Defaults to x-admin-key. */
  headerName?: string;
  /** Extra headers (e.g. CORS) merged onto any denial response this function builds. */
  responseHeaders?: Record<string, string>;
}

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; response: Response };

/** Same constant-time comparison as admin-kpi/index.ts. A length mismatch short-circuits before
 * the constant-time loop (byte-length is NOT folded into the timing-safe comparison itself) — the
 * same early-return-on-length-mismatch shape admin-kpi's own comparison uses. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ab.length; i++) out |= ab[i] ^ bb[i];
  return out === 0;
}

function denyResponse(status: 401 | 403, headers: Record<string, string>): Response {
  const body = status === 401 ? "unauthorized" : "forbidden";
  return new Response(JSON.stringify({ error: body }), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}

/**
 * Checks `req` against the configured shared secret. Returns `{ ok: true }` when the caller may
 * proceed, or `{ ok: false, status, response }` with a ready-to-return Response when it must not
 * — callers just do `const auth = requireSharedSecret(req); if (!auth.ok) return auth.response;`.
 */
export function requireSharedSecret(req: Request, options: AdminAuthOptions = {}): AdminAuthResult {
  const headerName = options.headerName ?? DEFAULT_HEADER;
  const envVarName = options.envVarName ?? DEFAULT_ENV_VAR;
  const headers = options.responseHeaders ?? {};

  const provided = req.headers.get(headerName) ?? "";
  const expected = Deno.env.get(envVarName) ?? "";

  if (!provided || !expected) {
    // Missing key, OR server misconfigured (no expected value set) — both fail closed as 401,
    // matching admin-kpi's `if (!expected || !provided || ...)` single branch.
    return { ok: false, status: 401, response: denyResponse(401, headers) };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { ok: false, status: 403, response: denyResponse(403, headers) };
  }
  return { ok: true };
}
