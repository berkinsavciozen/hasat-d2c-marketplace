export type AdminSmsEventType = "crop_type_request.created" | "crop_request.catalog_gap.created";

export interface ClaimedEvent {
  outcome: string;
  eventType?: AdminSmsEventType;
  payload?: Record<string, unknown>;
  attemptCount?: number;
}

export interface NotifyAdminDependencies {
  env(name: string): string | undefined;
  claim(eventId: string): Promise<ClaimedEvent>;
  complete(
    eventId: string,
    outcome: "sent" | "retryable_failure" | "uncertain",
    providerMessageId?: string,
  ): Promise<boolean>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  now(): number;
}

const MAX_REQUEST_BYTES = 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
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

async function hmacHex(secret: string, value: string): Promise<string> {
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

function boundedString(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
  required = false,
): string | null {
  const value = payload[key];
  if (value == null && !required) return null;
  if (typeof value !== "string") throw new Error(`invalid_${key}`);
  const trimmed = value.trim();
  if ((required && trimmed.length === 0) || trimmed.length > maxLength) {
    throw new Error(`invalid_${key}`);
  }
  return trimmed || null;
}

function boundedMonth(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  if (value == null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 12) {
    throw new Error(`invalid_${key}`);
  }
  return value as number;
}

export function renderAdminMessage(
  eventType: AdminSmsEventType,
  payload: Record<string, unknown>,
): string {
  const sourceId = boundedString(payload, "sourceId", 36, true);
  if (!sourceId || !UUID_PATTERN.test(sourceId)) {
    throw new Error("invalid_sourceId");
  }
  const cropName = boundedString(payload, "cropName", 100, true)!;
  const note = boundedString(payload, "note", 80);

  let message: string;
  if (eventType === "crop_type_request.created") {
    const unit = boundedString(payload, "unit", 20);
    const category = boundedString(payload, "category", 40);
    const requesterName = boundedString(payload, "requesterName", 80, true)!;
    const harvestStartMonth = boundedMonth(payload, "harvestStartMonth");
    const harvestEndMonth = boundedMonth(payload, "harvestEndMonth");
    const unitLabel = unit ? ` (${unit})` : "";
    const categoryLabel = category ? ` · ${category}` : "";
    const harvestLabel =
      harvestStartMonth && harvestEndMonth
        ? ` · Hasat: ${harvestStartMonth}-${harvestEndMonth} ay`
        : "";
    message = `🌾 Yeni ürün türü talebi: ${cropName}${unitLabel}${categoryLabel}${harvestLabel} — ${requesterName}`;
  } else if (eventType === "crop_request.catalog_gap.created") {
    message = `🛒 Katalogda olmayan ürün talebi: "${cropName}" (buyer)`;
  } else {
    throw new Error("unsupported_event_type");
  }

  if (note) message += ` · Not: ${note}`;
  return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}

function providerConfig(deps: NotifyAdminDependencies) {
  const sid = deps.env("TWILIO_ACCOUNT_SID") ?? "";
  const token = deps.env("TWILIO_AUTH_TOKEN") ?? "";
  const messagingServiceSid = deps.env("TWILIO_MESSAGING_SERVICE_SID") ?? "";
  const recipient = deps.env("ADMIN_NOTIFY_PHONE") ?? "";
  if (!sid || !token || !messagingServiceSid || !PHONE_PATTERN.test(recipient)) return null;
  return { sid, token, messagingServiceSid, recipient };
}

async function parseProviderMessageId(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as { sid?: unknown };
    return typeof data.sid === "string" && data.sid.length <= 64 ? data.sid : undefined;
  } catch {
    return undefined;
  }
}

export function createNotifyAdminHandler(deps: NotifyAdminDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { allow: "POST, OPTIONS" },
      });
    }
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, {
        allow: "POST, OPTIONS",
      });
    }

    const timestampHeader = req.headers.get("x-hasat-timestamp") ?? "";
    const signatureHeader = req.headers.get("x-hasat-signature") ?? "";
    const ingressSecret = deps.env("NOTIFY_ADMIN_INGRESS_SECRET") ?? "";
    if (!timestampHeader || !signatureHeader || !ingressSecret) {
      return json({ error: "unauthorized" }, 401);
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return json({ error: "payload_too_large" }, 413);
    }

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "payload_too_large" }, 413);
    }

    const timestamp = Number(timestampHeader);
    if (
      !Number.isInteger(timestamp) ||
      Math.abs(Math.floor(deps.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS ||
      !HEX_SHA256_PATTERN.test(signatureHeader)
    ) {
      return json({ error: "forbidden" }, 403);
    }

    const expectedSignature = await hmacHex(ingressSecret, `${timestampHeader}.${rawBody}`);
    if (!timingSafeEqual(signatureHeader, expectedSignature)) {
      return json({ error: "forbidden" }, 403);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body as Record<string, unknown>).length !== 1
    ) {
      return json({ error: "invalid_request" }, 400);
    }
    const eventId = (body as { eventId?: unknown }).eventId;
    if (typeof eventId !== "string" || !UUID_PATTERN.test(eventId)) {
      return json({ error: "invalid_request" }, 400);
    }

    let claimed: ClaimedEvent;
    try {
      claimed = await deps.claim(eventId);
    } catch {
      return json({ error: "dispatch_unavailable" }, 503);
    }

    if (claimed.outcome === "duplicate") {
      return json({ ok: true, status: "duplicate" });
    }
    if (claimed.outcome === "in_progress_or_uncertain") {
      return json({ ok: true, status: "already_processing" }, 202);
    }
    if (claimed.outcome === "rate_limited" || claimed.outcome === "retry_later") {
      return json({ error: "rate_limited" }, 429, { "retry-after": "60" });
    }
    if (claimed.outcome === "not_found") {
      return json({ error: "event_not_found" }, 404);
    }
    if (claimed.outcome === "attempts_exhausted") {
      return json({ error: "attempts_exhausted" }, 409);
    }
    if (claimed.outcome !== "claimed" || !claimed.eventType || !claimed.payload) {
      return json({ error: "invalid_dispatch_state" }, 500);
    }

    let message: string;
    try {
      message = renderAdminMessage(claimed.eventType, claimed.payload);
    } catch {
      await deps.complete(eventId, "uncertain");
      return json({ error: "invalid_event" }, 422);
    }

    const config = providerConfig(deps);
    if (!config) {
      await deps.complete(eventId, "retryable_failure");
      return json({ error: "sms_provider_unavailable" }, 503);
    }

    const form = new URLSearchParams({
      To: config.recipient,
      MessagingServiceSid: config.messagingServiceSid,
      Body: message,
    });

    let providerResponse: Response;
    try {
      providerResponse = await deps.fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            authorization: "Basic " + btoa(`${config.sid}:${config.token}`),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        },
      );
    } catch {
      await deps.complete(eventId, "uncertain");
      return json({ error: "sms_result_uncertain" }, 502);
    }

    if (!providerResponse.ok) {
      await deps.complete(eventId, "retryable_failure");
      return json({ error: "sms_provider_failed" }, 502);
    }

    const providerMessageId = await parseProviderMessageId(providerResponse);
    const completed = await deps.complete(eventId, "sent", providerMessageId);
    if (!completed) return json({ error: "dispatch_state_unavailable" }, 500);

    return json({ ok: true, status: "sent" });
  };
}
