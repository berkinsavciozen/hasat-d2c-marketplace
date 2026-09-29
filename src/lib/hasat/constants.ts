// Public support/contact e-mail (privacy, terms, AI chat human support).
export const HASAT_SUPPORT_EMAIL = "destek@hasat-ai.com";

// Single source for the public site's base URL — canonical links, share
// links, sitemap, and og:url all read from here so the domain can change
// (F17) without a code hunt (F8/F17, Launch-Scope-Plan.md).
// T1 Faz 1: reads from a build-time env var, falling back to the current
// production domain when it's unset — domain switched to hasat-ai.com on 2026-09-24.
export const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL ?? "https://hasat-ai.com";
