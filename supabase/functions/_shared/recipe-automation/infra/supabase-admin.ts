// F2 Recipe Automation — Step 05: the ONE place a service-role Supabase client is constructed
// for this pipeline.
//
// SECURITY BOUNDARY: the client this module hands out bypasses Row Level Security (service_role
// has `rolbypassrls = true` on the live project — confirmed in the Step 03A audit). It must only
// ever be constructed inside trusted, server-side Edge Function code that already gated the
// incoming request (admin-auth.ts, or a lock-token check in job-lock.ts/job-state.ts) — never in
// code reachable from client input without that gate, and NEVER passed to agent-runner.ts or
// exposed as a callable "tool" an LLM agent can invoke. agent-runner.ts must not import this
// module; that boundary is enforced by convention here and checked by the infra README's
// "who imports whom" list, not by a runtime guard, because a runtime guard can't stop a future
// stage agent from being handed the client value directly.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { RecipeAutomationError } from "./errors.ts";

export type { SupabaseClient };

let cached: SupabaseClient | null = null;

/**
 * Returns a memoized service-role client. Memoized because Supabase Edge Function isolates are
 * reused across requests within the same instance (like admin-kpi/notify-admin's pattern of
 * constructing per-request instead doesn't buy anything here and this avoids re-parsing env vars
 * on every invocation); callers must still treat the returned client as request-scoped and never
 * cache *results* from it across requests.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new RecipeAutomationError({
      code: "SUPABASE_ADMIN_CLIENT_MISCONFIGURED",
      message: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set",
      retryable: false,
    });
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Test-only: clears the memoized client so a test can inject fresh env vars. */
export function _resetSupabaseAdminClientForTests(): void {
  cached = null;
}
