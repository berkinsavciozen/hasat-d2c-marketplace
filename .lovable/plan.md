# Auth & Onboarding Flow Fixes

Logic and routing only — no UI/design changes.

## Current flow (verified)

1. `/` (Entry) — pick role → `/login?role=...`
2. `/login` — phone (+90, 10 digits) → `signInWithOtp` (sms or whatsapp) → 6-digit OTP → `verifyOtp({ type: "sms" })`
3. DB trigger `handle_new_user` creates `profiles` row with role from signup metadata
4. After verify, login fetches profile:
   - `profile.name` empty → `/onboarding/{role}`
   - else → `/{role}/home` or `/buyer/discover`
5. `__root.tsx` `AuthBootstrap` rehydrates store from existing session on mount

## Bugs found

1. **Leading-zero phone numbers** — `phoneDigits.slice(0, 10)` keeps the leading `0` if the user types `05XX…` (very common in TR). Result: Twilio is called with `+900533…`, OTP never arrives.
2. **`/login` doesn't redirect signed-in users** — a returning user who hits `/login` directly can re-trigger OTP and run into Supabase rate limits. Should redirect to their dashboard based on `profile.role`.
3. **Onboarding pages don't guard unauthenticated users** — the auth check happens only inside `finish()`. Users without a session can fill the whole form before being kicked back. Add a `useEffect` `getUser()` guard at mount; redirect to `/login?role=...` if no session.
4. **Onboarding doesn't redirect already-onboarded users** — if a user with `profile.name` set lands on `/onboarding/farmer`, they can overwrite their profile. Guard: if profile already has a name, redirect to dashboard.
5. **`AuthBootstrap` incomplete-onboarding gap** — if session exists but `profile.name` is empty, it returns early without redirecting. Entry then sees `user.role` undefined and shows the role picker; picking a role sends them back to `/login` while already authenticated. Fix: when session+profile exist but `name` empty, navigate to `/onboarding/{role}`.
6. **Generic OTP errors** — Supabase returns English errors like "Token has expired or is invalid". Map common cases to Turkish:
   - invalid/expired token → "Kod hatalı veya süresi dolmuş. Tekrar deneyin."
   - rate-limit → "Çok fazla deneme. Lütfen bekleyin."
7. **`verifyOtp` type for WhatsApp** — currently hardcoded `type: "sms"`. Supabase accepts `"sms"` for both SMS and WhatsApp Twilio channels (verified), so this is OK; will leave as-is but add inline comment.

## Changes (file-scoped)

### `src/routes/login.tsx`
- Strip leading `0` from `phoneDigits` before slicing to 10.
- On mount: `getSession()`; if signed-in, look up profile and redirect (dashboard if `name` set, else onboarding).
- Localize OTP error messages in `verify()` and `sendOtp()` catch blocks.

### `src/routes/onboarding.farmer.tsx` & `src/routes/onboarding.buyer.tsx`
- Add mount-time `useEffect`:
  - No session → `navigate({ to: "/login", search: { role } })`.
  - Session + `profile.name` already set → navigate to dashboard.

### `src/routes/__root.tsx` (`AuthBootstrap`)
- When session exists and profile exists but `profile.name` is empty, navigate to `/onboarding/{role}` (only if not already on a `/login` or `/onboarding/*` route, to avoid loops).

## Out of scope
- No UI/design changes.
- No DB migrations (existing trigger + RLS are correct).
- No changes to Twilio/Edge Function setup.
