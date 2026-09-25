-- ORD-1 — assertion suite for 20260925172029_ord1a_order_rpcs_and_guard.sql (A) +
-- 20260925180000_ord1b_lock_order_writes.sql (B), applied in that order by run.sh.
--
-- Negative matrix: claude/ORD-1-Spec-2026-09-25.md §5 (N1–N24) + the positive end-to-end flow.
-- Every negative case runs as the real API role (set role authenticated / anon / service_role) with
-- request.jwt.claims set the way PostgREST sets it, RLS on. Setup-only helpers (pg_temp.mk_order)
-- run as the superuser with claims set, so the RPCs still see the right auth.uid().
--
-- After B a client write to orders / order_timeline / disputes fails on the grant before RLS or the
-- trigger run. Each layer is therefore also tested on its own:
--   * RLS: inside a rolled-back transaction the write grant is restored to authenticated, and the write
--     must still fail because no write policy is left (N1, N6, N18, N19).
--   * guard trigger: :guard_buyer / :guard_farmer are the superuser (grants + RLS bypassed) with the
--     party's claims, so only fn_guard_order_transitions stands between them and the row.

\set ON_ERROR_STOP on
\o /dev/null

\set as_buyer   'reset role; select set_config(''request.jwt.claims'', ''{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_buyer2  'reset role; select set_config(''request.jwt.claims'', ''{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}'', false); set role authenticated;'
\set as_farmer  'reset role; select set_config(''request.jwt.claims'', ''{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_stranger 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_anon    'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false); set role anon;'
\set as_service 'reset role; select set_config(''request.jwt.claims'', ''{"role":"service_role"}'', false); set role service_role;'
\set as_super   'reset role; select set_config(''request.jwt.claims'', '''', false);'
\set guard_buyer  'reset role; select set_config(''request.jwt.claims'', ''{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false);'
\set guard_farmer 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false);'

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

create or replace function pg_temp.act(p_uid uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
                    case when p_uid is null then '' else jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text end,
                    false)
$$;

-- Setup only (superuser + claims): offer via rpc_create_offer -> farmer rpc_accept_offer -> optionally
-- buyer_mark_transfer_sent / farmer_confirm_payment_received / ship / deliver. Returns the order id.
create or replace function pg_temp.mk_order(p_listing uuid, p_qty numeric, p_stage text,
                                            p_buyer uuid default 'c0000000-0000-0000-0000-000000000001')
returns uuid
language plpgsql
as $$
declare
  v_farmer uuid := 'f0000000-0000-0000-0000-000000000001';
  v_offer public.offers;
  v_res jsonb;
  v_order uuid;
begin
  perform pg_temp.act(p_buyer);
  v_offer := public.rpc_create_offer(v_farmer,
    jsonb_build_array(jsonb_build_object('listing_id', p_listing, 'quantity', p_qty, 'price_per_unit', 10)));
  perform pg_temp.act(v_farmer);
  v_res := public.rpc_accept_offer(v_offer.id);
  v_order := (v_res->>'orderId')::uuid;
  if p_stage in ('pending_transfer', 'paid', 'shipped', 'delivered') then
    perform pg_temp.act(p_buyer);
    perform public.buyer_mark_transfer_sent(v_offer.id);
  end if;
  if p_stage in ('paid', 'shipped', 'delivered') then
    perform pg_temp.act(v_farmer);
    perform public.farmer_confirm_payment_received(v_offer.id);
  end if;
  if p_stage in ('shipped', 'delivered') then
    perform pg_temp.act(v_farmer);
    perform public.rpc_mark_order_shipped(v_order, 'TRK-1', 'Yurtiçi');
  end if;
  if p_stage = 'delivered' then
    perform pg_temp.act(p_buyer);
    perform public.rpc_confirm_order_delivered(v_order);
  end if;
  perform pg_temp.act(null);
  return v_order;
end;
$$;

-- Web useCounterOffer as the CURRENT role: offers update + offer_messages insert (explicit created_at
-- so message order is deterministic inside one transaction).
create or replace function pg_temp.counter(p_offer uuid, p_by text, p_price numeric, p_qty numeric, p_at timestamptz)
returns void
language plpgsql
as $$
begin
  update public.offers
     set quantity = p_qty, price_per_unit = p_price, current_quantity = p_qty, current_price = p_price,
         ball_side = case when p_by = 'farmer' then 'buyer' else 'farmer' end,
         status = 'counter',
         negotiation_history = negotiation_history || jsonb_build_array(jsonb_build_object('by', p_by, 'quantity', quantity, 'pricePerUnit', price_per_unit))
   where id = p_offer;
  insert into public.offer_messages (offer_id, sender_role, sender_id, price, quantity, created_at)
  values (p_offer, p_by, auth.uid(), p_price, p_qty, p_at);
end;
$$;

insert into public.listings (id, farmer_id, crop, quantity, price_per_unit, status) values
  ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates', 1000, 10, 'active'),
  ('10000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Biber',      5, 10, 'active'),
  ('10000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'Patlıcan',  10, 10, 'active'),
  ('10000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'Kabak',    100, 10, 'active');

-- =============================================================================================
-- 0. Migration shape (applied twice by run.sh)
-- =============================================================================================
select pg_temp.assert((select count(*) = 1 from pg_constraint
  where conrelid = 'public.orders'::regclass and conname = 'orders_offer_id_key' and contype = 'u'),
  'orders_offer_id_key UNIQUE exists exactly once');
select pg_temp.assert(not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'set_order_ref'),
  'duplicate set_order_ref trigger dropped');
select pg_temp.assert(exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'orders_set_order_ref'),
  'orders_set_order_ref kept');
select pg_temp.assert((select count(*) = 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'guard_order_transitions'),
  'guard_order_transitions exists exactly once');
select pg_temp.assert(not has_function_privilege('anon', p.oid, 'execute')
                      and has_function_privilege('authenticated', p.oid, 'execute')
                      and has_function_privilege('service_role', p.oid, 'execute'),
  'grants: ' || p.proname || ' -> authenticated + service_role only')
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('rpc_accept_offer', 'rpc_mark_order_shipped', 'rpc_confirm_order_delivered',
                    'rpc_cancel_order', 'rpc_open_dispute', 'rpc_withdraw_counter');
select pg_temp.assert((select count(*) = 6 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and p.proname in ('rpc_accept_offer', 'rpc_mark_order_shipped', 'rpc_confirm_order_delivered',
                    'rpc_cancel_order', 'rpc_open_dispute', 'rpc_withdraw_counter')
  and p.proconfig @> array['search_path=""']), 'all six RPCs are SECURITY DEFINER with search_path=''''');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.fn_guard_order_transitions()', 'execute')
                      and not has_function_privilege('anon', 'public.fn_guard_order_transitions()', 'execute')
                      and has_function_privilege('service_role', 'public.fn_guard_order_transitions()', 'execute'),
  'fn_guard_order_transitions: service_role only');

