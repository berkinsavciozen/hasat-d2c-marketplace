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


-- Recovered-history contract: the local replay must produce the same T4 reference inventory.
select pg_temp.assert((select count(*)=43 from public.ingredient_nutrition_reference),
  'replayed food reference count must be 43');
select pg_temp.assert((select count(*)=58 from public.ingredient_nutrition_alias),
  'replayed alias count must be 58');
select pg_temp.assert((select count(*)=66 from public.ingredient_measure_reference),
  'replayed measure count must be 66');
select pg_temp.assert((select count(*)=9 from public.ingredient_nutrition_reference
  where reference_version='2026-09-11-t4b-review-required'),
  'T4-B review-required food references must remain exactly as applied');
select pg_temp.assert((select count(*)=1 from public.crop_nutrition
  where crop='sumak' and reference_version='2026-09-11-t4b-review-required'),
  'sumak review-required row must remain exactly as applied');

select pg_temp.assert((select unit='adet' from public.recipe_ingredients
  where id='1f4b2328-1b2b-4129-98e1-0725f9c17c2b'), 'first T4-B unit correction must replay');
select pg_temp.assert((select unit='adet' from public.recipe_ingredients
  where id='7b8fafb1-178d-42dc-b080-9ee39ead5ea4'), 'second T4-B unit correction must replay');
select pg_temp.assert((select crop='kekik' from public.recipe_ingredients
  where id='c93f566e-06bf-4735-b629-3ccd7973ff87'), 'T4-B crop correction must replay');
select pg_temp.assert((select count(*)=3 from public.recipe_ingredients
  where id in ('5b8fff0d-0c85-451c-a70a-df7671babf23','4c6d5e69-73ef-4d04-94c3-fe0267fce9bd','fa458a3f-29ee-4aa5-b09a-74c2ad3b3dbf')
    and nutrition_exclusion_reason='seasoning_to_taste_unquantified'),
  'all three T4-B exclusions must replay');

select pg_temp.assert((select nutrition_source='computed' and nutrition_coverage_pct=100
  from public.recipes where id='00000000-0000-0000-0000-000000000101'),
  'F7-compatible recalculation must preserve computed/100');

select pg_temp.assert((select bool_and(relrowsecurity) from pg_class
  where oid=any(array[
    'public.ingredient_nutrition_reference'::regclass,
    'public.ingredient_nutrition_alias'::regclass,
    'public.ingredient_measure_reference'::regclass,
    'public.recipe_ingredient_nutrition_backfill_audit'::regclass
  ])), 'all recovered T4 tables must have RLS enabled');

-- The two data-only T4-B files are deliberately replay-safe. Their second application must not
-- change any reference row or guarded correction; run.sh compares this digest after reapplying.
select pg_temp.assert(
  (select digest from public.t4_reconciliation_replay_snapshot) =
  md5(
    (select string_agg(row_to_json(x)::text,'|' order by x.food_key)
       from public.ingredient_nutrition_reference x) || '|' ||
    (select string_agg(row_to_json(x)::text,'|' order by x.normalized_alias)
       from public.ingredient_nutrition_alias x) || '|' ||
    (select string_agg(row_to_json(x)::text,'|' order by x.target_kind,x.target_key,x.normalized_unit)
       from public.ingredient_measure_reference x) || '|' ||
    (select string_agg(row_to_json(x)::text,'|' order by x.id)
       from public.recipe_ingredients x
       where x.id in (
         '1f4b2328-1b2b-4129-98e1-0725f9c17c2b','7b8fafb1-178d-42dc-b080-9ee39ead5ea4',
         'c93f566e-06bf-4735-b629-3ccd7973ff87','5b8fff0d-0c85-451c-a70a-df7671babf23',
         '4c6d5e69-73ef-4d04-94c3-fe0267fce9bd','fa458a3f-29ee-4aa5-b09a-74c2ad3b3dbf'
       )) || '|' ||
    (select row_to_json(x)::text from public.crop_nutrition x where x.crop='sumak')
  ), 'T4-B data-only migrations must be idempotent');

\echo 'T4 production migration reconciliation assertions: PASSED'
