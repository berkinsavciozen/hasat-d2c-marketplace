-- F2-S20 fix assertions: quantity+unit-less lines publish with
-- nutrition_exclusion_reason='seasoning_to_taste_unquantified' and nutrition reaches computed/100;
-- quantified lines are untouched; a line with only one of quantity/unit is still NOT excluded
-- (the approval preview doesn't skip it either, so it must stay a real resolution failure).
\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

-- 1) The exact production shape (null quantity + null unit) now publishes.
do $$
declare
  v_job_id uuid;
  v_result jsonb;
  v_recipe record;
begin
  v_job_id := public.f2s20_seed_publish_job(
    'F2S20 Null', 'f2s20-null-lock',
    jsonb_build_object(
      'crop', null, 'freeTextName', 'tuz', 'quantity', null, 'unit', null, 'note', 'damak tadına göre',
      'isKeyIngredient', false, 'ingredientClass', 'platform_disi', 'sortOrder', 1
    )
  );
  v_result := public.publish_recipe_draft(v_job_id, 'f2s20-null-lock', 'f2s20-null');
  select * into v_recipe from public.recipes where id = (v_result->>'recipeId')::uuid;

  perform pg_temp.assert(v_recipe.status = 'published', 'recipe with unquantified salt should publish');
  perform pg_temp.assert(v_recipe.nutrition_source = 'computed', 'nutrition_source should be computed');
  perform pg_temp.assert(v_recipe.nutrition_coverage_pct = 100, 'coverage should be 100');
  perform pg_temp.assert(
    'excluded_ingredient:seasoning_to_taste_unquantified' = any(v_recipe.nutrition_warnings),
    'calculator should record the exclusion as a warning'
  );
  perform pg_temp.assert(
    (select nutrition_exclusion_reason from public.recipe_ingredients
      where recipe_id = v_recipe.id and free_text_name = 'tuz') = 'seasoning_to_taste_unquantified',
    'unquantified line should carry seasoning_to_taste_unquantified'
  );
  perform pg_temp.assert(
    (select nutrition_exclusion_reason is null from public.recipe_ingredients
      where recipe_id = v_recipe.id and crop = 'kabak'),
    'quantified line must not be excluded'
  );
  perform pg_temp.assert(
    (select status = 'completed' and recipe_id = v_recipe.id from public.recipe_generation_jobs where id = v_job_id),
    'job should be completed and linked'
  );
end;
$$;

-- 2) Empty-string unit (the preview's nullif(...,'') treats it as absent) is excluded the same way.
do $$
declare
  v_job_id uuid;
  v_result jsonb;
begin
  v_job_id := public.f2s20_seed_publish_job(
    'F2S20 Empty', 'f2s20-empty-lock',
    jsonb_build_object(
      'crop', null, 'freeTextName', 'karabiber', 'quantity', null, 'unit', '', 'note', 'isteğe göre',
      'isKeyIngredient', false, 'ingredientClass', 'platform_disi', 'sortOrder', 1
    )
  );
  v_result := public.publish_recipe_draft(v_job_id, 'f2s20-empty-lock', 'f2s20-empty');
  perform pg_temp.assert(
    (select nutrition_exclusion_reason from public.recipe_ingredients
      where recipe_id = (v_result->>'recipeId')::uuid and free_text_name = 'karabiber') = 'seasoning_to_taste_unquantified',
    'empty-string unit with null quantity should be excluded like the preview does'
  );
end;
$$;

-- 3) Unit without quantity is NOT skipped by the preview, so publish must not silently exclude it:
--    the gate still refuses it (a real data gap, not a to-taste line).
do $$
declare
  v_job_id uuid;
  v_error text;
begin
  v_job_id := public.f2s20_seed_publish_job(
    'F2S20 Unit Only', 'f2s20-unit-only-lock',
    jsonb_build_object(
      'crop', null, 'freeTextName', 'tuz', 'quantity', null, 'unit', 'tutam', 'note', null,
      'isKeyIngredient', false, 'ingredientClass', 'platform_disi', 'sortOrder', 1
    )
  );
  begin
    perform public.publish_recipe_draft(v_job_id, 'f2s20-unit-only-lock', 'f2s20-unit-only');
  exception when others then
    v_error := sqlerrm;
  end;
  perform pg_temp.assert(
    v_error like 'PUBLISH_NUTRITION_INCOMPLETE:%',
    'unit-only line must still fail the nutrition gate, got ' || coalesce(v_error, '(success)')
  );
end;
$$;

drop function public.f2s20_seed_publish_job(text, text, jsonb);

\echo 'F2-S20 assertions: PASSED'
