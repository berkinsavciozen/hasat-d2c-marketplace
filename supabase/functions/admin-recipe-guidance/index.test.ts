// Deno.test suite for admin-recipe-guidance/index.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/admin-recipe-guidance/index.test.ts
//
// Scope: only the request-shape logic this entrypoint itself owns (auth gate wiring, method/mode
// validation) — every path exercised below returns BEFORE ever constructing a Supabase client or
// calling into plan-guidance.ts, so no network/DB double is needed. The actual RPC-reuse logic is
// plan-guidance.ts's own, covered by plan-guidance.test.ts. Mirrors recipe-stage-write/
// recipe-stage-revise's own index.test.ts convention. This is also the "closed to anon/
// authenticated" proof the DoD asks for: with no ADMIN_DASHBOARD_KEY header (an anon/authenticated
// Lovable client never sends one), every request is rejected before any data is read.
import assert from "node:assert/strict";

const ENV_VAR = "ADMIN_DASHBOARD_KEY";

Deno.env.set(ENV_VAR, "test-admin-secret");
await import("./index.ts");
const handler = (globalThis as unknown as { __denoServeHandler: (req: Request) => Promise<Response> })
  .__denoServeHandler;

Deno.test("admin-recipe-guidance: OPTIONS returns 204 with no auth required", async () => {
  const res = await handler(new Request("https://example.com/fn", { method: "OPTIONS" }));
  assert.equal(res.status, 204);
});

Deno.test("admin-recipe-guidance: non-GET method is rejected with 405", async () => {
  const res = await handler(new Request("https://example.com/fn?mode=catalog", {
    method: "POST",
    headers: { "x-admin-key": "test-admin-secret" },
  }));
  assert.equal(res.status, 405);
});

Deno.test("admin-recipe-guidance: no key at all (anon) -> 401", async () => {
  const res = await handler(new Request("https://example.com/fn?mode=catalog"));
  assert.equal(res.status, 401);
});

Deno.test("admin-recipe-guidance: wrong key (e.g. a stale/guessed authenticated-session key) -> 403", async () => {
  const res = await handler(new Request("https://example.com/fn?mode=catalog", {
    headers: { "x-admin-key": "wrong-key" },
  }));
  assert.equal(res.status, 403);
});

Deno.test("admin-recipe-guidance: missing mode -> 400", async () => {
  const res = await handler(new Request("https://example.com/fn", {
    headers: { "x-admin-key": "test-admin-secret" },
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "invalid_mode");
});

Deno.test("admin-recipe-guidance: unknown mode -> 400", async () => {
  const res = await handler(new Request("https://example.com/fn?mode=bogus", {
    headers: { "x-admin-key": "test-admin-secret" },
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "invalid_mode");
});

Deno.test("admin-recipe-guidance: mode=duplicates without workingTitle -> 400", async () => {
  const res = await handler(new Request("https://example.com/fn?mode=duplicates", {
    headers: { "x-admin-key": "test-admin-secret" },
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "workingTitle_required");
});

Deno.test("admin-recipe-guidance: mode=duplicates with a blank workingTitle -> 400", async () => {
  const res = await handler(new Request("https://example.com/fn?mode=duplicates&workingTitle=%20%20", {
    headers: { "x-admin-key": "test-admin-secret" },
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "workingTitle_required");
});
