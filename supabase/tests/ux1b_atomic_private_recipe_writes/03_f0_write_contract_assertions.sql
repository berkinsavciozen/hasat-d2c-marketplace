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

-- authenticated receives exact RPC write allow-lists, not table-wide grants.
select pg_temp.assert(not has_table_privilege('authenticated','public.recipes','insert'),'no table-wide recipes INSERT');
select pg_temp.assert(not has_table_privilege('authenticated','public.recipes','update'),'no table-wide recipes UPDATE');
select pg_temp.assert(not has_table_privilege('authenticated','public.recipe_ingredients','insert'),'no table-wide ingredient INSERT');
select pg_temp.assert(not has_table_privilege('authenticated','public.recipe_ingredients','update'),'no table-wide ingredient UPDATE');

select pg_temp.assert(not exists(
  select 1 from pg_attribute a
  where a.attrelid='public.recipes'::regclass and a.attnum>0 and not a.attisdropped
    and (
      has_column_privilege('authenticated','public.recipes',a.attname,'INSERT')
      <> (a.attname = any(array[
        'id','slug','title','description','cover_photo_url','servings',
        'prep_minutes','cook_minutes','rest_minutes','difficulty','cuisine',
        'diet_tags','required_equipment','extraction_confidence','status',
        'visibility','source_type','owner_id','author_type',
        'cloned_from_recipe_id','private_edit_version'
      ]))
      or has_column_privilege('authenticated','public.recipes',a.attname,'UPDATE')
      <> (a.attname = any(array[
        'title','description','servings','prep_minutes','cook_minutes',
        'rest_minutes','difficulty','private_edit_version','updated_at'
      ]))
    )
),'recipes exact authenticated INSERT/UPDATE matrix');

select pg_temp.assert(not exists(
  select 1 from pg_attribute a
  where a.attrelid='public.recipe_ingredients'::regclass and a.attnum>0 and not a.attisdropped
    and (
      has_column_privilege('authenticated','public.recipe_ingredients',a.attname,'INSERT')
      <> (a.attname = any(array[
        'recipe_id','sort_order','crop','free_text_name','quantity','unit','note',
        'is_key_ingredient','ingredient_class'
      ]))
      or has_column_privilege('authenticated','public.recipe_ingredients',a.attname,'UPDATE')
    )
),'ingredient exact authenticated INSERT and zero UPDATE matrix');

-- anon and PUBLIC have no recipe writes in either table, at table or column level.
select pg_temp.assert(not exists(
  select 1 from pg_attribute a
  where a.attrelid in ('public.recipes'::regclass,'public.recipe_ingredients'::regclass)
    and a.attnum>0 and not a.attisdropped
    and (
      has_column_privilege('anon',a.attrelid,a.attname,'INSERT')
      or has_column_privilege('anon',a.attrelid,a.attname,'UPDATE')
    )
),'anon recipe INSERT/UPDATE denied on every column');
select pg_temp.assert(not exists(
  select 1
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(c.relacl) x
  where n.nspname='public' and c.relname in ('recipes','recipe_ingredients')
    and x.grantee=0 and x.privilege_type in ('INSERT','UPDATE')
  union all
  select 1
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  cross join lateral aclexplode(a.attacl) x
  where n.nspname='public' and c.relname in ('recipes','recipe_ingredients')
    and x.grantee=0 and x.privilege_type in ('INSERT','UPDATE')
),'PUBLIC recipe INSERT/UPDATE ACL absent');

-- The reconcile does not disturb existing read/delete capabilities.
select pg_temp.assert(has_table_privilege('authenticated','public.recipes','select,delete'),'authenticated recipes read/delete intact');
select pg_temp.assert(has_table_privilege('authenticated','public.recipe_ingredients','select,delete'),'authenticated ingredients read/delete intact');
select pg_temp.assert(has_table_privilege('anon','public.recipes','select'),'anon recipes SELECT intact');
select pg_temp.assert(has_table_privilege('anon','public.recipe_ingredients','select'),'anon ingredients SELECT intact');

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

-- Direct writes cannot forge ownership/state or mutate ingredient rows.
do $$
begin
  begin
    insert into public.recipes(id,slug,title,status,visibility,source_type,owner_id,author_type,private_edit_version)
    values (gen_random_uuid(),'f0-cross-owner','bad','draft','private','manual','20000000-0000-0000-0000-000000000002','kullanici',1);
    raise exception 'expected cross-owner insert denial';
  exception when insufficient_privilege then null; end;
  begin
    update public.recipes set title='cross-owner write'
    where id='10000000-0000-0000-0000-000000000002';
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
  begin
    update public.recipe_ingredients set quantity=999
    where recipe_id='10000000-0000-0000-0000-000000000001';
    raise exception 'expected direct ingredient UPDATE privilege denial';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
