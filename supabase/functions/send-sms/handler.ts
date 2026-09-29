// SEC-EDGE S1 — send-sms is a server-to-server endpoint only.
//
// The only legitimate caller is public.dispatch_sms (Postgres, via pg_net). It signs the exact raw
// JSON body with the Vault secret `notify_admin_ingress_hmac`; the Edge runtime holds the same value
// as NOTIFY_ADMIN_INGRESS_SECRET (L0-02B pattern, no new secret). The signed text carries a
// "send-sms." domain prefix so a notify-admin signature can never be replayed here (and vice versa).
//
// Fail-closed: any missing/short secret, missing header, stale timestamp or bad signature is 401
// before any database read or Twilio call. The response never echoes the provider body, the phone
// number or error text — only { ok, skipped? }. Details go to console.error.

export interface SendSmsDependencies {
  env(name: string): string | undefined;
  now(): number;
  /** notif_prefs.<column> for the user; false when no row / null. Throws on DB error. */
  prefEnabled(userId: string, column: string): Promise<boolean>;
  /** profiles.phone for the user, or null. Throws on DB error. */
  phone(userId: string): Promise<string | null>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

// notif_prefs has per-event SMS columns; map incoming `event` to the right column.
// NOTE: Keep this map in sync with the CASE expression in the SQL `dispatch_sms(_user_id, _event, _message)`
// function. If you add/remove an event in one, mirror the change in the other.
export const COL: Record<string, string> = {
  new_offer: "new_offer_sms",
  harvest_time: "harvest_time_sms",
  offer_accepted: "offer_accepted_sms",
  payment_confirmed: "payment_confirmed_sms",
  order_shipped: "order_shipped_sms",
  order_delivered: "order_delivered_sms",
  order_cancelled: "order_cancelled_sms",
  dispute_opened: "dispute_opened_sms",
  crop_request_match: "crop_request_match_sms",
  subscription_new: "subscription_new_sms",
  subscription_accepted: "subscription_accepted_sms",
  subscription_rejected: "subscription_rejected_sms",
};

export const SIGNATURE_DOMAIN = "send-sms";
const MIN_SECRET_LENGTH = 32;
const MAX_REQUEST_BYTES = 4096;
const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_MESSAGE_LENGTH = 480;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const TIMESTAMP_PATTERN = /^[0-9]{1,12}$/;

type Result = { ok: boolean; skipped?: string };

function json(body: Result, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a.toLowerCase());
  const right = encoder.encode(b.toLowerCase());
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function signedText(timestamp: string, rawBody: string): string {
  return `${SIGNATURE_DOMAIN}.${timestamp}.${rawBody}`;
}

function parseBody(rawBody: string): { userId: string; event: string; message: string } | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { userId, event, message } = body as Record<string, unknown>;
  if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) return null;
  if (typeof event !== "string" || !Object.hasOwn(COL, event)) return null;
  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return null;
  }
  return { userId, event, message };
}

export function createSendSmsHandler(deps: SendSmsDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ ok: false }, 405);

    const timestampHeader = req.headers.get("x-hasat-timestamp") ?? "";
    const signatureHeader = req.headers.get("x-hasat-signature") ?? "";
    const secret = deps.env("NOTIFY_ADMIN_INGRESS_SECRET") ?? "";
    if (!timestampHeader || !signatureHeader || secret.length < MIN_SECRET_LENGTH) {
      return json({ ok: false }, 401);
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return json({ ok: false }, 413);
    }
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ ok: false }, 413);
    }

    if (
      !TIMESTAMP_PATTERN.test(timestampHeader) ||
      Math.abs(Math.floor(deps.now() / 1000) - Number(timestampHeader)) > MAX_CLOCK_SKEW_SECONDS ||
      !HEX_SHA256_PATTERN.test(signatureHeader)
    ) {
      return json({ ok: false }, 401);
    }
    const expected = await hmacHex(secret, signedText(timestampHeader, rawBody));
    if (!timingSafeEqual(signatureHeader, expected)) {
      return json({ ok: false }, 401);
    }

    const body = parseBody(rawBody);
    if (!body) return json({ ok: false }, 400);
    const column = COL[body.event];

    let phone: string | null;
    try {
      if (!(await deps.prefEnabled(body.userId, column))) {
        return json({ ok: false, skipped: "opt-out" });
      }
      phone = await deps.phone(body.userId);
    } catch (e) {
      console.error("[send-sms] lookup failed", e);
      return json({ ok: false }, 503);
    }
    if (!phone) return json({ ok: false, skipped: "no-phone" });

    const sid = deps.env("TWILIO_ACCOUNT_SID");
    const token = deps.env("TWILIO_AUTH_TOKEN");
    const msid = deps.env("TWILIO_MESSAGING_SERVICE_SID");
    if (!sid || !token || !msid) {
      console.error("[send-sms] Twilio secrets missing");
      return json({ ok: false }, 503);
    }

    const to = phone.startsWith("+") ? phone : "+" + phone;
    const form = new URLSearchParams({ To: to, MessagingServiceSid: msid, Body: body.message });

    let resp: Response;
    try {
      resp = await deps.fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
    } catch (e) {
      console.error("[send-sms] Twilio request failed", e);
      return json({ ok: false }, 502);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[send-sms] Twilio rejected", resp.status, text);
      return json({ ok: false }, 502);
    }
    return json({ ok: true });
  };
}
