// T9 — pure logic for /auth/mobile-handoff, split out of auth.mobile-handoff.tsx so it's testable
// with plain `node --test` (mirrors protectedRouteAccess.ts's split from protectedRouteGuard.tsx: no
// JSX/router/supabase-client imports here, so it needs no component-test harness).

// Same rule as /login's validateSearch: only same-origin relative paths, never external URLs
// (`//host/...` is protocol-relative and would leave the site). Unchanged by T9 — T9 only changed
// what travels in the fragment (an opaque nonce instead of the real tokens), not this check.
export function isSafeNextPath(next: unknown): next is string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
}

export const DEFAULT_NEXT = "/buyer/discover";

export type ParsedHandoffFragment = {
  nonce: string | null;
  next: string | null;
};

// T9: the fragment now carries a single-use, 60s-lived, opaque nonce instead of the real
// access_token/refresh_token (see mobile-handoff-issue / mobile-handoff-exchange +
// 20260910110000_t9_mobile_handoff_nonces.sql for the full design and why). Reading exclusively from
// the fragment is unchanged from before: it's never sent to the server or logged.
export function parseHandoffFragment(hash: string): ParsedHandoffFragment {
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(stripped);
  return {
    nonce: params.get("nonce"),
    next: params.get("next"),
  };
}

/**
 * The redirect target after a successful exchange: prefers the server-issued `next_path` (what
 * mobile-handoff-issue stored, per the caller's own JWT-authenticated request) over the fragment's
 * own `next` (present for the same "path" mobile-handoff-issue already saw, kept as a fallback only).
 * Either source must still pass isSafeNextPath — this function never returns an unsafe path.
 */
export function resolveHandoffNext(serverNextPath: unknown, fragmentNext: unknown): string {
  const candidate = typeof serverNextPath === "string" && serverNextPath ? serverNextPath : fragmentNext;
  return isSafeNextPath(candidate) ? candidate : DEFAULT_NEXT;
}