-- B: write policies gone, SELECT policies (and reviews policies) kept.
select pg_temp.assert((select array_agg(tablename || ': ' || policyname order by tablename, policyname)
                       from pg_policies where schemaname = 'public'
                        and tablename in ('orders', 'order_timeline', 'disputes', 'reviews'))
                      = array['disputes: Order parties can view own disputes',
                              'order_timeline: Both parties read timeline',
                              'orders: Both parties read their orders',
                              'reviews: Order parties can insert their review',
                              'reviews: Reviews are publicly readable'],
  'B: only the SELECT policies (+ reviews policies) remain on orders / order_timeline / disputes / reviews');
select pg_temp.assert(not exists (select 1 from pg_policies where schemaname = 'public'
                                  and tablename in ('orders', 'order_timeline', 'disputes') and cmd <> 'SELECT'),
  'B: no write policy on orders / order_timeline / disputes');

-- B: table grants.
select pg_temp.assert(not has_table_privilege(r, 'public.' || t, priv),
  'B: ' || r || ' has no ' || priv || ' on ' || t)
from unnest(array['anon', 'authenticated']) r,
     unnest(array['orders', 'order_timeline', 'disputes']) t,
     unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) priv;
select pg_temp.assert(has_table_privilege(r, 'public.' || t, 'SELECT'), 'B: ' || r || ' keeps SELECT on ' || t)
from unnest(array['anon', 'authenticated', 'service_role']) r,
     unnest(array['orders', 'order_timeline', 'disputes', 'reviews']) t;
select pg_temp.assert(has_table_privilege('service_role', 'public.' || t, priv), 'B: service_role keeps ' || priv || ' on ' || t)
from unnest(array['orders', 'order_timeline', 'disputes', 'reviews']) t,
     unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) priv;
select pg_temp.assert(not has_table_privilege('anon', 'public.reviews', priv), 'B: anon has no ' || priv || ' on reviews')
from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) priv;
select pg_temp.assert(not has_table_privilege('authenticated', 'public.reviews', priv), 'B: authenticated has no ' || priv || ' on reviews')
from unnest(array['UPDATE', 'DELETE', 'TRUNCATE']) priv;
select pg_temp.assert(has_table_privilege('authenticated', 'public.reviews', 'INSERT'), 'B: authenticated keeps INSERT on reviews');

-- B: the guard blocks flagless client status writes; the rest of the body is unchanged.
select pg_temp.assert(position('ORDER_STATUS_CLIENT_WRITE_BLOCKED' in prosrc) > 0
                      and position('-- if not v_via_rpc' in prosrc) = 0,
  'B: fn_guard_order_transitions has the ORDER_STATUS_CLIENT_WRITE_BLOCKED block enabled')
from pg_proc where oid = 'public.fn_guard_order_transitions()'::regprocedure;

-- =============================================================================================
-- P. Positive end-to-end flow
--    teklif -> karşı teklif -> kabul (sipariş+timeline) -> havale bildirimi -> ödeme onayı (ikinci
--    sipariş yok) -> kargo -> teslim (pencere) -> servis rolü completed -> alıcı yorumu
-- =============================================================================================
select nextval('public.order_seq') as seq_before \gset

:as_buyer
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000001","quantity":10,"price_per_unit":10}]'::jsonb)).id as p_offer \gset

:as_farmer
select pg_temp.counter(:'p_offer', 'farmer', 12, 10, now());

:as_buyer
select pg_temp.assert(public.rpc_accept_offer(:'p_offer') ->> 'ok' = 'true', 'P: buyer accepts the farmer counter via rpc_accept_offer');
select id as p_order from public.orders where offer_id = :'p_offer' \gset
select pg_temp.assert((select status = 'accepted' and ball_side = 'buyer' and payment_status = 'unpaid'
                              and final_price_per_unit = 12 and final_quantity = 10
                       from public.offers where id = :'p_offer'),
  'P: offer accepted, final_* snapshot from the agreed counter (FIN-3 trigger ran inside the RPC)');
select pg_temp.assert((select count(*) = 1 from public.orders where offer_id = :'p_offer'), 'P: exactly one order created at acceptance (K1)');
select pg_temp.assert((select status = 'preparing' and order_ref ~ ('^HT-' || to_char(now(), 'YYYY') || '-[0-9]{4}$')
                              and buyer_id = 'c0000000-0000-0000-0000-000000000001' and farmer_id = 'f0000000-0000-0000-0000-000000000001'
                       from public.orders where id = :'p_order'),
  'P: order preparing, parties copied from offer, order_ref generated');
select pg_temp.assert((select array_agg(step order by created_at) = array['submitted'] and bool_and(label = 'Sipariş Alındı')
                       from public.order_timeline where order_id = :'p_order'),
  'P: timeline has the submitted step');
:as_super
select pg_temp.assert((select last_value from public.order_seq) = :seq_before + 1,
  'P: one order consumes ONE order_seq value (duplicate set_order_ref trigger gone)');

:as_farmer
select pg_temp.assert((public.rpc_accept_offer(:'p_offer')) = jsonb_build_object('ok', true, 'orderId', :'p_order'::uuid, 'alreadyAccepted', true),
  'P: repeated accept is idempotent: same orderId, alreadyAccepted');

:as_buyer
select pg_temp.assert(public.buyer_mark_transfer_sent(:'p_offer') ->> 'ok' = 'true', 'P: buyer_mark_transfer_sent');
:as_farmer
select pg_temp.assert(public.rpc_mark_order_shipped(:'p_order', 'TRK', 'Aras') = jsonb_build_object('ok', false, 'reason', 'payment_not_confirmed'),
  'P/N9: shipping while pending_transfer -> payment_not_confirmed (K2)');
select pg_temp.assert(public.farmer_confirm_payment_received(:'p_offer') = jsonb_build_object('ok', true, 'orderId', :'p_order'::uuid),
  'P: farmer_confirm_payment_received finds the order created at acceptance');
