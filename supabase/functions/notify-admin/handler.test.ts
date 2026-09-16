import assert from "node:assert/strict";
import {
  type ClaimedEvent,
  createNotifyAdminHandler,
  type NotifyAdminDependencies,
  renderAdminMessage,
} from "./handler.ts";

const NOW = 1_800_000_000_000;
const TIMESTAMP = String(Math.floor(NOW / 1000));
const SECRET = "test-notify-admin-ingress-secret-that-is-long-enough";
const EVENT_ID = "11111111-1111-4111-8111-111111111111";

async function sign(rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${TIMESTAMP}.${rawBody}`)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validClaim(): ClaimedEvent {
  return {
    outcome: "claimed",
    eventType: "crop_type_request.created",
    attemptCount: 1,
    payload: {
      sourceId: EVENT_ID,
      cropName: "Safran",
      unit: "kg",
      category: "Baharat",
      harvestStartMonth: 9,
      harvestEndMonth: 10,
      requesterName: "Test Çiftçi",
      note: "Organik üretim",
    },
  };
}

function setup(overrides: Partial<NotifyAdminDependencies> = {}) {
  const calls = {
    claims: [] as string[],
    completions: [] as Array<{ eventId: string; outcome: string; providerMessageId?: string }>,
    fetches: [] as Array<{ input: RequestInfo | URL; init?: RequestInit }>,
  };
  const env = new Map([
    ["NOTIFY_ADMIN_INGRESS_SECRET", SECRET],
    ["TWILIO_ACCOUNT_SID", "ACtest"],
    ["TWILIO_AUTH_TOKEN", "twilio-test-token"],
    ["TWILIO_MESSAGING_SERVICE_SID", "MGtest"],
    ["ADMIN_NOTIFY_PHONE", "+905001112233"],
  ]);
  const deps: NotifyAdminDependencies = {
    env: (name) => env.get(name),
    now: () => NOW,
    claim: async (eventId) => {
      calls.claims.push(eventId);
      return validClaim();
    },
    complete: async (eventId, outcome, providerMessageId) => {
      calls.completions.push({ eventId, outcome, providerMessageId });
      return true;
    },
    fetch: async (input, init) => {
      calls.fetches.push({ input, init });
      return Response.json(
        { sid: "SMopaque", body: "must-not-leak", to: "+905001112233" },
        { status: 201 },
      );
    },
    ...overrides,
  };
  return { handler: createNotifyAdminHandler(deps), calls, env };
}

async function signedRequest(rawBody = JSON.stringify({ eventId: EVENT_ID })) {
  return new Request("https://example.com/functions/v1/notify-admin", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasat-timestamp": TIMESTAMP,
      "x-hasat-signature": await sign(rawBody),
    },
    body: rawBody,
  });
}

Deno.test("notify-admin: OPTIONS is side-effect free and returns no CORS wildcard", async () => {
  const { handler, calls } = setup();
  const response = await handler(new Request("https://example.com", { method: "OPTIONS" }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: missing credentials -> 401 before claim/Twilio", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ eventId: EVENT_ID }),
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: wrong credential -> 403 before claim/Twilio", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    new Request("https://example.com", {
      method: "POST",
      headers: {
        "x-hasat-timestamp": TIMESTAMP,
        "x-hasat-signature": "0".repeat(64),
      },
      body: JSON.stringify({ eventId: EVENT_ID }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: stale signed request -> 403 before claim/Twilio", async () => {
  const staleTimestamp = String(Number(TIMESTAMP) - 301);
  const rawBody = JSON.stringify({ eventId: EVENT_ID });
  const { handler, calls } = setup();
  const response = await handler(
    new Request("https://example.com", {
      method: "POST",
      headers: {
        "x-hasat-timestamp": staleTimestamp,
        "x-hasat-signature": await sign(rawBody),
      },
      body: rawBody,
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: malformed signed JSON -> 400 and zero Twilio", async () => {
  const { handler, calls } = setup();
  const response = await handler(await signedRequest("not-json"));
  assert.equal(response.status, 400);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: free-form message field is rejected", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    await signedRequest(JSON.stringify({ eventId: EVENT_ID, message: "arbitrary" })),
  );
  assert.equal(response.status, 400);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: oversized signed payload -> 413 and zero Twilio", async () => {
  const { handler, calls } = setup();
  const response = await handler(await signedRequest("x".repeat(1025)));
  assert.equal(response.status, 413);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: authorized event creates exactly one bounded Twilio call", async () => {
  const { handler, calls } = setup();
  const response = await handler(await signedRequest());
  assert.equal(response.status, 200);
  assert.equal(calls.claims.length, 1);
  assert.equal(calls.fetches.length, 1);
  assert.equal(calls.completions.length, 1);
  assert.deepEqual(calls.completions[0], {
    eventId: EVENT_ID,
    outcome: "sent",
    providerMessageId: "SMopaque",
  });

  const form = calls.fetches[0].init?.body as URLSearchParams;
  assert.equal(form.get("To"), "+905001112233");
  assert.equal(
    form.get("Body"),
    "🌾 Yeni ürün türü talebi: Safran (kg) · Baharat · Hasat: 9-10 ay — Test Çiftçi · Not: Organik üretim",
  );
  assert.ok((form.get("Body") ?? "").length <= 300);

  const publicBody = await response.text();
  assert.equal(publicBody.includes("must-not-leak"), false);
  assert.equal(publicBody.includes("SMopaque"), false);
  assert.equal(publicBody.includes("+905001112233"), false);
});

Deno.test("notify-admin: idempotent retry after sent event never calls Twilio twice", async () => {
  let claimCount = 0;
  const { handler, calls } = setup({
    claim: async () => (claimCount++ === 0 ? validClaim() : { outcome: "duplicate" }),
  });
  assert.equal((await handler(await signedRequest())).status, 200);
  assert.equal((await handler(await signedRequest())).status, 200);
  assert.equal(calls.fetches.length, 1);
});

Deno.test("notify-admin: database rate gate returns 429 with zero Twilio", async () => {
  const { handler, calls } = setup({
    claim: async () => ({ outcome: "rate_limited" }),
  });
  const response = await handler(await signedRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(calls.fetches.length, 0);
});

Deno.test("notify-admin: malformed authoritative payload is rejected before Twilio", async () => {
  const { handler, calls } = setup({
    claim: async () => ({
      outcome: "claimed",
      eventType: "crop_request.catalog_gap.created",
      payload: { sourceId: EVENT_ID, cropName: "x".repeat(101) },
    }),
  });
  const response = await handler(await signedRequest());
  assert.equal(response.status, 422);
  assert.equal(calls.fetches.length, 0);
  assert.equal(calls.completions[0]?.outcome, "uncertain");
});

Deno.test("notify-admin: provider rejection is retryable; response body stays opaque", async () => {
  const { handler, calls } = setup({
    fetch: async () =>
      Response.json(
        { message: "sensitive provider diagnostic" },
        {
          status: 503,
        },
      ),
  });
  const response = await handler(await signedRequest());
  assert.equal(response.status, 502);
  assert.equal(calls.completions[0]?.outcome, "retryable_failure");
  assert.equal((await response.text()).includes("sensitive provider diagnostic"), false);
});

Deno.test("notify-admin: uncertain network result is not marked retryable", async () => {
  const { handler, calls } = setup({
    fetch: async () => {
      throw new Error("network timeout with sensitive detail");
    },
  });
  const response = await handler(await signedRequest());
  assert.equal(response.status, 502);
  assert.equal(calls.completions[0]?.outcome, "uncertain");
  assert.equal((await response.text()).includes("sensitive detail"), false);
});

Deno.test("notify-admin: server-rendered messages stay within the safety bound", () => {
  const message = renderAdminMessage("crop_type_request.created", {
    sourceId: "11111111-1111-4111-8111-111111111111",
    cropName: "x".repeat(100),
    unit: "u".repeat(20),
    category: "c".repeat(40),
    harvestStartMonth: 1,
    harvestEndMonth: 12,
    requesterName: "r".repeat(80),
    note: "n".repeat(80),
  });

  assert.equal(message.length, 300);
  assert.equal(message.endsWith("..."), true);
});
