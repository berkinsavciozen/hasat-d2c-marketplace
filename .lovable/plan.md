Scope: `src/components/hasat/PricesPageBody.tsx` only. Backend and `queries.ts` already expose `hasat`, `official`, `marketSources`, and `unit` on `usePriceHistorySummary`.

## 1) `PriceSummaryCard` — compact multi-source chips

Rewrite the card body so every available source shows its price in a single wrap-friendly chip row directly under the crop name:

- Build a `chips: { label: string; text: string }[]` from `summary`:
  - `hasat`: if `!insufficientData && avgPrice != null` → `"Hasat"` + `priceWithUnit(hasat.avgPrice, summary.unit)`. Else a muted chip `"Hasat: yetersiz veri"`.
  - `official`: `official.sourceLabel ?? "Resmi"` + `priceWithUnit(official.avgPrice, summary.unit)` (only when `avgPrice != null`).
  - each entry in `marketSources`: `source.label` + `priceWithUnit(source.avgPrice, summary.unit)` (only when `avgPrice != null`).
- Render as inline-flex wrap of small chips (`rounded-full border px-2 py-1 text-[11px]`). Source label in `text-hmuted`, price in `font-mono font-medium`. The "insufficient" hasat chip gets dashed border + muted text — never dropped.
- Remove from the card: `Sparkline`, `DistinctFarmerDots`, the `"Hasat topluluk verisi"` section title, the big "Ortalama ₺X" line, the `+N kaynak` mini-label, and `timeAgo` — that detail lives on `/prices/$crop`.
- Keep: crop name (truncate), `WatchStar`, whole-card `Link` to `/farmer|buyer/prices/$crop`, loading state ("Yükleniyor…"), and the empty state when no source has a price at all → single chip "Fiyat verisi yok".
- Card padding drops to `p-3` for compactness; min tap height stays ≥48px via the star button.

## 2) Shorter, watch-first list layout

In `PricesPageBody`:

- Cap tier1 (own crops) rendering to `TIER1_LIMIT = 4`. Compute `tier1Visible = tier1.slice(0, 4)` and `tier1Hidden = tier1.length - 4`.
- If `tier1Hidden > 0` and not searching, render a small text button under tier1 that opens the "Tüm Piyasa" accordion: `+{tier1Hidden} tane daha` — implement by lifting the accordion `value` into local state (`const [allOpen, setAllOpen] = useState<string | undefined>()`) and passing `value`/`onValueChange` to the controlled `<Accordion type="single" collapsible>`. Search still force-opens it via `useEffect` setting `"all"` when `searching`.
- Tier2 (watchlist) and tier3 (all market) stay unlimited / accordion as today. Section order unchanged: tier1 → tier2 → tier3 accordion.

## 3) Watchlist auto-refresh check

`useCreatePriceAlert` / `useTogglePriceAlert` already `invalidateQueries({ queryKey: ["priceAlerts"] })` (queries.ts L1634, L1648, L1661), and `PricesPageBody` derives tier2 from `usePriceAlerts()`. So starring an "all market" crop already re-renders it into tier2 automatically — no change needed. Confirmed; noted here so the plan doesn't ship unused code.

## Files to edit
- `src/components/hasat/PricesPageBody.tsx` (only)

## Out of scope
- `supabase/`, RPC changes
- `CropDetailBody`, `PriceChart`, detail routes
- New shared components — chip markup is small and local to this file
