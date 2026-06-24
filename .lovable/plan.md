## P13 — AIBox on Günlük / Fiyatlar / Vitrin / Teklifler

### Findings

- Edge fn `supabase/functions/ai-box-insights/index.ts` already routes via `if/else` on `pageType` (`dashboard`, `analytics`) and has shared CORS, JWT decode, AI gateway call, and isEmpty helper. We extend the same `if/else` chain plus add empty checks.
- `AIBox.tsx` prop union already includes `"journal" | "prices" | "storefront"` — no type change needed.
- Routes confirmed:
  - Günlük: `src/routes/farmer.journal.index.tsx` — header `<FarmerHeader title="Tarla Günlüğü">`, content begins `<div className="p-4 md:p-8 space-y-4 relative">`. Mount AIBox as first child.
  - Fiyatlar: `src/routes/farmer.prices.tsx` — header ends; main content `<div className="px-4 md:px-8 py-5 space-y-3">`. Mount as first child of that div.
  - Vitrin: `src/routes/farmer.storefront.tsx` — `<div className="px-4 md:px-8 py-5 pb-32 md:pb-5">` wrapping `<Tabs>`. Mount above the Tabs.
  - Teklifler: `src/routes/farmer.offers.tsx` — currently a one-liner "Yakında" placeholder. Replace with a proper component that keeps the placeholder body but adds the AIBox above it (same `storefront` page_type).
- Schemas confirmed (relevant columns):
  - `harvest_entries(farmer_id, harvest_date, crop, quantity, unit, quality, notes, created_at)`
  - `price_points(crop, hal_price, d2c_price, export_price, delta_7d, recorded_date)` — global, no farmer_id
  - `price_alerts(farmer_id, crop, target_price, condition, channels, active, created_at)`
  - `listings(farmer_id, crop, quantity, unit, price_per_unit, status, created_at)`
  - `offers(farmer_id, listing_id, status, price_per_unit, quantity, created_at)` — has farmer_id directly (no join needed)
  - `orders(farmer_id, status, created_at)` — no monetary column on orders; storefront fetch sticks to counts.

### Edge function — three new cases

In `supabase/functions/ai-box-insights/index.ts`, add three fetch functions and extend the `if/else` page_type dispatch + `isEmpty` rules. Same AI gateway call path, same JSON response contract (`{ insights, urgency, empty?, error? }`).

**fetchJournal(supa, userId)**
- One range query: `harvest_entries` last 31 days, columns `crop, quantity, unit, harvest_date`. In JS, bucket counts/qty by today / this ISO week / this month.
- Separate query: last 3 entries overall (`order by harvest_date desc limit 3`).
- Distinct crop count: `select crop` for this farmer, dedupe in JS.
- Context: `{ today: {count, qty}, week: {…}, month: {…}, last_entries: [...], distinct_crops: n }`.
- Empty when all bucket counts are 0 AND `last_entries.length === 0`.

**fetchPrices(supa, userId)**
- `price_alerts` where `farmer_id=userId AND active=true` → list `{crop, target_price, condition}`.
- Determine crops set: if alerts exist → alert crops; else → distinct crops from this farmer's most recent 5 `harvest_entries`.
- `price_points` where `crop = ANY(crops)` AND `recorded_date >= today-14d` ordered by `recorded_date desc`. Group by crop in JS: latest price + 7-day pct change (`delta_7d` already on the row, or compute first-vs-last in window).
- Context: `{ alerts: [...], tracked_crops: [{crop, latest_d2c, latest_hal, delta_7d, points: 14}] }`.
- Empty when `alerts.length === 0 && tracked_crops.length === 0`.

**fetchStorefront(supa, userId)**
- `listings` for farmer: select `status, crop, quantity, price_per_unit, created_at`. In JS: total count, count by status (active/sold/expired), and listing summaries (top 5 active by created_at desc).
- `offers` where `farmer_id=userId`: select `status, price_per_unit, quantity, listing_id, created_at`. Bucket counts by status; for pending compute `oldest_pending_at` (min created_at) and an `avg_pending_age_days`.
- Context: `{ listings: {total, active, sold, expired, top: [...]}, offers: {pending, accepted, rejected, countered, oldest_pending_at, avg_pending_age_days} }`.
- Empty when listings.total===0 AND every offer bucket is 0.

**Dispatch + AI prompt**
- Extend `if/else`: `journal` → fetchJournal, `prices` → fetchPrices, `storefront` → fetchStorefront. Unknown page_type still returns `{}` → empty.
- Same system prompt template, with `pageType` and `ctx` interpolated. Per-page goal added as a one-liner inside the prompt:
  - journal: "Çiftçinin günlük tutma alışkanlığını özetle (bugün/hafta/ay). 1–2 kısa öneri ekle. urgency yalnızca bu hafta 0 kayıt varsa."
  - prices: "Takip edilen ürünlerde son hareketleri yorumla. urgency: 7 günde |delta|>10% ya da bir alarm koşulu tetiklendiyse."
  - storefront: "Vitrin ve teklif durumunu değerlendir. urgency: 7 günden eski bekleyen teklif varsa."

### Frontend mounts

- `farmer.journal.index.tsx`: import AIBox, render `<AIBox page="journal" />` as first child of `<div className="p-4 md:p-8 space-y-4 relative">`, above the stats bar.
- `farmer.prices.tsx`: import AIBox, render `<AIBox page="prices" />` as first child of `<div className="px-4 md:px-8 py-5 space-y-3">`.
- `farmer.storefront.tsx`: import AIBox, render `<AIBox page="storefront" />` as first child of `<div className="px-4 md:px-8 py-5 pb-32 md:pb-5">`, above `<Tabs>`.
- `farmer.offers.tsx`: rewrite the inline component into a real `function Offers()` body, render `<FarmerHeader title="Teklifler" subtitle="Yakında" />`, then a container div with `<AIBox page="storefront" />` followed by the existing "🚧 Bu ekran sonraki adımda hazırlanacak." placeholder. Same `page="storefront"` as Vitrin — by design.

### Out of scope

No DB changes, no RLS changes, no AIBox component changes (prop union already covers it), no edits to `ai-chat-stream`, no usage-meter increments, no real Teklifler UI.

### Files

- Edited: `supabase/functions/ai-box-insights/index.ts` (add 3 fetchers + dispatch + isEmpty branches + per-page prompt goal)
- Edited: `src/routes/farmer.journal.index.tsx`, `src/routes/farmer.prices.tsx`, `src/routes/farmer.storefront.tsx`, `src/routes/farmer.offers.tsx` (single mount + import each; offers also gets a real component body)

### Verification

1. Visit Günlük → shimmer then journal-specific TR insights; today/week/month numbers reflect reality.
2. Visit Fiyatlar → insights mention farmer's tracked crops; if any active alert hit or |delta_7d|>10% appears as urgency.
3. Visit Vitrin → insights mention active listings + pending offers; old pending offer surfaces as urgency.
4. Visit Teklifler → same insights as Vitrin (identical payload), shown above placeholder.
5. Fresh farmer (no entries/alerts/listings/offers) → each page shows the "Henüz yeterli veri yok…" empty card.
6. Collapse on each page persists independently via `hasat_aibox_{page}_collapsed`.
7. Tapping any insight opens AI Chat with prefilled prompt (existing deeplink).
