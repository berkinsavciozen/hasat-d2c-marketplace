-- ORD-GATE — assertion suite for 20260928140000_ord_gate_storefront_mode.sql (G1–G17).
--
-- Every case runs as the real API role (set role authenticated / anon / service_role) with
-- request.jwt.claims set the way PostgREST sets it, RLS on. Setup rows are written by the superuser with
-- empty claims (= direct SQL, i.e. the service path the gate exempts). Only G8's "SECURITY DEFINER path"
-- probe runs as the superuser with anon claims, to prove the gate itself (not RLS) rejects anon.
--
-- Accounts: NB c..01 / NF f..01 (normal), AB c..03 / AF f..03 (allowlist), X d..01 (third party), anon.

\set ON_ERROR_STOP on
\o /dev/null

\set as_nb      'reset role; select set_config(''request.jwt.claims'', ''{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_nf      'reset role; select set_config(''request.jwt.claims'', ''{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_ab      'reset role; select set_config(''request.jwt.claims'', ''{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}'', false); set role authenticated;'
\set as_af      'reset role; select set_config(''request.jwt.claims'', ''{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}'', false); set role authenticated;'
\set as_x       'reset role; select set_config(''request.jwt.claims'', ''{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}'', false); set role authenticated;'
\set as_anon    'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false); set role anon;'
\set as_service 'reset role; select set_config(''request.jwt.claims'', ''{"role":"service_role"}'', false); set role service_role;'
\set as_super   'reset role; select set_config(''request.jwt.claims'', '''', false);'
\set super_with_anon_claims 'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false);'

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

-- The gate's exact contract: P0001 / message ORDERS_DISABLED / hint orders_disabled.
create or replace function pg_temp.expect_gate(p_sql text, msg text)
returns void
language plpgsql
as $$
declare
  v_state text;
  v_msg text;
  v_hint text;
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (no error raised)', msg;
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  if v_msg like 'ASSERTION FAILED%' then raise; end if;
  if v_state <> 'P0001' or v_msg <> 'ORDERS_DISABLED' or v_hint is distinct from 'orders_disabled' then
    raise exception 'ASSERTION FAILED: % (got % "%" hint %)', msg, v_state, v_msg, v_hint;
  end if;
end;
$$;

create or replace function pg_temp.expect_ok(p_sql text, msg text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
exception when others then
  raise exception 'ASSERTION FAILED: % (got % "%")', msg, sqlstate, sqlerrm;
end;
$$;

create or replace function pg_temp.expect_sqlstate(p_sql text, p_state text, msg text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (no error raised)', msg;
exception when others then
  if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if sqlstate <> p_state then
    raise exception 'ASSERTION FAILED: % (expected %, got % "%")', msg, p_state, sqlstate, sqlerrm;
  end if;
end;
$$;

-- Any error other than the gate's (anon cases: session / grant / RLS errors are all acceptable).
create or replace function pg_temp.expect_any_error(p_sql text, msg text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (no error raised)', msg;
exception when others then
  if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
end;
$$;

-- Web useCounterOffer as the CURRENT role: offers update + offer_messages insert. Fails loudly if RLS
-- filtered the update away.
create or replace function pg_temp.counter(p_offer uuid, p_by text, p_price numeric, p_qty numeric)
returns void
language plpgsql
as $$
declare
  v_n int;
begin
  update public.offers
     set quantity = p_qty, price_per_unit = p_price, current_quantity = p_qty, current_price = p_price,
         ball_side = case when p_by = 'farmer' then 'buyer' else 'farmer' end,
         status = 'counter',
         negotiation_history = negotiation_history || jsonb_build_array(jsonb_build_object('by', p_by, 'quantity', quantity, 'pricePerUnit', price_per_unit))
   where id = p_offer;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'counter: offer % not updated (row_count %)', p_offer, v_n;
  end if;
  insert into public.offer_messages (offer_id, sender_role, sender_id, price, quantity)
  values (p_offer, p_by, auth.uid(), p_price, p_qty);
end;
$$;

create or replace function pg_temp.ok(p jsonb, msg text)
returns uuid
language plpgsql
as $$
begin
  if coalesce((p->>'ok')::boolean, false) is not true then
    raise exception 'ASSERTION FAILED: % (got %)', msg, p;
  end if;
  return coalesce(p->>'orderId', p->>'offerId')::uuid;
end;
$$;

-- =============================================================================================
-- 0. Migration shape (applied twice by run.sh)
-- =============================================================================================
\echo '  0  migration shape'
select pg_temp.assert(
  (select column_default = 'false' and is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_settings' and column_name = 'orders_enabled'),
  'platform_settings.orders_enabled boolean not null default false');
select pg_temp.assert((select orders_enabled = false from public.platform_settings where id = 1),
  'existing platform_settings row: orders_enabled = false');
select pg_temp.assert((select count(*) = 0 from public.orders_allowlist), 'migration inserts no allowlist rows');
select pg_temp.assert((select relrowsecurity from pg_class where oid = 'public.orders_allowlist'::regclass), 'orders_allowlist RLS on');
select pg_temp.assert((select relrowsecurity from pg_class where oid = 'public.order_intent_events'::regclass), 'order_intent_events RLS on');
select pg_temp.assert(not exists (select 1 from pg_policies where schemaname = 'public'
  and tablename in ('orders_allowlist', 'order_intent_events')), 'no policies on the two new tables');
select pg_temp.assert((select reloptions @> array['security_invoker=true'] from pg_class
  where oid = 'public.v_kpi_order_intent_blocked'::regclass), 'v_kpi_order_intent_blocked security_invoker');

-- Each gate trigger exists exactly once and is the FIRST row-level BEFORE trigger for its event.
select pg_temp.assert((select count(*) = 1 from pg_trigger where tgrelid = 'public.offers'::regclass and tgname = 'a0_orders_gate_offers_ins'), 'a0_orders_gate_offers_ins once');
select pg_temp.assert((select count(*) = 1 from pg_trigger where tgrelid = 'public.offers'::regclass and tgname = 'a0_orders_gate_offers_upd'), 'a0_orders_gate_offers_upd once');
select pg_temp.assert((select count(*) = 1 from pg_trigger where tgrelid = 'public.offer_messages'::regclass and tgname = 'a0_orders_gate_offer_messages_ins'), 'a0_orders_gate_offer_messages_ins once');
select pg_temp.assert((select count(*) = 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'a0_orders_gate_orders_ins'), 'a0_orders_gate_orders_ins once');
select pg_temp.assert((select count(*) = 1 from pg_trigger where tgrelid = 'public.harvest_subscriptions'::regclass and tgname = 'a0_orders_gate_subscriptions'), 'a0_orders_gate_subscriptions once');

create or replace function pg_temp.first_before(p_rel regclass, p_event_bit int)
returns name
language sql
as $$
  select min(tgname) from pg_trigger
  where tgrelid = p_rel and not tgisinternal and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & p_event_bit <> 0
$$;
select pg_temp.assert(pg_temp.first_before('public.offers', 4) = 'a0_orders_gate_offers_ins', 'offers: gate is first BEFORE INSERT trigger');
select pg_temp.assert(pg_temp.first_before('public.offers', 16) = 'a0_orders_gate_offers_upd', 'offers: gate is first BEFORE UPDATE trigger');
select pg_temp.assert(pg_temp.first_before('public.offer_messages', 4) = 'a0_orders_gate_offer_messages_ins', 'offer_messages: gate is first BEFORE INSERT trigger');
select pg_temp.assert(pg_temp.first_before('public.orders', 4) = 'a0_orders_gate_orders_ins', 'orders: gate is first BEFORE INSERT trigger');
select pg_temp.assert(pg_temp.first_before('public.harvest_subscriptions', 4) = 'a0_orders_gate_subscriptions', 'harvest_subscriptions: gate is first BEFORE INSERT trigger');
select pg_temp.assert(pg_temp.first_before('public.harvest_subscriptions', 16) = 'a0_orders_gate_subscriptions', 'harvest_subscriptions: gate is first BEFORE UPDATE trigger');

-- Gate functions: SECURITY DEFINER + search_path=''.
select pg_temp.assert((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('fn_orders_is_service', 'fn_orders_open_for', 'fn_assert_orders_open',
                     'fn_orders_gate_offers_ins', 'fn_orders_gate_offers_upd', 'fn_orders_gate_offer_messages_ins',
                     'fn_orders_gate_orders_ins', 'fn_orders_gate_subscriptions',
                     'rpc_get_order_gate', 'rpc_log_order_intent_blocked')
  having count(*) = 10), 'all 10 new functions SECURITY DEFINER with search_path=''''');

-- =============================================================================================
-- Setup (superuser, empty claims = service path)
-- =============================================================================================
:as_super
insert into public.orders_allowlist (user_id, note) values
  ('c0000000-0000-0000-0000-000000000003', 'AB test buyer'),
  ('f0000000-0000-0000-0000-000000000003', 'AF test farmer');

insert into public.listings (id, farmer_id, crop, quantity, price_per_unit, status) values
  ('20000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates', 1000, 10, 'active'),
  ('20000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003', 'Biber',   1000, 10, 'active');
insert into public.listings (id, farmer_id, crop, quantity, price_per_unit, status)
select ('21000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'f0000000-0000-0000-0000-000000000001', 'Elma', 100, 10, 'active'
from generate_series(1, 21) n;

insert into public.harvest_subscriptions (id, buyer_id, farmer_id, crop) values
  ('40000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates'),
  ('40000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates'),
  ('40000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates');

-- Pre-existing NB<->NF offers, created on the service path while the gate is closed.
insert into public.offers (id, buyer_id, farmer_id, listing_id, quantity, price_per_unit, current_quantity, current_price,
                           status, ball_side, source_recipe_id, subscription_id) values
  ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 5, 10, 5, 10, 'pending', 'farmer', null, null),
  ('30000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 5, 10, 5, 10, 'pending', 'farmer', null, null),
  ('30000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 5, 10, 5, 9, 'counter', 'farmer', null, null),
  ('30000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 5, 10, 5, 10, 'pending', 'farmer',
   'e0000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003');
insert into public.offer_items (offer_id, listing_id, quantity, price_per_unit)
select id, listing_id, quantity, price_per_unit from public.offers where id::text like '30000000-%';
-- P3 is in 'counter' because NB countered (last message is NB's).
insert into public.offer_messages (offer_id, sender_role, sender_id, price, quantity) values
  ('30000000-0000-0000-0000-000000000003', 'buyer', 'c0000000-0000-0000-0000-000000000001', 9, 5);

select count(*) as offers_0, (select count(*) from public.offer_items) as items_0,
       (select count(*) from public.orders) as orders_0 from public.offers \gset

-- =============================================================================================
-- G1  NB -> rpc_create_offer(NF listing) -> ORDERS_DISABLED; offers / offer_items unchanged.
-- =============================================================================================
\echo '  G1  NB rpc_create_offer'
:as_nb
select pg_temp.expect_gate($$select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"20000000-0000-0000-0000-000000000001","quantity":5,"price_per_unit":10}]'::jsonb)$$,
  'G1 NB rpc_create_offer -> ORDERS_DISABLED');
:as_super
select pg_temp.assert((select count(*) from public.offers) = :offers_0
  and (select count(*) from public.offer_items) = :items_0, 'G1 offers / offer_items unchanged');

-- =============================================================================================
-- G2  NB -> offers direct insert (MCP create-offer path) -> ORDERS_DISABLED.
-- =============================================================================================
\echo '  G2  NB direct offers insert'
:as_nb
select pg_temp.expect_gate($$insert into public.offers (buyer_id, farmer_id, listing_id, quantity, price_per_unit, current_quantity, current_price, ball_side, payment_status, status)
  values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 5, 10, 5, 10, 'farmer', 'unpaid', 'pending')$$,
  'G2 NB direct offers insert -> ORDERS_DISABLED');
:as_super
select pg_temp.assert((select count(*) from public.offers) = :offers_0, 'G2 offers unchanged');

-- =============================================================================================
-- G3  AB (allowlisted) -> NF (not allowlisted) -> ORDERS_DISABLED: BOTH parties must be allowlisted.
-- =============================================================================================
\echo '  G3  AB -> NF (one-sided allowlist)'
:as_ab
select pg_temp.expect_gate($$select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"20000000-0000-0000-0000-000000000001","quantity":5,"price_per_unit":10}]'::jsonb)$$,
  'G3 AB rpc_create_offer on NF listing -> ORDERS_DISABLED');
