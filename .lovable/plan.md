## Goal

Give buyers a UI to see and respond to farmer counter-offers. Implement the "Tekliflerim" tab on `/buyer/orders` and confirm the existing negotiation route handles re-counter.

## Scope

Single file edit: **`src/routes/buyer.orders.tsx`**.

No changes to: `queries.ts`, `buyer.negotiation.$offerId.tsx` (already works), farmer routes, DB schema, types.

## Key facts from exploration

- `useBuyerOffers()` returns the buyer's sent offers, mapped via `dbToOffer`.
- The DB column is `counter_offer` (jsonb), **not** `counter_price`. When farmer counters, `dbToOffer` puts the **farmer's counter values** into the main offer fields (`pricePerUnit`, `quantity`, etc.) and stores the **buyer's previous values** in `offer.original`. So `offer.pricePerUnit` IS the farmer's counter price.
- `useUpdateOfferStatus` already accepts `'accepted'` (used for inline Kabul Et).
- `buyer.negotiation.$offerId.tsx` already renders side-by-side comparison + accept/reject/counter sheet calling `useCounterOffer`. Re-counter works today; no rewrite needed.
- Per your answer: skip the "İptal Et" button on pending offers.

## Implementation — `src/routes/buyer.orders.tsx`

1. **Imports**: add `useBuyerOffers`, `useUpdateOfferStatus`, `formatTRY` is already imported, `toast` from `sonner`, `Offer` type from `@/lib/hasat/types`.
2. **State**: keep current `useBuyerOrders` for active/done tabs. Add `useBuyerOffers()` and filter `status in ('pending','counter')` for the new tab.
3. **Tabs**: change `TabsList` to 3 columns: `Tekliflerim ({offers.length})` · `Aktif ({active.length})` · `Tamamlanan ({done.length})`. Default `tab` stays `"active"`; new value `"offers"`.
4. **Offer card** (new `OfferCard` component, local to file):
   - Header: crop name + `{quantity} {unit}` + status badge.
     - `pending` → "Beklemede" (muted)
     - `counter` → "Karşı Teklif Geldi" (saffron)
   - Price row: `{formatTRY(pricePerUnit)}/{unit}` × quantity = total.
   - When `status === 'counter'`: show two lines — "Sizin teklifiniz: {original.pricePerUnit}/unit" (muted, struck-through) and "Çiftçinin karşı teklifi: {pricePerUnit}/unit" (saffron, bold). Falls back to just current price if `original` is missing.
   - Actions:
     - `status === 'counter'`: two buttons — **Kabul Et** (calls `useUpdateOfferStatus.mutateAsync({ id, status: 'accepted' })`, toast "Teklif kabul edildi", invalidation already handled inside the mutation) and **Yeni Teklif Gönder** (navigate to `/buyer/negotiation/$offerId`).
     - `status === 'pending'`: no action buttons (per your decision).
5. **Loading / empty**: reuse `LoadingDots`. Empty state: "Henüz teklif yok."
6. **Error handling**: try/catch around mutation, `toast.error` on failure.

### Tab order in the UI

```text
[ Tekliflerim (n) ] [ Aktif (n) ] [ Tamamlanan (n) ]
```

Tekliflerim placed first since it's the new actionable surface; Aktif remains the default selected tab so existing users see no behavior change on load.

## Out of scope / confirmations

- **buyer.negotiation.$offerId.tsx**: verified intact — accept/reject/counter all wired. No edits.
- **Farmer side**: untouched.
- **Realtime**: `useRealtimeSync` already invalidates `buyerOffers` on offers table changes, so the new tab updates live when the farmer counters.

## Verification

1. As buyer, open `/buyer/orders` → Tekliflerim tab shows pending + countered offers.
2. Farmer sends a counter → tab updates live, badge "Karşı Teklif Geldi" appears, prices show buyer's original (struck) vs farmer's counter (saffron).
3. Click **Kabul Et** → toast, offer disappears from Tekliflerim, order appears in Aktif.
4. Click **Yeni Teklif Gönder** → navigates to `/buyer/negotiation/$offerId`, existing UI handles re-counter.