-- ORD-GATE — geri alma betiği: 20260928140000_ord_gate_storefront_mode.sql'in eklediği her şeyi kaldırır.
-- CANLIDA ÇALIŞTIRILMAZ. run.sh bunu test veritabanında uygular ve migration'ın ardından yeniden
-- uygulanabildiğini gösterir. orders_allowlist ve order_intent_events satırları da silinir.

drop trigger if exists a0_orders_gate_offers_ins on public.offers;
drop trigger if exists a0_orders_gate_offers_upd on public.offers;
drop trigger if exists a0_orders_gate_offer_messages_ins on public.offer_messages;
drop trigger if exists a0_orders_gate_orders_ins on public.orders;
drop trigger if exists a0_orders_gate_subscriptions on public.harvest_subscriptions;

drop function if exists public.fn_orders_gate_offers_ins();
drop function if exists public.fn_orders_gate_offers_upd();
drop function if exists public.fn_orders_gate_offer_messages_ins();
drop function if exists public.fn_orders_gate_orders_ins();
drop function if exists public.fn_orders_gate_subscriptions();

drop function if exists public.rpc_get_order_gate();
drop function if exists public.rpc_log_order_intent_blocked(text, text, uuid, uuid, text);
drop function if exists public.fn_assert_orders_open(uuid, uuid);
drop function if exists public.fn_orders_open_for(uuid, uuid);
drop function if exists public.fn_orders_is_service();

drop view if exists public.v_kpi_order_intent_blocked;
drop table if exists public.order_intent_events;
drop table if exists public.orders_allowlist;

alter table public.platform_settings drop column if exists orders_enabled;