select pg_temp.expect_gate($$insert into public.offers (buyer_id, farmer_id, listing_id, quantity, price_per_unit)
  values ('c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 5, 10)$$,
  'G3 AB direct insert on NF listing -> ORDERS_DISABLED');
:as_super
select pg_temp.assert((select count(*) from public.offers) = :offers_0, 'G3 offers unchanged');

-- =============================================================================================
-- G4  AB <-> AF: offer -> counter (offers.update + offer_messages) -> rpc_accept_offer (1 order) ->
--     buyer_mark_transfer_sent -> farmer_confirm_payment_received -> ship -> deliver -> review: ALL pass.
-- =============================================================================================
\echo '  G4  AB <-> AF full ORD-1 flow'
:as_ab
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000003',
  '[{"listing_id":"20000000-0000-0000-0000-000000000002","quantity":5,"price_per_unit":10}]'::jsonb)).id as g4_offer \gset
:as_af
select pg_temp.counter(:'g4_offer', 'farmer', 12, 5);
:as_ab
select pg_temp.ok(public.rpc_accept_offer(:'g4_offer'), 'G4 AB rpc_accept_offer') as g4_order \gset
select pg_temp.ok(public.buyer_mark_transfer_sent(:'g4_offer'), 'G4 AB buyer_mark_transfer_sent');
:as_af
select pg_temp.ok(public.farmer_confirm_payment_received(:'g4_offer'), 'G4 AF farmer_confirm_payment_received');
select pg_temp.ok(public.rpc_mark_order_shipped(:'g4_order', 'TRK-G4', 'Yurtiçi'), 'G4 AF rpc_mark_order_shipped');
:as_ab
select pg_temp.ok(public.rpc_confirm_order_delivered(:'g4_order'), 'G4 AB rpc_confirm_order_delivered');
insert into public.reviews (order_id, reviewer_id, reviewee_id, reviewer_role, rating)
values (:'g4_order', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'buyer', 5);
:as_super
select pg_temp.assert((select count(*) = 1 from public.orders where offer_id = :'g4_offer'), 'G4 exactly one order');
select pg_temp.assert((select o.status = 'delivered' and f.payment_status = 'paid' and f.status = 'accepted'
  and f.final_price_per_unit = 12
  from public.orders o join public.offers f on f.id = o.offer_id where o.id = :'g4_order'), 'G4 order delivered, offer paid at the countered price');
