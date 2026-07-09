# Expand Hasat MCP with full farmer + buyer tool set

Add 11 new MCP tools mirroring the existing app mutations in `src/lib/hasat/queries.ts`, following the exact file pattern of the current 4 tools in `src/lib/mcp/tools/` (one file per tool, local `supabaseForUser(ctx)` helper, RLS-scoped Supabase client, no service-role usage).

## New tool files under `src/lib/mcp/tools/`

### Farmer
1. **create-parcel.ts** `create_parcel` — inputs: name, city, area, crops[]. Inline ensureFarm(userId), insert into `parcels` (lat/lng=0). Photo upload N/A.
2. **list-parcels.ts** `list_my_parcels` — inputs: limit (default 50).
3. **publish-listing.ts** `publish_listing` — inputs: listing_id, quantity, price_per_unit. UPDATE listings status='active' with explicit `.eq("farmer_id", uid)` guard.
4. **list-offers-on-my-listings.ts** `list_offers_on_my_listings` — inputs: status (any|pending|counter|accepted|rejected|completed), limit.
5. **respond-to-offer.ts** `respond_to_offer` **SENSITIVE** — inputs: offer_id, action (accept|decline|counter), counter_price, counter_quantity, `confirm: z.literal(true)`. Mirrors `useUpdateOfferStatus` + counter branch of `useCounterOffer` including snapshot append + `offer_messages` insert + idempotent order/timeline creation on accept.
6. **confirm-payment-received.ts** `confirm_payment_received` **SENSITIVE** — inputs: order_id, `confirm: z.literal(true)`. Resolve offer via orders row, then set offers.payment_status='paid' guarded by `farmer_id=uid AND payment_status='pending_transfer'`.

### Buyer
7. **browse-marketplace.ts** `browse_marketplace` — inputs: crop?, city?, limit. Active listings only; city filter via profiles lookup then `.in("farmer_id", ids)`.
8. **create-offer.ts** `create_offer` — inputs: listing_id, quantity, offered_price. Fetch listing.farmer_id (must be active), insert offer with ball_side=farmer, status=pending.
9. **respond-to-counter.ts** `respond_to_counter` **SENSITIVE** — inputs: offer_id, action (accept|decline), `confirm: z.literal(true)`. Verify status='counter' + buyer_id=uid. Accept path creates order+timeline idempotently.
10. **list-my-offers.ts** `list_my_offers` — buyer_id=uid scoped, status filter.
11. **mark-transfer-sent.ts** `mark_transfer_sent` **SENSITIVE** — inputs: order_id, `confirm: z.literal(true)`. Resolve offer via orders (buyer_id=uid), then set payment_status='pending_transfer' guarded by `status='accepted'`.
12. **list-my-orders.ts** `list_my_orders` — inputs: status?, limit.

## Edit `src/lib/mcp/index.ts`
- Import all 11 new tools, add to `tools` array.
- Bump version to `0.2.0`.
- Expand `instructions` to summarise farmer vs buyer capabilities and note that SENSITIVE tools require `confirm=true`.

## Security invariants (apply to every new tool)
- Only `supabaseForUser(ctx)` (publishable key + user bearer). No `supabaseAdmin` / service role.
- Every handler starts with `ctx.isAuthenticated()` check.
- Sensitive tools: `confirm: z.literal(true)` — Zod fails validation with a clear message if missing/false. Description prefixed "SENSITIVE — …" spelling out the irreversible effect.
- Defense-in-depth: explicit `.eq("buyer_id"/"farmer_id", ctx.getUserId())` on scoped reads/writes even when RLS already enforces it.
- Return shape matches existing tools: `{ content: [{ type:"text", text }], structuredContent, isError? }`.

## Verification
1. Call `app_mcp_server--extract_mcp_manifest` — must succeed and list 15 tools with `confirm` marked required (literal true) on the 4 sensitive ones.
2. Run `tsgo` typecheck.
