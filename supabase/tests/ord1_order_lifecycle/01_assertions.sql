-- ORD-1 A — assertion suite for 20260925160000_ord1a_order_rpcs_and_guard.sql.
--
-- Negative matrix: claude/ORD-1-Spec-2026-09-25.md §5 (N1–N24) + the positive end-to-end flow.
-- Every negative case runs as the real API role (set role authenticated / anon / service_role) with
-- request.jwt.claims set the way PostgREST sets it, RLS on. Setup-only helpers (pg_temp.mk_order)
-- run as the superuser with claims set, so the RPCs still see the right auth.uid().
--
-- Aşama B'ye ait (bu suite'te SKIP, TODO olarak işaretli): N1, N6 (yetki kısmı), N18, N19.

\set ON_ERROR_STOP on
\o /dev/null

\set as_buyer   'reset role; select set_config(''request.jwt.claims'', ''{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_buyer2  'reset role; select set_config(''request.jwt.claims'', ''{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}'', false); set role authenticated;'
\set as_farmer  'reset role; select set_config(''request.jwt.claims'', ''{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_stranger 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_anon    'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false); set role anon;'
\set as_service 'reset role; select set_config(''request.jwt.claims'', ''{"role":"service_role"}'', false); set role service_role;'
\set as_super   'reset role; select set_config(''request.jwt.claims'', '''', false);'

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
  'ORDER_INVALID_TRANSITION: delivered -> completed', 'P: a party cannot complete a delivered order');

-- N24: service role delivered -> completed (ORD-2 cron simulation).
:as_service
update public.orders set status = 'completed' where id = :'p_order';
select pg_temp.assert((select status = 'completed' from public.orders where id = :'p_order'), 'N24: service role delivered -> completed');

:as_buyer
insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating, comment)
values (:'p_order', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'buyer', 5, 'Harika');
select pg_temp.assert((select count(*) = 1 from public.reviews where order_id = :'p_order'), 'P: buyer reviews the completed order');

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
-- Guard (direct client UPDATEs — still allowed by RLS in Aşama A; the trigger is the defence)
-- =============================================================================================
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'unpaid') as g_order \gset

-- N1 (B'de): buyer direct INSERT into orders with status='completed' -> permission error after B.
--   TODO(ORD-1 B): expect 'new row violates row-level security policy' / 'permission denied for table orders'.

-- N6 (guard half; permission half is B): identity columns.
:as_buyer
select pg_temp.expect_error($$update public.orders set farmer_id = 'c0000000-0000-0000-0000-000000000001' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: buyer cannot change farmer_id');
:as_farmer
select pg_temp.expect_error($$update public.orders set buyer_id = 'c0000000-0000-0000-0000-000000000002' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: farmer cannot change buyer_id');
select pg_temp.expect_error($$update public.orders set offer_id = '$$ || :'n5_offer' || $$' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: offer_id immutable');
select pg_temp.expect_error($$update public.orders set order_ref = 'HT-FAKE' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: order_ref immutable');
select pg_temp.expect_error($$update public.orders set created_at = now() - interval '1 year' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_IDENTITY_IMMUTABLE', 'N6: created_at immutable');
-- TODO(ORD-1 B): N6 permission half — after B the same UPDATEs fail with a permission error first.

-- N7 / N8: skipping states.
select pg_temp.expect_error($$update public.orders set status = 'delivered' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: preparing -> delivered', 'N7: farmer cannot jump preparing -> delivered');
:as_buyer
select pg_temp.expect_error($$update public.orders set status = 'completed' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: preparing -> completed', 'N8: buyer cannot jump preparing -> completed');
select pg_temp.expect_error($$update public.orders set status = 'disputed' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: preparing -> disputed', 'guard: preparing -> disputed rejected');

-- dispute_window_expires_at is server-only: the web's current direct write is rejected.
select pg_temp.expect_error($$update public.orders set dispute_window_expires_at = now() + interval '30 days' where id = '$$ || :'g_order' || $$'$$,
  'ORDER_DISPUTE_WINDOW_SERVER_ONLY', 'guard: client cannot set the dispute window');
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'shipped') as w_order \gset
:as_buyer
select pg_temp.expect_error($$update public.orders set status = 'delivered', dispute_window_expires_at = now() + interval '30 days' where id = '$$ || :'w_order' || $$'$$,
  'ORDER_DISPUTE_WINDOW_SERVER_ONLY', 'guard: client shipped -> delivered with its own window is rejected (web useConfirmDelivery path)');
:as_super
select pg_temp.assert((select status = 'shipped' and dispute_window_expires_at is null from public.orders where id = :'w_order'),
  'guard: rejected write left the order untouched');

-- Aşama A: flagless client status change along the matrix is still allowed (web writes directly today).
-- TODO(ORD-1 B): expect 'ORDER_STATUS_CLIENT_WRITE_BLOCKED' here.
:as_super
select pg_temp.mk_order('10000000-0000-0000-0000-000000000001', 1, 'unpaid') as a_order \gset
:as_buyer
update public.orders set status = 'cancelled', cancelled_at = now() where id = :'a_order';
select pg_temp.assert((select status = 'cancelled' from public.orders where id = :'a_order'),
  'Aşama A: flagless preparing -> cancelled still passes the matrix');
select pg_temp.expect_error($$update public.orders set status = 'preparing' where id = '$$ || :'a_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: cancelled -> preparing', 'guard: cancelled is terminal');

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
  'ORDER_DISPUTE_WINDOW_SERVER_ONLY', 'N12: the client cannot reopen the window itself');
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
  'ORDER_INVALID_TRANSITION: disputed -> completed', 'N14: buyer disputed -> completed rejected');
:as_farmer
select pg_temp.expect_error($$update public.orders set status = 'cancelled' where id = '$$ || :'d_order' || $$'$$,
  'ORDER_INVALID_TRANSITION: disputed -> cancelled', 'N14: farmer disputed -> cancelled rejected');
:as_service
update public.orders set status = 'cancelled' where id = :'d_order';
select pg_temp.assert((select status = 'cancelled' from public.orders where id = :'d_order'), 'service role resolves disputed -> cancelled');

-- N19 (B'de): party UPDATE disputes set status='resolved' -> permission error after B.
--   TODO(ORD-1 B): expect 'permission denied for table disputes' / zero rows.

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

-- N18 (B'de): direct INSERT into order_timeline -> permission error after B.
--   TODO(ORD-1 B): expect 'new row violates row-level security policy' / 'permission denied for table order_timeline'.

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
\echo '    Aşama B (skipped, TODO in this file): N1, N6 permission half, N18, N19'