select pg_temp.assert((select count(*) = 1 from public.offer_messages where offer_id = :'g4_offer'), 'G4 counter message stored');
select pg_temp.assert((select count(*) = 1 from public.reviews where order_id = :'g4_order'), 'G4 review stored');

-- =============================================================================================
-- G5  Pre-existing NB<->NF pending offer while closed: counter / accept (RPC + direct) blocked;
--     rejection passes.
-- =============================================================================================
\echo '  G5  pre-existing NB <-> NF offer'
:as_nf
select pg_temp.expect_gate($$select pg_temp.counter('30000000-0000-0000-0000-000000000001', 'farmer', 12, 5)$$,
  'G5 NF counter -> ORDERS_DISABLED');
select pg_temp.expect_gate($$select public.rpc_accept_offer('30000000-0000-0000-0000-000000000001')$$,
  'G5 NF rpc_accept_offer -> ORDERS_DISABLED');
select pg_temp.expect_gate($$update public.offers set status = 'accepted', ball_side = 'buyer' where id = '30000000-0000-0000-0000-000000000001'$$,
  'G5 NF direct update status=accepted -> ORDERS_DISABLED');
:as_super
select pg_temp.assert((select status = 'pending' and current_price = 10 from public.offers where id = '30000000-0000-0000-0000-000000000001'),
  'G5 offer untouched after blocked writes');
