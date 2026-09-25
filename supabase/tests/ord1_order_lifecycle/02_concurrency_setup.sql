-- ORD-1 A — N4 setup: one pending offer (ball on the farmer) for the two-connection accept race in run.sh.
\set ON_ERROR_STOP on
\o /dev/null
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select public.rpc_create_offer('f0000000-0000-0000-0000-000000000001',
  '[{"listing_id":"10000000-0000-0000-0000-000000000001","quantity":2,"price_per_unit":10}]'::jsonb, 'kargo-buyer', null, 'N4');
