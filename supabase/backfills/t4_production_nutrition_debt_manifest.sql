-- Read-only manifest. Safe before and after the migration/backfill.
\set ON_ERROR_STOP on

select r.slug,r.title,r.nutrition_source,r.nutrition_coverage_pct,
       count(ri.*) ingredient_count,
       count(*) filter(where ri.crop is null) free_text_rows,
       count(*) filter(where public.fn_recipe_ingredient_grams(ri.crop,ri.quantity,ri.unit) is null)
         unweighable_rows,
       string_agg(
         coalesce(ri.free_text_name,ri.crop)||' ['||coalesce(ri.quantity::text,'∅')||' '||
         coalesce(ri.unit,'∅')||']','; ' order by ri.sort_order
       ) filter(where ri.crop is null
         or public.fn_recipe_ingredient_grams(ri.crop,ri.quantity,ri.unit) is null
         or not exists(select 1 from public.crop_nutrition cn where cn.crop=ri.crop)) blockers
from public.recipes r
join public.recipe_ingredients ri on ri.recipe_id=r.id
where r.status='published' and r.visibility='public'
  and (r.nutrition_source is distinct from 'computed'
       or r.nutrition_coverage_pct is distinct from 100)
group by r.id,r.slug,r.title,r.nutrition_source,r.nutrition_coverage_pct
order by r.slug;

select count(*) public_published,
       count(*) filter(where nutrition_source='computed' and nutrition_coverage_pct=100) ready,
       count(*) filter(where nutrition_source is distinct from 'computed'
                         or nutrition_coverage_pct is distinct from 100) debt
from public.recipes where status='published' and visibility='public';