select pg_temp.assert(not exists (select 1 from public.orders where offer_id = '30000000-0000-0000-0000-000000000001'), 'G5 no order');
select pg_temp.assert(not exists (select 1 from public.offer_messages where offer_id = '30000000-0000-0000-0000-000000000001'), 'G5 no message');
:as_nf
select pg_temp.expect_ok($$update public.offers set status = 'rejected', note = 'stok yok' where id = '30000000-0000-0000-0000-000000000001'$$,
  'G5 NF reject passes');
:as_super
select pg_temp.assert((select status = 'rejected' from public.offers where id = '30000000-0000-0000-0000-000000000001'), 'G5 offer rejected');

-- =============================================================================================
-- G6  NB offer_messages insert -> ORDERS_DISABLED.
-- =============================================================================================
\echo '  G6  NB offer_messages insert'
:as_nb
select pg_temp.expect_gate($$insert into public.offer_messages (offer_id, sender_role, sender_id, price, quantity)
  values ('30000000-0000-0000-0000-000000000002', 'buyer', 'c0000000-0000-0000-0000-000000000001', 9, 5)$$,
  'G6 NB offer_messages insert -> ORDERS_DISABLED');

-- =============================================================================================
-- G7  harvest_subscriptions: NB insert blocked; AB<->AF passes; cancel passes; NF -> active blocked.
-- =============================================================================================
\echo '  G7  harvest_subscriptions'
:as_nb
select pg_temp.expect_gate($$insert into public.harvest_subscriptions (buyer_id, farmer_id, crop)
  values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates')$$,
  'G7 NB subscription insert -> ORDERS_DISABLED');
:as_ab
select pg_temp.expect_ok($$insert into public.harvest_subscriptions (id, buyer_id, farmer_id, crop)
  values ('40000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'Biber')$$,
  'G7 AB<->AF subscription insert passes');
:as_af
select pg_temp.expect_ok($$update public.harvest_subscriptions set status = 'active' where id = '40000000-0000-0000-0000-000000000009'$$,
  'G7 AF activates AB subscription');
:as_nf
select pg_temp.expect_gate($$update public.harvest_subscriptions set status = 'active' where id = '40000000-0000-0000-0000-000000000001'$$,
  'G7 NF pending -> active -> ORDERS_DISABLED');
select pg_temp.expect_ok($$update public.harvest_subscriptions set next_harvest_date = date '2026-10-15', estimated_qty = 50 where id = '40000000-0000-0000-0000-000000000002'$$,
  'G7 NF non-status update passes');
select pg_temp.expect_ok($$update public.harvest_subscriptions set status = 'cancelled' where id = '40000000-0000-0000-0000-000000000002'$$,
  'G7 NF cancel passes');
:as_nb
select pg_temp.expect_ok($$update public.harvest_subscriptions set status = 'cancelled' where id = '40000000-0000-0000-0000-000000000001'$$,
  'G7 NB cancel passes');
:as_super
select pg_temp.assert((select status from public.harvest_subscriptions where id = '40000000-0000-0000-0000-000000000001') = 'cancelled', 'G7 S1 cancelled');
select pg_temp.assert((select status from public.harvest_subscriptions where id = '40000000-0000-0000-0000-000000000002') = 'cancelled', 'G7 S2 cancelled');
select pg_temp.assert((select status from public.harvest_subscriptions where id = '40000000-0000-0000-0000-000000000009') = 'active', 'G7 AB<->AF active');
select pg_temp.assert((select count(*) = 4 from public.harvest_subscriptions), 'G7 NB insert wrote nothing');

-- =============================================================================================
-- G8  anon: rpc_create_offer / rpc_accept_offer / direct insert rejected, nothing written. And the gate
--     itself treats anon claims as NOT service (probe via a SECURITY DEFINER-like path: superuser with
--     anon claims, RLS and grants bypassed, so only the gate stands in the way).
-- =============================================================================================
\echo '  G8  anon'
:as_anon
select pg_temp.expect_any_error($$select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"20000000-0000-0000-0000-000000000001","quantity":5,"price_per_unit":10}]'::jsonb)$$,
  'G8 anon rpc_create_offer rejected');
select pg_temp.expect_sqlstate($$select public.rpc_accept_offer('30000000-0000-0000-0000-000000000002')$$, '42501',
  'G8 anon rpc_accept_offer -> 42501');
select pg_temp.expect_any_error($$insert into public.offers (buyer_id, farmer_id, listing_id, quantity, price_per_unit)
  values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 5, 10)$$,
  'G8 anon direct insert rejected');
:super_with_anon_claims
select pg_temp.assert(public.fn_orders_is_service() = false, 'G8 fn_orders_is_service() is false for anon claims');
select pg_temp.expect_gate($$insert into public.offers (buyer_id, farmer_id, listing_id, quantity, price_per_unit)
  values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 5, 10)$$,
  'G8 anon claims on an RLS-bypassing path -> ORDERS_DISABLED');
select pg_temp.expect_gate($$select public.fn_assert_orders_open(null, null)$$, 'G8 fn_assert_orders_open(null,null) under anon claims');
:as_super
select pg_temp.assert((select count(*) from public.offers) = :offers_0 + 1, 'G8 no offer written (only G4''s)');
select pg_temp.assert(not exists (select 1 from public.orders where offer_id = '30000000-0000-0000-0000-000000000002'), 'G8 no order');

