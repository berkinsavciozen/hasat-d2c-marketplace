Plan: P18-F/E/C/D + Faz D backend RPC — tek turda

## Step 1 — Faz D backend: `get_price_history_series` RPC (tek migration)

New file only under `supabase/migrations/`. No table/RLS/trigger changes.

- Migration `add_price_history_series_rpc`:
  - `CREATE OR REPLACE FUNCTION public.get_price_history_series(p_crop text, p_weeks int default 12) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`.
  - Canonicalize crop via `crop_config` (case-insensitive), same as summary. If unknown crop → `{ hasat_series: [], official_series: null }`.
  - Build week buckets `date_trunc('week', recorded_date)` for the last `p_weeks` weeks.
  - For `source='order'`: per bucket compute `avg(price_per_unit)` and `count(distinct farmer_id)`; emit `{ week_start, avg_price }` ONLY when distinct-farmer count ≥ 5. Weeks below the threshold are omitted (no null padding, no interpolation).
  - For `source='hks'`: when `crop_config.has_official_price_source` is true, aggregate the same bucketing on official rows into `official_series: [{ week_start, avg_price }, …]`. No k-anon threshold on official data. When `has_official_price_source` is false → `official_series: null`.
  - Never merge official + community series; always separate keys.
  - `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`.
- Post-migration verification: query `pg_proc` to confirm the function exists; confirm no other DDL diff by checking migration count delta (1) and running `supabase--linter`.

## Step 2 — `src/lib/hasat/queries.ts` glue (still Step 1 scope, src-only)

- Add `PriceHistorySeries` type:
  ```
  export interface PriceHistorySeries {
    hasat: { date: string; avgPrice: number }[];
    official: { date: string; avgPrice: number }[] | null;
  }
  ```
- Add `usePriceHistorySeries(crop: string | null | undefined, weeks = 12)` using `supabase.rpc('get_price_history_series', { p_crop, p_weeks })`, `enabled: !!crop`, mapping snake_case → camelCase.

## Step 3 — P18-F: Prices + Analytics (src only)

- `src/components/hasat/PricesPageBody.tsx`:
  - Top search/filter bar: text search over `useCropsWithPriceData()` result (client-side filter by crop name).
  - Each `PriceSummaryCard`:
    - Star/watchlist icon backed by `usePriceAlerts()` + `useCreatePriceAlert()` / `useTogglePriceAlert()` for the current crop.
    - Visual indicator for `distinctFarmerCount` (small dot cluster or badge) and stddev band (min–max chip).
    - Feed `Sparkline` with the real `usePriceHistorySeries(crop)` result. Hide sparkline entirely when `hasat.length < 2`. Never invent points.
- `src/routes/farmer.analytics.tsx`:
  - Replace static 3 stat cards + top-product row with real client-side aggregations over `useFarmerOrders()` (paid only via `isPaidOrder`) + `useFarmerListings()`:
    - Last-6-months revenue trend (monthly bar chart, mirroring `buyer.reports.tsx` pattern).
    - Product-level breakdown (crop × revenue).
  - No new queries.

## Step 4 — P18-E: Storefront share preview (src only)

- `src/routes/s.$slug.tsx`:
  - Hero banner using the farmer's newest parcel photo (already available via existing storefront query) — background image + overlay with farmer name, city, existing cert badges.
  - Native share button: if `typeof navigator !== 'undefined' && navigator.share`, call `navigator.share({ url, title, text })`; otherwise fall back to `copyVitrinLink`.
- `src/routes/farmer.storefront.tsx`:
  - Small "Alıcılar böyle görecek" live preview card reusing the same hero layout as a compact component; wraps a `<Link to="/s/$slug" params={{ slug }}>`.
- No new queries; use existing `useStorefront` / `vitrinUrl`.

## Step 5 — P18-C: Order status + WhatsApp (src only)

- `src/components/hasat/OrderTimeline.tsx`:
  - Convert current text list into a step indicator: connector line, filled circles for completed steps (check icon), highlighted current step (saffron), muted future steps. Preserve current data inputs and step ordering.
- `src/routes/farmer.orders.index.tsx` and `src/routes/buyer.orders.$orderId.tsx`:
  - Where the counterparty's phone is available, add a WhatsApp button next to the existing `tel:` link: `https://wa.me/{digits}` (strip non-digits, keep TR country code). Icon + "WhatsApp'tan sor". 48px touch target.
- No new queries.

## Step 6 — P18-D: Buyer reports card feel (src only)

- `src/routes/buyer.reports.tsx`:
  - "Tedarikçi Güveni": redesign each supplier row as a card — large farmer name, city subtitle, delivery-rate as colored badge + progress bar, small product photo when available (first listing photo already in analytics data path).
  - "Son Siparişler": card list with product photo, order ref, status badge, total.
  - Keep `useBuyerAnalytics`, `orderRowTotal`, `isPaidOrder` and all math unchanged. Purely presentational.

## Verification

- After each step: `bunx tsgo --noEmit` returns clean.
- After Step 1: exactly one new file under `supabase/migrations/`; no other supabase/ diff.
- Steps 2–6: `git diff --name-only` shows only `src/**` changes.
- No synthetic/interpolated data anywhere: gated on real thresholds; empty states render nothing rather than fake points.

## Files touched

- `supabase/migrations/<timestamp>_add_price_history_series_rpc.sql` (new, Step 1 only)
- `src/lib/hasat/queries.ts`
- `src/components/hasat/PricesPageBody.tsx`
- `src/components/hasat/OrderTimeline.tsx`
- `src/components/hasat/Sparkline.tsx` (only if API adjustments are needed for real series; otherwise unchanged)
- `src/routes/farmer.analytics.tsx`
- `src/routes/s.$slug.tsx`
- `src/routes/farmer.storefront.tsx`
- `src/routes/farmer.orders.index.tsx`
- `src/routes/buyer.orders.$orderId.tsx`
- `src/routes/buyer.reports.tsx`