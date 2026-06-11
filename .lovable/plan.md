# Iteration 3 — Farmer Auth, Onboarding & Account Screens

Build out the remaining farmer-side surfaces. All existing routes, components, tokens, and Zustand store stay intact — this iteration is purely additive (new routes, new store slices, two stubs replaced).

## 1. Store additions (`src/lib/hasat/store.ts`)

Additive only — no schema rewrites:
- `setPremium(value: boolean)` — flips `user.premium`.
- `updateUser(patch: Partial<User>)` — for onboarding profile + settings edits.
- `deleteParcel(id)` and `updateParcel(id, patch)` — used by Settings.
- New slice `notifPrefs: Record<EventKey, { whatsapp: boolean; push: boolean; sms: boolean }>` with `setNotifPref(event, channel, value)`. Seeded with sensible defaults (WhatsApp on for all, push on for offers + price, SMS off).
- New optional `user` fields: `crops?: string[]`, `landSize?: number`, `certs?: string[]`. Added to `User` type as optional so existing seeds keep working.

## 2. New routes

All farmer routes follow existing `farmer.*` filename + `/farmer/...` route-id convention. Auth + onboarding are top-level (outside the farmer layout) so the sidebar/header don't render.

### A1 — `src/routes/login.tsx` (`/login`)
- Full-screen `--dark` background, centered card.
- Logo block: 🌸 + "Hasat" (Georgia 38px, saffron) + "هارست" (Courier 11px muted).
- Phone field: 🇹🇷 +90 pill + 10-digit input (digits-only, formatted `5XX XXX XX XX`).
- Channel toggle: two pill buttons (WhatsApp default, SMS). Helper line "Çiftçilerin %95'i WhatsApp kullanıyor".
- "Kod Gönder →" primary button, disabled until 10 digits. On click sets local `step="otp"`.
- OTP step: 6 individual digit `<input>` boxes (Courier New 22px, auto-advance, backspace-to-previous, paste support). "Tekrar gönder (30s)" hint with simple countdown.
- "Giriş Yap ✓" enabled when 6 digits filled → `setRole("farmer")` + `navigate("/farmer/home")`.
- Footer link "Hesabın yok mu? Kayıt ol →" → `/onboarding/farmer`.
- Update `src/routes/index.tsx`: "Çiftçiyim" CTA navigates to `/login` (instead of immediately setting role). Buyer flow unchanged.

### A1-ONB — `src/routes/onboarding.farmer.tsx` (`/onboarding/farmer`)
Three steps held in local component state (`step: 1|2|3`). Shared `ProgressDots` component (3 dots, saffron active).
- **Step 1 (Welcome)**: Logo + 3 value-prop cards (📓 Dijital Defter / 📈 Fiyat Zekası / 🏪 Vitrin). "Başla →" advances; "Zaten hesabım var → Giriş Yap" goes to `/login`.
- **Step 2 (Profile)**: ProgressDots 2/3. Name input, city Select (Karabük/Safranbolu, Isparta, Tokat, Kastamonu, Diğer), crop multi-select chips (Safran/Lavanta/Tıbbi/Fındık/Zeytin/Diğer — toggled chip array), land size shadcn `Slider` 0.5–100 dönüm with current value displayed in saffron. "Devam →".
- **Step 3 (Certs)**: ProgressDots 3/3. Headline "Belgelenmiş üreticiler 3x daha fazla teklif alıyor". 4 tap-to-toggle cert cards (Organik / ISO 3632 / GlobalGAP / Coğrafi İşaret) with icon + label + description. Dashed upload zone (📄 icon, "JPG, PDF — maks 10MB") — placeholder, no real upload. "Profilimi oluştur ✓" calls `setRole("farmer")` + `updateUser({ name, city, crops, landSize, certs })` + navigates `/farmer/home`. "Şimdilik atla" ghost link does the same minus profile fields.

### A8 — `src/routes/farmer.analytics.tsx` (replace stub)
- `FarmerHeader title="Analitik"`.
- Time range pills: Bu Ay / Q3 2028 / 2028 Tümü — controls a local `range` state that selects between three mock datasets.
- KPI row (`grid-cols-2 md:grid-cols-4`): Toplam Gelir (gold, formatTRY), Ort. Verim/Dönüm, Aktif Parsel (from store), En İyi Alıcı.
- Revenue: Recharts `AreaChart`, saffron linear gradient, 8 monthly points.
- Quality breakdown: Recharts grouped `BarChart` A/B/C per parcel.
- Top buyers: ranked table (rank chip, name, total spend formatTRY, orders count, ★ rating).
- Seasonal trend: Recharts `BarChart` grouped by year (2027/2028/2029).