-- =============================================================================================
-- G9  service role (auth.uid() null, role service_role) and direct SQL: offers insert passes.
-- =============================================================================================
\echo '  G9  service role'
:as_service
select pg_temp.assert(public.fn_orders_is_service(), 'G9 fn_orders_is_service() true for service_role claims');
select pg_temp.expect_ok($$insert into public.offers (id, buyer_id, farmer_id, listing_id, quantity, price_per_unit)
  values ('30000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 5, 10)$$,
  'G9 service_role offers insert passes');
:as_super
select pg_temp.assert(public.fn_orders_is_service(), 'G9 fn_orders_is_service() true for direct SQL (no claims)');
select pg_temp.assert(exists (select 1 from public.offers where id = '30000000-0000-0000-0000-000000000009'), 'G9 offer written');

-- =============================================================================================
-- G10 rpc_withdraw_counter passes for AB<->AF and for the pre-existing NB<->NF counter.
-- =============================================================================================
\echo '  G10 rpc_withdraw_counter'
:as_ab
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000003',
  '[{"listing_id":"20000000-0000-0000-0000-000000000002","quantity":3,"price_per_unit":10}]'::jsonb)).id as g10_offer \gset
:as_af
select pg_temp.counter(:'g10_offer', 'farmer', 11, 3);
select pg_temp.ok(public.rpc_withdraw_counter(:'g10_offer'), 'G10 AF withdraws counter (AB<->AF)');
:as_nb
select pg_temp.ok(public.rpc_withdraw_counter('30000000-0000-0000-0000-000000000003'), 'G10 NB withdraws counter (NB<->NF, gate closed)');
:as_super
select pg_temp.assert((select status = 'pending' and current_price = 10 from public.offers where id = :'g10_offer'), 'G10 AB<->AF back to pending');
select pg_temp.assert((select status = 'pending' and current_price = 10 and ball_side = 'buyer'
  from public.offers where id = '30000000-0000-0000-0000-000000000003'), 'G10 NB<->NF back to pending, ball to NB');
select pg_temp.assert(not exists (select 1 from public.offer_messages where offer_id = '30000000-0000-0000-0000-000000000003'), 'G10 NB message deleted');

-- =============================================================================================
-- G11 Talep Et: NB crop_requests + recipe_rfq_links insert pass (gate never touches them).
-- =============================================================================================
\echo '  G11 Talep Et'
:as_nb
insert into public.crop_requests (id, requested_by, crop_name_free_text, note)
values ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Safran', 'tarif için');
insert into public.recipe_rfq_links (recipe_id, crop_request_id)
values ('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
:as_super
select pg_temp.assert((select count(*) = 1 from public.recipe_rfq_links where crop_request_id = '50000000-0000-0000-0000-000000000001'), 'G11 Talep Et rows written');

-- =============================================================================================
-- G12 rpc_get_order_gate.
-- =============================================================================================
\echo '  G12 rpc_get_order_gate'
create or replace function pg_temp.gate_is(p jsonb, p_enabled boolean, p_allowed boolean, msg text)
returns void
language plpgsql
as $$
begin
  if (select array_agg(k order by k) from jsonb_object_keys(p) k) <> array['callerAllowed', 'ordersEnabled']
     or jsonb_typeof(p->'ordersEnabled') <> 'boolean' or jsonb_typeof(p->'callerAllowed') <> 'boolean'
     or (p->>'ordersEnabled')::boolean <> p_enabled or (p->>'callerAllowed')::boolean <> p_allowed then
    raise exception 'ASSERTION FAILED: % (got %)', msg, p;
  end if;
end;
$$;
:as_anon
select pg_temp.gate_is(public.rpc_get_order_gate(), false, false, 'G12 anon {false,false}');
:as_nb
select pg_temp.gate_is(public.rpc_get_order_gate(), false, false, 'G12 NB {false,false}');
:as_ab
select pg_temp.gate_is(public.rpc_get_order_gate(), false, true, 'G12 AB {false,true}');
:as_super
update public.platform_settings set orders_enabled = true where id = 1;
:as_nb
select pg_temp.gate_is(public.rpc_get_order_gate(), true, true, 'G12 NB {true,true} when enabled');
:as_anon
select pg_temp.gate_is(public.rpc_get_order_gate(), true, true, 'G12 anon {true,true} when enabled');
:as_super
update public.platform_settings set orders_enabled = false where id = 1;

-- =============================================================================================
-- G13 rpc_log_order_intent_blocked.
-- =============================================================================================
\echo '  G13 rpc_log_order_intent_blocked'
create or replace function pg_temp.logged_is(p jsonb, p_logged boolean, msg text)
returns void
language plpgsql
as $$
begin
  if p is distinct from jsonb_build_object('ok', true, 'logged', p_logged) then
    raise exception 'ASSERTION FAILED: % (got %)', msg, p;
  end if;
end;
$$;
create or replace function pg_temp.invalid(p jsonb, msg text)
returns void
language plpgsql
as $$
begin
  if p is distinct from '{"ok":false,"reason":"invalid_input"}'::jsonb then
    raise exception 'ASSERTION FAILED: % (got %)', msg, p;
  end if;
end;
$$;

:as_nb
-- valid call; crop comes from the listing, p_crop ignored; user_id = auth.uid().
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('discover', 'web', '20000000-0000-0000-0000-000000000001', null, 'Başka'), true, 'G13 valid call logged');
:as_super
select pg_temp.assert((select user_id = 'c0000000-0000-0000-0000-000000000001' and crop = 'Domates' and listing_id = '20000000-0000-0000-0000-000000000001'
  and surface = 'discover' and platform = 'web' and recipe_id is null
  from public.order_intent_events order by id desc limit 1), 'G13 row: user_id = auth.uid(), crop from listing');
