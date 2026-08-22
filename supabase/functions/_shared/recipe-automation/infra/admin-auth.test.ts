// Deno.test suite for admin-auth.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/infra/admin-auth.test.ts
import assert from "node:assert/strict";
import { requireSharedSecret, timingSafeEqual } from "./admin-auth.ts";

const ENV_VAR = "TEST_ADMIN_KEY_" + crypto.randomUUID().replace(/-/g, "");

function withEnvKey(value: string | undefined, fn: () => void) {
  if (value === undefined) {
    Deno.env.delete(ENV_VAR);
  } else {
    Deno.env.set(ENV_VAR, value);
  }
  try {
    fn();
  } finally {
    Deno.env.delete(ENV_VAR);
  }
}

Deno.test("timingSafeEqual: equal strings match", () => {
  assert.equal(timingSafeEqual("secret-value", "secret-value"), true);
});

Deno.test("timingSafeEqual: different strings do not match", () => {
  assert.equal(timingSafeEqual("secret-value", "other-value!"), false);
});

Deno.test("timingSafeEqual: different lengths do not match", () => {
  assert.equal(timingSafeEqual("short", "much-longer-value"), false);
});

Deno.test("requireSharedSecret: missing header -> 401, no key leaked in body", () => {
  withEnvKey("correct-key", () => {
    const req = new Request("https://example.com/fn");
    const result = requireSharedSecret(req, { envVarName: ENV_VAR });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });
});

Deno.test("requireSharedSecret: server misconfigured (no expected key) -> 401, fails closed", () => {
  withEnvKey(undefined, () => {
    const req = new Request("https://example.com/fn", { headers: { "x-admin-key": "anything" } });
    const result = requireSharedSecret(req, { envVarName: ENV_VAR });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });
});

Deno.test("requireSharedSecret: wrong key -> 403", () => {
  withEnvKey("correct-key", () => {
    const req = new Request("https://example.com/fn", { headers: { "x-admin-key": "wrong-key" } });
    const result = requireSharedSecret(req, { envVarName: ENV_VAR });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });
});

Deno.test("requireSharedSecret: correct key -> ok", () => {
  withEnvKey("correct-key", () => {
    const req = new Request("https://example.com/fn", { headers: { "x-admin-key": "correct-key" } });
    const result = requireSharedSecret(req, { envVarName: ENV_VAR });
    assert.equal(result.ok, true);
  });
});

Deno.test("requireSharedSecret: custom header name is honored", () => {
  withEnvKey("dispatch-secret", () => {
    const req = new Request("https://example.com/fn", { headers: { "x-stage-key": "dispatch-secret" } });
    const result = requireSharedSecret(req, { envVarName: ENV_VAR, headerName: "x-stage-key" });
    assert.equal(result.ok, true);
  });
});
