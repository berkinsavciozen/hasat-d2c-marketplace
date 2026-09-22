\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

-- The public RPC boundary remains authenticated-only and SECURITY INVOKER.
select pg_temp.assert(has_function_privilege('authenticated','public.rpc_create_private_recipe(uuid,text,jsonb,uuid,text)','execute'),'authenticated create execute');
select pg_temp.assert(has_function_privilege('authenticated','public.rpc_update_private_recipe(uuid,uuid,bigint,jsonb)','execute'),'authenticated update execute');
select pg_temp.assert(has_function_privilege('authenticated','public.rpc_clone_recipe(uuid,uuid)','execute'),'authenticated keyed clone execute');
select pg_temp.assert(has_function_privilege('authenticated','public.rpc_create_ai_customized_recipe(uuid,uuid,text,text,integer,integer,integer,integer,text,jsonb,jsonb)','execute'),'authenticated T6 execute');
select pg_temp.assert(not has_function_privilege('anon','public.rpc_create_private_recipe(uuid,text,jsonb,uuid,text)','execute'),'anon create denied');
select pg_temp.assert(not has_function_privilege('anon','public.rpc_update_private_recipe(uuid,uuid,bigint,jsonb)','execute'),'anon update denied');
select pg_temp.assert(not has_function_privilege('anon','public.rpc_clone_recipe(uuid,uuid)','execute'),'anon clone denied');
select pg_temp.assert(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('rpc_create_private_recipe','rpc_update_private_recipe','rpc_clone_recipe','rpc_create_ai_customized_recipe')
    and p.prosecdef
),'recipe write RPCs remain SECURITY INVOKER');

-- Only columns explicitly written by the RPC bodies are restored.
select pg_temp.assert(has_column_privilege('authenticated','public.recipes','title','insert'),'recipes title INSERT restored');
select pg_temp.assert(has_column_privilege('authenticated','public.recipes','title','update'),'recipes title UPDATE restored');
select pg_temp.assert(has_column_privilege('authenticated','public.recipes','private_edit_version','update'),'version UPDATE restored');
select pg_temp.assert(has_column_privilege('authenticated','public.recipe_ingredients','recipe_id','insert'),'ingredient INSERT restored');
select pg_temp.assert(not has_column_privilege('authenticated','public.recipe_ingredients','recipe_id','update'),'ingredient UPDATE remains ungranted');
select pg_temp.assert(not has_column_privilege('authenticated','public.recipes','owner_id','update'),'owner UPDATE remains ungranted');
select pg_temp.assert(not has_column_privilege('authenticated','public.recipes','author_type','update'),'author type UPDATE remains ungranted');
select pg_temp.assert(not has_column_privilege('authenticated','public.recipes','visibility','update'),'visibility UPDATE remains ungranted');
select pg_temp.assert(not has_column_privilege('authenticated','public.recipes','status','update'),'status UPDATE remains ungranted');
select pg_temp.assert(not has_column_privilege('anon','public.recipes','title','insert'),'anon recipes INSERT denied');
select pg_temp.assert(not has_column_privilege('anon','public.recipes','title','update'),'anon recipes UPDATE denied');
select pg_temp.assert(not has_column_privilege('anon','public.recipe_ingredients','recipe_id','insert'),'anon ingredient INSERT denied');
select pg_temp.assert(not has_column_privilege('public','public.recipes','title','insert'),'PUBLIC recipes INSERT denied');
select pg_temp.assert(not has_column_privilege('public','public.recipes','title','update'),'PUBLIC recipes UPDATE denied');
select pg_temp.assert(not has_column_privilege('public','public.recipe_ingredients','recipe_id','insert'),'PUBLIC ingredient INSERT denied');

-- Favorite/save stays owner-bound and independently writable.
select pg_temp.assert((select relrowsecurity from pg_class where oid='public.recipe_saves'::regclass),'recipe_saves RLS enabled');
select pg_temp.assert(has_table_privilege('authenticated','public.recipe_saves','select,insert,update,delete'),'favorite privileges intact');
select pg_temp.assert(not exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='recipe_saves'
    and ('authenticated' <> all(roles) or coalesce(qual,with_check,'') not like '%auth.uid()%')
),'favorite policies remain authenticated owner-bound');

set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
insert into public.recipe_saves(user_id,recipe_id)
values (auth.uid(),'10000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*)=1 from public.recipe_saves where user_id=auth.uid()),'favorite insert succeeds for owner');
delete from public.recipe_saves where user_id=auth.uid() and recipe_id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert((select count(*)=0 from public.recipe_saves where user_id=auth.uid()),'favorite delete succeeds for owner');

-- Direct writes cannot forge the RPC ownership/state invariants.
do $$
begin
  begin
    insert into public.recipes(id,slug,title,status,visibility,source_type,owner_id,author_type,private_edit_version)
    values (gen_random_uuid(),'f0-cross-owner','bad','draft','private','manual','20000000-0000-0000-0000-000000000002','kullanici',1);
    raise exception 'expected cross-owner insert denial';
  exception when insufficient_privilege then null; end;
  begin
    update public.recipes set title='cross-owner write'
    where id='10000000-0000-0000-0000-000000000003';
    if found then raise exception 'expected cross-owner update denial'; end if;
  end;
  begin
    insert into public.recipes(id,slug,title,status,visibility,source_type,owner_id,author_type,private_edit_version)
    values (gen_random_uuid(),'f0-public','bad','published','public','manual',auth.uid(),'kullanici',1);
    raise exception 'expected public/published insert denial';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recipes(id,slug,title,status,visibility,source_type,owner_id,author_type,private_edit_version)
    values (gen_random_uuid(),'f0-author','bad','draft','private','manual',auth.uid(),'hasat',1);
    raise exception 'expected author_type forgery denial';
  exception when insufficient_privilege then null; end;
  begin
    update public.recipes set owner_id='20000000-0000-0000-0000-000000000002'
    where id='10000000-0000-0000-0000-000000000002';
    raise exception 'expected owner update privilege denial';
  exception when insufficient_privilege then null; end;
  begin
    update public.recipes set visibility='public', status='published', author_type='hasat'
    where id='10000000-0000-0000-0000-000000000002';
    raise exception 'expected state update privilege denial';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