### A7 — `src/routes/farmer.community.tsx` (replace stub)
- `FarmerHeader title="Topluluk"`.
- Search `Input` + horizontal category chips (Safran / Pazar / Hava / Hastalık / Diğer). Local state filters list.
- Post cards: avatar circle (saffron bg, name initial), name, city, "2 saat önce", body (2-3 lines), 🤍/❤️ like toggle with count, 💬 comment count. 4–5 seeded mock posts in component state.
- FAB "+ Gönderi" opens shadcn `Sheet` with `Textarea` + "Paylaş" — prepends new post to local list.
- Empty state when search yields nothing.
- Mock data lives in the component (not in Zustand) — community is not a domain entity yet.

### A9 — `src/routes/farmer.premium.tsx` (replace stub)
- `FarmerHeader title="Premium"`.
- Three tier cards (mobile: horizontal scroll snap; `md:grid-cols-3`):
  - Ücretsiz — dark outline, "Mevcut Plan" chip if `!user.premium`.
  - Premium ₺299/ay — saffron border + bg tint, "En Popüler" badge.
  - Elite ₺799/ay — gold border.
- Feature comparison rows (6): Listeleme limiti, Fiyat alarmı, Analitik, Hasat aboneliği, Öncelikli eşleşme, Hesap yöneticisi — each tier shows ✓/✗ or value.
- "Premium'a Geç" CTA on Premium card → `navigate("/farmer/billing?plan=premium")`. Elite CTA same with `plan=elite`.

### A9-BILLING — `src/routes/farmer.billing.tsx`
- `FarmerHeader title="Ödeme"`.
- Plan summary card (reads `?plan=` query param, defaults to premium). Shows plan name + price.
- shadcn `Tabs`: "Banka Havalesi" (instructions block with IBAN placeholder) / "Kredi Kartı" (default).
- Credit card form: card number input formatted in 4-digit groups, MM/YY expiry, CVV, cardholder name. Pure presentation — no real processing.
- Saffron banner "30 gün ücretsiz dene".
- "Aboneliği Başlat ✓" → opens shadcn `Dialog` with ⭐ + "Premium aktif!" + close button that calls `setPremium(true)` and `navigate("/farmer/home")`.

### Settings — `src/routes/farmer.settings.tsx` (replace stub)
- `FarmerHeader title="Ayarlar"`.
- Profile section: avatar circle (initial placeholder, "Değiştir" button), name `Input`, city `Input`/Select — "Kaydet" calls `updateUser`.
- "Parsellerim" list from Zustand `parcels`, each row with name + area + edit (sheet with name/area inputs → `updateParcel`) + trash (`deleteParcel`).
- Certifications: read-only badges from `user.certs` (if present) + "Yenile" placeholder.
- Link rows: "Bildirim Tercihleri →" → `/farmer/settings/notifs`.
- Danger zone: destructive "Çıkış Yap" → `setRole(null)` + `navigate("/")`.

### `src/routes/farmer.settings.notifs.tsx`
- Back link to `/farmer/settings`, header "Bildirim Tercihleri".
- 4×3 table: rows Yeni Teklif / Fiyat Alarmı / Hasat Zamanı / Topluluk; cols WhatsApp / Push / SMS. Each cell is a shadcn `Switch` wired to `notifPrefs[event][channel]` + `setNotifPref`.

## 3. Sidebar wiring (`src/routes/farmer.tsx`)
- Repoint "Premium'a Geç" item to `/farmer/premium`.
- Add a profile/settings footer row (avatar + name) at the bottom of the sidebar → `/farmer/settings`. Keep existing nav order otherwise.

## 4. New shared component
- `src/components/hasat/ProgressDots.tsx` — `current`/`total` props, saffron active dot, muted inactive. Used by onboarding.

## Out of scope
- No real OTP/SMS backend, no real upload, no real payment processor — all simulated in component state.
- Buyer-side screens, A10 beyond Settings, real persistence to Supabase.
- No changes to design tokens, existing component signatures, or any existing route file other than `index.tsx` (CTA redirect), `farmer.tsx` (sidebar links), `store.ts` (additive), `farmer.analytics.tsx` + `farmer.community.tsx` (stub replacements).
