// Business WhatsApp number (international format, digits only, no +)
export const HASAT_WHATSAPP_NUMBER = "905421241011";

// Single source for the public site's base URL — canonical links, share
// links, sitemap, and og:url all read from here so the domain can change
// (F17) without a code hunt (F8/F17, Launch-Scope-Plan.md).
// T1 Faz 1: reads from a build-time env var, falling back to the current
// production domain when it's unset — flip day sets VITE_PUBLIC_BASE_URL,
// no code change needed.
export const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL ?? "https://hasat.lovable.app";
