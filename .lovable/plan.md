## B1 — Public storefront route `/s/:slug`
Create `src/routes/s.$slug.tsx`. Since profiles table has no `slug` column, resolve the slug as either the farmer's profile UUID or a slug derived from `full_name` (kebab-cased, lowercase, ascii-folded). The route:
- Queries `profiles` for a farmer where `id = slug` OR generated slug of `full_name` matches.
- Queries active `listings` for that farmer.
- Renders a lightweight public page: farmer name, city, trust badges, and listing cards. Each card links to `/buyer/offer/:listingId` (existing flow) if the visitor is logged in, else to `/login`.
- Provides `notFoundComponent`.

Also add a "Vitrin linkini kopyala" button on `farmer.storefront.tsx` header that copies `${origin}/s/${profile.id}` — small addition so the farmer can share.

## B2 — Edit listing
Verified: `ListingCard` already receives `onEdit` and opens `ListingSheet` with `editing={l}`. Actual bug is the `ListingSheet` initializes state from `editing?.*` only once and the `useEffect([editingId])` covers it — but the `description` and photos are missing when editing. Fix:
- Prefill `desc` from `editing?.description` when opening for edit.
- Include `description` in the `updateListing` patch call.
- Verify `useUpdateListing` accepts `description` in the patch; extend it if not.

## B4 — Quantity stepper respects `min_order_quantity`
`src/routes/buyer.offer.$listingId.tsx`:
- Initialize `qty` with `listing.minOrder`.
- Pass `min={listing.minOrder}` to `<Stepper>` (already done for `min`, but manual typing bypasses it) — clamp on input change inside Stepper via `Math.max(min, ...)`. Stepper currently does `onChange={(n) => setQty(Math.max(listing.minOrder, Math.min(listing.quantity, n)))}` outside; but the internal number input calls `onChange(Number(e.target.value) || 0)` without clamping. Add clamping in `Stepper.tsx` when `min` is provided: `onChange(Math.max(min, Number(e.target.value) || 0))`.
- Add a submit-time guard: if `qty < listing.minOrder`, toast error and abort.

## B5 — Buyer "Tamamlanan" tab count
Current: `orders.filter(o => o.status === "delivered")`. Check DB-side status: `useBuyerOrders` may map or filter statuses. Ensure `dbToOrder` doesn't overwrite `delivered`. If mapping is fine, also treat `completed` status as done in case DB uses that label. Confirm by reading `useBuyerOrders`; update filter to `["delivered","completed"].includes(o.status)`.

## B6 — Accept offer creates active order
In `useUpdateOfferStatus` (queries.ts, line ~742), when `status === "accepted"`:
- After updating the offer, upsert a row in `orders` (idempotent via `.select("id").eq("offer_id", id).maybeSingle()` then insert if missing) with `status = 'active'`, `offer_id`, `buyer_id`, `farmer_id`, `order_ref: ""`.
- Insert an `order_timeline` "submitted" row.
- Keep `useSimulatePayment` behavior but make it also idempotent (already is) and just update timeline / no duplicate insert.
- Invalidate `farmerOrders` / `buyerOrders`.

## B11 — Prices unit display
`src/routes/farmer.prices.tsx`: replace `unitFor(crop)` so it always returns `"kg"` for `price_points` display (except keep `"L"` for `Zeytinyağı` since that is per-litre reference). Do NOT touch `buyer.offer` or `buyer.discover`.

## B13 — Farmer analytics real data
Rewrite `src/routes/farmer.analytics.tsx`:
- Use existing hooks `useFarmerListings()` and `useFarmerOrders()` (or add a thin `useFarmerOrders` if missing — check queries.ts; there is already a `farmerOrders` query key).
- Compute: total orders count, total revenue (sum of paid/active orders' offer totals), top product (by revenue).
- Show 3 stat cards + top product row.
- Only show "Henüz veri yok" when both listings and orders are empty.
- Keep `<AIBox page="analytics" />` at top.

## B15 — Custom date picker (dd.mm.yyyy)
`src/routes/buyer.offer.$listingId.tsx`: replace native `<Input type="date">` with a shadcn Popover + `Calendar` (react-day-picker, already in project):
- Trigger: `Button` variant outline showing `date ? format(date, "dd.MM.yyyy") : "Tarih seçin"` with a CalendarIcon.
- Content: `<Calendar mode="single" selected={date} onSelect={setDate} locale={tr} className="p-3 pointer-events-auto" />`.
- Store as `Date` internally; on submit serialize via `format(date, "yyyy-MM-dd")` for DB.
- Import `tr` from `date-fns/locale`; `format` from `date-fns` (already used elsewhere).

## B18 — Subscriptions empty state
`src/routes/buyer.subscriptions.tsx`: update empty-state text to
"Henüz aboneliğiniz yok. Keşfet sayfasından üretici bulun ve düzenli teslimat isteyin."
and add a `<Link to="/buyer/discover">` styled button "Keşfet'e Git".

## Verification
After edits: run typecheck/build implicitly; manually verify:
- `/s/<uuid>` renders storefront.
- Editing an existing listing prefills description.
- Buyer offer form rejects qty below min.
- Delivered orders appear in Tamamlanan tab.
- Accepting an offer creates an active order row.
- `farmer.prices` shows `/kg` for Safran.
- Analytics shows real numbers with test data.
- Date picker shows dd.mm.yyyy.
- Subscriptions CTA navigates to discover.
