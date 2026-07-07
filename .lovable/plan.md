
## P17 — Marketing landing page + indoor interest capture

Replace the minimal `/` with a complete Turkish marketing page. Preserve brand tokens (`--dark`, `--saffron`, `--gold`, `--hwhite`), 🌸 mark, font-serif headings, and existing role → `/login?role=…` CTA behavior.

### 1. Auth-aware redirect (fix stale-cache bug)

Rework `src/routes/index.tsx`:
- Add a `checking` state (default true).
- On mount: call `supabase.auth.getSession()`. If session exists, fetch `profiles.role, name` (same shape as `login.tsx`).
  - No session → set `checking=false`, render landing.
  - Session + no `profile.name` → `navigate({ to: "/onboarding/{role}" })`.
  - Session + `profile.name` → `navigate({ to: role === "buyer" ? "/buyer/discover" : "/farmer/home" })`.
- While `checking` is true, render a minimal centered 🌸 splash on `--dark` (no landing flash).
- Drop the Zustand-only redirect; keep `setRole/updateUser` sync via existing `AuthBootstrap` in `__root.tsx`.

### 2. Landing page sections (single route file, componentized locally)

Order and content exactly as spec:
1. **Hero** — "Tarladan sofraya, aracısız." + subhead + two role CTAs (large, primary).
2. **Problem** — 2 cards (Çiftçi / Alıcı), 3 bullet pain points each.
3. **Çiftçiyim** — "Ürününü Türkiye'ye aç" + 6 feature cards (vitrin, günlük, izlenebilirlik, pazarlık, stok, referral) in 2-col grid (1-col mobile). Placeholders = clean lucide icon tiles on token-tinted backgrounds; no fake screenshots.
4. **Alıcıyım** — "Güvenilir üreticiyi bul, doğrudan al" + 5 cards (keşfet, ürün geçmişi w/ anti-sahtecilik emphasis, izlenebilir rozet, teklif, sipariş takibi).
5. **Nasıl Çalışır** — two 4-step numbered journeys side-by-side (Ahmet/Safranbolu, Zeynep/İstanbul).
6. **Hasat AI** — `--dark` background, 3 cards each with description + a small chat-bubble example (question + Hasat's reply) styled like WhatsApp thread.
7. **Güven** — 3 one-liners: %5 komisyon (ilk 3 ay ücretsiz), veri güvenliği, gerçek çiftçi doğrulaması.
8. **Indoor Farming** (`id="indoor-basvuru"`) — pitch (indoor + kırsal genç kalıcılığı + TKDK genç çiftçi bonusu) + form (Ad, Telefon, Şehir, İlgi Tipi radio, Not) + WhatsApp CTA (`wa.me/...?text=…`).
9. **Footer** — 🌸 Hasat + tagline + contact (WhatsApp link).

Repeats of the two role CTAs at the bottom of Çiftçi/Alıcı sections and above the footer.

### 3. Indoor lead capture — backend

**Migration** (`indoor_interest_leads`):
- Columns: `id`, `name`, `phone`, `city`, `interest_type` (check: danışmanlık | ortaklık | diğer), `note`, `created_at`.
- `GRANT INSERT ON public.indoor_interest_leads TO anon, authenticated;`
- `GRANT ALL ON public.indoor_interest_leads TO service_role;`
- Enable RLS. Policies:
  - INSERT: `TO anon, authenticated USING (true) WITH CHECK (true)` (form is public).
  - SELECT: none for anon/authenticated (service_role bypasses).

**Server function** `src/lib/api/indoor-interest.functions.ts` (`createServerFn`, no auth middleware — public form):
- `inputValidator` with zod: name (1–100, trimmed), phone (digits, 10–15), city (≤80, optional), interest_type enum, note (≤500, optional).
- Handler:
  1. Insert row using a server publishable client (respects RLS anon INSERT).
  2. Fire Twilio SMS to Berkin's number via the existing pattern (env `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`; Berkin's number stored as a new secret `BERKIN_NOTIFY_PHONE`). Body: `🌱 Yeni indoor başvuru: {name} / {phone} / {city} / {interest_type}`.
  3. Wrap SMS in try/catch — SMS failure must not block the lead save; log and continue.
  4. Return `{ ok: true }`.

**Secret**: `BERKIN_NOTIFY_PHONE` (E.164). If not set at call time, skip SMS silently and log a warning. I'll ask the user to add it after the migration lands.

### 4. Client form wiring

- Local `useMutation` calling `useServerFn(submitIndoorInterest)`.
- Client-side zod validation + inline errors.
- On success: toast "Başvurunuz alındı", reset form.
- WhatsApp CTA button renders alongside form: `https://wa.me/{BERKIN_NUMBER}?text=…` — number is a client-safe constant (put in `src/lib/hasat/constants.ts`); confirm the number with user before hardcoding, otherwise use a placeholder note.

### 5. Cleanup

- No `/indoor-basvuru` route created (spec explicit); if one already exists, leave it out of scope unless found during exploration.
- `bunx tsgo --noEmit` must be clean at the end.

### Files (planned)

- edit: `src/routes/index.tsx` (auth-aware redirect + full landing page)
- new: `src/lib/api/indoor-interest.functions.ts`
- new: migration for `indoor_interest_leads`
- edit (if needed): `src/lib/hasat/constants.ts` for Berkin WhatsApp number constant

### Open questions

1. **Berkin's phone number** for both the Twilio SMS notify and the WhatsApp CTA `wa.me` link — please share the E.164 number (e.g. `+9053…`). I'll add the SMS target as a secret (`BERKIN_NOTIFY_PHONE`) and use the same number for the `wa.me` link.
2. Any existing indoor pitch copy you want reused, or should I write concise Turkish copy from scratch matching the rest of the page's tone?