select pg_temp.assert((select count(*) = 1 from public.orders where offer_id = :'p_offer'), 'P: no second order after payment confirmation');
select pg_temp.assert((select count(*) = 1 from public.order_timeline where order_id = :'p_order' and step = 'submitted'),
  'P: no second submitted timeline row');

select pg_temp.assert(public.rpc_mark_order_shipped(:'p_order', '  ', 'Aras') = jsonb_build_object('ok', false, 'reason', 'tracking_required'),
  'P: blank tracking number rejected');
select pg_temp.assert(public.rpc_mark_order_shipped(:'p_order', ' TRK-42 ', 'Aras') ->> 'ok' = 'true', 'P: farmer ships once paid');
select pg_temp.assert((select status = 'shipped' and tracking_number = 'TRK-42' and carrier = 'Aras' from public.orders where id = :'p_order'),
  'P: shipped with tracking/carrier');

:as_buyer
select pg_temp.assert(public.rpc_confirm_order_delivered(:'p_order') ->> 'ok' = 'true', 'P: buyer confirms delivery');
select pg_temp.assert((select status = 'delivered'
                              and dispute_window_expires_at between now() + interval '24 hours' - interval '1 minute'
                                                                and now() + interval '24 hours' + interval '1 minute'
                       from public.orders where id = :'p_order'),
  'P: delivered, dispute window = server now() + 24h');
select pg_temp.assert((select array_agg(step order by created_at) = array['submitted', 'shipped', 'delivered']
                       from public.order_timeline where order_id = :'p_order'),
  'P: timeline submitted -> shipped -> delivered');
select pg_temp.expect_error($$update public.orders set status = 'completed' where id = '$$ || :'p_order' || $$'$$,
  'permission denied for table orders', 'B: authenticated buyer direct UPDATE status -> permission error (no grant, no policy)');
:guard_buyer
select pg_temp.expect_error($$update public.orders set status = 'completed' where id = '$$ || :'p_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'B: past the grant, the guard still blocks a flagless client status write');
:as_super
select pg_temp.assert((select status = 'delivered' from public.orders where id = :'p_order'), 'P: order still delivered');

-- N24: service role delivered -> completed (ORD-2 cron simulation).
:as_service
update public.orders set status = 'completed' where id = :'p_order';
select pg_temp.assert((select status = 'completed' from public.orders where id = :'p_order'), 'N24: service role delivered -> completed');

:as_buyer
insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating, comment)
values (:'p_order', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'buyer', 5, 'Harika');
select pg_temp.assert((select count(*) = 1 from public.reviews where order_id = :'p_order'), 'P: buyer reviews the completed order');
:as_farmer
insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating)
values (:'p_order', 'f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'farmer', 4);
select pg_temp.assert((select count(*) = 2 from public.reviews where order_id = :'p_order'), 'P: farmer reviews the completed order');

:as_super
select pg_temp.assert((select count(*) >= 3 from public.notifications where related_id = :'p_order' and type = 'order_status'),
  'P: notify_order_status (AFTER) still fires for RPC transitions');

-- =============================================================================================
-- Acceptance negatives
-- =============================================================================================
:as_buyer
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000004","quantity":5,"price_per_unit":10}]'::jsonb)).id as n2_offer \gset

-- N2: buyer accepts while the ball is on the farmer.
select pg_temp.expect_error($$select public.rpc_accept_offer('$$ || :'n2_offer' || $$')$$,
  'Sırada karşı taraf var', 'N2: buyer cannot accept when it is the farmer''s turn');
select pg_temp.assert((select status = 'pending' from public.offers where id = :'n2_offer'), 'N2: offer untouched');

-- N3: stranger.
:as_stranger
select pg_temp.expect_error($$select public.rpc_accept_offer('$$ || :'n2_offer' || $$')$$,
  'ACCEPT_OFFER_FORBIDDEN', 'N3: third party cannot accept');
select pg_temp.assert(public.rpc_accept_offer('00000000-0000-0000-0000-00000000dead') = jsonb_build_object('ok', false, 'reason', 'not_found'),
  'rpc_accept_offer on a missing offer -> not_found');
:as_super
select pg_temp.assert((select count(*) = 0 from public.orders where offer_id = :'n2_offer'), 'N2/N3: no order created');

-- Rejected offers cannot be accepted.
:as_farmer
update public.offers set status = 'rejected' where id = :'n2_offer';
select pg_temp.assert(public.rpc_accept_offer(:'n2_offer') = jsonb_build_object('ok', false, 'reason', 'wrong_offer_status'),
  'accepting a rejected offer -> wrong_offer_status');

-- N5: stock no longer sufficient at acceptance -> trigger error, whole RPC rolled back.
:as_buyer
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000002","quantity":5,"price_per_unit":10}]'::jsonb)).id as n5_offer \gset
:as_super
update public.listings set quantity = 3 where id = '10000000-0000-0000-0000-000000000002';
:as_farmer
select pg_temp.expect_error($$select public.rpc_accept_offer('$$ || :'n5_offer' || $$')$$,
  'Stok yetersiz (batch)', 'N5: insufficient stock rejects the acceptance');
:as_super
select pg_temp.assert((select status = 'pending' from public.offers where id = :'n5_offer'), 'N5: offer still pending (rolled back)');
select pg_temp.assert((select count(*) = 0 from public.orders where offer_id = :'n5_offer'), 'N5: no order created');

-- N4 (constraint half; the two-connection race runs in run.sh): the UNIQUE backstop itself.
select pg_temp.expect_error($$insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
  select offer_id, buyer_id, farmer_id, 'preparing', '' from public.orders where id = '$$ || :'p_order' || $$'$$,
  'duplicate key value violates unique constraint "orders_offer_id_key"', 'N4: a second order for the same offer is impossible');

-- =============================================================================================
-- Direct client writes to orders (B: grant + RLS closed; the guard trigger stays as the last line)
-- =============================================================================================
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'unpaid') as g_order \gset

-- N1: buyer / farmer direct INSERT into orders with status='completed' (n5_offer has no order).
:as_buyer
select pg_temp.expect_error($$insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
  values ('$$ || :'n5_offer' || $$', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'completed', '')$$,
  'permission denied for table orders', 'N1: buyer direct INSERT into orders -> permission error');
:as_farmer
select pg_temp.expect_error($$insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
  values ('$$ || :'n5_offer' || $$', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'completed', '')$$,
  'permission denied for table orders', 'N1: farmer direct INSERT into orders -> permission error');
