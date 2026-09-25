-- FIN-3-S — assertion suite for 20260925120000_fin3s_stock_reservation_agreed_quantity.sql.

\set ON_ERROR_STOP on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(p_sql text, p_prefix text, msg text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (no error raised)', msg;
exception when others then
  if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if position(p_prefix in sqlerrm) <> 1 then
    raise exception 'ASSERTION FAILED: % (got "%")', msg, sqlerrm;
  end if;
end;
$$;

-- Exact-message variant: 'Stok yetersiz' must not be satisfied by 'Stok yetersiz (batch)' or vice versa.
create or replace function pg_temp.expect_exact_error(p_sql text, p_message text, msg text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (no error raised)', msg;
exception when others then
  if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if sqlerrm <> p_message then
    raise exception 'ASSERTION FAILED: % (got "%")', msg, sqlerrm;
  end if;
end;
$$;

-- Offer as rpc_create_offer writes it: offers row (listing_id = first batch, quantity = total,
-- weighted price) + one offer_items row per batch. p_items = [[listing_id, qty], ...].
-- p_items = '[]' writes a legacy offer with no offer_items.
create or replace function pg_temp.mk_offer(p_id uuid, p_listing uuid, p_qty numeric, p_items jsonb default null,
                                            p_buyer uuid default 'c0000000-0000-0000-0000-000000000001')
returns void
language plpgsql
as $$
declare
  v_items jsonb := coalesce(p_items, jsonb_build_array(jsonb_build_array(p_listing, p_qty)));
begin
  insert into public.offers (id, buyer_id, farmer_id, listing_id, quantity, price_per_unit, current_quantity, current_price)
  values (p_id, p_buyer, 'f0000000-0000-0000-0000-000000000001', p_listing, p_qty, 10, p_qty, 10);
  insert into public.offer_items (offer_id, listing_id, quantity, price_per_unit)
  select p_id, (i->>0)::uuid, (i->>1)::numeric, 10 from jsonb_array_elements(v_items) i;
end;
$$;

-- useCounterOffer: always writes quantity AND current_quantity (+ price) and status 'counter'.
create or replace function pg_temp.counter(p_id uuid, p_qty numeric, p_price numeric default 10)
returns void
language sql
as $$
  update public.offers
  set quantity = p_qty, current_quantity = p_qty, price_per_unit = p_price, current_price = p_price,
      status = 'counter', ball_side = case when ball_side = 'farmer' then 'buyer' else 'farmer' end
  where id = p_id
$$;

create or replace function pg_temp.accept(p_id uuid)
returns void
language sql
as $$
  update public.offers set status = 'accepted' where id = p_id
$$;

insert into public.listings (id, farmer_id, crop, quantity, price_per_unit, status) values
  ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Biber',   11, 10, 'active'),
  ('10000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Biber',   20, 10, 'active'),
  ('10000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'Biber',   20, 10, 'active'),
  ('10000000-0000-0000-0000-00000000003a', 'f0000000-0000-0000-0000-000000000001', 'Kabak',   50, 10, 'active'),
  ('10000000-0000-0000-0000-00000000003b', 'f0000000-0000-0000-0000-000000000001', 'Kabak',   50, 10, 'active'),
  ('10000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'Patlıcan', 10, 10, 'active'),
  ('10000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000001', 'Patlıcan', 10, 10, 'active'),
  ('10000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001', 'Elma',    20, 10, 'active'),
  ('10000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000001', 'Armut',  999, 10, 'draft'),
  ('10000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000001', 'Ayva',     2, 10, 'active');

-- ---- 0. backfill of pre-existing rows (00b_pre_migration.sql) ---------------------------------
select pg_temp.assert((select initial_quantity = 7 and initial_price_per_unit = 30 from public.offers
  where id = 'b0000000-0000-0000-0000-0000000000a1'), 'backfill: negotiation_history[0] is the original ask');
select pg_temp.assert((select initial_quantity = 5 and initial_price_per_unit = 20 from public.offers
  where id = 'b0000000-0000-0000-0000-0000000000a2'), 'backfill: no history -> quantity/price_per_unit');
select pg_temp.assert((select initial_quantity = 4 and initial_price_per_unit = 22.5 from public.offers
  where id = 'b0000000-0000-0000-0000-0000000000a3'), 'backfill: malformed history value falls back per column');
select pg_temp.assert((select count(*) from public.offers where initial_quantity is null or initial_price_per_unit is null) = 0,
  'backfill: no offer left without initial_*');

-- ---- 1. single batch: counter 10 -> 12, accept reserves 12 ------------------------------------
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 10);
select pg_temp.counter('20000000-0000-0000-0000-000000000001', 12);
select pg_temp.expect_exact_error($$select pg_temp.accept('20000000-0000-0000-0000-000000000001')$$,
  'Stok yetersiz (batch)', 'single batch countered to 12 on stock 11 is rejected with the batch message');
update public.listings set quantity = 12 where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.accept('20000000-0000-0000-0000-000000000001');
select pg_temp.assert((select final_quantity = 12 from public.offers where id = '20000000-0000-0000-0000-000000000001'),
  'final_quantity is the agreed 12');
select pg_temp.assert(public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000001') = 12,
  'single batch reserves the agreed 12, not offer_items.quantity 10');
select pg_temp.assert((select available = 0 from public.listing_stock_summary('10000000-0000-0000-0000-000000000001')),
  'nothing left after the 12 is reserved');

-- ---- 2. single batch: counter to 12 then withdrawn (current 10, quantity stays 12) ------------
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 10);
select pg_temp.counter('20000000-0000-0000-0000-000000000002', 12);
-- useWithdrawCounter: reverts only current_*, leaves quantity/price_per_unit at the counter.
update public.offers set current_quantity = 10, current_price = 10, status = 'pending_buyer', ball_side = 'buyer'
  where id = '20000000-0000-0000-0000-000000000002';
select pg_temp.accept('20000000-0000-0000-0000-000000000002');
select pg_temp.assert(public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000002') = 10,
  'withdrawn counter: reserves current_quantity 10, not quantity 12');

-- ---- 3. multi batch: quantity lock --------------------------------------------------------------
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000003a', 10,
  '[["10000000-0000-0000-0000-00000000003a", 4], ["10000000-0000-0000-0000-00000000003b", 6]]');
select pg_temp.expect_error($$select pg_temp.counter('20000000-0000-0000-0000-000000000003', 12)$$,
  'OFFER_MULTI_ITEM_QUANTITY_LOCKED:', 'multi batch: quantity change rejected');
select pg_temp.expect_error($$update public.offers set current_quantity = 8 where id = '20000000-0000-0000-0000-000000000003'$$,
  'OFFER_MULTI_ITEM_QUANTITY_LOCKED:', 'multi batch: current_quantity-only change rejected');
select pg_temp.expect_error($$update public.offers set quantity = 11 where id = '20000000-0000-0000-0000-000000000003'$$,
  'OFFER_MULTI_ITEM_QUANTITY_LOCKED:', 'multi batch: quantity-only change rejected');
select pg_temp.counter('20000000-0000-0000-0000-000000000003', 10, 12);  -- same quantity, new price: UI shape
select pg_temp.assert((select current_price = 12 and quantity = 10 from public.offers
  where id = '20000000-0000-0000-0000-000000000003'), 'multi batch: price-only counter passes');
update public.offers set quantity = 10.00, current_quantity = 10 where id = '20000000-0000-0000-0000-000000000003';
select pg_temp.accept('20000000-0000-0000-0000-000000000003');
select pg_temp.assert(public.fn_listing_reserved_qty('10000000-0000-0000-0000-00000000003a') = 4
  and public.fn_listing_reserved_qty('10000000-0000-0000-0000-00000000003b') = 6,
  'multi batch: each listing reserves its own offer_items.quantity');
-- single batch offers are NOT locked (scenario 1 already countered one); a legacy one neither:
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000006', 1, '[]');
select pg_temp.counter('20000000-0000-0000-0000-000000000009', 2);

-- ---- 4. legacy (0 offer_items) and new offers on the same listing see each other --------------
-- 4a: legacy accepted first, new single-batch offer then blocked (message: batch path).
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000004', 6, '[]');
select pg_temp.accept('20000000-0000-0000-0000-000000000041');
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000004', 5);
select pg_temp.expect_exact_error($$select pg_temp.accept('20000000-0000-0000-0000-000000000042')$$,
  'Stok yetersiz (batch)', 'new offer sees the legacy reservation');
-- 4b: new offer accepted first, legacy offer then blocked (message: legacy path).
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000005', 5);
select pg_temp.accept('20000000-0000-0000-0000-000000000051');
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000005', 6, '[]');
select pg_temp.expect_exact_error($$select pg_temp.accept('20000000-0000-0000-0000-000000000052')$$,
  'Stok yetersiz', 'legacy offer sees the new-style reservation');
select pg_temp.assert(public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000004') = 6
  and public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000005') = 5,
  'rejected acceptances reserved nothing');
-- exact fit still passes on the legacy path
update public.offers set quantity = 5, current_quantity = 5 where id = '20000000-0000-0000-0000-000000000052';
select pg_temp.accept('20000000-0000-0000-0000-000000000052');
select pg_temp.assert(public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000005') = 10,
  'legacy + new reserve together');

-- ---- 5. rpc_create_offer against an accepted, negotiated-up offer ------------------------------
-- As the API would run it: role authenticated, RLS on, a DIFFERENT buyer who cannot see the
-- first buyer's offer. Offer 1: 10 -> countered to 15 -> accepted. Stock 20 -> 5 left.
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';
select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000006","quantity":10,"price_per_unit":10}]');
reset role;
update public.offers set quantity = 15, current_quantity = 15, status = 'counter'
  where buyer_id = 'c0000000-0000-0000-0000-000000000001' and listing_id = '10000000-0000-0000-0000-000000000006'
    and id <> '20000000-0000-0000-0000-000000000009';
update public.offers set status = 'accepted'
  where buyer_id = 'c0000000-0000-0000-0000-000000000001' and listing_id = '10000000-0000-0000-0000-000000000006'
    and id <> '20000000-0000-0000-0000-000000000009';
select pg_temp.assert(public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000006') = 15,
  'negotiated-up acceptance reserves 15');

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.assert((select count(*) from public.offers) = 0, 'buyer 2 sees no offers under RLS');
select pg_temp.expect_exact_error($$select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000006","quantity":6,"price_per_unit":10}]')$$,
  'Stok yetersiz (batch)', 'rpc_create_offer: 6 > 20 - 15 rejected (sees the grown, RLS-hidden reservation)');
select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000006","quantity":5,"price_per_unit":10}]');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.role;
select pg_temp.assert((select count(*) from public.offers where buyer_id = 'c0000000-0000-0000-0000-000000000002') = 1,
  'rpc_create_offer: exact remaining 5 accepted');

-- ---- 6. initial_* ------------------------------------------------------------------------------
select pg_temp.assert((select initial_quantity = 10 and initial_price_per_unit = 10 from public.offers
  where id = '20000000-0000-0000-0000-000000000001'), 'initial_* filled at insert and kept after counter + accept');
select pg_temp.assert((select initial_quantity = 1 from public.offers where id = '20000000-0000-0000-0000-000000000009'),
  'initial_quantity kept after a counter on a pending offer');
select pg_temp.expect_error($$update public.offers set initial_quantity = 99 where id = '20000000-0000-0000-0000-000000000009'$$,
  'OFFERS_INITIAL_IMMUTABLE:', 'initial_quantity cannot be updated');
select pg_temp.expect_error($$update public.offers set initial_price_per_unit = 99 where id = '20000000-0000-0000-0000-000000000009'$$,
  'OFFERS_INITIAL_IMMUTABLE:', 'initial_price_per_unit cannot be updated');
select pg_temp.expect_error($$update public.offers set initial_price_per_unit = null where id = '20000000-0000-0000-0000-000000000009'$$,
  'OFFERS_INITIAL_IMMUTABLE:', 'initial_price_per_unit cannot be cleared');
insert into public.offers (id, buyer_id, farmer_id, listing_id, quantity, price_per_unit, initial_quantity, initial_price_per_unit)
values ('20000000-0000-0000-0000-000000000061', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000006', 3, 11, 999, 999);
select pg_temp.assert((select initial_quantity = 3 and initial_price_per_unit = 11 from public.offers
  where id = '20000000-0000-0000-0000-000000000061'), 'client-supplied initial_* on insert is overwritten');

-- ---- 7. trigger order: guard_offer_snapshot_columns before trg_enforce_offer_stock -------------
-- BEFORE UPDATE row triggers fire in name order. The assertion names both triggers, so renaming
-- either (or the lock trigger) fails here.
select pg_temp.assert((
  select array_agg(tgname::text order by tgname::text collate "C")
  from pg_trigger
  where tgrelid = 'public.offers'::regclass and not tgisinternal
    and tgtype & 2 = 2       -- BEFORE
    and tgtype & 16 = 16     -- UPDATE
    and tgtype & 1 = 1       -- ROW
    and tgname in ('guard_offer_snapshot_columns', 'offers_multi_item_quantity_lock', 'trg_enforce_offer_stock')
) = array['guard_offer_snapshot_columns', 'offers_multi_item_quantity_lock', 'trg_enforce_offer_stock'],
  'BEFORE UPDATE order: guard_offer_snapshot_columns < offers_multi_item_quantity_lock < trg_enforce_offer_stock');
select pg_temp.assert((select tgfoid = 'public.fn_guard_offer_snapshot_columns'::regproc from pg_trigger
  where tgrelid = 'public.offers'::regclass and tgname = 'guard_offer_snapshot_columns'), 'guard trigger -> guard function');
select pg_temp.assert((select tgfoid = 'public.enforce_offer_stock'::regproc from pg_trigger
  where tgrelid = 'public.offers'::regclass and tgname = 'trg_enforce_offer_stock'), 'stock trigger -> enforce_offer_stock');
-- Behavioural pin: a client that sends its own final_quantity with the acceptance. The guard
-- (first) overwrites it with the agreed current_quantity 3; enforce (second) must check 3 against
-- stock 2. If enforce ran first it would check the client's 1 and let the acceptance through.
select pg_temp.mk_offer('20000000-0000-0000-0000-000000000071', '10000000-0000-0000-0000-000000000008', 3);
select pg_temp.expect_exact_error($$update public.offers set status = 'accepted', final_quantity = 1, final_price_per_unit = 1
  where id = '20000000-0000-0000-0000-000000000071'$$,
  'Stok yetersiz (batch)', 'enforce sees the guard-set final_quantity, not a client-sent one');

-- ---- 8. listing_stock_summary ------------------------------------------------------------------
set role anon;
select pg_temp.assert((select base = 20 and reserved = 15 and available = 5 and linked_count = 0 and using_fallback
  from public.listing_stock_summary('10000000-0000-0000-0000-000000000006')), 'anon: summary of an active listing');
select pg_temp.assert((select count(*) from public.listing_stock_summary('10000000-0000-0000-0000-000000000007')) = 0,
  'anon: draft listing -> no row');
select pg_temp.expect_error($$select public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000006')$$,
  'permission denied', 'anon cannot call fn_listing_reserved_qty');
reset role;
-- reserved == the function the trigger uses, for every listing
select pg_temp.assert((
  select bool_and(s.reserved = public.fn_listing_reserved_qty(l.id))
  from public.listings l cross join lateral public.listing_stock_summary(l.id) s
), 'summary.reserved equals fn_listing_reserved_qty on every listing');
-- batch-linked stock: base = sum(harvest_entries), not listing.quantity; available floors at 0
insert into public.harvest_entries (id, farmer_id, crop, quantity) values
  ('30000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Biber', 3),
  ('30000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Biber', 4);
insert into public.listing_harvest_entries (listing_id, harvest_entry_id) values
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002');
select pg_temp.assert((select base = 7 and reserved = 10 and available = 0 and linked_count = 2 and not using_fallback
  from public.listing_stock_summary('10000000-0000-0000-0000-000000000002')), 'batch-linked base, available floored at 0');
-- farmer sees own draft
set request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.assert((select count(*) from public.listing_stock_summary('10000000-0000-0000-0000-000000000007')) = 1,
  'owner sees own draft listing summary');
reset role;
reset request.jwt.claim.sub;

-- ---- 9. grants / function shape ----------------------------------------------------------------
select pg_temp.assert(has_function_privilege('anon', 'public.listing_stock_summary(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.listing_stock_summary(uuid)', 'execute'),
  'listing_stock_summary executable by anon + authenticated');
select pg_temp.assert(not has_function_privilege('anon', 'public.fn_offer_effective_item_qty(public.offers, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_offer_effective_item_qty(public.offers, uuid)', 'execute'),
  'fn_offer_effective_item_qty internal');
select pg_temp.assert(not has_function_privilege('anon', 'public.fn_listing_reserved_qty(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.fn_listing_reserved_qty(uuid, uuid)', 'execute'),
  'fn_listing_reserved_qty: anon denied, authenticated kept for SECURITY INVOKER rpc_create_offer');
select pg_temp.assert(not has_function_privilege('anon', 'public.fn_offers_multi_item_quantity_lock()', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_offers_multi_item_quantity_lock()', 'execute')
  and has_function_privilege('service_role', 'public.fn_offers_multi_item_quantity_lock()', 'execute'),
  'lock trigger function: service_role only');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.enforce_offer_stock()', 'execute')
  and has_function_privilege('service_role', 'public.enforce_offer_stock()', 'execute'),
  'enforce_offer_stock keeps baseline grants');
select pg_temp.assert((select bool_and(proconfig @> array['search_path=""']) from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in ('fn_offer_effective_item_qty', 'fn_listing_reserved_qty', 'listing_stock_summary',
                    'fn_offers_multi_item_quantity_lock')), 'new functions pin search_path to empty');
select pg_temp.assert((select prosecdef and provolatile = 's' and prolang = (select oid from pg_language where lanname = 'sql')
  from pg_proc where proname = 'listing_stock_summary'), 'listing_stock_summary: sql, stable, security definer');
select pg_temp.assert((select provolatile = 's' and prolang = (select oid from pg_language where lanname = 'sql')
  from pg_proc where proname = 'fn_listing_reserved_qty'), 'fn_listing_reserved_qty: sql, stable');
select pg_temp.assert((select not prosecdef from pg_proc where proname = 'rpc_create_offer'),
  'rpc_create_offer stays SECURITY INVOKER');

\o
\echo '    all FIN-3-S assertions passed'
