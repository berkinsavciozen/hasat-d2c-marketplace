-- F0-24/T4-B — SQL test suite for the recipe_ingredients/recipes.servings nutrition recalc
-- trigger migration (20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql).

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
-- f024_nutrition_calc_engine/01_assertions.sql uses. Per 100g: 20 kcal / 1g protein / 4g carbs /
-- 0g fat / 1g fiber — hand-computable numbers, same as f024's own suite.
set role service_role;
insert into public.crop_nutrition
  (crop, reference_source, reference_version, calories_kcal, protein_g, carbs_g, fat_g, fiber_g)
values
  ('domates', 'usda', 'test-v1', 20, 1, 4, 0, 1);
reset role;

-- ===================================================================================================
-- (a) authenticated INSERT into recipe_ingredients on the caller's OWN recipe fires the trigger and
--     recalculates recipes.nutrition_* — dispatch acceptance criterion #2 (INSERT half).
-- ===================================================================================================

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_calories numeric;
  v_source text;
  v_calculated_at timestamptz;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.recipes (slug, title, servings, owner_id)
  values ('recipe-a-insert', 'Test A - Insert', 2, v_owner)
  returning id into v_recipe_id;

  insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
  values (v_recipe_id, 1, 'domates', 300, 'g');

  reset role;

  select calories, nutrition_source, nutrition_calculated_at
    into v_calories, v_source, v_calculated_at
    from public.recipes where id = v_recipe_id;

  -- 300g domates @ 20kcal/100g = 60kcal total / 2 servings = 30kcal/serving.
  perform pg_temp.assert_eq(v_calories, 30, '(a) expected calories = 30 after authenticated INSERT');
  perform pg_temp.assert(v_source = 'computed', '(a) expected nutrition_source = computed (full match)');
  perform pg_temp.assert(v_calculated_at is not null, '(a) expected nutrition_calculated_at to be set');
end;
$$;

-- ===================================================================================================
-- (b) authenticated UPDATE of recipe_ingredients fires the trigger too — acceptance criterion #2
--     (UPDATE half).
-- ===================================================================================================

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_calories numeric;
begin
  select id into v_recipe_id from public.recipes where slug = 'recipe-a-insert';

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  update public.recipe_ingredients set quantity = 400 where recipe_id = v_recipe_id;

  reset role;

  select calories into v_calories from public.recipes where id = v_recipe_id;

  -- 400g domates @ 20kcal/100g = 80kcal total / 2 servings = 40kcal/serving.
  perform pg_temp.assert_eq(v_calories, 40, '(b) expected calories = 40 after authenticated UPDATE');
end;
$$;

-- ===================================================================================================
-- (c) authenticated DELETE of recipe_ingredients fires the trigger and correctly reaches the
--     "unavailable" (all-null) state once no ingredient remains — acceptance criterion #2
--     (DELETE half).
-- ===================================================================================================

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_calories numeric;
  v_source text;
begin
  select id into v_recipe_id from public.recipes where slug = 'recipe-a-insert';

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  delete from public.recipe_ingredients where recipe_id = v_recipe_id;

  reset role;

  select calories, nutrition_source into v_calories, v_source from public.recipes where id = v_recipe_id;

  perform pg_temp.assert(v_calories is null, '(c) expected calories = null after deleting the only ingredient');
  perform pg_temp.assert(v_source is null, '(c) expected nutrition_source = null (unavailable state)');
end;
$$;

-- ===================================================================================================
-- (d) recipes.servings: fires on a real servings change, does NOT fire on an unrelated column
--     change (e.g. title) — acceptance criterion #3.
-- ===================================================================================================

-- Three SEPARATE top-level statements/transactions on purpose (not one do-block): now() is frozen
-- for the lifetime of a single transaction, so the nutrition_calculated_at "did it actually
-- advance" comparisons below need a genuinely later transaction to be meaningful.

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_calories numeric;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.recipes (slug, title, servings, owner_id)
  values ('recipe-d-servings', 'Test D - Servings', 2, v_owner)
  returning id into v_recipe_id;

  insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
  values (v_recipe_id, 1, 'domates', 100, 'g');

  reset role;

  select calories into v_calories from public.recipes where id = v_recipe_id;
  -- 100g @ 20kcal/100g = 20kcal / 2 servings = 10kcal/serving.
  perform pg_temp.assert_eq(v_calories, 10, '(d) sanity: expected calories = 10 before any servings edit');
end;
$$;

-- (d.1) title-only edit must NOT recalculate.
do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_calories numeric;
  v_calculated_at_before timestamptz;
  v_calculated_at_after timestamptz;
