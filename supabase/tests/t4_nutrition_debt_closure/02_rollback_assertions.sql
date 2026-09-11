\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean,msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %',msg; end if; end $$;

select pg_temp.assert(
  (select count(*)=0 from recipe_ingredient_nutrition_backfill_audit),
  'dry-run audit rows must roll back'
);
select pg_temp.assert(
  (select crop='çeltik' and free_text_name is null
   from recipe_ingredients ri join recipes r on r.id=ri.recipe_id
   where r.slug='celtik-pilavi-geleneksel-ve-luks-sunum' and ri.sort_order=1),
  'dry-run ingredient corrections must roll back'
);
select pg_temp.assert(
  (select count(*) filter(where nutrition_source is not null)=0
   from recipes where status='published' and visibility='public'),
  'dry-run materialized nutrition writes must roll back'
);
\echo 'T4 nutrition debt dry-run rollback: ALL ASSERTIONS PASSED'
