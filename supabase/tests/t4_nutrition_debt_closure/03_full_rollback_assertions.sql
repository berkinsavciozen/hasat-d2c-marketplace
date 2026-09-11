\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean,msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %',msg; end if; end $$;

select pg_temp.assert(to_regclass('public.ingredient_nutrition_reference') is null,
  'reference table must be removed by full rollback');
select pg_temp.assert(to_regclass('public.recipe_ingredient_nutrition_backfill_audit') is null,
  'audit table must be removed after guarded restore');
select pg_temp.assert(to_regprocedure('public.fn_recipe_ingredient_grams_v2(text,text,text,numeric,text)') is null,
  'v2 grams function must be removed');
select pg_temp.assert(to_regprocedure('public.fn_recipe_ingredient_grams(text,numeric,text)') is not null,
  'previous grams function must be restored');
select pg_temp.assert(
  (select crop='çeltik' and free_text_name is null
   from recipe_ingredients ri join recipes r on r.id=ri.recipe_id
   where r.slug='celtik-pilavi-geleneksel-ve-luks-sunum' and ri.sort_order=1),
  'full rollback must restore original ingredient fields'
);
\echo 'T4 nutrition debt full rollback: ALL ASSERTIONS PASSED'
