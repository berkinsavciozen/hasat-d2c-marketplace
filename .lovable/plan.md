# Expand Hasat MCP with full farmer + buyer tool set

Follow the existing pattern in `src/lib/mcp/tools/`: one file per tool, default-exports a `defineTool`, uses a local `supabaseForUser(ctx)` helper that creates a Supabase client with `Authorization: Bearer ${ctx.getToken()}` (RLS-scoped, no service role anywhere). Register each new tool in `src/lib/mcp/index.ts`. After edits, run `app_mcp_server--extract_mcp_manifest` to regenerate `.lovable/mcp/manifest.json`.

## Files to create (one per tool, `src/lib/mcp/tools/`)

### Farmer tools
1. `create-parcel.ts` — `create_parcel`
   - Input: `name` (string), `city` (string, → `location_label`), `area` (number > 0), `crops` (string[] min 1).
   - Handler: replicate `useCreateParcel` — call `ensureFarm(userId)` via a small inline helper (upsert-style: select farms where farmer_id, else insert), then insert into `parcels` with `farmer_id, farm_id, name, area, crops, location_label=city, lat=0, lng=0`. No photo upload path (MCP can't upload files).
2. `list-parcels.ts` — `list_my_parcels`
   - Input: `limit` (1–100, default 50).
   - Read `parcels` scoped by RLS, order `created_at desc`, select id/name/area/crops/location_label/created_at.
3. `publish-listing.ts` — `publish_listing`
   - Input: `listing_id` (uuid), `quantity` (>0), `price_per_unit` (>0).
   - Handler: UPDATE `listings` SET status='active', quantity, price_per_unit, WHERE id=listing_id (RLS restricts to owner). Reject quantity/price ≤ 0 in Zod. Return updated row or an "is-error" text if 0 rows updated.
4. `list-offers-on-my-listings.ts` — `list_offers_on_my_listings`
   - Input: `status` (enum accepted|pending|counter|rejected|completed|any, default any), `limit` (1–100 default 50).
   - Read `offers` filtered by `farmer_id = auth uid` (RLS gives us this; also add explicit `.eq("farmer_id", ctx.getUserId())` as a defense-in-depth filter). Return id/listing_id/status/ball_side/quantity/price_per_unit/current_quantity/current_price/payment_status/buyer_id/created_at.
5. `respond-to-offer.ts` — `respond_to_offer` (SENSITIVE)
   - Input: `offer_id` (uuid), `action` (enum: accept|decline|counter), `counter_price` (number > 0, required only when action=counter), `counter_quantity` (number > 0, optional; defaults to current quantity on counter), `confirm` (literal true).
   - Zod refinement: require `confirm === true`; when action=counter require `counter_price`.
   - Handler mirrors `useUpdateOfferStatus` / `useCounterOffer`:
     - `accept`: UPDATE offers SET status='accepted', ball_side='buyer', payment_status='unpaid' WHERE id=offer_id. Then idempotently insert an `orders` row + `order_timeline` "submitted" (same as `useUpdateOfferStatus`).
     - `decline`: UPDATE offers SET status='rejected'.
     - `counter`: read offer, append snapshot to `negotiation_history`, UPDATE with new price/qty, ball_side='buyer', status='counter'; insert `offer_messages` row.
   - Description: "SENSITIVE — accepting an offer LOCKS your listing stock via a DB trigger and cannot be reversed via this tool. Requires confirm=true."
6. `confirm-payment-received.ts` — `confirm_payment_received` (SENSITIVE)
   - Input: `order_id` (uuid), `confirm` (literal true).
   - Handler: resolve offer via `orders.offer_id` (or accept `offer_id` directly — simpler: keep `order_id` in tool signature, look up offer_id from orders row). Mirror `useConfirmTransferReceived`: UPDATE offers SET payment_status='paid' WHERE id=offer_id AND farmer_id=uid AND payment_status='pending_transfer', then idempotent order/timeline insert (already there in this case, but keep parity).
   - Description: "SENSITIVE — finalizes the order as paid; not reversible via this tool. Requires confirm=true."

### Buyer tools
7. `browse-marketplace.ts` — `browse_marketplace`
   - Input: `crop` (string, optional, ilike), `city` (string, optional — join through `profiles.city` OR filter listings via `farmer_id` in profiles; simpler: filter by `crop` only and note city filter is not supported unless a view exists — investigate: quick check shows `listings` has no city column; do city filter with a two-step: fetch profile ids where city ilike, then `.in("farmer_id", ids)`), `limit` (1–50 default 20).
   - Read `listings` WHERE `status='active'` (RLS already allows public read of active), select id/farmer_id/crop/quantity/unit/price_per_unit/min_order/quality/created_at.
8. `create-offer.ts` — `create_offer`
   - Input: `listing_id` (uuid), `quantity` (>0), `offered_price` (>0).
   - Handler: fetch listing (id, farmer_id, unit) to derive `farmer_id`; INSERT into `offers` mirroring `useCreateOffer` (buyer_id=uid, farmer_id, listing_id, quantity, price_per_unit=offered_price, current_*, ball_side='farmer', payment_status='unpaid', status='pending').
9. `respond-to-counter.ts` — `respond_to_counter` (SENSITIVE)
   - Input: `offer_id` (uuid), `action` (enum: accept|decline), `confirm` (literal true).
   - Handler: verify offer is in `status='counter'` with `buyer_id=uid` and `ball_side='buyer'`. Accept → UPDATE status='accepted', ball_side='buyer', payment_status='unpaid' + idempotent order/timeline insert. Decline → UPDATE status='rejected'.
   - Description: "SENSITIVE — accepting locks stock and creates the order. Requires confirm=true."
10. `list-my-offers.ts` — `list_my_offers`
    - Input: `status` (enum pending|counter|accepted|rejected|completed|any, default any), `limit` (1–100 default 50).
    - Read `offers` WHERE `buyer_id=uid` (RLS-scoped + explicit filter), same columns as farmer variant.
11. `mark-transfer-sent.ts` — `mark_transfer_sent` (SENSITIVE)
    - Input: `order_id` (uuid), `confirm` (literal true).
    - Handler: look up offer_id from orders (buyer_id=uid), then mirror `useMarkTransferSent` — UPDATE offers SET payment_status='pending_transfer' WHERE id=offer_id AND buyer_id=uid AND status='accepted'.
    - Description: "SENSITIVE — signals the farmer to expect your bank transfer. Payment is currently simulated (no real gateway). Requires confirm=true."
12. `list-my-orders.ts` — `list_my_orders`
    - Input: `status` (optional string), `limit` (1–100 default 50).
    - Read `orders` WHERE `buyer_id=uid` (RLS + explicit filter), select id/offer_id/farmer_id/status/order_ref/created_at.

## Shared conventions
- Reuse the existing `supabaseForUser(ctx)` helper pattern verbatim in each file (small local copy — matches current tools).
- Sensitive tools implement the confirm guard as a Zod `z.literal(true)` on the `confirm` field so a missing/`false` value fails validation with a clear message. Description prefixed with `"SENSITIVE — "` and states the irreversible effect.
- Every handler starts with `if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };`.
- Return shape: `{ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { ... } }` (matches existing tools). On errors: `isError: true` with the Supabase error message.
- No `supabaseAdmin` / service role usage. RLS is the only authorization boundary; explicit `.eq("buyer_id"/"farmer_id", userId)` filters added as belt-and-suspenders on scoped reads.

## Files to edit
- `src/lib/mcp/index.ts` — import the 11 new tools and add to the `tools: [...]` array; append to the `instructions` string a short note listing farmer vs buyer capabilities.

## Verification
- Run `app_mcp_server--extract_mcp_manifest` after edits — confirms manifest builds and lists all 15 tools (4 existing + 11 new).
- Run `tsgo` typecheck.
- Spot-check that each SENSITIVE tool's JSON schema in the regenerated manifest has `confirm` as a required literal `true`.
