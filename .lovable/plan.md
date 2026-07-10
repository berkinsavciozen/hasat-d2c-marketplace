# Finish audit-fix follow-through

The four triggers (`enforce_offer_transitions`, `enforce_community_moderation`, `enforce_profile_self_update_restrictions`, `enforce_cert_verification`) are already applied and live from the previous turn. Only cleanup remains.

## Changes

1. `src/routes/farmer.settings.tsx` line 374 — swap the always-rendered "Doğrulandı: {date}" for a conditional so farmer-created rows (which will now always have `verified_at = NULL` due to the new trigger) show a clean "Doğrulama bekleniyor" instead of an empty date:

   ```tsx
   <div>{c.verified_at ? `Doğrulandı: ${fmtDate(c.verified_at)}` : "Doğrulama bekleniyor"}</div>
   ```

2. Run `tsgo` and report the result.

No other files change. Client-side `looksLikePriceCoordination` stays for instant UI feedback (defense in depth); DB trigger is now authoritative.
