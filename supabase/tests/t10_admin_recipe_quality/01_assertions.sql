-- T10 — SQL test suite for 20260911140000_t10_admin_recipe_quality_overview.sql.
--
-- Run order (see run.sh): 00_fixtures.sql -> the real T4-A/T4-A2/T3-A/F0-24/F0-24b/T4-B migrations
-- (dependencies) -> the real T10 migration under test -> this file.

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

-- Seed a crop_nutrition row for 'domates' (the table only exists once the real T4-A migration
-- applied by run.sh has run) so calculate_recipe_nutrition has something real to compute from —
-- needed to prove admin_update_ingredient_nutrition's own UPDATE triggers a real recalculation
-- (a non-null nutrition_calculated_at change), not just the "unavailable"/all-null branch.
insert into public.crop_nutrition (crop, reference_source, reference_version, calories_kcal, protein_g, carbs_g, fat_g, fiber_g)
values ('domates', 'tuber', 'test-v1', 18, 0.9, 3.9, 0.2, 1.2);

-- Fixture recipe (published/public, so it surfaces in admin_recipe_quality_overview) + two
-- ingredients: one resolvable via crop (feeds calculate_recipe_nutrition, proves the T4-B
-- AFTER UPDATE trigger fires from admin_update_ingredient_nutrition's own UPDATE), one unresolved
-- free-text row (feeds admin_recipe_quality_overview.unresolved_ingredient_count). Inserted here,
-- not in 00_fixtures.sql, because allergens_reviewed only exists once the real T3-A migration
-- (applied by run.sh, before this file) has run.
insert into public.recipes (id, slug, title, servings, status, visibility, allergen_labels, allergens_reviewed, allergens_reviewed_at, required_equipment, diet_tags)
values (
  '00000000-0000-0000-0000-0000000000f1', 'test-tarif', 'Test Tarifi', 4, 'published', 'public',
  array['gluten'], true, now(), array['ozel-ekipman-gerekmiyor'], array['vejetaryen']
);

insert into public.recipe_ingredients (id, recipe_id, sort_order, crop, quantity, unit)
values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 0, 'domates', 200, 'g');

insert into public.recipe_ingredients (id, recipe_id, sort_order, free_text_name, quantity, unit)
values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 1, 'ince bulgur', 2, 'su_bardagi');

-- ===================================================================================================
-- (1) ACL — admin_recipe_quality_overview: anon/authenticated denied SELECT, service_role keeps it.
-- ===================================================================================================
do $$
begin
  perform pg_temp.assert(
    not has_table_privilege('anon', 'public.admin_recipe_quality_overview', 'select'),
    'expected anon to be denied SELECT on admin_recipe_quality_overview'
  );
  perform pg_temp.assert(
    not has_table_privilege('authenticated', 'public.admin_recipe_quality_overview', 'select'),
    'expected authenticated to be denied SELECT on admin_recipe_quality_overview'
  );
  perform pg_temp.assert(
    has_table_privilege('service_role', 'public.admin_recipe_quality_overview', 'select'),
    'expected service_role to keep SELECT on admin_recipe_quality_overview'
  );
end;
$$;

