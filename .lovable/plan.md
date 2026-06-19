# Goal

After auditing the negotiation flow: today only **two** snapshots are visible (current + the one immediately before, stored in `offers.counter_offer`). Every new counter overwrites the prior one, so iteration #1 is lost the moment iteration #3 arrives. The buyer negotiation page, the "Tekliflerim" tab card, and the farmer counter form all reflect this two-version limit and they each render the comparison in a different shape.

This plan persists the full chain and shows the same iteration timeline everywhere — for both farmer and buyer, on every round.

# Audit findings

| Surface | Current behavior | Gap |
| --- | --- | --- |
| DB `offers.counter_offer` (jsonb) | Holds the single previous snapshot | Loses history past 1 round |
| `dbToOffer` mapper | Exposes `offer.original` (the one prior version) | No `history` array |
| Buyer `Tekliflerim` card (`buyer.orders.tsx`) | Shows struck buyer price → saffron farmer price | Only last 2 |
| Buyer negotiation page (`buyer.negotiation.$offerId.tsx`) | Two side cards "Teklifiniz" vs "Çiftçinin Teklifi" | Only last 2; no chain |
| Farmer counter form (`farmer.orders.$offerId.counter.tsx`) | "Orijinal teklif" panel = current main fields only | No history; no diff highlighting |
| Farmer orders list | Counter offers shown but no version trail | Same gap |

# Plan

## 1. Schema (migration)

Add a JSONB array column for the full chain. Keep `counter_offer` for backward read-compat (mapper falls back to it when `negotiation_history` is empty).

```sql
ALTER TABLE public.offers
  ADD COLUMN negotiation_history jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Each entry shape (TypeScript mirrors it):
```ts
type NegotiationSnapshot = {
  by: 'buyer' | 'farmer';
  at: string;            // ISO timestamp
  quantity: number;
  pricePerUnit: number;
  delivery?: string;
  deliveryDate?: string;
  note?: string;
};
```

The current "live" offer fields (`quantity`, `price_per_unit`, etc.) always represent the **latest** proposal. `negotiation_history` holds every earlier snapshot in order, oldest first.

No grants/RLS changes — column inherits from the existing `offers` policies.

## 2. Mutation update (`useCounterOffer`)

When the user (buyer or farmer) sends a counter:
- Read the current row's `quantity`, `price_per_unit`, `delivery`, `delivery_date`, `note`, and existing `negotiation_history`.
- Append a snapshot of those current fields tagged with `by` (the caller's role) and `at: now()`.
- Update the row with the new patch values **and** the appended history array.
- Mirror the same snapshot into the legacy `counter_offer` field so older clients still render the "previous" pill correctly during rollout.

The mutation will receive `by: 'buyer' | 'farmer'` from the caller. We already have role context where it's invoked.

## 3. Mapper (`dbToOffer`)

Add `history: NegotiationSnapshot[]` to the `Offer` type and populate it from `negotiation_history`. Keep `original` as a derived convenience (= last entry of history) so existing components keep working.

## 4. Shared UI: `<NegotiationTimeline />`

New component in `src/components/hasat/NegotiationTimeline.tsx`. Renders the chain as a vertical list:

```
text
[ Round 1 · Alıcı · 12 Haz ]   200 kg × ₺18,00 = ₺3.600
       ↓
[ Round 2 · Üretici · 13 Haz ] 200 kg × ₺22,00 = ₺4.400  (+₺800)
       ↓
[ Round 3 · Alıcı · 14 Haz ]   180 kg × ₺21,00 = ₺3.780  (-₺620)   ← current
```

- Diff vs previous round highlighted (saffron up, sage down) on each changed field (qty, price, delivery, date, note).
- Latest round badged "Güncel".
- Compact mode (used inside `Tekliflerim` card) collapses to last 3 + "Tümünü gör".

## 5. Surfaces wired to the timeline

- **Buyer negotiation page** — replaces the two-card SideCard layout with the timeline + the existing accept/reject/counter action bar.
- **Buyer "Tekliflerim" card** — compact timeline (last 2 rounds + count badge "X tur") above existing buttons.
- **Farmer counter form** — replaces the single "Orijinal teklif" muted card with the timeline (read-only) above the form fields.
- **Farmer orders list** — counter offers row gets the same compact timeline strip.

All four read from `offer.history`, so they stay in sync automatically.

## 6. Backfill

For existing rows where `negotiation_history = []` but `counter_offer IS NOT NULL`, seed history with that single snapshot. One-shot SQL inside the same migration:

```sql
UPDATE public.offers
SET negotiation_history = jsonb_build_array(
  jsonb_build_object(
    'by', CASE WHEN status = 'counter' THEN 'buyer' ELSE 'farmer' END,
    'at', COALESCE(updated_at, created_at),
    'quantity', (counter_offer->>'quantity')::numeric,
    'pricePerUnit', (counter_offer->>'pricePerUnit')::numeric,
    'delivery', counter_offer->>'delivery',
    'deliveryDate', counter_offer->>'deliveryDate',
    'note', counter_offer->>'note'
  )
)
WHERE negotiation_history = '[]'::jsonb AND counter_offer IS NOT NULL;
```

(`by` heuristic: if status is `counter`, the historical row is the buyer's previous proposal; otherwise the farmer's. Imperfect for legacy rows but only affects pre-existing data — new rows are tagged correctly.)

# Out of scope

- Per-round chat messages / threaded notes (notes still live on each snapshot).
- Reverting to a previous round.
- Notifications copy changes.

# Files touched

- `supabase/migrations/<new>.sql` (via migration tool)
- `src/lib/hasat/types.ts` — add `NegotiationSnapshot`, extend `Offer.history`
- `src/lib/hasat/queries.ts` — `dbToOffer`, `useCounterOffer`
- `src/components/hasat/NegotiationTimeline.tsx` — new
- `src/routes/buyer.negotiation.$offerId.tsx`
- `src/routes/buyer.orders.tsx`
- `src/routes/farmer.orders.$offerId.counter.tsx`
- `src/routes/farmer.orders.tsx`

Approve and I'll implement, starting with the migration.