select count(*) as ev_0 from public.order_intent_events \gset

:as_nb
select pg_temp.invalid(public.rpc_log_order_intent_blocked('checkout', 'web'), 'G13 invalid surface');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('discover', 'windows'), 'G13 invalid platform');
select pg_temp.invalid(public.rpc_log_order_intent_blocked(null, 'web'), 'G13 null surface');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('discover', null), 'G13 null platform');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('discover', 'web', '2fffffff-0000-0000-0000-000000000000'), 'G13 unknown listing');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('mcp', 'web', null, null, 'x<script>'), 'G13 crop with markup');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('mcp', 'web', null, null, '12kg'), 'G13 crop with digits');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('mcp', 'web', null, null, ''), 'G13 empty crop');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('mcp', 'web', null, null, '   '), 'G13 blank crop');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('mcp', 'web', null, null, repeat('a', 41)), 'G13 41-char crop');
select pg_temp.invalid(public.rpc_log_order_intent_blocked('mcp', 'web', null, null, 'tel: 0555'), 'G13 crop with phone-like text');
:as_super
select pg_temp.assert((select count(*) from public.order_intent_events) = :ev_0, 'G13 invalid inputs wrote nothing');

:as_nb
-- dedupe: same user + surface + listing within 10 minutes.
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('discover', 'web', '20000000-0000-0000-0000-000000000001'), false, 'G13 same user/surface/listing -> logged:false');
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('storefront', 'ios', '20000000-0000-0000-0000-000000000001'), true, 'G13 other surface logged');
-- Turkish crops, trimmed.
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('producer', 'android', null, null, '  şeker_pancarı '), true, 'G13 crop şeker_pancarı');
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('recipe_product', 'web', null, null, 'tıbbi bitkiler'), true, 'G13 crop tıbbi bitkiler');
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('subscription', 'web', null, null, 'ÇİĞDEM-Üzüm'), true, 'G13 crop uppercase Turkish + hyphen');
-- recipes: private -> null, public -> kept.
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('offer_route', 'web', null, 'e0000000-0000-0000-0000-000000000002'), true, 'G13 private recipe call logged');
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('mcp', 'web', null, 'e0000000-0000-0000-0000-000000000001'), true, 'G13 public recipe call logged');
:as_super
select pg_temp.assert((select array_agg(crop order by id) from public.order_intent_events
  where user_id = 'c0000000-0000-0000-0000-000000000001' and surface in ('producer', 'recipe_product', 'subscription'))
  = array['şeker_pancarı', 'tıbbi bitkiler', 'ÇİĞDEM-Üzüm'], 'G13 Turkish crops stored trimmed');
select pg_temp.assert((select recipe_id is null from public.order_intent_events
  where user_id = 'c0000000-0000-0000-0000-000000000001' and surface = 'offer_route'), 'G13 private recipe id stored as null');
select pg_temp.assert((select recipe_id = 'e0000000-0000-0000-0000-000000000001' from public.order_intent_events
  where user_id = 'c0000000-0000-0000-0000-000000000001' and surface = 'mcp'), 'G13 public recipe id stored');

-- per-user cap: 20 in 10 minutes, the 21st is dropped.
:as_x
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('discover', 'web',
  ('21000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid), true, 'G13 X call ' || n)
from generate_series(1, 20) n;
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('discover', 'web', '21000000-0000-0000-0000-000000000021'), false, 'G13 21st call -> logged:false');
:as_super
select pg_temp.assert((select count(*) = 20 from public.order_intent_events where user_id = 'd0000000-0000-0000-0000-000000000001'), 'G13 X has exactly 20 rows');

-- anon: user_id null; global anon cap 500 per 10 minutes.
:as_anon
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('recipe_product', 'web', '20000000-0000-0000-0000-000000000002'), true, 'G13 anon call logged');
:as_super
select pg_temp.assert((select user_id is null and crop = 'Biber' from public.order_intent_events order by id desc limit 1), 'G13 anon row has user_id null');
insert into public.order_intent_events (surface, platform) select 'discover', 'web' from generate_series(1, 499);
:as_anon
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('storefront', 'web'), false, 'G13 anon 501st call -> logged:false');
:as_super
select pg_temp.assert((select count(*) = 500 from public.order_intent_events where user_id is null), 'G13 anon rows capped at 500');
-- older anon rows fall out of the window.
update public.order_intent_events set created_at = now() - interval '11 minutes' where user_id is null;
:as_anon
select pg_temp.logged_is(public.rpc_log_order_intent_blocked('storefront', 'web'), true, 'G13 anon logs again after the window');

