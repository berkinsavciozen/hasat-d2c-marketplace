// End-to-end: the request captured from public.dispatch_sms (real pgcrypto HMAC, pg_net body bytes)
// must pass the real send-sms handler's verification with the same secret. Run via run.sh.
import assert from "node:assert/strict";
import { createSendSmsHandler } from "../../functions/send-sms/handler.ts";

const captured = JSON.parse(await Deno.readTextFile(Deno.env.get("SEC_EDGE_CAPTURE")!));
const secret = Deno.env.get("SEC_EDGE_SECRET")!;
const bodyBytes = Uint8Array.from(
  atob(captured.bodyBase64.replace(/\s+/g, "")),
  (c) => c.charCodeAt(0),
);

function setup() {
  const fetches: Array<RequestInit | undefined> = [];
  const handler = createSendSmsHandler({
    env: (name) =>
      ({
        NOTIFY_ADMIN_INGRESS_SECRET: secret,
        TWILIO_ACCOUNT_SID: "ACtest",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_MESSAGING_SERVICE_SID: "MGtest",
      })[name],
    now: () => Number(captured.timestamp) * 1000,
    prefEnabled: async () => true,
    phone: async () => "+905001112233",
    fetch: async (_input, init) => {
      fetches.push(init);
      return Response.json({ sid: "SM1" }, { status: 201 });
    },
  });
  return { handler, fetches };
}

function request(body: Uint8Array<ArrayBuffer>, signature = captured.signature): Request {
  return new Request("https://example.test/functions/v1/send-sms", {
    method: "POST",
    headers: {
      "Content-Type": captured.contentType,
      "X-Hasat-Timestamp": captured.timestamp,
      "X-Hasat-Signature": signature,
    },
    body,
  });
}

Deno.test("dispatch_sms → send-sms: DB-signed request is accepted and sends one SMS", async () => {
  const { handler, fetches } = setup();
  const res = await handler(request(bodyBytes));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(fetches.length, 1);
  const form = fetches[0]!.body as URLSearchParams;
  assert.equal(form.get("Body"), 'Hasat: Çiğdem "Şeftali" için teklif verdi 🍑\nüç kasa — ığüşöç');
});

Deno.test("dispatch_sms → send-sms: one flipped body byte is rejected", async () => {
  const { handler, fetches } = setup();
  const tampered = bodyBytes.slice();
  tampered[tampered.length - 3] ^= 0x01;
  assert.equal((await handler(request(tampered))).status, 401);
  assert.equal(fetches.length, 0);
});
