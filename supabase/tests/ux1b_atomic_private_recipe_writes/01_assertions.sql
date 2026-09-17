\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;
create temp table test_ids(label text primary key, id uuid not null);
grant all on table test_ids to authenticated;

-- ACL and anonymous denial.
select pg_temp.assert(not has_function_privilege('anon','public.rpc_create_private_recipe(uuid,text,jsonb,uuid,text)','execute'),'anon create execute denied');
select pg_temp.assert(not has_function_privilege('anon','public.rpc_get_private_recipe_operation(uuid,text,text)','execute'),'anon operation lookup denied');
select pg_temp.assert(not has_function_privilege('anon','public.rpc_update_private_recipe(uuid,uuid,bigint,jsonb)','execute'),'anon update execute denied');
select pg_temp.assert(not has_function_privilege('anon','public.rpc_clone_recipe(uuid,uuid)','execute'),'anon clone execute denied');
select pg_temp.assert(not has_table_privilege('authenticated','private.private_recipe_operations','insert'),'authenticated ledger insert denied');
select pg_temp.assert(not has_table_privilege('authenticated','private.private_recipe_operations','update'),'authenticated ledger update denied');
select pg_temp.assert(has_function_privilege('authenticated','private.claim_private_recipe_operation(uuid,text,text,text)','execute'),'authenticated has narrow ledger claim execute');
select pg_temp.assert(not has_function_privilege('anon','private.claim_private_recipe_operation(uuid,text,text,text)','execute'),'anon ledger helper execute denied');
select pg_temp.assert((
  select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('claim_private_recipe_operation','complete_private_recipe_operation')
),'private ledger definers have fixed empty search_path');
select pg_temp.assert(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('rpc_create_private_recipe','rpc_get_private_recipe_operation','rpc_update_private_recipe','rpc_clone_recipe')
    and p.prosecdef
),'no UX-1B SECURITY DEFINER function is exposed in public');

set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);

do $$ begin
  begin
    insert into private.private_recipe_operations(owner_id,operation_type,operation_key,input_hash)
    values (auth.uid(),'create_text','30000000-0000-4000-8000-000000000010',repeat('f',64));
    raise exception 'expected direct ledger insert denial';
  exception when insufficient_privilege then null; end;
  begin
    update private.private_recipe_operations set result='{"recipe_id":"10000000-0000-0000-0000-000000000001","version":1}'::jsonb;
    raise exception 'expected direct ledger update denial';
  exception when insufficient_privilege then null; end;
end $$;

select pg_temp.assert(
  public.rpc_get_private_recipe_operation('30000000-0000-4000-8000-000000000009','create_photo_estimate',repeat('a',64)) is null,
  'preflight reserves a pending operation'
);
select public.rpc_create_private_recipe(
  '30000000-0000-4000-8000-000000000009','create_photo_estimate',
  '{"title":"Preflight Tarif","steps":[{"instruction":"Pişir."}]}'::jsonb,null,repeat('a',64)
) as preflight_create \gset
select pg_temp.assert(
  public.rpc_get_private_recipe_operation('30000000-0000-4000-8000-000000000009','create_photo_estimate',repeat('a',64)) = :'preflight_create'::jsonb,
  'preflight replay returns the completed result before AI work'
);
do $$ begin
  begin
    perform public.rpc_create_private_recipe(
      '30000000-0000-4000-8000-000000000009','create_photo_estimate',
      '{"title":"Forged Hash Payload","steps":[{"instruction":"Different"}]}'::jsonb,
      null,repeat('a',64)
    );
    raise exception 'expected forged input hash payload conflict';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='private_recipe_idempotency_conflict','same client hash cannot mask a different canonical payload');
  end;
end $$;

