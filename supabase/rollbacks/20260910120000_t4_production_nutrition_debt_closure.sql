\set ON_ERROR_STOP on
-- Roll back DATA first while the new columns still exist. Current rows must still equal the audited
-- after-state; otherwise the whole transaction stops rather than clobbering a later human edit.
begin;
create temporary table t4_restored_ids on commit drop as
with restored as (
update public.recipe_ingredients ri
set crop=a.before_row->>'crop',
    free_text_name=a.before_row->>'free_text_name',
    quantity=nullif(a.before_row->>'quantity','')::numeric,
    unit=a.before_row->>'unit',
    nutrition_food_key=a.before_row->>'nutrition_food_key',
    nutrition_exclusion_reason=a.before_row->>'nutrition_exclusion_reason'
from public.recipe_ingredient_nutrition_backfill_audit a
where a.migration_key='20260910120000_t4_production_nutrition_debt_closure'
  and a.ingredient_id=ri.id
  and jsonb_build_object('crop',ri.crop,'free_text_name',ri.free_text_name,'quantity',ri.quantity,'unit',ri.unit,
    'nutrition_food_key',ri.nutrition_food_key,'nutrition_exclusion_reason',ri.nutrition_exclusion_reason)=a.after_row
returning ri.id
) select id from restored;

do $$
declare expected_count integer; restored_count integer;
begin
  select count(*) into expected_count from public.recipe_ingredient_nutrition_backfill_audit
    where migration_key='20260910120000_t4_production_nutrition_debt_closure';
  select count(*) into restored_count from t4_restored_ids;
  if expected_count<>restored_count then
    raise exception 'T4 rollback guard failed: expected %, restored %',expected_count,restored_count;
  end if;
end $$;

-- Restore the previous engine bodies before removing their v2 dependencies.
\ir ../migrations/20260909120000_f024_recipe_nutrition_calc_engine.sql
drop function public.fn_recipe_ingredient_grams_v2(text,text,text,numeric,text);
delete from public.crop_nutrition
where crop='pul_biber' and reference_source='tuber' and reference_source_id='08.02.0042'
  and reference_version='TÜRKOMP-live-2026-09-10';
drop table public.ingredient_measure_reference;
drop table public.ingredient_nutrition_alias;
drop index public.recipe_ingredients_nutrition_food_key_idx;
revoke insert (recipe_id,sort_order,crop,free_text_name,quantity,unit,note,is_key_ingredient,ingredient_class)
  on public.recipe_ingredients from anon, authenticated;
revoke update (sort_order,crop,free_text_name,quantity,unit,note,is_key_ingredient,ingredient_class)
  on public.recipe_ingredients from anon, authenticated;
grant insert, update on table public.recipe_ingredients to anon, authenticated;
alter table public.recipe_ingredients
  drop constraint recipe_ingredients_nutrition_resolution_check,
  drop constraint recipe_ingredients_nutrition_exclusion_reason_check,
  drop column nutrition_exclusion_reason,
  drop column nutrition_food_key;
drop table public.recipe_ingredient_nutrition_backfill_audit;
drop table public.ingredient_nutrition_reference;
drop function public.fn_nutrition_normalize_unit(text);
drop function public.fn_nutrition_normalize_text(text);

select public.calculate_recipe_nutrition(r.id)
from public.recipes r where r.status='published' and r.visibility='public' order by r.id;
commit;