-- ===================================================================================================
-- (2) ACL — the 4 functions this migration adds: anon/authenticated denied EXECUTE, service_role
--     keeps it. (aclexplode over pg_proc.proacl would show the same thing; has_function_privilege
--     is the exact check this repo's own test suites already use for this, e.g.
--     supabase/tests/f024t4b_recipe_nutrition_trigger/01_assertions.sql.)
-- ===================================================================================================
do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.is_valid_recipe_required_equipment(text[])', 'execute'),
    'expected anon to be denied EXECUTE on is_valid_recipe_required_equipment'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.is_valid_recipe_required_equipment(text[])', 'execute'),
    'expected authenticated to be denied EXECUTE on is_valid_recipe_required_equipment'
  );
  perform pg_temp.assert(
    has_function_privilege('service_role', 'public.is_valid_recipe_required_equipment(text[])', 'execute'),
    'expected service_role to keep EXECUTE on is_valid_recipe_required_equipment'
  );

  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.admin_update_recipe_allergens(uuid,text[],boolean)', 'execute'),
    'expected anon to be denied EXECUTE on admin_update_recipe_allergens'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.admin_update_recipe_allergens(uuid,text[],boolean)', 'execute'),
    'expected authenticated to be denied EXECUTE on admin_update_recipe_allergens'
  );
  perform pg_temp.assert(
    has_function_privilege('service_role', 'public.admin_update_recipe_allergens(uuid,text[],boolean)', 'execute'),
    'expected service_role to keep EXECUTE on admin_update_recipe_allergens'
  );

  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.admin_update_recipe_facts(uuid,text[],text[])', 'execute'),
    'expected anon to be denied EXECUTE on admin_update_recipe_facts'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.admin_update_recipe_facts(uuid,text[],text[])', 'execute'),
    'expected authenticated to be denied EXECUTE on admin_update_recipe_facts'
  );
  perform pg_temp.assert(
    has_function_privilege('service_role', 'public.admin_update_recipe_facts(uuid,text[],text[])', 'execute'),
    'expected service_role to keep EXECUTE on admin_update_recipe_facts'
  );

  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.admin_update_ingredient_nutrition(uuid,text,text,numeric,text,text,text)', 'execute'),
    'expected anon to be denied EXECUTE on admin_update_ingredient_nutrition'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.admin_update_ingredient_nutrition(uuid,text,text,numeric,text,text,text)', 'execute'),
    'expected authenticated to be denied EXECUTE on admin_update_ingredient_nutrition'
  );
  perform pg_temp.assert(
    has_function_privilege('service_role', 'public.admin_update_ingredient_nutrition(uuid,text,text,numeric,text,text,text)', 'execute'),
    'expected service_role to keep EXECUTE on admin_update_ingredient_nutrition'
  );
end;
$$;

-- ===================================================================================================
-- (3) Negative — anon/authenticated cannot actually call the RPCs (not just has_function_privilege
--     on paper), same "prove it at the DB level, not just via the catalog" convention t4a2 uses.
-- ===================================================================================================
create or replace function pg_temp.try_call_as(role_name text, ok out boolean)
returns boolean
language plpgsql
as $$
begin
  ok := false;
  execute format('set role %I', role_name);
  begin
    perform public.admin_update_recipe_allergens('00000000-0000-0000-0000-0000000000f1'::uuid, array['gluten']::text[], true);
  exception when insufficient_privilege then
    ok := true;
  end;
  reset role;
end;
$$;

do $$
begin
  perform pg_temp.assert(
    (select ok from pg_temp.try_call_as('anon')),
    'expected anon to be denied EXECUTE calling admin_update_recipe_allergens for real'
  );
  perform pg_temp.assert(
    (select ok from pg_temp.try_call_as('authenticated')),
    'expected authenticated to be denied EXECUTE calling admin_update_recipe_allergens for real'
  );
end;
$$;

-- ===================================================================================================
-- (4) View content — as service_role, admin_recipe_quality_overview surfaces the fixture recipe
--     with the right completeness/quality flags.
-- ===================================================================================================
set role service_role;
do $$
declare v public.admin_recipe_quality_overview%rowtype;
begin
  select * into v from public.admin_recipe_quality_overview
  where id = '00000000-0000-0000-0000-0000000000f1';

  perform pg_temp.assert(v.id is not null, 'expected the fixture recipe to appear in the overview (published/public)');
  perform pg_temp.assert(v.has_equipment = true, 'expected has_equipment = true (required_equipment is non-empty)');
  perform pg_temp.assert(v.allergens_reviewed_state = true, 'expected allergens_reviewed_state = true (allergen_labels is not null)');
  perform pg_temp.assert(v.allergens_reviewed = true, 'expected allergens_reviewed = true from the fixture');
  perform pg_temp.assert(v.ingredient_count = 2, format('expected ingredient_count = 2, got %s', v.ingredient_count));
  perform pg_temp.assert(
    v.unresolved_ingredient_count = 1,
    format('expected unresolved_ingredient_count = 1 (the free-text bulgur row), got %s', v.unresolved_ingredient_count)
  );
