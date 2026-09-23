type JsonRecord = Record<string, unknown>;
const SENSITIVE_KEY = /^(share|p_token)$/i;
const SHARE_FRAGMENT = /(#|%23)share=[0-9a-f]{64}/gi;

function sanitize(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
    return value.replace(SHARE_FRAGMENT, (_match, prefix: string) => `${prefix}share=[REDACTED]`);
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([k, v]) => [k, sanitize(v, k)]),
    );
  }
  return value;
}

export function sanitizeBreadcrumb<T>(breadcrumb: T): T {
  return sanitize(breadcrumb) as T;
}

export function sanitizeEvent<T>(event: T): T {
  return sanitize(event) as T;
}
