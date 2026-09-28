-- ORD-GATE — presence check for every object the migration creates. run.sh runs it with
-- -v expect_present=0 after rollback.sql (all gone) and =1 after re-applying the migration (all back).
\set ON_ERROR_STOP on
\o /dev/null
-- psql variables are not interpolated inside dollar quotes; hand the flag over as a setting.
select set_config('ord_gate.expect_present', :'expect_present', false);
\o

do $$
declare
  v_expect boolean := current_setting('ord_gate.expect_present') = '1';
  v_missing text[];
  v_present text[];
  r record;
begin
  for r in
    select 'column platform_settings.orders_enabled' as obj,
           exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'platform_settings' and column_name = 'orders_enabled') as present
    union all select 'table orders_allowlist', to_regclass('public.orders_allowlist') is not null
    union all select 'table order_intent_events', to_regclass('public.order_intent_events') is not null
    union all select 'view v_kpi_order_intent_blocked', to_regclass('public.v_kpi_order_intent_blocked') is not null
    union all select 'fn ' || f, to_regprocedure('public.' || f) is not null
      from unnest(array['fn_orders_is_service()', 'fn_orders_open_for(uuid,uuid)', 'fn_assert_orders_open(uuid,uuid)',
                        'fn_orders_gate_offers_ins()', 'fn_orders_gate_offers_upd()', 'fn_orders_gate_offer_messages_ins()',
                        'fn_orders_gate_orders_ins()', 'fn_orders_gate_subscriptions()', 'rpc_get_order_gate()',
                        'rpc_log_order_intent_blocked(text,text,uuid,uuid,text)']) f
    union all select 'trigger ' || t, exists (select 1 from pg_trigger where tgname = t)
      from unnest(array['a0_orders_gate_offers_ins', 'a0_orders_gate_offers_upd', 'a0_orders_gate_offer_messages_ins',
                        'a0_orders_gate_orders_ins', 'a0_orders_gate_subscriptions']) t
  loop
    if r.present and not v_expect then v_present := v_present || r.obj; end if;
    if not r.present and v_expect then v_missing := v_missing || r.obj; end if;
  end loop;
  if v_present is not null then
    raise exception 'ASSERTION FAILED: still present after rollback: %', v_present;
  end if;
  if v_missing is not null then
    raise exception 'ASSERTION FAILED: missing after re-apply: %', v_missing;
  end if;
end;
$$;
