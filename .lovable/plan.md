# P16-E: Dynamic Price Feed

Replace the static Fiyatlar page with a live `price_feed` table that farmers can contribute to.

## 1. Database

New migration:

```sql
CREATE TABLE public.price_feed (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_name text NOT NULL,
  price_per_kg numeric NOT NULL,   -- generic price value; real unit is in `unit`
  unit text NOT NULL DEFAULT 'kg',
  source text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles(id)
);

GRANT SELECT ON public.price_feed TO anon, authenticated;
GRANT INSERT ON public.price_feed TO authenticated;
GRANT ALL ON public.price_feed TO service_role;

ALTER TABLE public.price_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read price feed"
  ON public.price_feed FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Farmers can insert price feed"
  ON public.price_feed FOR INSERT
  TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'farmer')
  );

CREATE INDEX idx_price_feed_crop_recorded ON public.price_feed (LOWER(TRIM(crop_name)), recorded_at DESC);
```

No UPDATE/DELETE policies.

## 2. Data layer (`src/lib/hasat/queries.ts`)

- `usePriceFeed()` — SELECT all, ORDER BY recorded_at DESC, limit ~500. Group client-side by `LOWER(TRIM(crop_name))`.
- `useCreatePriceFeedEntry()` — INSERT `{ crop_name, price_per_kg, unit, source, recorded_by: user.id }`, invalidate `['price_feed']`.
- `useLatestPriceByCrop()` helper (derived from usePriceFeed) → `Map<normalizedCrop, latestEntry>` for AI nudges.

## 3. Fiyatlar page (`src/routes/farmer.prices.tsx`)

Replace the current static `usePricePoints()` implementation:

- Fetch via `usePriceFeed()`.
- Group by crop, show one card per crop: crop name (via `formatCrop`), latest `price_per_kg` + `unit`, `source`, "X saat önce" (relative time).
- Under each card: recharts `LineChart` of last 14 entries for that crop, `width=120 height=40`, single `<Line>`, `dot={false}`, no axes/grid/tooltip.
- Empty state: "Fiyat verisi bekleniyor" placeholder (replaces the current empty branch).
- Sticky "Fiyat Güncelle" button (farmer only — hide for buyer role via `useHasat` user check).
- Keep existing price-alert section unchanged.

Buyer side: no dedicated buyer prices route exists today; skip.

## 4. Fiyat Güncelle sheet

New component inline in `farmer.prices.tsx` (or `src/components/hasat/PriceUpdateSheet.tsx`):

- Crop selector: `<Select>` populated from distinct crops in the farmer's listings + a free-text "Diğer…" fallback input.
- Price input: numeric.
- Unit selector: `kg | g | adet | litre`.
- Source: text input, placeholder "İstanbul Hali, TMO, Manuel...".
- Submit → `useCreatePriceFeedEntry`, toast "Fiyat güncellendi", close sheet.

## 5. AI nudge on farmer storefront/home

- In `src/routes/farmer.storefront.tsx` (listing cards) and `src/routes/farmer.home.tsx` (active listings list):
  - Look up latest `price_feed` entry for the listing's crop (normalized match).
  - If `|listing.price - latest.price| / latest.price > 0.2`, render a small amber alert under the card: `Piyasa fiyatının %X üzerindesiniz` / `…altındasınız`.
  - No entry → no alert.

## 6. Verify

`tsgo` typecheck after implementation.

## Technical notes

- Normalize crop name with `LOWER(TRIM(...))` on both write and grouping/matching.
- `price_per_kg` is a generic numeric value; the real unit lives in `unit`.
- Sparkline is intentionally axis-less; if a crop has <2 points, render a dash placeholder instead of the chart.
- `src/lib/hasat/types.ts`: add a `PriceFeedEntry` type; keep the legacy `PricePoint` type until unused, then remove.