select public.rpc_create_private_recipe(
  '30000000-0000-4000-8000-000000000001','create_text',
  '{"title":"Atomik Tarif","ingredients":[{"free_text_name":"Biber","quantity":2,"unit":"adet"}],"steps":[{"instruction":"Doğra."}]}'::jsonb
) as create_result \gset
select pg_temp.assert((:'create_result'::jsonb->>'recipe_id') is not null,'create returns recipe id');
insert into test_ids values ('created',(:'create_result'::jsonb->>'recipe_id')::uuid);
select pg_temp.assert((select count(*) from public.recipes where title='Atomik Tarif')=1,'one recipe created');
select pg_temp.assert((select bool_and(owner_id=auth.uid() and visibility='private' and status='draft' and author_type='kullanici') from public.recipes where title='Atomik Tarif'),'server fixes owner/state');

-- Exact replay and different payload conflict.
select public.rpc_create_private_recipe(
  '30000000-0000-4000-8000-000000000001','create_text',
  '{"title":"Atomik Tarif","ingredients":[{"free_text_name":"Biber","quantity":2,"unit":"adet"}],"steps":[{"instruction":"Doğra."}]}'::jsonb
) as replay_result \gset
select pg_temp.assert(:'create_result'::jsonb = :'replay_result'::jsonb,'replay returns identical result');
select pg_temp.assert((select count(*) from public.recipes where title='Atomik Tarif')=1,'replay creates no duplicate');
do $$ begin
  begin
    perform public.rpc_create_private_recipe('30000000-0000-4000-8000-000000000001','create_text','{"title":"Different","steps":[{"instruction":"X"}]}'::jsonb);
    raise exception 'expected idempotency conflict';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='private_recipe_idempotency_conflict','deterministic payload conflict');
  end;
end $$;

-- Forced ingredient and step errors roll back parent and operation rows.
do $$ declare before_count bigint; begin
  select count(*) into before_count from public.recipes;
  begin
    perform public.rpc_create_private_recipe('30000000-0000-4000-8000-000000000002','create_text','{"title":"Ingredient Fail","ingredients":[{"free_text_name":"FORCE_FAIL"}],"steps":[{"instruction":"ok"}]}'::jsonb);
  exception when others then null; end;
  perform pg_temp.assert((select count(*) from public.recipes)=before_count,'ingredient failure leaves no parent');
  begin
    perform public.rpc_create_private_recipe('30000000-0000-4000-8000-000000000003','create_text','{"title":"Step Fail","ingredients":[{"free_text_name":"ok"}],"steps":[{"instruction":"FORCE_FAIL"}]}'::jsonb);
  exception when others then null; end;
  perform pg_temp.assert((select count(*) from public.recipes)=before_count,'step failure leaves no parent or children');
end $$;
reset role;
select pg_temp.assert(not exists(select 1 from private.private_recipe_operations where operation_key='30000000-0000-4000-8000-000000000002'),'ingredient failure rolls back ledger');
select pg_temp.assert(not exists(select 1 from private.private_recipe_operations where operation_key='30000000-0000-4000-8000-000000000003'),'step failure rolls back ledger');

-- Same key is independently usable by a second owner.
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
select public.rpc_create_private_recipe('30000000-0000-4000-8000-000000000001','create_text','{"title":"Owner Two","steps":[{"instruction":"ok"}]}'::jsonb);
reset role;
select pg_temp.assert((select count(*) from private.private_recipe_operations where operation_key='30000000-0000-4000-8000-000000000001')=2,'same key scoped by owner');

