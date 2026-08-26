// Deno.test suite for recipe-stage-revise/index.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/recipe-stage-revise/index.test.ts
//
// Scope: only the request-shape logic this entrypoint itself owns (auth gate wiring, JSON/jobId
// parsing, method handling) — every early-return path below returns BEFORE ever constructing a
// Supabase client or calling runReviseStage, so no network/DB double is needed. The actual pipeline
// logic (claim/resolve/revise/store/route) is revise-stage.ts's own, already covered by
// revise/revise-stage.test.ts. Mirrors recipe-stage-write/index.test.ts's own convention.
import assert from "node:assert/strict";

const ENV_VAR = "RECIPE_STAGE_DISPATCH_SECRET";

Deno.env.set(ENV_VAR, "test-dispatch-secret");
await import("./index.ts");
const handler = (globalThis as unknown as { __denoServeHandler: (req: Request) => Promise<Response> })
  .__denoServeHandler;

Deno.test("recipe-stage-revise: OPTIONS returns 204 with no auth required", async () => {
  const res = await handler(new Request("https://example.com/fn", { method: "OPTIONS" }));
  assert.equal(res.status, 204);
});

Deno.test("recipe-stage-revise: non-POST method is rejected with 405", async () => {
  const res = await handler(new Request("https://example.com/fn", {
    method: "GET",
    headers: { "x-admin-key": "test-dispatch-secret" },
  }));
  assert.equal(res.status, 405);
});

Deno.test("recipe-stage-revise: missing admin key -> 401", async () => {
  const res = await handler(new Request("https://example.com/fn", {
    method: "POST",
    body: JSON.stringify({ jobId: "11111111-1111-4111-8111-111111111111" }),
  }));
  assert.equal(res.status, 401);
});

Deno.test("recipe-stage-revise: wrong admin key -> 403", async () => {
  const res = await handler(new Request("https://example.com/fn", {
    method: "POST",
    headers: { "x-admin-key": "wrong-key" },
    body: JSON.stringify({ jobId: "11111111-1111-4111-8111-111111111111" }),
  }));
  assert.equal(res.status, 403);
});

Deno.test("recipe-stage-revise: invalid JSON body -> 400", async () => {
  const res = await handler(new Request("https://example.com/fn", {
    method: "POST",
    headers: { "x-admin-key": "test-dispatch-secret" },
    body: "not json",
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "invalid_json_body");
});

Deno.test("recipe-stage-revise: missing jobId -> 400", async () => {
  const res = await handler(new Request("https://example.com/fn", {
    method: "POST",
    headers: { "x-admin-key": "test-dispatch-secret" },
    body: JSON.stringify({}),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "jobId_required");
});

Deno.test("recipe-stage-revise: non-UUID jobId -> 400", async () => {
  const res = await handler(new Request("https://example.com/fn", {
    method: "POST",
    headers: { "x-admin-key": "test-dispatch-secret" },
    body: JSON.stringify({ jobId: "not-a-uuid" }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "jobId_required");
});