begin
  select id, nutrition_calculated_at into v_recipe_id, v_calculated_at_before
    from public.recipes where slug = 'recipe-d-servings';

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  update public.recipes set title = 'Test D - Renamed' where id = v_recipe_id;
  reset role;

  select calories, nutrition_calculated_at into v_calories, v_calculated_at_after
    from public.recipes where id = v_recipe_id;
  perform pg_temp.assert_eq(v_calories, 10, '(d.1) expected calories unchanged after a title-only edit');
  perform pg_temp.assert(
    v_calculated_at_after = v_calculated_at_before,
    '(d.1) expected nutrition_calculated_at unchanged after a title-only edit (WHEN clause must not fire)'
  );
end;
$$;

-- (d.2) a real servings edit MUST recalculate.
do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_calories numeric;
  v_calculated_at_before timestamptz;
  v_calculated_at_after timestamptz;
begin
  select id, nutrition_calculated_at into v_recipe_id, v_calculated_at_before
    from public.recipes where slug = 'recipe-d-servings';

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  update public.recipes set servings = 4 where id = v_recipe_id;
  reset role;

  select calories, nutrition_calculated_at into v_calories, v_calculated_at_after
    from public.recipes where id = v_recipe_id;
  -- Same 20kcal total, now divided by 4 servings = 5kcal/serving.
  perform pg_temp.assert_eq(v_calories, 5, '(d.2) expected calories = 5 after servings changed 2 -> 4');
  perform pg_temp.assert(
    v_calculated_at_after > v_calculated_at_before,
    '(d.2) expected nutrition_calculated_at to advance after a real servings edit'
  );
end;
$$;

-- ===================================================================================================
-- (e) cascade delete: deleting the parent recipe cascades to recipe_ingredients, whose AFTER DELETE
--     trigger then targets a recipe_id that no longer exists (calculate_recipe_nutrition raises
--     "recipe % not found" for it, per this migration's own discovery note #3) -- the caller's
--     DELETE must still succeed without error. Acceptance criterion #3 (safe no-op for a deleted
--     recipe).
-- ===================================================================================================

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_recipe_count integer;
  v_ingredient_count integer;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.recipes (slug, title, servings, owner_id)
  values ('recipe-e-cascade', 'Test E - Cascade Delete', 2, v_owner)
  returning id into v_recipe_id;

  insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
  values (v_recipe_id, 1, 'domates', 100, 'g');

  -- This DELETE, if the cascaded recipe_ingredients trigger's "recipe not found" exception ever
  -- escaped fn_recalc_recipe_nutrition_ids's per-id handler, would itself raise here and fail this
  -- whole do-block (ON_ERROR_STOP is on) -- reaching the assertions below IS the proof it didn't.
  delete from public.recipes where id = v_recipe_id;

  reset role;

  select count(*) into v_recipe_count from public.recipes where id = v_recipe_id;
  select count(*) into v_ingredient_count from public.recipe_ingredients where recipe_id = v_recipe_id;

  perform pg_temp.assert(v_recipe_count = 0, '(e) expected the recipe to actually be deleted');
  perform pg_temp.assert(v_ingredient_count = 0, '(e) expected the cascade to remove its recipe_ingredients rows too');
end;
$$;

-- ===================================================================================================
-- (f) a recalc failure must never break the caller's own write -- dispatch requirement #4.2 /
--     acceptance criterion #6. Injected by temporarily adding a CHECK constraint to `recipes` that
--     calculate_recipe_nutrition's own UPDATE will violate, while leaving recipe_ingredients (a
--     different table) completely unaffected.
-- ===================================================================================================

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_ingredient_count integer;
  v_calories numeric;
begin
  alter table public.recipes
    add constraint f024t4b_probe_break_calc check (calories is null or calories < -999999) not valid;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.recipes (slug, title, servings, owner_id)
  values ('recipe-f-injected-failure', 'Test F - Injected Failure', 2, v_owner)
  returning id into v_recipe_id;

  -- The trigger's calculate_recipe_nutrition call will now fail (check_violation on its own
  -- UPDATE) every time -- this INSERT must still succeed.
  insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit)
  values (v_recipe_id, 1, 'domates', 100, 'g');

  reset role;

  alter table public.recipes drop constraint f024t4b_probe_break_calc;

  select count(*) into v_ingredient_count from public.recipe_ingredients where recipe_id = v_recipe_id;
  select calories into v_calories from public.recipes where id = v_recipe_id;

  perform pg_temp.assert(
    v_ingredient_count = 1,
    '(f) expected the user''s recipe_ingredients INSERT to succeed despite the recalc failing'
  );
  perform pg_temp.assert(
    v_calories is null,
    '(f) expected calories to remain null: the failed recalc''s own UPDATE must not have partially applied'
  );