end;
$$;
reset role;

-- ===================================================================================================
-- (5) admin_update_recipe_allergens — valid write, then CHECK-constraint (taxonomy) rejection.
-- ===================================================================================================
set role service_role;
select public.admin_update_recipe_allergens(
  '00000000-0000-0000-0000-0000000000f1'::uuid, array['gluten', 'laktoz'], true
);
reset role;

do $$
declare r public.recipes%rowtype;
begin
  select * into r from public.recipes where id = '00000000-0000-0000-0000-0000000000f1';
  perform pg_temp.assert(
    r.allergen_labels = array['gluten', 'laktoz'],
    format('expected allergen_labels = {gluten,laktoz}, got %s', r.allergen_labels)
  );
  perform pg_temp.assert(r.allergens_reviewed = true, 'expected allergens_reviewed = true');
  perform pg_temp.assert(r.allergens_reviewed_at is not null, 'expected allergens_reviewed_at to be set');
end;
$$;

do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_recipe_allergens('00000000-0000-0000-0000-0000000000f1'::uuid, array['not-a-real-allergen'], true);
  exception when others then
    if sqlerrm like 'ADMIN_UPDATE_ALLERGENS_INVALID_LABELS%' then
      v_raised := true;
    else
      raise;
    end if;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected an out-of-taxonomy allergen slug to be rejected');
end;
$$;

-- ===================================================================================================
-- (6) admin_update_recipe_facts — valid write, then equipment-taxonomy rejection, then
--     diet_tags-hygiene rejection (empty string element).
-- ===================================================================================================
set role service_role;
select public.admin_update_recipe_facts(
  '00000000-0000-0000-0000-0000000000f1'::uuid, array['firin', 'ozel-ekipman-gerekmiyor'], array['vegan', 'vejetaryen']
);
reset role;

do $$
declare r public.recipes%rowtype;
begin
  select * into r from public.recipes where id = '00000000-0000-0000-0000-0000000000f1';
  perform pg_temp.assert(
    r.required_equipment = array['firin', 'ozel-ekipman-gerekmiyor'],
    format('expected required_equipment = {firin,ozel-ekipman-gerekmiyor}, got %s', r.required_equipment)
  );
  perform pg_temp.assert(
    r.diet_tags = array['vegan', 'vejetaryen'],
    format('expected diet_tags = {vegan,vejetaryen}, got %s', r.diet_tags)
  );
end;
$$;

do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_recipe_facts('00000000-0000-0000-0000-0000000000f1'::uuid, array['not-a-real-equipment'], array['vejetaryen']);
  exception when others then
    if sqlerrm like 'ADMIN_UPDATE_FACTS_INVALID_EQUIPMENT%' then
      v_raised := true;
    else
      raise;
    end if;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected an out-of-taxonomy equipment value to be rejected');
end;
$$;

do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_recipe_facts('00000000-0000-0000-0000-0000000000f1'::uuid, array['firin'], array['vejetaryen', '']);
  exception when others then
    if sqlerrm like 'ADMIN_UPDATE_FACTS_INVALID_DIET_TAGS%' then
      v_raised := true;
    else
      raise;
    end if;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected an empty-string diet_tags element to be rejected');
end;
$$;