:as_anon
select pg_temp.expect_error($$insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
  values ('$$ || :'n5_offer' || $$', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'completed', '')$$,
  'permission denied for table orders', 'N1: anon direct INSERT into orders -> permission error');
-- N1, RLS layer: with the INSERT grant restored, no INSERT policy is left ("System inserts orders" and
-- "Farmers insert orders on acceptance" dropped).
:as_super
begin;
grant insert on public.orders to authenticated;
:as_buyer
select pg_temp.expect_error($$insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
  values ('$$ || :'n5_offer' || $$', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'completed', '')$$,
  'new row violates row-level security policy', 'N1 (RLS layer): buyer INSERT has no policy');
:as_farmer
select pg_temp.expect_error($$insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
  values ('$$ || :'n5_offer' || $$', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'completed', '')$$,
  'new row violates row-level security policy', 'N1 (RLS layer): farmer INSERT has no policy');
:as_super
rollback;
select pg_temp.assert((select count(*) = 0 from public.orders where offer_id = :'n5_offer'), 'N1: no order created');

-- N6, permission half: the same identity UPDATEs fail on the grant first.
:as_buyer
select pg_temp.expect_error($$update public.orders set farmer_id = 'c0000000-0000-0000-0000-000000000001' where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'N6: buyer UPDATE farmer_id -> permission error');
:as_farmer
select pg_temp.expect_error($$update public.orders set buyer_id = 'c0000000-0000-0000-0000-000000000002' where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'N6: farmer UPDATE buyer_id -> permission error');
select pg_temp.expect_error($$update public.orders set tracking_number = 'X' where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'N6: farmer UPDATE of a plain column -> permission error');
:as_anon
select pg_temp.expect_error($$update public.orders set status = 'cancelled' where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'N6: anon UPDATE -> permission error');
select pg_temp.expect_error($$delete from public.orders where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'anon DELETE -> permission error');
:as_buyer
select pg_temp.expect_error($$delete from public.orders where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'buyer DELETE -> permission error');
-- N6, RLS layer: with the UPDATE grant restored, no UPDATE policy is left -> zero rows touched.
:as_super
begin;
grant update on public.orders to authenticated;
:as_buyer
with u as (update public.orders set tracking_number = 'X' where id = :'g_order' returning 1)
select pg_temp.assert(count(*) = 0, 'N6 (RLS layer): buyer UPDATE matches no row ("Order parties can update their orders" dropped)') from u;
:as_farmer
with u as (update public.orders set tracking_number = 'X' where id = :'g_order' returning 1)
select pg_temp.assert(count(*) = 0, 'N6 (RLS layer): farmer UPDATE matches no row') from u;
:as_super
rollback;
select pg_temp.assert((select status = 'preparing' and tracking_number is null from public.orders where id = :'g_order'),
  'N6: order untouched');

