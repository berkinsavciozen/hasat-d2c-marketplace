// deno test --allow-env supabase/functions/send-sms/handler.test.ts
import assert from "node:assert/strict";
import { createSendSmsHandler, hmacHex, type SendSmsDependencies } from "./handler.ts";

const NOW = 1_800_000_000_000;
const TIMESTAMP = String(Math.floor(NOW / 1000));
const SECRET = "test-notify-admin-ingress-secret-that-is-long-enough";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const PHONE = "+905001112233";

function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    userId: USER_ID,
    message: "Hasat: Yeni teklif geldi 🍅",
    event: "new_offer",
    ...overrides,
  });
}

function sign(rawBody: string, timestamp = TIMESTAMP, prefix = "send-sms."): Promise<string> {
  return hmacHex(SECRET, `${prefix}${timestamp}.${rawBody}`);
}

function setup(overrides: Partial<SendSmsDependencies> = {}) {
  const calls = { fetches: [] as Array<{ input: RequestInfo | URL; init?: RequestInit }>, lookups: 0 };
  const env = new Map([
    ["NOTIFY_ADMIN_INGRESS_SECRET", SECRET],
    ["TWILIO_ACCOUNT_SID", "ACtest"],
    ["TWILIO_AUTH_TOKEN", "twilio-test-token"],
    ["TWILIO_MESSAGING_SERVICE_SID", "MGtest"],
  ]);
  const deps: SendSmsDependencies = {
    env: (name) => env.get(name),
    now: () => NOW,
    prefEnabled: async () => {
      calls.lookups++;
      return true;
    },
    phone: async () => {
      calls.lookups++;
      return PHONE;
    },
    fetch: async (input, init) => {
      calls.fetches.push({ input, init });
      return Response.json(
        { sid: "SMopaque", to: PHONE, body: "must-not-leak" },
        { status: 201 },
      );
    },
    ...overrides,
  };
  return { handler: createSendSmsHandler(deps), calls, env };
}

async function request(
  rawBody: string,
  headers: Record<string, string | undefined>,
  method = "POST",
): Promise<Request> {
  const h = new Headers({ "content-type": "application/json" });
  for (const [k, v] of Object.entries(headers)) if (v !== undefined) h.set(k, v);
  return new Request("https://example.test/functions/v1/send-sms", {
    method,
    headers: h,
    body: method === "POST" ? rawBody : undefined,
  });
}

async function signedRequest(rawBody = body()): Promise<Request> {
  return request(rawBody, {
    "x-hasat-timestamp": TIMESTAMP,
    "x-hasat-signature": await sign(rawBody),
  });
}

Deno.test("send-sms: valid signature sends exactly one Twilio request and returns only {ok}", async () => {
  const { handler, calls } = setup();
  const res = await handler(await signedRequest());
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { ok: true });
  assert.equal(calls.fetches.length, 1);
  assert.ok(!text.includes(PHONE) && !text.includes("must-not-leak") && !text.includes("SMopaque"));
  const form = calls.fetches[0].init!.body as URLSearchParams;
  assert.equal(form.get("To"), PHONE);
  assert.equal(form.get("Body"), "Hasat: Yeni teklif geldi 🍅");
});

Deno.test("send-sms: missing signature → 401, no lookup, no Twilio call", async () => {
  const { handler, calls } = setup();
  for (const headers of [
    {},
    { "x-hasat-timestamp": TIMESTAMP },
    { "x-hasat-signature": await sign(body()) },
    { authorization: "Bearer anon.jwt.token" },
  ]) {
    const res = await handler(await request(body(), headers));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false });
  }
  assert.equal(calls.fetches.length, 0);
  assert.equal(calls.lookups, 0);
});

Deno.test("send-sms: wrong signature / tampered body → 401, no Twilio call", async () => {
  const { handler, calls } = setup();
  const good = await sign(body());
  const wrong = await request(body(), {
    "x-hasat-timestamp": TIMESTAMP,
    "x-hasat-signature": "0".repeat(64),
  });
  const tampered = await request(body({ message: "Başka mesaj" }), {
    "x-hasat-timestamp": TIMESTAMP,
    "x-hasat-signature": good,
  });
  const otherSecret = await request(body(), {
    "x-hasat-timestamp": TIMESTAMP,
    "x-hasat-signature": await hmacHex(SECRET + "x", `send-sms.${TIMESTAMP}.${body()}`),
  });
  const notHex = await request(body(), {
    "x-hasat-timestamp": TIMESTAMP,
    "x-hasat-signature": "not-a-signature",
  });
  for (const req of [wrong, tampered, otherSecret, notHex]) {
    assert.equal((await handler(req)).status, 401);
  }
  assert.equal(calls.fetches.length, 0);
});

