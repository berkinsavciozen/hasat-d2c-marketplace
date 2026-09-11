\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean,msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %',msg; end if; end $$;

select pg_temp.assert(
  (select count(*)=34 and count(*) filter(where nutrition_source='computed' and nutrition_coverage_pct=100)=34
   from recipes where status='published' and visibility='public'),
  'dry-run manifest must finish 34/34 computed/100'
);

select pg_temp.assert(
  (select count(*)=14 from recipe_ingredient_nutrition_backfill_audit
   where migration_key='20260910120000_t4_production_nutrition_debt_closure'),
  'all 14 reviewed corrections must be audited exactly once'
);

select pg_temp.assert(
  (select micronutrients is null from recipes where slug='cevizli-biber-ezmesi-muhammara'),
  'unknown micronutrients must remain NULL, never be zero-filled'
);

-- New F2 fixture: exact standard food is supported.
insert into recipes(slug,title,servings,status,visibility) values
 ('f2-fixture-exact-milk','F2 exact milk',1,'draft','private');
insert into recipe_ingredients(recipe_id,sort_order,free_text_name,quantity,unit)
select id,1,'süt',250,'ml' from recipes where slug='f2-fixture-exact-milk';
select calculate_recipe_nutrition(id) from recipes where slug='f2-fixture-exact-milk';
select pg_temp.assert(
  (select nutrition_source='computed' and nutrition_coverage_pct=100 from recipes where slug='f2-fixture-exact-milk'),
  'exact F2 standard-food alias must calculate'
);

-- New F2 fixture: ambiguous alternatives are deliberately not aliased and can never pass publish.
insert into recipes(slug,title,servings,status,visibility) values
 ('f2-fixture-ambiguous-milk','F2 ambiguous milk',1,'draft','private');
insert into recipe_ingredients(recipe_id,sort_order,free_text_name,quantity,unit)
select id,1,'badem, yulaf veya soya sütü',250,'ml' from recipes where slug='f2-fixture-ambiguous-milk';
select calculate_recipe_nutrition(id) from recipes where slug='f2-fixture-ambiguous-milk';
select pg_temp.assert(
  (select nutrition_source is distinct from 'computed' and nutrition_coverage_pct is distinct from 100
   from recipes where slug='f2-fixture-ambiguous-milk'),
  'ambiguous F2 ingredient must not calculate or pass'
);

-- Regression: an unknown unweighable row blocks computed/100 even beside a matched ingredient.
insert into recipes(slug,title,servings,status,visibility) values
 ('f2-fixture-hidden-unmatched','F2 hidden unmatched',1,'draft','private');
insert into recipe_ingredients(recipe_id,sort_order,crop,quantity,unit)
select id,1,'domates',100,'g' from recipes where slug='f2-fixture-hidden-unmatched';
insert into recipe_ingredients(recipe_id,sort_order,free_text_name,quantity,unit)
select id,2,'bilinmeyen karışım',1,'avuç' from recipes where slug='f2-fixture-hidden-unmatched';
select calculate_recipe_nutrition(id) from recipes where slug='f2-fixture-hidden-unmatched';
select pg_temp.assert(
  (select nutrition_source='partial' and nutrition_coverage_pct=99.99
   from recipes where slug='f2-fixture-hidden-unmatched'),
  'unweighable unknown must cap coverage below 100'
);

\echo 'T4 nutrition debt closure: ALL ASSERTIONS PASSED'