-- N6, guard half (grants + RLS bypassed): identity columns.
:guard_buyer
select pg_temp.expect_error($$update public.orders set farmer_id = 'c0000000-0000-0000-0000-000000000001' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: buyer cannot change farmer_id');
:guard_farmer
select pg_temp.expect_error($$update public.orders set buyer_id = 'c0000000-0000-0000-0000-000000000002' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: farmer cannot change buyer_id');
select pg_temp.expect_error($$update public.orders set offer_id = '$$ || :'n5_offer' || $$' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: offer_id immutable');
select pg_temp.expect_error($$update public.orders set order_ref = 'HT-FAKE' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: order_ref immutable');
select pg_temp.expect_error($$update public.orders set created_at = now() - interval '1 year' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: created_at immutable');

-- N7 / N8: skipping states. Through the API: permission error. Past the grant: the guard blocks any
-- flagless client status change before the matrix is even consulted.
:as_farmer
select pg_temp.expect_error($$update public.orders set status = 'delivered' where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'N7: farmer direct preparing -> delivered -> permission error');
:guard_farmer
select pg_temp.expect_error($$update public.orders set status = 'delivered' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'N7 (guard): farmer flagless preparing -> delivered');
:as_buyer
select pg_temp.expect_error($$update public.orders set status = 'completed' where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'N8: buyer direct preparing -> completed -> permission error');
:guard_buyer
select pg_temp.expect_error($$update public.orders set status = 'completed' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'N8 (guard): buyer flagless preparing -> completed');
select pg_temp.expect_error($$update public.orders set status = 'shipped' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'guard: even a matrix-legal flagless client transition is blocked');
-- The matrix still applies to the service role.
:as_service
select pg_temp.expect_error($$update public.orders set status = 'delivered' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: preparing -> delivered', 'guard: service role preparing -> delivered rejected by the matrix');
select pg_temp.expect_error($$update public.orders set status = 'disputed' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: preparing -> disputed', 'guard: service role preparing -> disputed rejected by the matrix');

-- dispute_window_expires_at is server-only.
:as_buyer
select pg_temp.expect_error($$update public.orders set dispute_window_expires_at = now() + interval '30 days' where id = '$$ || :'g_order' || $$'$$,
  'permission denied for table orders', 'client dispute window write -> permission error');
:guard_buyer
select pg_temp.expect_error($$update public.orders set dispute_window_expires_at = now() + interval '30 days' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_DISPUTE_WINDOW_SERVER_ONLY', 'guard: client cannot set the dispute window');
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'shipped') as w_order \gset
:guard_buyer
select pg_temp.expect_error($$update public.orders set status = 'delivered' where id = '$$ || :'w_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'guard: client shipped -> delivered without the RPC is blocked');
select pg_temp.expect_error($$update public.orders set status = 'delivered', dispute_window_expires_at = now() + interval '30 days' where id = '$$ || :'w_order' || $$'$$,
  'ORDER_DISPUTE_WINDOW_SERVER_ONLY', 'guard: client shipped -> delivered with its own window is rejected (web useConfirmDelivery path)');
:as_super
select pg_temp.assert((select status = 'shipped' and dispute_window_expires_at is null from public.orders where id = :'w_order'),
  'guard: rejected write left the order untouched');

-- The pre-ORD-1 web cancel path (direct UPDATE) is closed; rpc_cancel_order is the way.
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'unpaid') as a_order \gset
:as_buyer
select pg_temp.expect_error($$update public.orders set status = 'cancelled', cancelled_at = now() where id = '$$ || :'a_order' || $$'$$,
  'permission denied for table orders', 'B: direct preparing -> cancelled -> permission error');
:guard_buyer
select pg_temp.expect_error($$update public.orders set status = 'cancelled', cancelled_at = now() where id = '$$ || :'a_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'B (guard): flagless preparing -> cancelled blocked');
:as_super
select pg_temp.assert((select status = 'preparing' from public.orders where id = :'a_order'), 'B: order untouched');
:as_buyer
select pg_temp.assert(public.rpc_cancel_order(:'a_order', 'Vazgeçtim') ->> 'ok' = 'true', 'B: rpc_cancel_order still cancels');
:as_service
select pg_temp.expect_error($$update public.orders set status = 'preparing' where id = '$$ || :'a_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: cancelled -> preparing', 'guard: cancelled is terminal (even for the service role)');

-- =============================================================================================
-- Shipping / delivery
-- =============================================================================================
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'unpaid') as s_order \gset
:as_farmer
select pg_temp.assert(public.rpc_mark_order_shipped(:'s_order', 'TRK', 'Aras') = jsonb_build_object('ok', false, 'reason', 'payment_not_confirmed'),
  'N9: unpaid -> payment_not_confirmed (K2)');
:as_super
select pg_temp.assert((select status = 'preparing' from public.orders where id = :'s_order'), 'N9: order untouched');

:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'paid') as s2_order \gset
:as_buyer
select pg_temp.expect_error($$select public.rpc_mark_order_shipped('$$ || :'s2_order' || $$', 'TRK', 'Aras')$$,
  'MARK_ORDER_SHIPPED_FORBIDDEN', 'N10: buyer cannot mark shipped');
:as_stranger
select pg_temp.expect_error($$select public.rpc_mark_order_shipped('$$ || :'s2_order' || $$', 'TRK', 'Aras')$$,
  'MARK_ORDER_SHIPPED_FORBIDDEN', 'N10: stranger cannot mark shipped');
:as_farmer
select pg_temp.assert(public.rpc_mark_order_shipped(:'s2_order', 'TRK', 'Aras') ->> 'ok' = 'true', 'paid order ships');
select pg_temp.assert(public.rpc_mark_order_shipped(:'s2_order', 'TRK', 'Aras') = jsonb_build_object('ok', false, 'reason', 'wrong_status'),
  'shipping twice -> wrong_status');
select pg_temp.expect_error($$select public.rpc_confirm_order_delivered('$$ || :'s2_order' || $$')$$,
  'CONFIRM_ORDER_DELIVERED_FORBIDDEN', 'N11: farmer cannot confirm delivery');
:as_buyer
select pg_temp.assert(public.rpc_confirm_order_delivered(:'s_order') = jsonb_build_object('ok', false, 'reason', 'wrong_status'),
  'confirming delivery of a preparing order -> wrong_status');

-- =============================================================================================
-- Disputes (K4)
-- =============================================================================================
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'shipped') as d_shipped \gset
:as_buyer
select pg_temp.assert(public.rpc_open_dispute(:'d_shipped', 'Ezik', '{}') = jsonb_build_object('ok', false, 'reason', 'wrong_status'),
  'N13: dispute on a shipped order -> wrong_status');

:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'delivered') as d_late \gset
-- server-side clock moves past the window (only the service role may touch it)
:as_service
update public.orders set dispute_window_expires_at = now() - interval '1 minute' where id = :'d_late';
:as_buyer
select pg_temp.assert(public.rpc_open_dispute(:'d_late', 'Ezik', '{}') = jsonb_build_object('ok', false, 'reason', 'window_closed'),
  'N12: window closed (server time) -> window_closed');
select pg_temp.expect_error($$update public.orders set dispute_window_expires_at = now() + interval '1 day' where id = '$$ || :'d_late' || $$'$$,
  'permission denied for table orders', 'N12: the client cannot reopen the window itself (permission)');
:guard_buyer
select pg_temp.expect_error($$update public.orders set dispute_window_expires_at = now() + interval '1 day' where id = '$$ || :'d_late' || $$'$$,
  'ORDER_DISPUTE_WINDOW_SERVER_ONLY', 'N12: the client cannot reopen the window itself (guard)');
:as_super
select pg_temp.assert((select count(*) = 0 from public.disputes where order_id = :'d_late'), 'N12: no dispute row');

:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'delivered') as d_order \gset
:as_stranger
select pg_temp.expect_error($$select public.rpc_open_dispute('$$ || :'d_order' || $$', 'x', '{}')$$,
  'OPEN_DISPUTE_FORBIDDEN', 'stranger cannot open a dispute');
:as_farmer
select pg_temp.assert(public.rpc_open_dispute(:'d_order', '   ', '{}') = jsonb_build_object('ok', false, 'reason', 'reason_required'),
  'blank dispute reason rejected');
select pg_temp.assert(public.rpc_open_dispute(:'d_order', 'Ezik', array['someone-else/x.jpg']) = jsonb_build_object('ok', false, 'reason', 'invalid_evidence_path'),
  'evidence outside <order_id>/ rejected');
select pg_temp.assert(public.rpc_open_dispute(:'d_order', 'Ezik', array[:'d_order' || '/../x/y.jpg']) = jsonb_build_object('ok', false, 'reason', 'invalid_evidence_path'),
  'evidence with .. rejected');
-- K4: the farmer can open a dispute too.
select pg_temp.assert(public.rpc_open_dispute(:'d_order', ' Ödeme sorunu ', array[:'d_order' || '/dispute-1.jpg']) ->> 'ok' = 'true',
  'K4: farmer opens a dispute inside the window');
select pg_temp.assert((select d.status = 'open' and d.opened_by = 'f0000000-0000-0000-0000-000000000001' and d.reason = 'Ödeme sorunu'
                              and d.evidence_photo_urls = array[:'d_order' || '/dispute-1.jpg']
                              and d.window_expires_at = o.dispute_window_expires_at and o.status = 'disputed'
                       from public.disputes d join public.orders o on o.id = d.order_id where d.order_id = :'d_order'),
  'K4: dispute row (default status open, window copied) + order disputed, atomically');
:as_buyer
select pg_temp.assert(public.rpc_open_dispute(:'d_order', 'Ben de', '{}') = jsonb_build_object('ok', false, 'reason', 'wrong_status'),
  'second dispute on a disputed order -> wrong_status');

-- N14: parties cannot resolve.
select pg_temp.expect_error($$update public.orders set status = 'completed' where id = '$$ || :'d_order' || $$'$$,
  'permission denied for table orders', 'N14: buyer disputed -> completed -> permission error');
:as_farmer
select pg_temp.expect_error($$update public.orders set status = 'cancelled' where id = '$$ || :'d_order' || $$'$$,
  'permission denied for table orders', 'N14: farmer disputed -> cancelled -> permission error');
:guard_buyer
select pg_temp.expect_error($$update public.orders set status = 'completed' where id = '$$ || :'d_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'N14 (guard): buyer disputed -> completed blocked');
:guard_farmer
select pg_temp.expect_error($$update public.orders set status = 'cancelled' where id = '$$ || :'d_order' || $$'$$,
  'ORDER_STATUS_CLIENT_WRITE_BLOCKED', 'N14 (guard): farmer disputed -> cancelled blocked');

-- N19: parties cannot resolve / edit / open a dispute directly.
:as_buyer
select pg_temp.expect_error($$update public.disputes set status = 'resolved', resolution = 'x', resolved_at = now() where order_id = '$$ || :'d_order' || $$'$$,
  'permission denied for table disputes', 'N19: buyer UPDATE disputes -> permission error');
:as_farmer
select pg_temp.expect_error($$update public.disputes set status = 'resolved' where order_id = '$$ || :'d_order' || $$'$$,
  'permission denied for table disputes', 'N19: farmer (opener) UPDATE disputes -> permission error');
select pg_temp.expect_error($$delete from public.disputes where order_id = '$$ || :'d_order' || $$'$$,
  'permission denied for table disputes', 'N19: DELETE disputes -> permission error');
select pg_temp.expect_error($$insert into public.disputes (order_id, opened_by, reason) values ('$$ || :'d_order' || $$', 'f0000000-0000-0000-0000-000000000001', 'x')$$,
  'permission denied for table disputes', 'N19: direct INSERT into disputes -> permission error (rpc_open_dispute only)');
:as_anon
select pg_temp.expect_error($$update public.disputes set status = 'resolved' where order_id = '$$ || :'d_order' || $$'$$,
  'permission denied for table disputes', 'N19: anon UPDATE disputes -> permission error');
-- N19, RLS layer: with the grants restored, no INSERT/UPDATE policy is left.
:as_super
begin;
grant insert, update on public.disputes to authenticated;
:as_buyer
with u as (update public.disputes set status = 'resolved' where order_id = :'d_order' returning 1)
select pg_temp.assert(count(*) = 0, 'N19 (RLS layer): UPDATE matches no row ("Order parties can update own disputes" dropped)') from u;
select pg_temp.assert((select count(*) = 1 from public.disputes where order_id = :'d_order'), 'N19 (RLS layer): the SELECT policy still shows the row');
select pg_temp.expect_error($$insert into public.disputes (order_id, opened_by, reason) values ('$$ || :'d_order' || $$', 'c0000000-0000-0000-0000-000000000001', 'x')$$,
  'new row violates row-level security policy', 'N19 (RLS layer): INSERT has no policy ("Order parties can open disputes" dropped)');
:as_super
rollback;
select pg_temp.assert((select count(*) = 1 and bool_and(status = 'open') from public.disputes where order_id = :'d_order'),
  'N19: dispute still open, no second row');

:as_service
update public.orders set status = 'cancelled' where id = :'d_order';
select pg_temp.assert((select status = 'cancelled' from public.orders where id = :'d_order'), 'service role resolves disputed -> cancelled');
update public.disputes set status = 'resolved', resolution = 'iade', resolved_at = now() where order_id = :'d_order';
select pg_temp.assert((select status = 'resolved' from public.disputes where order_id = :'d_order'), 'service role resolves the dispute row');

-- Service role (auth.uid() null) disputed -> completed (ORD-2 / admin path).
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'delivered') as d2_order \gset
:as_buyer
select pg_temp.assert(public.rpc_open_dispute(:'d2_order', 'Eksik', '{}') ->> 'ok' = 'true', 'buyer opens a dispute via the RPC');
:as_service
update public.orders set status = 'completed' where id = :'d2_order';
select pg_temp.assert((select status = 'completed' from public.orders where id = :'d2_order'), 'service role resolves disputed -> completed');

-- =============================================================================================
-- Cancellation (K3) + stock (N17)
-- =============================================================================================
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'paid') as c_paid \gset
:as_buyer
select pg_temp.assert(public.rpc_cancel_order(:'c_paid', 'Vazgeçtim') = jsonb_build_object('ok', false, 'reason', 'paid_admin_only'),
  'N15: party cannot cancel a paid order');
