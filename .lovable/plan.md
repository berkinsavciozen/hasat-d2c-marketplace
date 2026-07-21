Plan: Add unit display to all price UI surfaces
Scope: only `src/`. Backend already returns `unit` from `get_price_history_summary`/`get_price_history_series`.

1. Type + data mapping (`src/lib/hasat/queries.ts`)
   - Add `unit: string | null` to `PriceHistorySummary` and `PriceHistorySeries` interfaces.
   - In `usePriceHistorySummary`: read `row.unit` and include it in the returned object.
   - In `usePriceHistorySeries`: read `row.unit` and include it in the returned object.
   - Keep all existing fields unchanged.

2. Format helper (`src/lib/hasat/format.ts`)
   - Add a small helper `priceWithUnit(n: number, unit: string | null | undefined)` that returns `formatTRY(n) + "/" + (unit ?? "kg")`.
   - This keeps unit rendering consistent and avoids repeating the fallback logic in every component.

3. Price list cards (`src/components/hasat/PricesPageBody.tsx`)
   - In `PriceSummaryCard`, replace the average display with `priceWithUnit(hasat.avgPrice, summary?.unit)`.
   - Use the `summary.unit` returned by `usePriceHistorySummary`; fallback to `"kg"`.

4. Crop detail cards (`src/components/hasat/CropDetailBody.tsx`)
   - Read `unit` from the `summary` object (all sources for the same crop share this unit).
   - Update the "Ortalama" row in the Hasat card, the official source card, and every market source card to use `priceWithUnit(..., unit)`.

5. Large chart component (`src/components/hasat/PriceChart.tsx`)
   - Add optional `unit?: string` prop.
   - Append `/${unit ?? "kg"}` to the "Son" value and the "Aralık" min–max range.

6. Wire unit into chart consumers (`src/components/hasat/CropDetailBody.tsx`)
   - Pass `unit={unit}` to each `<PriceChart>` instance so the large-format charts also show ₺/kg or ₺/g.

7. Verification
   - Run `tsgo` (or `bunx tsc --noEmit`) to confirm type safety.
   - No `supabase/` changes, no backend RPC changes.

Files to edit:
- `src/lib/hasat/queries.ts`
- `src/lib/hasat/format.ts`
- `src/components/hasat/PricesPageBody.tsx`
- `src/components/hasat/CropDetailBody.tsx`
- `src/components/hasat/PriceChart.tsx`