-- =============================================================================================
-- G14 privileges: order_intent_events / orders_allowlist / v_kpi_order_intent_blocked closed to anon and
--     authenticated; gate functions not executable by them.
-- =============================================================================================
\echo '  G14 privileges'
create or replace function pg_temp.closed(p_rel text, msg text)
returns void
language plpgsql
as $$
begin
  perform pg_temp.expect_sqlstate(format('select * from %s', p_rel), '42501', msg || ' select');
  if p_rel <> 'public.v_kpi_order_intent_blocked' then
    perform pg_temp.expect_sqlstate(format('insert into %s default values', p_rel), '42501', msg || ' insert');
    perform pg_temp.expect_sqlstate(format('update %s set created_at = now()', p_rel), '42501', msg || ' update');
    perform pg_temp.expect_sqlstate(format('delete from %s', p_rel), '42501', msg || ' delete');
  end if;
end;
$$;
-- orders_allowlist has no created_at; its own column list for the write probes.
create or replace function pg_temp.closed_allowlist(msg text)
returns void
language plpgsql
as $$
begin
  perform pg_temp.expect_sqlstate('select * from public.orders_allowlist', '42501', msg || ' select');
  perform pg_temp.expect_sqlstate($q$insert into public.orders_allowlist (user_id) values ('c0000000-0000-0000-0000-000000000001')$q$, '42501', msg || ' insert');
  perform pg_temp.expect_sqlstate('update public.orders_allowlist set note = null', '42501', msg || ' update');
  perform pg_temp.expect_sqlstate('delete from public.orders_allowlist', '42501', msg || ' delete');
end;
$$;
:as_anon
select pg_temp.closed('public.order_intent_events', 'G14 anon order_intent_events');
select pg_temp.closed_allowlist('G14 anon orders_allowlist');
select pg_temp.closed('public.v_kpi_order_intent_blocked', 'G14 anon v_kpi_order_intent_blocked');
select pg_temp.expect_sqlstate($$select public.fn_orders_open_for(null, null)$$, '42501', 'G14 anon fn_orders_open_for');
select pg_temp.expect_sqlstate($$select public.fn_assert_orders_open(null, null)$$, '42501', 'G14 anon fn_assert_orders_open');
select pg_temp.expect_sqlstate($$select public.fn_orders_is_service()$$, '42501', 'G14 anon fn_orders_is_service');
:as_nb
select pg_temp.closed('public.order_intent_events', 'G14 authenticated order_intent_events');
select pg_temp.closed_allowlist('G14 authenticated orders_allowlist');
select pg_temp.closed('public.v_kpi_order_intent_blocked', 'G14 authenticated v_kpi_order_intent_blocked');
select pg_temp.expect_sqlstate($$select public.fn_orders_open_for('c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003')$$, '42501', 'G14 authenticated fn_orders_open_for (allowlist oracle)');
select pg_temp.expect_sqlstate($$select public.fn_assert_orders_open(null, null)$$, '42501', 'G14 authenticated fn_assert_orders_open');
:as_service
select pg_temp.expect_ok($$select * from public.v_kpi_order_intent_blocked$$, 'G14 service_role reads the KPI view');
select pg_temp.expect_ok($$select * from public.orders_allowlist$$, 'G14 service_role reads the allowlist');
:as_super
select pg_temp.assert(not has_table_privilege(r, t, p), format('G14 %s has no %s on %s', r, p, t))
from unnest(array['anon', 'authenticated']) r,
     unnest(array['public.order_intent_events', 'public.orders_allowlist', 'public.v_kpi_order_intent_blocked']) t,
     unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p;
select pg_temp.assert(not has_sequence_privilege(r, pg_get_serial_sequence('public.order_intent_events', 'id'), p),
  format('G14 %s has no %s on the order_intent_events sequence', r, p))
from unnest(array['anon', 'authenticated']) r, unnest(array['usage', 'select', 'update']) p;
select pg_temp.assert(has_table_privilege('service_role', 'public.v_kpi_order_intent_blocked', 'select'), 'G14 service_role select on view');
select pg_temp.assert(not has_function_privilege(r, f, 'execute'), format('G14 %s cannot execute %s', r, f))
from unnest(array['anon', 'authenticated']) r,
     unnest(array['public.fn_orders_is_service()', 'public.fn_orders_open_for(uuid,uuid)', 'public.fn_assert_orders_open(uuid,uuid)',
                  'public.fn_orders_gate_offers_ins()', 'public.fn_orders_gate_offers_upd()', 'public.fn_orders_gate_offer_messages_ins()',
                  'public.fn_orders_gate_orders_ins()', 'public.fn_orders_gate_subscriptions()']) f;
select pg_temp.assert(has_function_privilege('service_role', f, 'execute'), format('G14 service_role can execute %s', f))
from unnest(array['public.fn_orders_is_service()', 'public.fn_orders_open_for(uuid,uuid)', 'public.fn_assert_orders_open(uuid,uuid)',
                  'public.rpc_get_order_gate()', 'public.rpc_log_order_intent_blocked(text,text,uuid,uuid,text)']) f;
select pg_temp.assert(has_function_privilege(r, f, 'execute'), format('G14 %s can execute %s', r, f))
from unnest(array['anon', 'authenticated']) r,
     unnest(array['public.rpc_get_order_gate()', 'public.rpc_log_order_intent_blocked(text,text,uuid,uuid,text)']) f;
select pg_temp.assert(not exists (
  select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'public'::regnamespace and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    and p.proname in ('fn_orders_is_service', 'fn_orders_open_for', 'fn_assert_orders_open', 'fn_orders_gate_offers_ins',
                      'fn_orders_gate_offers_upd', 'fn_orders_gate_offer_messages_ins', 'fn_orders_gate_orders_ins',
                      'fn_orders_gate_subscriptions', 'rpc_get_order_gate', 'rpc_log_order_intent_blocked')),
  'G14 PUBLIC has execute on none of the new functions');