-- Owner one: update own draft atomically, replay, stale-version conflict, and foreign denial.
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
select public.rpc_update_private_recipe(
  '30000000-0000-4000-8000-000000000004',(select id from test_ids where label='created'),1,
  '{"title":"Updated","ingredients":[{"free_text_name":"Soğan"}],"steps":[{"instruction":"Pişir."}]}'::jsonb
) as update_result \gset
select pg_temp.assert((:'update_result'::jsonb->>'version')::int=2,'update increments version');
select pg_temp.assert((select title='Updated' from public.recipes where id=(select id from test_ids where label='created')),'update rewrites recipe');
select public.rpc_update_private_recipe(
  '30000000-0000-4000-8000-000000000004',(select id from test_ids where label='created'),1,
  '{"title":"Updated","ingredients":[{"free_text_name":"Soğan"}],"steps":[{"instruction":"Pişir."}]}'::jsonb
);
do $$ begin
  begin
    perform public.rpc_update_private_recipe('30000000-0000-4000-8000-000000000005',(select id from pg_temp.test_ids where label='created'),1,'{"title":"Stale","steps":[{"instruction":"X"}]}'::jsonb);
    raise exception 'expected version conflict';
  exception when sqlstate '40001' then
    perform pg_temp.assert(sqlerrm='private_recipe_version_conflict','deterministic version conflict');
  end;
  perform pg_temp.assert((select title='Updated' from public.recipes where id=(select id from pg_temp.test_ids where label='created')),'stale write preserves data');
  begin
    perform public.rpc_update_private_recipe('30000000-0000-4000-8000-000000000006','10000000-0000-0000-0000-000000000002',1,'{"title":"Foreign","steps":[{"instruction":"X"}]}'::jsonb);
    raise exception 'expected foreign denial';
  exception when sqlstate '42501' then null; end;
end $$;

-- Clone is idempotent, snapshot-independent and deliberately omits step photo_url.
select public.rpc_clone_recipe('10000000-0000-0000-0000-000000000001','30000000-0000-4000-8000-000000000007') as clone_result \gset
insert into test_ids values ('clone',(:'clone_result'::jsonb->>'recipe_id')::uuid);
select public.rpc_clone_recipe('10000000-0000-0000-0000-000000000001','30000000-0000-4000-8000-000000000007') as clone_replay \gset
select pg_temp.assert(:'clone_result'::jsonb=:'clone_replay'::jsonb,'clone replay identical');
select pg_temp.assert((select photo_url is null from public.recipe_steps where recipe_id=(select id from test_ids where label='clone')),'clone omits step photo');
reset role;
update public.recipes set title='Source Changed' where id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert((select title='Editorial Source' from public.recipes where id=(select id from test_ids where label='clone')),'clone is independent snapshot');

-- Direct privilege escalation is denied by existing RLS.
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
do $$ begin
  begin
    insert into public.recipes(slug,title,status,visibility,source_type,owner_id,author_type)
    values ('bad','Bad','published','public','manual',auth.uid(),'hasat');
    raise exception 'expected escalation denial';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recipes(slug,title,status,visibility,source_type,owner_id,author_type)
    values ('bad-private-published','Bad','published','private','manual',auth.uid(),'kullanici');
    raise exception 'expected published escalation denial';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recipes(slug,title,status,visibility,source_type,owner_id,author_type)
    values ('bad-author','Bad','draft','private','manual',auth.uid(),'hasat');
    raise exception 'expected author escalation denial';
  exception when insufficient_privilege then null; end;
end $$;

-- T6 compatibility adapter uses the common ledger and payload-conflict protection.
insert into public.ai_customize_requests(idempotency_key,user_id,source_recipe_id)
values ('30000000-0000-4000-8000-000000000008',auth.uid(),'10000000-0000-0000-0000-000000000001');
select public.rpc_create_ai_customized_recipe(
  '30000000-0000-4000-8000-000000000008','10000000-0000-0000-0000-000000000001','T6','desc',2,1,2,0,'kolay',
  '[{"freeTextName":"Biber","quantity":1,"unit":"adet","isKeyIngredient":true}]'::jsonb,
  '[{"instruction":"Pişir","timerSeconds":60}]'::jsonb
) as t6_id \gset
select pg_temp.assert((select count(*)=1 from public.recipes where id=:'t6_id'),'T6 adapter created one recipe');

\echo 'UX-1B atomic private recipe SQL suite: ALL ASSERTIONS PASSED'
