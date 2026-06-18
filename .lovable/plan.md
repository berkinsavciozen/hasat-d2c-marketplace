## Phase 3 — Wire Listings, Offers, Orders to Supabase

Same pattern as Phase 2: hooks in `src/lib/hasat/queries.ts`, mappers, ProgressDots loading, empty states. Zustand keeps owning producers, subscriptions, price alerts, community, pendingOffer hand-off, and notif prefs.

### 0. Schema fixup (migration)

The `orders` table requires `order_ref` (NOT NULL). The DB function `generate_order_ref()` exists but is not attached as a trigger. Attach it:

```sql
CREATE TRIGGER orders_set_order_ref
BEFORE INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.order_ref IS NULL OR NEW.order_ref = '')
EXECUTE FUNCTION public.generate_order_ref();
```

This lets inserts omit `order_ref`. Also confirm `order_seq` sequence exists (the function references it); if not, the migration creates it: `CREATE SEQUENCE IF NOT EXISTS public.order_seq;`.

### 1. Enum reality check (UI strings → DB enums)

- `order_status` enum is `preparing | shipped | delivered | disputed | completed` — **no `submitted`**. New orders insert as `'preparing'`. The first `order_timeline` row carries the human label "Sipariş Alındı" with `step: 'submitted'` (free-text column).
- `offer_status` is `pending | accepted | rejected | counter | completed` — **no `cancelled`**. `useUpdateOfferStatus` accepts `'accepted' | 'rejected' | 'counter' | 'completed'`. If a route currently calls "cancelled", we map to `'rejected'`.
- `delivery_type` enum is `kargo-buyer | kargo-seller | elden`. UI labels in offer screens get a small mapper.
- `listing_status` is `active | sold | expired`.

### 2. New hooks in `src/lib/hasat/queries.ts`

Reuse existing `useAuthUserId()`. Mappers convert DB rows to the existing `Listing`, `Offer`, `Order` shapes the components already use.

**Listings**
- `useFarmerListings()` — `select * from listings where farmer_id = uid order by created_at desc`.
- `useActiveListings()` — `select *, profiles!farmer_id(id,name,city) from listings where status='active' order by created_at desc`. Returns listings each with embedded farmer info.
- `useCreateListing()` — insert `{ farmer_id: uid, harvest_entry_id, crop, quantity, unit, price_per_unit, min_order, quality, description, status: 'active' }`.
- `useUpdateListing()` — update by id (status/price/quantity/etc).
- `useDeleteListing()` — delete by id.

**Offers**
- `useFarmerOffers()` — `select *, buyer:profiles!buyer_id(id,name,city), listing:listings(crop,unit) from offers where farmer_id = uid order by created_at desc`.
- `useBuyerOffers()` — `select *, listing:listings(crop,unit), farmer:profiles!farmer_id(id,name,city) from offers where buyer_id = uid order by created_at desc`.
- `useCreateOffer()` — insert `{ buyer_id: uid, farmer_id, listing_id, quantity, price_per_unit, delivery, delivery_date, note, status: 'pending' }`.
- `useUpdateOfferStatus({ id, status })` — special path for `'accepted'`:
  1. `update offers set status='accepted' where id=? returning *`
  2. `insert into orders { offer_id, buyer_id, farmer_id, status: 'preparing' }` returning `id` (DB trigger fills `order_ref`).
  3. `insert into order_timeline { order_id, step: 'submitted', label: 'Sipariş Alındı', completed_at: now() }`.
  4. Invalidate `['farmerOffers']`, `['buyerOffers']`, `['farmerOrders']`, `['buyerOrders']`.
- For `'rejected' | 'counter' | 'completed'` just update status + invalidate offer keys.

**Orders**
- `useFarmerOrders()` — `select *, offer:offers(quantity,price_per_unit,delivery_date,listing_id, listing:listings(crop,unit)), buyer:profiles!buyer_id(id,name) from orders where farmer_id = uid order by created_at desc`.
- `useBuyerOrders()` — same with `farmer:profiles!farmer_id(id,name,city)` instead.
- `useOrderTimeline(orderId)` — `select * from order_timeline where order_id = ? order by completed_at asc nulls last`.
- `useCreateOrder()` — exposed for direct use, but the typical path is via `useUpdateOfferStatus('accepted')`.