:as_service
update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'admin iade' where id = :'c_paid';
select pg_temp.assert((select status = 'cancelled' from public.orders where id = :'c_paid'), 'K3: service role (admin) cancels a paid order');

:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'shipped') as c_shipped \gset
:as_farmer
select pg_temp.assert(public.rpc_cancel_order(:'c_shipped', 'x') = jsonb_build_object('ok', false, 'reason', 'wrong_status'),
  'N16: shipped order cannot be cancelled');
:as_stranger
select pg_temp.expect_error($$select public.rpc_cancel_order('$$ || :'c_shipped' || $$', 'x')$$,
  'CANCEL_ORDER_FORBIDDEN', 'stranger cannot cancel');

-- N17: listing 3 has stock 10. Two orders of 6 cannot coexist; cancelling the first frees the stock.
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000003', 6, 'pending_transfer') as c_stock \gset
select pg_temp.assert((select reserved = 6 and available = 4 from public.listing_stock_summary('10000000-0000-0000-0000-000000000003')),
  'N17: 6 reserved before cancellation');
:as_buyer
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000003","quantity":4,"price_per_unit":10}]'::jsonb)).id as c_next \gset
:as_super
update public.offers set quantity = 6, current_quantity = 6 where id = :'c_next';  -- the buyer now wants 6 (setup)
:as_farmer
select pg_temp.expect_error($$select public.rpc_accept_offer('$$ || :'c_next' || $$')$$,
  'Stok yetersiz (batch)', 'N17: a second 6 does not fit while the first is live');
:as_buyer
select pg_temp.assert(public.rpc_cancel_order(:'c_stock', '  ') ->> 'ok' = 'true', 'K3: buyer cancels during pending_transfer');
select pg_temp.assert((select status = 'cancelled' and cancelled_at is not null and cancel_reason is null
                       from public.orders where id = :'c_stock'), 'K3: cancelled_at set, blank reason stored as null');
select pg_temp.assert((select step = 'cancelled' and label = 'Sipariş İptal Edildi' from public.order_timeline
                       where order_id = :'c_stock' order by created_at desc limit 1), 'K3: cancelled timeline row');