-- ===================================================================================================
-- (7) admin_update_ingredient_nutrition — valid write DOES NOT itself call
--     calculate_recipe_nutrition (per the migration's own design), but recipe_ingredients' real
--     T4-B AFTER UPDATE STATEMENT trigger fires anyway, as a side effect of this RPC's plain
--     UPDATE — proven by a real, non-null nutrition_calculated_at change plus a real calories
--     figure now present (crop_nutrition row seeded above), not just a timestamp bump.
-- ===================================================================================================
do $$
declare
  v_before timestamptz;
  v_after timestamptz;
  v_calories numeric;
begin
  -- The fixture INSERT of the 'domates' ingredient (01_assertions.sql, above) already fired the
  -- T4-B AFTER INSERT STATEMENT trigger once (crop_nutrition already had a 'domates' row seeded
  -- by then), so nutrition_calculated_at is already non-null here — pg_sleep(1) guarantees a
  -- strictly later, distinguishable timestamp() from this test's own UPDATE below (the two could
  -- otherwise land in the same microsecond and look like "no change" by coincidence, not because
  -- the trigger didn't fire).
  select nutrition_calculated_at into v_before from public.recipes where id = '00000000-0000-0000-0000-0000000000f1';
  perform pg_temp.assert(v_before is not null, 'expected nutrition_calculated_at to already be set from the fixture insert');
  perform pg_sleep(1);

  set role service_role;
  perform public.admin_update_ingredient_nutrition(
    '00000000-0000-0000-0000-0000000000f2'::uuid, 'domates', null, 400, 'g', null, null
  );
  reset role;

  select nutrition_calculated_at, calories into v_after, v_calories from public.recipes where id = '00000000-0000-0000-0000-0000000000f1';
  perform pg_temp.assert(
    v_after is not null and v_after > v_before,
    'expected nutrition_calculated_at to advance after admin_update_ingredient_nutrition''s own UPDATE '
    '(recipe_ingredients'' T4-B trigger should have fired calculate_recipe_nutrition automatically, '
    'even though this RPC never calls it itself)'
  );
  perform pg_temp.assert(v_calories is not null and v_calories > 0, format('expected a real computed calories figure, got %s', v_calories));
end;
$$;

-- ===================================================================================================
-- (8) admin_update_ingredient_nutrition — recipe_ingredients' own native constraints still apply:
--     an unknown nutrition_food_key is a real FK violation, and setting both nutrition_food_key
--     and nutrition_exclusion_reason at once is a real CHECK violation. Neither is re-implemented
--     by this RPC — this proves the table's own constraints are what reject them.
-- ===================================================================================================
do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_ingredient_nutrition(
      '00000000-0000-0000-0000-0000000000f3'::uuid, null, 'ince bulgur', 2, 'su_bardagi', 'not-a-real-food-key', null
    );
  exception when foreign_key_violation then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected an unknown nutrition_food_key to raise a real foreign_key_violation');
end;
$$;

do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_ingredient_nutrition(
      '00000000-0000-0000-0000-0000000000f3'::uuid, null, 'ince bulgur', 2, 'su_bardagi', 'bulgur_dry', 'seasoning_to_taste_unquantified'
    );
  exception when check_violation then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(
    v_raised,
    'expected setting both nutrition_food_key and nutrition_exclusion_reason to raise a real check_violation'
  );
end;
$$;

do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_ingredient_nutrition(
      '00000000-0000-0000-0000-0000000000f3'::uuid, null, null, null, null, null, null
    );
  exception when check_violation then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(
    v_raised,
    'expected clearing both crop and free_text_name to raise a real check_violation (recipe_ingredients_name_present)'
  );
end;
$$;

-- ===================================================================================================
-- (9) Not-found — each write RPC raises a clear NOT_FOUND for a nonexistent id, rather than
--     silently no-op'ing.
-- ===================================================================================================
do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_recipe_allergens('00000000-0000-0000-0000-000000000999'::uuid, array['gluten'], true);
  exception when others then
    if sqlerrm like 'ADMIN_UPDATE_ALLERGENS_NOT_FOUND%' then v_raised := true; else raise; end if;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected admin_update_recipe_allergens on a nonexistent recipe to raise NOT_FOUND');
end;
$$;

do $$
declare v_raised boolean := false;
begin
  set role service_role;
  begin
    perform public.admin_update_ingredient_nutrition('00000000-0000-0000-0000-000000000999'::uuid, 'domates', null, 1, 'g', null, null);
  exception when others then
    if sqlerrm like 'ADMIN_UPDATE_INGREDIENT_NOT_FOUND%' then v_raised := true; else raise; end if;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected admin_update_ingredient_nutrition on a nonexistent ingredient to raise NOT_FOUND');
end;
$$;