-- =============================================================================================
-- G17 (extra) ON DELETE SET NULL on offers is not blocked: a recipe owner who is not a party deletes the
--     source recipe, and NB deletes their subscription. A real NB edit on the same offer stays blocked.
-- =============================================================================================
\echo '  G17 FK detach (recipe / subscription delete)'
:as_x
select pg_temp.expect_ok($$delete from public.recipes where id = 'e0000000-0000-0000-0000-000000000003'$$, 'G17 X deletes own source recipe');
:as_nb
select pg_temp.expect_ok($$delete from public.harvest_subscriptions where id = '40000000-0000-0000-0000-000000000003'$$, 'G17 NB deletes own subscription');
select pg_temp.expect_gate($$update public.offers set note = 'değişiklik' where id = '30000000-0000-0000-0000-000000000004'$$,
  'G17 NB note edit on the same offer -> ORDERS_DISABLED');
select pg_temp.expect_gate($$update public.offers set note = 'x', subscription_id = null where id = '30000000-0000-0000-0000-000000000002'$$,
  'G17 FK-null plus another column change -> ORDERS_DISABLED');
:as_super
select pg_temp.assert((select source_recipe_id is null and subscription_id is null and note is null and status = 'pending'
  from public.offers where id = '30000000-0000-0000-0000-000000000004'), 'G17 FKs detached, offer otherwise untouched');

-- =============================================================================================
-- G15 orders_enabled = true, allowlist EMPTY: NB<->NF full flow (offer -> counter -> accept -> payment)
--     passes with ORD-1 behaviour.
-- =============================================================================================
\echo '  G15 orders_enabled = true, NB <-> NF'
:as_super
create temp table allowlist_backup as select * from public.orders_allowlist;
delete from public.orders_allowlist;
update public.platform_settings set orders_enabled = true where id = 1;
:as_nb
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"20000000-0000-0000-0000-000000000001","quantity":7,"price_per_unit":10}]'::jsonb)).id as g15_offer \gset
:as_nf
select pg_temp.counter(:'g15_offer', 'farmer', 11, 7);
:as_nb
select pg_temp.ok(public.rpc_accept_offer(:'g15_offer'), 'G15 NB rpc_accept_offer') as g15_order \gset
select pg_temp.ok(public.buyer_mark_transfer_sent(:'g15_offer'), 'G15 NB buyer_mark_transfer_sent');
:as_nf
select pg_temp.ok(public.farmer_confirm_payment_received(:'g15_offer'), 'G15 NF farmer_confirm_payment_received');
select pg_temp.ok(public.rpc_mark_order_shipped(:'g15_order', 'TRK-G15', 'Aras'), 'G15 NF ship');
:as_nb
select pg_temp.expect_ok($$insert into public.harvest_subscriptions (buyer_id, farmer_id, crop)
  values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates')$$, 'G15 NB subscription insert passes');
-- ORD-1 behaviour unchanged: accept out of turn still fails with ORD-1's own error, not the gate's.
select (public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"20000000-0000-0000-0000-000000000001","quantity":1,"price_per_unit":10}]'::jsonb)).id as g15_offer2 \gset
select pg_temp.expect_sqlstate(format($$select public.rpc_accept_offer(%L)$$, :'g15_offer2'), 'P0001', 'G15 NB accepting own offer out of turn still rejected by ORD-1');
:as_super
select pg_temp.assert((select count(*) = 1 from public.orders where offer_id = :'g15_offer' and status = 'shipped'), 'G15 one order, shipped');
select pg_temp.assert((select payment_status = 'paid' and final_price_per_unit = 11 from public.offers where id = :'g15_offer'), 'G15 offer paid at countered price');
select pg_temp.assert((select status = 'pending' from public.offers where id = :'g15_offer2'), 'G15 out-of-turn offer untouched');
update public.platform_settings set orders_enabled = false where id = 1;
insert into public.orders_allowlist select * from allowlist_backup;

-- =============================================================================================
-- G16 no platform_settings row -> gate CLOSED (fail-closed), even though it was enabled.
-- =============================================================================================
\echo '  G16 platform_settings row missing -> closed'
:as_super
begin;
update public.platform_settings set orders_enabled = true where id = 1;
:as_nb
select pg_temp.gate_is(public.rpc_get_order_gate(), true, true, 'G16 precondition: enabled');
:as_super
delete from public.platform_settings where id = 1;
:as_nb
select pg_temp.expect_gate($$select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"20000000-0000-0000-0000-000000000001","quantity":1,"price_per_unit":10}]'::jsonb)$$,
  'G16 NB rpc_create_offer without settings row -> ORDERS_DISABLED');
select pg_temp.gate_is(public.rpc_get_order_gate(), false, false, 'G16 NB {false,false} without settings row');
:as_ab
select pg_temp.gate_is(public.rpc_get_order_gate(), false, true, 'G16 AB {false,true} without settings row');
:as_super
rollback;
:as_super
select pg_temp.assert((select count(*) = 1 and bool_and(orders_enabled = false) from public.platform_settings), 'G16 settings row restored (rolled back)');

\o
\echo '==> ord_gate assertions: ALL PASSED'
