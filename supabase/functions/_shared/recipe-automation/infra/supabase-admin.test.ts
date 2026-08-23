// Deno.test suite for supabase-admin.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/infra/supabase-admin.test.ts
//
// F2 Step 06 (P7 preflight): this module previously had no test file at all — every other infra/
// module does. Covers the two things getSupabaseAdminClient() actually promises: it throws a
// typed, safe error (never a raw "undefined" TypeError) when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// are missing, and it memoizes across calls within the same isolate instead of reconstructing a
// client (and re-parsing env) on every request.
import assert from "node:assert/strict";
import { _resetSupabaseAdminClientForTests, getSupabaseAdminClient } from "./supabase-admin.ts";
import { RecipeAutomationError } from "./errors.ts";

const URL_VAR = "SUPABASE_URL";
const KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
    _resetSupabaseAdminClientForTests();
  }
}

Deno.test("getSupabaseAdminClient: throws a typed RecipeAutomationError when SUPABASE_URL is missing", () => {
  withEnv({ [URL_VAR]: undefined, [KEY_VAR]: "service-role-key" }, () => {
    assert.throws(
      () => getSupabaseAdminClient(),
      (err: unknown) => err instanceof RecipeAutomationError && err.code === "SUPABASE_ADMIN_CLIENT_MISCONFIGURED",
    );
  });
});

Deno.test("getSupabaseAdminClient: throws a typed RecipeAutomationError when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
  withEnv({ [URL_VAR]: "https://example.supabase.co", [KEY_VAR]: undefined }, () => {
    assert.throws(
      () => getSupabaseAdminClient(),
      (err: unknown) => err instanceof RecipeAutomationError && err.code === "SUPABASE_ADMIN_CLIENT_MISCONFIGURED",
    );
  });
});

Deno.test("getSupabaseAdminClient: never leaks the service-role key value into the thrown error", () => {
  withEnv({ [URL_VAR]: undefined, [KEY_VAR]: "sk-should-never-appear-anywhere" }, () => {
    try {
      getSupabaseAdminClient();
      assert.fail("expected getSupabaseAdminClient to throw when SUPABASE_URL is missing");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      assert.ok(!message.includes("sk-should-never-appear-anywhere"));
    }
  });
});

Deno.test("getSupabaseAdminClient: memoizes — repeated calls return the exact same client instance", () => {
  withEnv({ [URL_VAR]: "https://example.supabase.co", [KEY_VAR]: "service-role-key" }, () => {
    const first = getSupabaseAdminClient();
    const second = getSupabaseAdminClient();
    assert.equal(first, second, "expected the memoized client to be returned, not a fresh instance");
  });
});

Deno.test("_resetSupabaseAdminClientForTests: forces the next call to reconstruct the client", () => {
  withEnv({ [URL_VAR]: "https://example.supabase.co", [KEY_VAR]: "service-role-key" }, () => {
    const first = getSupabaseAdminClient();
    _resetSupabaseAdminClientForTests();
    const second = getSupabaseAdminClient();
    assert.notEqual(first, second, "expected a reset to force a new client instance on the next call");
  });
});
