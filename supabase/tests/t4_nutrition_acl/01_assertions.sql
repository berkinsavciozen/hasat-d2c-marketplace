\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean,msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %',msg; end if; end $$;

create or replace function pg_temp.assert_function_locked(signature text) returns void language plpgsql as $$
declare p oid; public_execute boolean;
begin
  p:=to_regprocedure(signature);
  if p is null then raise exception 'ASSERTION FAILED: missing function %',signature; end if;
  select exists(
    select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
    where f.oid=p and a.grantee=0 and a.privilege_type='EXECUTE'
  ) into public_execute;
  perform pg_temp.assert(not public_execute,signature||' must have no PUBLIC execute ACL');
  perform pg_temp.assert(not has_function_privilege('anon',p,'EXECUTE'),signature||' must deny anon');
  perform pg_temp.assert(not has_function_privilege('authenticated',p,'EXECUTE'),signature||' must deny authenticated');
  perform pg_temp.assert(has_function_privilege('service_role',p,'EXECUTE'),signature||' must allow service_role');
end $$;

select pg_temp.assert_function_locked('public.fn_nutrition_normalize_text(text)');
select pg_temp.assert_function_locked('public.fn_nutrition_normalize_unit(text)');
select pg_temp.assert_function_locked('public.fn_recipe_ingredient_grams_v2(text,text,text,numeric,text)');
select pg_temp.assert_function_locked('public.fn_recipe_ingredient_grams(text,numeric,text)');
select pg_temp.assert_function_locked('public.calculate_recipe_nutrition(uuid)');

select pg_temp.assert(not has_table_privilege('authenticated','public.recipe_ingredients','INSERT'),
  'authenticated must not retain table-level INSERT');
select pg_temp.assert(not has_table_privilege('authenticated','public.recipe_ingredients','UPDATE'),
  'authenticated must not retain table-level UPDATE');
select pg_temp.assert(not has_table_privilege('anon','public.recipe_ingredients','INSERT'),
  'anon must not retain table-level INSERT');
select pg_temp.assert(not has_table_privilege('anon','public.recipe_ingredients','UPDATE'),
  'anon must not retain table-level UPDATE');

do $$
declare c text;
begin
  foreach c in array array['recipe_id','sort_order','crop','free_text_name','quantity','unit','note','is_key_ingredient','ingredient_class']
  loop
    perform pg_temp.assert(has_column_privilege('authenticated','public.recipe_ingredients',c,'INSERT'),
      'authenticated INSERT must preserve mobile column '||c);
  end loop;
  foreach c in array array['sort_order','crop','free_text_name','quantity','unit','note','is_key_ingredient','ingredient_class']
  loop
    perform pg_temp.assert(has_column_privilege('authenticated','public.recipe_ingredients',c,'UPDATE'),
      'authenticated UPDATE must preserve mobile column '||c);
  end loop;
  foreach c in array array['nutrition_food_key','nutrition_exclusion_reason']
  loop
    perform pg_temp.assert(not has_column_privilege('authenticated','public.recipe_ingredients',c,'INSERT'),
      'authenticated must not INSERT '||c);
    perform pg_temp.assert(not has_column_privilege('authenticated','public.recipe_ingredients',c,'UPDATE'),
      'authenticated must not UPDATE '||c);
    perform pg_temp.assert(not has_column_privilege('anon','public.recipe_ingredients',c,'INSERT'),
      'anon must not INSERT '||c);
    perform pg_temp.assert(not has_column_privilege('anon','public.recipe_ingredients',c,'UPDATE'),
      'anon must not UPDATE '||c);
    perform pg_temp.assert(has_column_privilege('authenticated','public.recipe_ingredients',c,'SELECT'),
      'existing SELECT visibility must be preserved for '||c);
  end loop;
end $$;

set role service_role;
insert into public.crop_nutrition
 (crop,reference_source,reference_source_id,reference_version,calories_kcal,protein_g,carbs_g,fat_g,fiber_g)
values ('domates','usda','acl-test-domates','acl-test-v1',20,1,4,0,1);
reset role;

insert into public.recipes(id,slug,title,servings,owner_id,status,visibility) values
 ('00000000-0000-0000-0000-000000000101','acl-owner-a','Owner A',2,'00000000-0000-0000-0000-0000000000a1','draft','private'),
 ('00000000-0000-0000-0000-000000000102','acl-owner-b','Owner B',2,'00000000-0000-0000-0000-0000000000b2','draft','private');

