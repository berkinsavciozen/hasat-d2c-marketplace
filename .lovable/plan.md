# P17-C Follow-ups — Review System Gap Fixes

Scope: `src/` only. Backend RPC `get_buyer_rating_summary(_buyer_id)` is already deployed and mirrors `get_farmer_rating_summary`.

## 1. `src/lib/hasat/queries.ts`

- Add `useBuyerRatingSummary(buyerId)` — identical shape to `useFarmerRatingSummary`, calls RPC `get_buyer_rating_summary` with arg `_buyer_id`. Cache key: `["buyer-rating", buyerId]`.
- Update `useCreateReview` to fire a best-effort notification (mirroring `useCreateReply`):
  - Skip when `revieweeId === userId` (defensive; DB already prevents self-review).
  - Fetch reviewer name from `profiles` (`select name where id = userId`).
  - Insert into `notifications`: `{ user_id: revieweeId, type: 'review', title: 'Yeni değerlendirme', body: '${who} ${rating}/5 puan verdi', related_id: orderId }`, wrapped in try/catch so review success does not depend on notification insert.
  - Also invalidate `["buyer-rating", revieweeId]` so farmer-role reviews refresh the buyer badge.

No type changes needed — `Order.buyerId` and `Offer.buyerId` already exist and are mapped in `dbToOrder`/`dbToOffer`.

## 2. `src/routes/buyer.orders.tsx` — completed list indicator

In `renderDoneOrders`, extract each row into a small local `DoneOrderRow` component so it can call `useOrderReviews(o.id)` and `useAuthUserId()` at row scope (mirrors the pattern used in `farmer.orders.index.tsx`'s `OrderCard`).

- Compute `myReview = reviews.find(r => r.reviewerId === userId && r.reviewerRole === 'buyer')`.
- If `myReview` exists: render a small inline `⭐ Değerlendirdiniz` chip with `<RatingStars rating={myReview.rating} />` (imported from `@/components/hasat/ReviewModal`).
- Else if `o.producerId` exists: render a small `⭐ Değerlendir` button. `onClick` calls `e.stopPropagation()` (so the row's navigate does not fire) and opens `ReviewModal` locally with `reviewerRole: "buyer"`, `revieweeId: o.producerId`, `orderId: o.id`. Success calls `useCreateReview` mutation, toasts, and closes.
- Place the chip/button in the existing bottom row (near the price), keeping visual density consistent with the rest of the list.

## 3. Farmer-visible buyer rating badge

Small presentational helper (co-located in `farmer.orders.index.tsx` since it is only used there for now):

```tsx
function BuyerRatingBadge({ buyerId }: { buyerId?: string }) {
  const { data } = useBuyerRatingSummary(buyerId);
  if (!buyerId || !data || !data.reviewCount || data.avgRating == null) return null;
  return <span className="text-[11px] text-hmuted">⭐ {data.avgRating.toFixed(1)} ({data.reviewCount})</span>;
}
```

Render `<BuyerRatingBadge buyerId={...} />` next to the buyer name in:
- `OfferCard` (offer.buyerId)
- `OrderCard` (order.buyerId)

Renders nothing when there are no reviews — no fake defaults.

## Verification

- Manual sanity: buyer completes → sees "Değerlendir" chip in list; after review, chip flips to "Değerlendirdiniz ⭐⭐⭐⭐⭐". Farmer sees `⭐ x/5 (n)` next to buyer name once at least one farmer→buyer review exists. Reviewee gets a `notifications` row.
- `tsgo` at the end.
