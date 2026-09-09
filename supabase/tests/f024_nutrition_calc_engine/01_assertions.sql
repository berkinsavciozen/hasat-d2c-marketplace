-- F0-24 — SQL test suite for the nutrition calculation engine
-- (20260909120000_f024_recipe_nutrition_calc_engine.sql).

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

create or replace function pg_temp.assert_eq(actual numeric, expected numeric, msg text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'ASSERTION FAILED: % (expected %, got %)', msg, expected, actual;
  end if;
end;
$$;

-- crop_nutrition only accepts service_role writes (T4-A) — seed as that role, same pattern
-- t4a_nutrition_schema/01_assertions.sql uses.
set role service_role;

insert into public.crop_nutrition
  (crop, reference_source, reference_version, calories_kcal, protein_g, carbs_g, fat_g, fiber_g,
   sodium_mg, potassium_mg, calcium_mg, iron_mg, vitamin_c_mg, vitamin_a_mcg_rae)
values
  ('domates', 'usda', 'test-v1', 20, 1, 4, 0, 1, 5, 200, 10, 0.3, 15, 40),
  -- biber: most micros deliberately left null, only iron set — proves a matched row with sparse
  -- micronutrient coverage still flips v_has_micro true and the unset keys fall back to a 0
  -- contribution (see calc engine migration's own comment on this simplification).
  ('biber', 'usda', 'test-v1', 30, 2, 6, 0, 2, null, null, null, 0.5, null, null);

reset role;

-- ===================================================================================================
-- (a) all ingredients matched -> nutrition_source = 'computed', coverage ~100.
-- ===================================================================================================

insert into public.recipes (slug, title, servings) values ('recipe-a-full-match', 'Tam Eslesen Tarif', 2);

insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
select id, 1, 'domates', 200, 'g' from public.recipes where slug = 'recipe-a-full-match';
insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
select id, 2, 'biber', 2, 'adet' from public.recipes where slug = 'recipe-a-full-match';

select public.calculate_recipe_nutrition(id) from public.recipes where slug = 'recipe-a-full-match';

do $$
declare
  rec record;
begin
  select * into rec from public.recipes where slug = 'recipe-a-full-match';

  perform pg_temp.assert_eq(rec.calories, 50, 'recipe A calories per serving');
  perform pg_temp.assert_eq(rec.protein_g, 3, 'recipe A protein_g per serving');
  perform pg_temp.assert_eq(rec.carbs_g, 10, 'recipe A carbs_g per serving');
  perform pg_temp.assert_eq(rec.fat_g, 0, 'recipe A fat_g per serving');
  perform pg_temp.assert_eq(rec.fiber_g, 3, 'recipe A fiber_g per serving');
  perform pg_temp.assert(rec.nutrition_source = 'computed', 'recipe A nutrition_source should be computed');
  perform pg_temp.assert_eq(rec.nutrition_coverage_pct, 100.00, 'recipe A coverage should be 100');
  perform pg_temp.assert(rec.nutrition_calculated_at is not null, 'recipe A nutrition_calculated_at should be set');
  perform pg_temp.assert(rec.nutrition_input_hash is not null, 'recipe A nutrition_input_hash should be set');
  perform pg_temp.assert(rec.nutrition_reference_version = 'test-v1', 'recipe A nutrition_reference_version');
  perform pg_temp.assert(rec.nutrition_warnings = '{}', 'recipe A should have no warnings');
  perform pg_temp.assert(rec.micronutrients is not null, 'recipe A micronutrients should be populated');
  perform pg_temp.assert_eq((rec.micronutrients -> 'values' ->> 'sodium_mg')::numeric, 5, 'recipe A sodium_mg per serving');
  perform pg_temp.assert_eq((rec.micronutrients -> 'values' ->> 'potassium_mg')::numeric, 200, 'recipe A potassium_mg per serving');
  perform pg_temp.assert_eq((rec.micronutrients -> 'values' ->> 'iron_mg')::numeric, 0.80, 'recipe A iron_mg per serving');
end;
$$;

-- ===================================================================================================
-- (b) some ingredients are free-text -> nutrition_source = 'partial', coverage ratio correct.
-- ===================================================================================================

insert into public.recipes (slug, title, servings) values ('recipe-b-partial', 'Kismi Eslesen Tarif', 2);

insert into public.recipe_ingredients (recipe_id, sort_order, crop, free_text_name, quantity, unit)
select id, 1, 'domates', null, 100, 'g' from public.recipes where slug = 'recipe-b-partial';
-- free-text but metric unit -> grams known (50g), still counts toward the denominator only.
insert into public.recipe_ingredients (recipe_id, sort_order, crop, free_text_name, quantity, unit)
select id, 2, null, 'tuz', 50, 'g' from public.recipes where slug = 'recipe-b-partial';
-- free-text, non-metric, no crop to resolve a hint against -> grams unknown, excluded entirely.
insert into public.recipe_ingredients (recipe_id, sort_order, crop, free_text_name, quantity, unit)
select id, 3, null, 'biberiye', 1, 'tutam' from public.recipes where slug = 'recipe-b-partial';

select public.calculate_recipe_nutrition(id) from public.recipes where slug = 'recipe-b-partial';

do $$
declare
  rec record;
begin
  select * into rec from public.recipes where slug = 'recipe-b-partial';

  perform pg_temp.assert(rec.nutrition_source = 'partial', 'recipe B nutrition_source should be partial');
  -- matched_grams=100 (domates only), total_grams=150 (domates 100 + tuz 50) -> 66.67%.
  perform pg_temp.assert_eq(rec.nutrition_coverage_pct, 66.67, 'recipe B coverage ratio');
  perform pg_temp.assert_eq(rec.calories, 10, 'recipe B calories per serving (domates only)');
  perform pg_temp.assert_eq(rec.protein_g, 0.5, 'recipe B protein_g per serving');
  perform pg_temp.assert(rec.nutrition_warnings = array['unmatched_ingredient'], 'recipe B should carry unmatched_ingredient warning');
  perform pg_temp.assert(rec.nutrition_calculated_at is not null, 'recipe B nutrition_calculated_at should be set');
end;
$$;

-- ===================================================================================================
-- (c) nothing matches at all -> "unavailable" (every nutrition_* field null), no divide-by-zero.
-- ===================================================================================================

-- c1: a known crop with NO crop_nutrition row (one of the 41-unseeded-crops case) plus a genuinely
--     unweighable free-text row.
insert into public.recipes (slug, title, servings) values ('recipe-c1-no-nutrition-row', 'Beslenme Verisi Olmayan Tarif', 4);

insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
select id, 1, 'gizemli_ot', 100, 'g' from public.recipes where slug = 'recipe-c1-no-nutrition-row';
insert into public.recipe_ingredients (recipe_id, sort_order, crop, free_text_name, quantity, unit)
select id, 2, null, 'biberiye', 1, 'tutam' from public.recipes where slug = 'recipe-c1-no-nutrition-row';

select public.calculate_recipe_nutrition(id) from public.recipes where slug = 'recipe-c1-no-nutrition-row';

-- c2: recipe with zero recipe_ingredients rows at all (total_grams = matched_grams = 0 identically).
insert into public.recipes (slug, title, servings) values ('recipe-c2-no-ingredients', 'Malzemesiz Tarif', 4);
select public.calculate_recipe_nutrition(id) from public.recipes where slug = 'recipe-c2-no-ingredients';

do $$
declare
  rec record;
begin
  select * into rec from public.recipes where slug = 'recipe-c1-no-nutrition-row';
  perform pg_temp.assert(rec.calories is null, 'recipe C1 calories should be null (unavailable)');
  perform pg_temp.assert(rec.protein_g is null, 'recipe C1 protein_g should be null');
  perform pg_temp.assert(rec.nutrition_source is null, 'recipe C1 nutrition_source should be null');
  perform pg_temp.assert(rec.nutrition_coverage_pct is null, 'recipe C1 nutrition_coverage_pct should be null');
  perform pg_temp.assert(rec.nutrition_calculated_at is null, 'recipe C1 nutrition_calculated_at should be null');
  perform pg_temp.assert(rec.micronutrients is null, 'recipe C1 micronutrients should be null');
  perform pg_temp.assert(rec.nutrition_warnings = array['unmatched_ingredient'], 'recipe C1 should still carry unmatched_ingredient warning');

  select * into rec from public.recipes where slug = 'recipe-c2-no-ingredients';
  perform pg_temp.assert(rec.calories is null, 'recipe C2 calories should be null (unavailable, no ingredients)');
  perform pg_temp.assert(rec.nutrition_source is null, 'recipe C2 nutrition_source should be null');
  perform pg_temp.assert(rec.nutrition_warnings = '{}', 'recipe C2 should have no warnings (nothing to flag)');
end;
$$;

-- ===================================================================================================
-- (d) servings = 0 / null -> safe "unavailable", no crash, even with otherwise fully-matchable
--     ingredients.
-- ===================================================================================================

insert into public.recipes (slug, title, servings) values ('recipe-d1-zero-servings', 'Sifir Porsiyonlu Tarif', 0);
insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
select id, 1, 'domates', 200, 'g' from public.recipes where slug = 'recipe-d1-zero-servings';
select public.calculate_recipe_nutrition(id) from public.recipes where slug = 'recipe-d1-zero-servings';

insert into public.recipes (slug, title, servings) values ('recipe-d2-null-servings', 'Porsiyonsuz Tarif', null);
insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
select id, 1, 'domates', 200, 'g' from public.recipes where slug = 'recipe-d2-null-servings';
select public.calculate_recipe_nutrition(id) from public.recipes where slug = 'recipe-d2-null-servings';

do $$
declare
  rec record;
begin
  select * into rec from public.recipes where slug = 'recipe-d1-zero-servings';
  perform pg_temp.assert(rec.calories is null, 'recipe D1 (servings=0) calories should be null');
  perform pg_temp.assert(rec.nutrition_source is null, 'recipe D1 (servings=0) nutrition_source should be null');
  perform pg_temp.assert(rec.nutrition_coverage_pct is null, 'recipe D1 (servings=0) coverage should be null');

  select * into rec from public.recipes where slug = 'recipe-d2-null-servings';
  perform pg_temp.assert(rec.calories is null, 'recipe D2 (servings=null) calories should be null');
  perform pg_temp.assert(rec.nutrition_source is null, 'recipe D2 (servings=null) nutrition_source should be null');
end;
$$;

-- ===================================================================================================
-- Grants: calculate_recipe_nutrition / fn_recipe_ingredient_grams only executable by service_role,
-- same posture as every other pipeline function in this family.
-- ===================================================================================================

do $$
begin
  perform pg_temp.assert(
    has_function_privilege('service_role', 'public.calculate_recipe_nutrition(uuid)', 'execute'),
    'expected service_role to have execute on calculate_recipe_nutrition'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.calculate_recipe_nutrition(uuid)', 'execute'),
    'expected authenticated to be denied execute on calculate_recipe_nutrition'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.calculate_recipe_nutrition(uuid)', 'execute'),
    'expected anon to be denied execute on calculate_recipe_nutrition'
  );
end;
$$;

\echo 'F0-24 nutrition calculation engine SQL test suite: ALL ASSERTIONS PASSED'
