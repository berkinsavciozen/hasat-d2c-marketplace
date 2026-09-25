-- ORD-1 A — N4 assertions after the two-connection race in run.sh.
-- :res_a / :res_b are the jsonb results of connection A (took the lock first) and B (waited on it).
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

select pg_temp.assert((select count(*) = 1 from public.orders where offer_id = :'offer'), 'N4: exactly one order after two concurrent accepts');
select pg_temp.assert((select count(*) = 1 from public.order_timeline t join public.orders o on o.id = t.order_id
                       where o.offer_id = :'offer' and t.step = 'submitted'), 'N4: exactly one submitted timeline row');
select pg_temp.assert((:'res_a')::jsonb ->> 'ok' = 'true' and not ((:'res_a')::jsonb ? 'alreadyAccepted'), 'N4: A accepted');
select pg_temp.assert((:'res_b')::jsonb ->> 'ok' = 'true' and (:'res_b')::jsonb ->> 'alreadyAccepted' = 'true', 'N4: B got alreadyAccepted');
select pg_temp.assert((:'res_a')::jsonb ->> 'orderId' = (:'res_b')::jsonb ->> 'orderId'
                      and (:'res_a')::jsonb ->> 'orderId' = (select id::text from public.orders where offer_id = :'offer'),
  'N4: both calls return the same orderId');

\o
\echo '    03_concurrency_assertions.sql: N4 passed'