select pg_temp.assert((select reserved = 0 and available = 10 from public.listing_stock_summary('10000000-0000-0000-0000-000000000003')),
  'N17: cancelled order no longer reserved in listing_stock_summary');
select pg_temp.assert(public.fn_listing_reserved_qty('10000000-0000-0000-0000-000000000003') = 0, 'N17: fn_listing_reserved_qty agrees');
:as_farmer
select pg_temp.assert(public.rpc_accept_offer(:'c_next') ->> 'ok' = 'true', 'N17: freed stock can be sold again');
select pg_temp.assert((select reserved = 6 from public.listing_stock_summary('10000000-0000-0000-0000-000000000003')),
  'N17: only the live order is reserved');

-- N18: direct INSERT into order_timeline -> permission error.
:as_buyer
select pg_temp.expect_error($$insert into public.order_timeline (order_id, step, label, completed_at) values ('$$ || :'c_stock' || $$', 'delivered', 'Teslim Edildi', now())$$,
  'permission denied for table order_timeline', 'N18: buyer direct INSERT into order_timeline -> permission error');
:as_farmer
select pg_temp.expect_error($$insert into public.order_timeline (order_id, step, label, completed_at) values ('$$ || :'c_stock' || $$', 'shipped', 'Kargoya Verildi', now())$$,
  'permission denied for table order_timeline', 'N18: farmer direct INSERT into order_timeline -> permission error');
select pg_temp.expect_error($$update public.order_timeline set label = 'x' where order_id = '$$ || :'c_stock' || $$'$$,
  'permission denied for table order_timeline', 'N18: UPDATE order_timeline -> permission error');
select pg_temp.expect_error($$delete from public.order_timeline where order_id = '$$ || :'c_stock' || $$'$$,
  'permission denied for table order_timeline', 'N18: DELETE order_timeline -> permission error');
:as_anon
select pg_temp.expect_error($$insert into public.order_timeline (order_id, step, label) values ('$$ || :'c_stock' || $$', 'x', 'x')$$,
  'permission denied for table order_timeline', 'N18: anon INSERT into order_timeline -> permission error');
-- N18, RLS layer: with the INSERT grant restored, no INSERT policy is left.
:as_super
begin;
grant insert on public.order_timeline to authenticated;
:as_buyer
select pg_temp.expect_error($$insert into public.order_timeline (order_id, step, label, completed_at) values ('$$ || :'c_stock' || $$', 'delivered', 'Teslim Edildi', now())$$,
  'new row violates row-level security policy', 'N18 (RLS layer): buyer INSERT has no policy ("Buyers insert order timeline" dropped)');
:as_farmer
select pg_temp.expect_error($$insert into public.order_timeline (order_id, step, label, completed_at) values ('$$ || :'c_stock' || $$', 'shipped', 'Kargoya Verildi', now())$$,
  'new row violates row-level security policy', 'N18 (RLS layer): farmer INSERT has no policy ("Farmers insert order timeline" dropped)');
:as_super
rollback;
select pg_temp.assert((select count(*) = 2 from public.order_timeline where order_id = :'c_stock'), 'N18: timeline unchanged (submitted, cancelled)');

-- =============================================================================================
-- N20: reviews without a delivered/completed order (existing policy keeps rejecting)
-- =============================================================================================
:as_buyer
select pg_temp.expect_error($$insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating)
  values ('$$ || :'s_order' || $$', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'buyer', 1)$$,
  'new row violates row-level security policy', 'N20: no review on a preparing order');
:as_stranger
select pg_temp.expect_error($$insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating)
  values ('$$ || :'p_order' || $$', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'buyer', 1)$$,
  'new row violates row-level security policy', 'N20: stranger cannot review someone else''s order');
:as_buyer
select pg_temp.expect_error($$insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating)
  values ('00000000-0000-0000-0000-00000000dead', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'buyer', 1)$$,
  'new row violates row-level security policy', 'N20: no review without an order');

-- reviews after B: INSERT on a delivered order still works; UPDATE/DELETE and anon writes are closed.
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'delivered') as r_order \gset
:as_buyer
insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating, comment)
values (:'r_order', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'buyer', 4, 'İyi');
select pg_temp.assert((select count(*) = 1 from public.reviews where order_id = :'r_order'), 'reviews: buyer reviews a delivered order');
select pg_temp.expect_error($$update public.reviews set rating = 1 where order_id = '$$ || :'r_order' || $$'$$,
  'permission denied for table reviews', 'reviews: authenticated UPDATE -> permission error');
select pg_temp.expect_error($$delete from public.reviews where order_id = '$$ || :'r_order' || $$'$$,
  'permission denied for table reviews', 'reviews: authenticated DELETE -> permission error');
:as_anon
select pg_temp.expect_error($$insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating)
  values ('$$ || :'r_order' || $$', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'buyer', 1)$$,
  'permission denied for table reviews', 'reviews: anon INSERT -> permission error');
select pg_temp.assert((select count(*) = 1 from public.reviews where order_id = :'r_order'), 'reviews: anon still reads (public SELECT policy kept)');

-- =============================================================================================
-- K5: counter withdrawal (N21, N22)
-- =============================================================================================
:as_buyer
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000004","quantity":8,"price_per_unit":10}]'::jsonb)).id as k_offer \gset
:as_farmer
select pg_temp.assert(public.rpc_withdraw_counter(:'k_offer') = jsonb_build_object('ok', false, 'reason', 'wrong_offer_status'),
  'K5: nothing to withdraw on a pending offer');
select pg_temp.counter(:'k_offer', 'farmer', 12, 8, now() - interval '2 minutes');
:as_buyer
select pg_temp.counter(:'k_offer', 'buyer', 11, 7, now() - interval '1 minute');

-- N21: the farmer tries to withdraw the buyer's (last) counter.
:as_farmer
select pg_temp.assert(public.rpc_withdraw_counter(:'k_offer') = jsonb_build_object('ok', false, 'reason', 'not_last_sender'),
  'N21: only the sender of the last message can withdraw');
:as_super
select pg_temp.assert((select count(*) = 2 from public.offer_messages where offer_id = :'k_offer'), 'N21: no message deleted');
select pg_temp.assert((select status = 'counter' and current_price = 11 and current_quantity = 7 and ball_side = 'farmer'
                              and jsonb_array_length(negotiation_history) = 2 from public.offers where id = :'k_offer'),
  'N21: offer unchanged');