end;
$$;

-- ===================================================================================================
-- (g) grant regression -- acceptance criterion #7, plus this migration's own new non-trigger
--     function. Note: a plain local Postgres has no equivalent of Supabase's project-level default
--     ACL (which separately auto-grants EXECUTE to anon/authenticated/service_role on every new
--     `public` function, on top of whatever `revoke ... from public` says -- see this migration's
--     own header discovery #4 and 20260909123000_f024b's history). This suite can only prove this
--     migration's own explicit revokes are present; the true regression proof against that
--     Supabase-specific default-ACL behavior is the live verification run against the real project
--     (see PR description), not this local suite.
-- ===================================================================================================

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.calculate_recipe_nutrition(uuid)', 'execute'),
    '(g) expected authenticated to still lack EXECUTE on calculate_recipe_nutrition'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.calculate_recipe_nutrition(uuid)', 'execute'),
    '(g) expected anon to still lack EXECUTE on calculate_recipe_nutrition'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.fn_recalc_recipe_nutrition_ids(uuid[])', 'execute'),
    '(g) expected authenticated to lack EXECUTE on the new fn_recalc_recipe_nutrition_ids helper'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.fn_recalc_recipe_nutrition_ids(uuid[])', 'execute'),
    '(g) expected anon to lack EXECUTE on the new fn_recalc_recipe_nutrition_ids helper'
  );
  perform pg_temp.assert(
    not has_function_privilege('service_role', 'public.fn_recalc_recipe_nutrition_ids(uuid[])', 'execute'),
    '(g) expected service_role to lack EXECUTE on the new fn_recalc_recipe_nutrition_ids helper (postgres-only)'
  );
end;
$$;

-- ===================================================================================================
-- (h) multi-row / single-statement dedup -- dispatch requirement #3 / acceptance criterion #5: a
--     single multi-row INSERT/UPDATE/DELETE touching N rows of the SAME recipe must call
--     calculate_recipe_nutrition exactly once per statement, not N times. Proven by temporarily
--     interposing a call-counting probe in front of the real function (renamed aside, not modified)
--     -- restored to its original name/definition before this block ends.
-- ===================================================================================================

do $$
begin
  alter function public.calculate_recipe_nutrition(uuid)
    rename to calculate_recipe_nutrition_f024t4b_real;

  create table public.f024t4b_recalc_probe (
    recipe_id uuid not null,
    called_at timestamptz not null default clock_timestamp()
  );

  create function public.calculate_recipe_nutrition(p_recipe_id uuid)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
  as $probe$
  begin
    insert into public.f024t4b_recalc_probe (recipe_id) values (p_recipe_id);
    perform public.calculate_recipe_nutrition_f024t4b_real(p_recipe_id);
  end;
  $probe$;
end;
$$;

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_recipe_id uuid;
  v_calls integer;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.recipes (slug, title, servings, owner_id)
  values ('recipe-h-multirow', 'Test H - Multi Row', 2, v_owner)
  returning id into v_recipe_id;

  -- One multi-row INSERT (3 rows, same recipe, same statement).
  insert into public.recipe_ingredients (recipe_id, sort_order, crop, quantity, unit) values
    (v_recipe_id, 1, 'domates', 100, 'g'),
    (v_recipe_id, 2, 'domates', 100, 'g'),
    (v_recipe_id, 3, 'domates', 100, 'g');

  -- One multi-row UPDATE (all 3 rows, same statement).
  update public.recipe_ingredients set note = 'bulk-updated' where recipe_id = v_recipe_id;

  -- One multi-row DELETE (all 3 rows, same statement).
  delete from public.recipe_ingredients where recipe_id = v_recipe_id;

  reset role;

  select count(*) into v_calls from public.f024t4b_recalc_probe where recipe_id = v_recipe_id;

  perform pg_temp.assert(
    v_calls = 3,
    format('(h) expected exactly 3 recalc calls (one per statement: insert, update, delete), got %s', v_calls)
  );
end;
$$;

do $$
begin
  drop function public.calculate_recipe_nutrition(uuid);
  alter function public.calculate_recipe_nutrition_f024t4b_real(uuid)
    rename to calculate_recipe_nutrition;
  drop table public.f024t4b_recalc_probe;
end;
$$;

select '==> F0-24/T4-B recipe nutrition trigger SQL test suite: ALL ASSERTIONS PASSED' as result;