Mappers produce the existing `Order` shape (`code` ← `order_ref`, `producerName` ← embedded farmer, `crop`/`unit`/`pricePerUnit`/`quantity` ← embedded listing/offer, `total` computed, `status` ← DB enum, `timeline` ← from `useOrderTimeline` when needed). Detail screen calls `useOrderTimeline` separately to avoid heavy joins on list pages.

### 3. Routes to update

- `src/routes/farmer.storefront.tsx` — replace listings reads/writes with `useFarmerListings` + `useCreateListing` / `useUpdateListing` / `useDeleteListing`. ProgressDots while loading; existing empty state preserved. The "Add listing" sheet currently does not pick a `harvest_entry_id`; we pass `harvest_entry_id: null`.
- `src/routes/farmer.home.tsx` — listings stat card uses `useFarmerListings` (count of active).
- `src/routes/farmer.orders.tsx` — replace offers/addOrder/updateOffer with `useFarmerOffers` + `useUpdateOfferStatus`. The "accept" button calls `mutate({ id, status: 'accepted' })`; toast on success. Drop local `addOrder` call. The completed-orders tab queries `useFarmerOrders`.
- `src/routes/farmer.orders.$offerId.counter.tsx` — replace `updateOffer` with `useUpdateOfferStatus({ status: 'counter' })` plus a separate `useUpdateOffer()` mutation that writes `counter_offer` jsonb (qty/price/delivery/date/note) and sets status to `'counter'` in one update. Add this mutation alongside `useUpdateOfferStatus`.
- `src/routes/buyer.discover.tsx` — replace `producers` grid with `useActiveListings()`. Keep the search input filtering on listing crop or farmer name. Listing cards link to `/buyer/offer/$listingId` (existing route). Loading/empty/no-results states use existing markup with ProgressDots.
- `src/routes/buyer.offer.$listingId.tsx` — fetch listing via a small `useListing(listingId)` (`select *, profiles!farmer_id(id,name,city)`) instead of pulling from `producers`. On submit, call `useCreateOffer()` and navigate to `/buyer/payment` (payment screen still mock-flows the rest, unchanged).
- `src/routes/buyer.payment.tsx` — currently calls Zustand `addOffer` + `addOrder`. Replace with `useCreateOffer()` only; remove the manual `addOrder` (an order is created later when the farmer accepts). Keep `pendingOffer` Zustand hand-off as-is. After successful insert, navigate to `/buyer/orders`.
- `src/routes/buyer.orders.tsx` — `useBuyerOrders()` + ProgressDots + empty state.
- `src/routes/buyer.orders.$orderId.tsx` — fetch single via `useBuyerOrders` (find by id) plus `useOrderTimeline(orderId)` to feed the existing `OrderTimeline` component. Map DB timeline rows `{ step, label, completed_at }` to component shape `{ key, label, doneAt }`.
- `src/routes/buyer.negotiation.$offerId.tsx` — replace Zustand offer lookup with `useBuyerOffers` (find by id) plus listing/producer info already embedded. On accept-counter / reject, call `useUpdateOfferStatus`.

### 4. Zustand store cleanup

`src/lib/hasat/store.ts`: empty `seedListings`, `seedOffers`, `seedOrders` → `[]`. Keep `producers` and `subscriptions` mocks intact (out of scope). Keep action signatures so non-migrated code (e.g. anything still referring to `addListing`) doesn't break — we will remove dead actions in a later cleanup once all consumers have moved off.

### 5. Out of scope (unchanged)

- Producers detail (`/buyer/producer/$id`), subscriptions, price alerts, community posts.
- Real payments (UI only).
- Photo uploads on listings (`photo_urls: []`).
- Push/email notifications.

### Files touched

- migration: attach `orders_set_order_ref` trigger (+ `order_seq` if missing).
- edited: `src/lib/hasat/queries.ts` (extend), `src/lib/hasat/store.ts` (empty seeds).
- edited routes: `farmer.storefront.tsx`, `farmer.home.tsx`, `farmer.orders.tsx`, `farmer.orders.$offerId.counter.tsx`, `buyer.discover.tsx`, `buyer.offer.$listingId.tsx`, `buyer.payment.tsx`, `buyer.orders.tsx`, `buyer.orders.$orderId.tsx`, `buyer.negotiation.$offerId.tsx`.
