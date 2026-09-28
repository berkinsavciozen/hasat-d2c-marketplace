-- ORD-GATE — fingerprint of everything the migration must NOT change: ORD-1 / FIN-2 / FIN-3-S / baseline
-- function bodies and config, plus every pre-existing trigger and policy on the four gated tables.
-- run.sh captures this before and after the migration and diffs the two.
select 'fn ' || p.proname || ' ' || md5(p.prosrc || coalesce(array_to_string(p.proconfig, ','), '')
                                        || p.prosecdef::text || coalesce(p.proacl::text, ''))
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('rpc_accept_offer', 'rpc_mark_order_shipped', 'rpc_confirm_order_delivered', 'rpc_cancel_order',
                    'rpc_open_dispute', 'rpc_withdraw_counter', 'enforce_offer_transitions', 'enforce_offer_accept_turn',
                    'enforce_offer_stock', 'fn_guard_order_transitions', 'buyer_mark_transfer_sent',
                    'farmer_confirm_payment_received', 'fn_guard_offers_payment_status', 'rpc_create_offer',
                    'fn_listing_reserved_qty', 'fn_snapshot_offer_on_insert', 'fn_guard_offer_snapshot_columns',
                    'enforce_subscription_updates', 'enforce_subscription_buyer_role')
union all
select 'trg ' || tgrelid::regclass || ' ' || tgname || ' ' || md5(pg_get_triggerdef(oid))
from pg_trigger
where tgrelid in ('public.offers'::regclass, 'public.offer_messages'::regclass, 'public.orders'::regclass,
                  'public.harvest_subscriptions'::regclass)
  and not tgisinternal
  and tgname not like 'a0\_orders\_gate\_%'
union all
select 'pol ' || tablename || ' ' || policyname || ' ' || md5(cmd || roles::text || coalesce(qual, '') || coalesce(with_check, ''))
from pg_policies
where schemaname = 'public'
  and tablename in ('offers', 'offer_messages', 'orders', 'harvest_subscriptions', 'platform_settings')
order by 1;