-- Positive F7/saveDraft shape: exact mobile INSERT and UPDATE payload columns remain usable and
-- the existing SECURITY DEFINER trigger still recalculates nutrition.
do $$
declare rid uuid:='00000000-0000-0000-0000-000000000101'; iid uuid; got numeric;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
  insert into public.recipe_ingredients
    (recipe_id,sort_order,crop,free_text_name,quantity,unit,note,is_key_ingredient,ingredient_class)
  values (rid,1,'domates',null,300,'g','ilk kayıt',true,'tarimsal') returning id into iid;
  update public.recipe_ingredients set sort_order=1,crop='domates',free_text_name=null,quantity=400,
    unit='g',note='güncellendi',is_key_ingredient=true,ingredient_class='tarimsal' where id=iid;
  reset role;
  select calories into got from public.recipes where id=rid;
  perform pg_temp.assert(got=40,'F7 saveDraft-compatible UPDATE must recalculate 40 kcal/serving');
end $$;

-- Role-level negative writes: both controlled columns fail before they can influence the engine.
do $$
declare blocked boolean;
begin
  blocked:=false;
  begin
    set role authenticated;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
    insert into public.recipe_ingredients(recipe_id,free_text_name,quantity,unit,nutrition_food_key)
    values ('00000000-0000-0000-0000-000000000101','süt',100,'g','whole_milk');
  exception when insufficient_privilege then blocked:=true;
  end;
  reset role;
  perform pg_temp.assert(blocked,'authenticated nutrition_food_key INSERT must fail');

  blocked:=false;
  begin
    set role authenticated;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
    update public.recipe_ingredients set nutrition_exclusion_reason='trace_flavoring_unquantified'
    where recipe_id='00000000-0000-0000-0000-000000000101';
  exception when insufficient_privilege then blocked:=true;
  end;
  reset role;
  perform pg_temp.assert(blocked,'authenticated nutrition_exclusion_reason UPDATE must fail');

  blocked:=false;
  begin
    set role anon;
    insert into public.recipe_ingredients(recipe_id,free_text_name,quantity,unit,nutrition_food_key)
    values ('00000000-0000-0000-0000-000000000101','süt',100,'g','whole_milk');
  exception when insufficient_privilege then blocked:=true;
  end;
  reset role;
  perform pg_temp.assert(blocked,'anon nutrition_food_key INSERT must fail');

  blocked:=false;
  begin
    set role anon;
    update public.recipe_ingredients set nutrition_exclusion_reason='trace_flavoring_unquantified'
    where recipe_id='00000000-0000-0000-0000-000000000101';
  exception when insufficient_privilege then blocked:=true;
  end;
  reset role;
  perform pg_temp.assert(blocked,'anon nutrition_exclusion_reason UPDATE must fail');
end $$;

-- service_role/backfill is the trusted writer.
set role service_role;
insert into public.recipe_ingredients(recipe_id,sort_order,free_text_name,quantity,unit,nutrition_food_key)
values ('00000000-0000-0000-0000-000000000102',1,'süt',100,'g','whole_milk');
insert into public.recipe_ingredients(recipe_id,sort_order,free_text_name,quantity,unit,nutrition_exclusion_reason)
values ('00000000-0000-0000-0000-000000000102',2,'damla sakızı',2,'parça','trace_flavoring_unquantified');
reset role;

select pg_temp.assert(
 (select count(*)=2 from public.recipe_ingredients
  where recipe_id='00000000-0000-0000-0000-000000000102'
    and (nutrition_food_key is not null or nutrition_exclusion_reason is not null)),
 'service_role must write both controlled columns'
);

-- RLS owner boundary still applies to the legitimate mobile columns.
do $$
declare blocked boolean:=false; before_note text; after_note text;
begin
  select note into before_note from public.recipe_ingredients
    where recipe_id='00000000-0000-0000-0000-000000000102' order by sort_order limit 1;
  begin
    set role authenticated;
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
    insert into public.recipe_ingredients(recipe_id,sort_order,free_text_name,quantity,unit)
    values ('00000000-0000-0000-0000-000000000102',9,'yetkisiz',1,'g');
  exception when insufficient_privilege then blocked:=true;
  end;
  set role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
  update public.recipe_ingredients set note='başka owner' where recipe_id='00000000-0000-0000-0000-000000000102';
  reset role;
  select note into after_note from public.recipe_ingredients
    where recipe_id='00000000-0000-0000-0000-000000000102' order by sort_order limit 1;
  perform pg_temp.assert(blocked,'RLS must reject insert into another owner recipe');
  perform pg_temp.assert(after_note is not distinct from before_note,'RLS must hide another owner rows from UPDATE');
end $$;

\echo 'T4 nutrition ACL + F7 integration assertions: PASSED'
