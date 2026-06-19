## Goal

Eliminate the last bits of static "demo" content that show up before the user has any data, and make the Fiyatlar page actually load from the database (currently shows a permanent empty state because no query is wired up).

## Findings from the audit

### 1. Farmer home — `src/routes/farmer.home.tsx`

Three hardcoded blocks render for every new user, regardless of whether they have data:

- **Weather card**: literal `Karabük`, `14°C · Parçalı bulutlu`, `14°`, "Sulama gerekmiyor", "Hasat: 8 gün kaldı".
- **"Verim anomalisi tespit edildi" card**: fake AI insight claiming "Bu yılki safran verimi geçen yıla göre %12 düşük".
- **"Son Etkinlikler" feed**: three fake rows (`Eataly İstanbul ₺72.000`, `Mikla Restoran ₺28.500`, `Safran D2C ₺358/g`).
- **Bottom AIInsightBanner**: hardcoded "Safran D2C fiyatı 7 gün içinde %8.4 arttı…".

### 2. Farmer journal — `src/routes/farmer.journal.index.tsx`

`saveParcel` hardcodes every new parsel's location to `{ lat: 41.25, lng: 32.69, label: "Karabük, Safranbolu" }` regardless of where the user is. The "GPS ile algıla" button is also fake (just a 1.5s timeout that flips state to "done").

### 3. Fiyatlar page is broken — `src/routes/farmer.prices.tsx`

`prices` is read from the Zustand store, which is permanently initialized to `[]`. The Supabase table `public.price_points` already contains 5 real rows (Safran, Lavanta, Tıbbi Bitkiler, Fındık, Zeytin) but no query loads them. Result: the empty-state guard added previously fires forever → "Fiyatlar menu not responding".

## Changes

### A. `src/routes/farmer.home.tsx`

- Delete the weather card block, the verim-anomalisi card, the hardcoded activity feed, and the bottom hardcoded AIInsightBanner.
- Keep: header, quick actions, "Bu Sezon" card (uses real `entries`), "Aktif Ürünler" list (uses real `listings`).
- If both `entries` and `listings` are empty, show a single onboarding-style empty card pointing to "Hasat Kaydet" and "Vitrine Ekle" instead of the now-bare page.

### B. `src/routes/farmer.journal.index.tsx`

- Remove the hardcoded `{ lat: 41.25, lng: 32.69, label: "Karabük, Safranbolu" }` payload.
- When the user clicks "GPS ile algıla", call `navigator.geolocation.getCurrentPosition` and store the real coords; on failure, leave location undefined.
- Replace the static "✓ Karabük, Safranbolu — Doğrulandı" success line with the actual coords (or a generic "Konum kaydedildi" if no reverse-geocoding is available).
- Make the parsel save without a location possible (location becomes optional in the insert payload).

### C. Fiyatlar — wire real data without breaking the empty-state guard

- Add `usePricePoints()` in `src/lib/hasat/queries.ts` that selects from `public.price_points`, ordered by `recorded_date desc`, and maps DB columns (`d2c_price`, `hal_price`, `export_price`, `delta_7d`, `recorded_date`) into the existing `PricePoint` shape used by the UI.
- Reduce to one row per crop (latest `recorded_date`).
- Update `src/routes/farmer.prices.tsx` to read from `usePricePoints()` instead of `useHasat((s) => s.prices)`. Keep the existing empty-state guard for the case where the table is genuinely empty, and add an `isLoading` branch that renders `<LoadingDots />` so the page is never silent on first load.
- Leave the store's `prices: []` field in place (other code may still reference it), just stop reading it on this page.

### D. Sanity sweep

- Re-grep for any remaining literal mock strings (`Eataly`, `Mikla`, `Karabük`, `14°C`, `358`, `72.000`, `28.500`) and confirm only `onboarding.farmer.tsx` city dropdown options remain — those are legitimate user-facing choices, not demo data.
- Confirm `buyer.discover.tsx`, `buyer.reports.tsx`, `farmer.community.tsx`, `farmer.analytics.tsx`, `farmer.orders.index.tsx`, `farmer.storefront.tsx` already render proper empty states from real queries.

## Out of scope

- Real weather integration, real "verim anomalisi" detection, real activity feed, and reverse geocoding. Those are separate features and need their own data sources/APIs — for now the corresponding cards are simply removed rather than replaced.
- No DB migrations, no RLS changes, no Twilio/edge-function changes.
- No styling/design changes beyond removing or relocating the affected blocks.