Deno.test("send-sms: timestamp outside ±300s → 401, no Twilio call", async () => {
  const { handler, calls } = setup();
  for (const ts of [
    String(Number(TIMESTAMP) - 301),
    String(Number(TIMESTAMP) + 301),
    "abc",
    "1.5",
  ]) {
    const res = await handler(
      await request(body(), { "x-hasat-timestamp": ts, "x-hasat-signature": await sign(body(), ts) }),
    );
    assert.equal(res.status, 401, ts);
  }
  // Edge of the window is still accepted.
  const ts = String(Number(TIMESTAMP) - 300);
  const ok = await handler(
    await request(body(), { "x-hasat-timestamp": ts, "x-hasat-signature": await sign(body(), ts) }),
  );
  assert.equal(ok.status, 200);
  assert.equal(calls.fetches.length, 1);
});

Deno.test("send-sms: missing or short ingress secret → 401 even with a matching signature", async () => {
  for (const value of [undefined, "", "short-secret"]) {
    const { handler, calls, env } = setup();
    if (value === undefined) env.delete("NOTIFY_ADMIN_INGRESS_SECRET");
    else env.set("NOTIFY_ADMIN_INGRESS_SECRET", value);
    const rawBody = body();
    // Empty HMAC keys are rejected by WebCrypto; sign with the real secret instead.
    const signature = await hmacHex(value || SECRET, `send-sms.${TIMESTAMP}.${rawBody}`);
    const res = await handler(
      await request(rawBody, { "x-hasat-timestamp": TIMESTAMP, "x-hasat-signature": signature }),
    );
    assert.equal(res.status, 401);
    assert.equal(calls.fetches.length, 0);
  }
});

Deno.test("send-sms: a notify-admin format signature (no send-sms. prefix) → 401", async () => {
  const { handler, calls } = setup();
  const rawBody = body();
  const res = await handler(
    await request(rawBody, {
      "x-hasat-timestamp": TIMESTAMP,
      "x-hasat-signature": await sign(rawBody, TIMESTAMP, ""),
    }),
  );
  assert.equal(res.status, 401);
  assert.equal(calls.fetches.length, 0);
});

Deno.test("send-sms: invalid userId / event / message → 400, no Twilio call", async () => {
  const { handler, calls } = setup();
  const invalid = [
    body({ userId: "not-a-uuid" }),
    body({ userId: undefined }),
    body({ event: "offer_rejected_typo" }),
    body({ event: "__proto__" }),
    body({ event: undefined }),
    body({ message: "" }),
    body({ message: "   " }),
    body({ message: "x".repeat(481) }),
    body({ message: 42 }),
    "not json",
    "[]",
  ];
  for (const rawBody of invalid) {
    const res = await handler(await signedRequest(rawBody));
    assert.equal(res.status, 400, rawBody);
    assert.deepEqual(await res.json(), { ok: false });
  }
  // 480 characters is the inclusive upper bound.
  assert.equal((await handler(await signedRequest(body({ message: "x".repeat(480) })))).status, 200);
  assert.equal(calls.fetches.length, 1);
});

Deno.test("send-sms: opt-out and missing phone are skipped without Twilio", async () => {
  const optOut = setup({ prefEnabled: async () => false });
  const r1 = await optOut.handler(await signedRequest());
  assert.deepEqual(await r1.json(), { ok: false, skipped: "opt-out" });
  assert.equal(optOut.calls.fetches.length, 0);

  const noPhone = setup({ phone: async () => null });
  const r2 = await noPhone.handler(await signedRequest());
  assert.deepEqual(await r2.json(), { ok: false, skipped: "no-phone" });
  assert.equal(noPhone.calls.fetches.length, 0);
});

Deno.test("send-sms: Twilio failure never leaks provider body, phone or error text", async () => {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const rejected = setup({
      fetch: async () => Response.json({ message: `Invalid To ${PHONE}` }, { status: 400 }),
    });
    const r1 = await rejected.handler(await signedRequest());
    assert.equal(r1.status, 502);
    assert.equal(await r1.text(), JSON.stringify({ ok: false }));

    const thrown = setup({
      fetch: async () => {
        throw new Error(`network down for ${PHONE}`);
      },
    });
    const r2 = await thrown.handler(await signedRequest());
    assert.equal(r2.status, 502);
    assert.equal(await r2.text(), JSON.stringify({ ok: false }));

    const dbDown = setup({
      prefEnabled: async () => {
        throw new Error("db down");
      },
    });
    const r3 = await dbDown.handler(await signedRequest());
    assert.equal(r3.status, 503);
    assert.equal(await r3.text(), JSON.stringify({ ok: false }));
    assert.equal(dbDown.calls.fetches.length, 0);
  } finally {
    console.error = original;
  }
  assert.ok(errors.length >= 3);
});

Deno.test("send-sms: non-POST methods are rejected without side effects", async () => {
  const { handler, calls } = setup();
  for (const method of ["GET", "OPTIONS", "PUT"]) {
    const res = await handler(await request("", {}, method));
    assert.equal(res.status, 405);
  }
  assert.equal(calls.fetches.length + calls.lookups, 0);
});