:as_stranger
select pg_temp.expect_error($$select public.rpc_withdraw_counter('$$ || :'k_offer' || $$')$$,
  'WITHDRAW_COUNTER_FORBIDDEN', 'K5: stranger cannot withdraw');

-- The pre-ORD-1 web path (delete message, then status 'pending_buyer') is still blocked by the trigger.
:as_buyer
select pg_temp.expect_error($$update public.offers set status = 'pending_buyer', ball_side = 'buyer', current_price = 12, current_quantity = 8 where id = '$$ || :'k_offer' || $$'$$,
  'Fiyat/miktar yalnizca karsi teklif sirasinda', 'K5: the exception needs the RPC flag, a direct revert is still rejected');
select pg_temp.expect_error($$update public.offers set status = 'pending' where id = '$$ || :'k_offer' || $$'$$,
  'Gecersiz teklif durum gecisi: counter -> pending', 'K5: counter -> pending without the flag is still rejected');

-- N22: buyer withdraws own counter -> back to the farmer's counter, status counter, ball on buyer.
select pg_temp.assert(public.rpc_withdraw_counter(:'k_offer') ->> 'ok' = 'true', 'N22: buyer withdraws own last counter');
:as_super
select pg_temp.assert((select count(*) = 1 from public.offer_messages where offer_id = :'k_offer' and sender_role = 'farmer'),
  'N22: only the buyer message was deleted');
select pg_temp.assert((select status = 'counter' and current_price = 12 and current_quantity = 8 and ball_side = 'buyer'
                              and jsonb_array_length(negotiation_history) = 1 and negotiation_history->0->>'by' = 'farmer'
                       from public.offers where id = :'k_offer'),
  'N22: current_* = previous message, status counter, ball -> withdrawer, history popped');

-- The farmer withdraws the remaining counter -> back to initial_*, status pending, ball on farmer.
:as_farmer
select pg_temp.assert(public.rpc_withdraw_counter(:'k_offer') ->> 'ok' = 'true', 'N22: farmer withdraws the first counter');
:as_super
select pg_temp.assert((select count(*) = 0 from public.offer_messages where offer_id = :'k_offer'), 'N22: thread empty');
select pg_temp.assert((select status = 'pending' and current_price = initial_price_per_unit and current_quantity = initial_quantity
                              and initial_price_per_unit = 10 and initial_quantity = 8 and ball_side = 'farmer'
                              and jsonb_array_length(negotiation_history) = 0
                       from public.offers where id = :'k_offer'),
  'N22: no previous message -> initial_*, status pending, ball -> farmer');
:as_farmer
select pg_temp.assert(public.rpc_withdraw_counter(:'k_offer') = jsonb_build_object('ok', false, 'reason', 'wrong_offer_status'),
  'N22: nothing left to withdraw');
select pg_temp.assert(public.rpc_accept_offer(:'k_offer') ->> 'ok' = 'true', 'N22: after withdrawal the farmer holds the turn and can accept');
:as_super
select pg_temp.assert((select final_price_per_unit = 10 and final_quantity = 8 from public.offers where id = :'k_offer'),
  'N22: accepted at the original ask');

-- K5 fallback: initial_* null -> price_per_unit/quantity.
:as_buyer
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000004","quantity":3,"price_per_unit":10}]'::jsonb)).id as k2_offer \gset
:as_farmer
select pg_temp.counter(:'k2_offer', 'farmer', 15, 3, now());
:as_super
alter table public.offers disable trigger guard_offer_snapshot_columns;
update public.offers set initial_price_per_unit = null, initial_quantity = null where id = :'k2_offer';
alter table public.offers enable trigger guard_offer_snapshot_columns;
:as_farmer
select pg_temp.assert(public.rpc_withdraw_counter(:'k2_offer') ->> 'ok' = 'true', 'K5: withdraw with null initial_*');
:as_super
select pg_temp.assert((select status = 'pending' and current_price = price_per_unit and current_quantity = quantity
                       from public.offers where id = :'k2_offer'),
  'K5: initial_* null -> price_per_unit/quantity');

-- The flag is transaction-local and switched off again after the RPC.
select pg_temp.assert(coalesce(current_setting('hasat.offer_withdraw', true), 'off') in ('off', ''), 'K5: offer_withdraw flag off after the RPC');
select pg_temp.assert(coalesce(current_setting('hasat.order_transition', true), 'off') in ('off', ''), 'order_transition flag off after the RPCs');

-- =============================================================================================
-- N23: anon cannot call any RPC; unauthenticated (no sub) authenticated calls raise
-- =============================================================================================
:as_anon
select pg_temp.expect_error($$select public.rpc_accept_offer('$$ || :'k_offer' || $$')$$, 'permission denied for function rpc_accept_offer', 'N23: anon rpc_accept_offer');
select pg_temp.expect_error($$select public.rpc_mark_order_shipped('$$ || :'s2_order' || $$', 'a', 'b')$$, 'permission denied for function rpc_mark_order_shipped', 'N23: anon rpc_mark_order_shipped');
select pg_temp.expect_error($$select public.rpc_confirm_order_delivered('$$ || :'s2_order' || $$')$$, 'permission denied for function rpc_confirm_order_delivered', 'N23: anon rpc_confirm_order_delivered');
select pg_temp.expect_error($$select public.rpc_cancel_order('$$ || :'s2_order' || $$', 'x')$$, 'permission denied for function rpc_cancel_order', 'N23: anon rpc_cancel_order');
select pg_temp.expect_error($$select public.rpc_open_dispute('$$ || :'s2_order' || $$', 'x', '{}')$$, 'permission denied for function rpc_open_dispute', 'N23: anon rpc_open_dispute');
select pg_temp.expect_error($$select public.rpc_withdraw_counter('$$ || :'k_offer' || $$')$$, 'permission denied for function rpc_withdraw_counter', 'N23: anon rpc_withdraw_counter');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
set role authenticated;
select pg_temp.expect_error($$select public.rpc_accept_offer('$$ || :'k_offer' || $$')$$, 'ACCEPT_OFFER_UNAUTHENTICATED', 'no sub -> exception');
select pg_temp.expect_error($$select public.rpc_cancel_order('$$ || :'s2_order' || $$', 'x')$$, 'CANCEL_ORDER_UNAUTHENTICATED', 'no sub -> exception');

:as_super
\o
\echo '    01_assertions.sql: all assertions passed'
