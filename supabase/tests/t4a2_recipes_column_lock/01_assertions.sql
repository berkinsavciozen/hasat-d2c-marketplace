-- T4-A2 — SQL test suite for the recipes column-level UPDATE lock migration.
--
-- Run order (see run.sh): 00_fixtures.sql -> the real T4-A migrations (160000, 161000) -> the
-- real T4-A2 migration (170000) -> this file. By the time these assertions run, `recipes` has its
-- full post-T4-A shape (32 original columns + the 5 nutrition_* columns from PR #95) and the
-- column-level REVOKE from 170000 has been applied.

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

insert into public.recipes (id, slug, title, description, servings, owner_id, visibility, status)
values ('00000000-0000-0000-0000-000000000001', 'kilitli-test-tarifi', 'Kilitli Test Tarifi', 'baslangic aciklamasi', 4,
        '00000000-0000-0000-0000-0000000000aa', 'private', 'draft');

-- ===================================================================================================
-- (1) has_column_privilege: authenticated and anon are denied UPDATE on all 13 locked columns;
--     service_role (the RLS-bypassing admin/service path) keeps it.
-- ===================================================================================================

do $$
declare
  locked_cols text[] := array[
    'calories','protein_g','carbs_g','fat_g','fiber_g','micronutrients','nutrition_calculated_at',
    'nutrition_source','nutrition_coverage_pct','nutrition_input_hash','nutrition_reference_version',
    'nutrition_warnings','allergen_labels'
  ];
  c text;
begin
  foreach c in array locked_cols loop
    perform pg_temp.assert(
      not has_column_privilege('authenticated', 'public.recipes', c, 'update'),
      format('expected authenticated to be denied UPDATE on recipes.%I', c)
    );
    perform pg_temp.assert(
      not has_column_privilege('anon', 'public.recipes', c, 'update'),
      format('expected anon to be denied UPDATE on recipes.%I', c)
    );
    perform pg_temp.assert(
      has_column_privilege('service_role', 'public.recipes', c, 'update'),
      format('expected service_role to keep UPDATE on recipes.%I', c)
    );
  end loop;
end;
$$;

-- ===================================================================================================
-- (2) Negative: authenticated actually cannot UPDATE any of the 13 locked columns directly (not
--     just has_column_privilege on paper) -- the DB-level mechanism a PostgREST 401/403 rests on,
--     same reasoning as B-1/B-2/T4-A's own negative REVOKE tests. One representative literal value
--     per column (types differ: numeric, jsonb, text[], timestamptz, text, enum-checked text).
-- ===================================================================================================

create or replace function pg_temp.try_locked_update(colname text, value_sql text)
returns boolean
language plpgsql
as $$
declare
  v_raised boolean := false;
begin
  set role authenticated;
  begin
    execute format(
      'update public.recipes set %I = %s where id = $1',
      colname, value_sql
    ) using '00000000-0000-0000-0000-000000000001'::uuid;
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  return v_raised;
end;
$$;

do $$
begin
  perform pg_temp.assert(pg_temp.try_locked_update('calories', '999'), 'expected authenticated UPDATE of recipes.calories to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('protein_g', '10'), 'expected authenticated UPDATE of recipes.protein_g to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('carbs_g', '10'), 'expected authenticated UPDATE of recipes.carbs_g to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('fat_g', '10'), 'expected authenticated UPDATE of recipes.fat_g to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('fiber_g', '10'), 'expected authenticated UPDATE of recipes.fiber_g to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('micronutrients', $q$'{"schema_version":1,"basis":"per_serving","values":{}}'::jsonb$q$), 'expected authenticated UPDATE of recipes.micronutrients to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('nutrition_calculated_at', 'now()'), 'expected authenticated UPDATE of recipes.nutrition_calculated_at to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('nutrition_source', $q$'computed'$q$), 'expected authenticated UPDATE of recipes.nutrition_source to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('nutrition_coverage_pct', '50.00'), 'expected authenticated UPDATE of recipes.nutrition_coverage_pct to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('nutrition_input_hash', $q$'fake-hash'$q$), 'expected authenticated UPDATE of recipes.nutrition_input_hash to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('nutrition_reference_version', $q$'fake-v1'$q$), 'expected authenticated UPDATE of recipes.nutrition_reference_version to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('nutrition_warnings', $q$array['low_coverage']::text[]$q$), 'expected authenticated UPDATE of recipes.nutrition_warnings to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('allergen_labels', $q$array['gluten']::text[]$q$), 'expected authenticated UPDATE of recipes.allergen_labels to raise insufficient_privilege');
end;
$$;

-- Sanity: none of the locked-column attempts above actually mutated the row (the whole statement
-- aborts on the privilege error, it doesn't silently skip just that column).
do $$
declare
  r record;
begin
  select * into r from public.recipes where id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.assert(r.calories is null, 'expected recipes.calories to remain untouched after the rejected UPDATE attempts');
  perform pg_temp.assert(r.allergen_labels is null, 'expected recipes.allergen_labels to remain untouched after the rejected UPDATE attempts');
  perform pg_temp.assert(r.nutrition_source is null, 'expected recipes.nutrition_source to remain untouched after the rejected UPDATE attempts');
end;
$$;

-- ===================================================================================================
-- (3) Positive regression: authenticated can still UPDATE ordinary, never-locked recipe fields.
--     The lock must be narrow -- it must not break legitimate user editing.
-- ===================================================================================================

do $$
begin
  set role authenticated;
  update public.recipes
    set title = 'Guncellenmis Baslik',
        description = 'guncellenmis aciklama',
        servings = 6,
        prep_minutes = 15,
        cook_minutes = 30,
        cuisine = 'turk',
        difficulty = 'orta',
        cover_photo_url = 'https://example.test/photo.jpg'
    where id = '00000000-0000-0000-0000-000000000001';
  reset role;
end;
$$;

do $$
declare
  r record;
begin
  select * into r from public.recipes where id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.assert(r.title = 'Guncellenmis Baslik', 'expected authenticated to still be able to UPDATE recipes.title');
  perform pg_temp.assert(r.description = 'guncellenmis aciklama', 'expected authenticated to still be able to UPDATE recipes.description');
  perform pg_temp.assert(r.servings = 6, 'expected authenticated to still be able to UPDATE recipes.servings');
  perform pg_temp.assert(r.prep_minutes = 15, 'expected authenticated to still be able to UPDATE recipes.prep_minutes');
  perform pg_temp.assert(r.cook_minutes = 30, 'expected authenticated to still be able to UPDATE recipes.cook_minutes');
  perform pg_temp.assert(r.cuisine = 'turk', 'expected authenticated to still be able to UPDATE recipes.cuisine');
  perform pg_temp.assert(r.difficulty = 'orta', 'expected authenticated to still be able to UPDATE recipes.difficulty');
  perform pg_temp.assert(r.cover_photo_url = 'https://example.test/photo.jpg', 'expected authenticated to still be able to UPDATE recipes.cover_photo_url');
end;
$$;

-- ===================================================================================================
-- (4) service_role (the admin/nutrition-engine path) can still write the locked columns freely --
--     the lock only narrows `authenticated`/`anon`, never the service path.
-- ===================================================================================================

do $$
begin
  set role service_role;
  update public.recipes
    set calories = 420, protein_g = 18.5, carbs_g = 45.2, fat_g = 15.1, fiber_g = 6.0,
        nutrition_source = 'computed', nutrition_coverage_pct = 100.00, nutrition_calculated_at = now(),
        nutrition_input_hash = 'hash-1', nutrition_reference_version = 'tuber-2026.1',
        allergen_labels = array['gluten','laktoz']
    where id = '00000000-0000-0000-0000-000000000001';
  reset role;
end;
$$;

do $$
declare
  r record;
begin
  select * into r from public.recipes where id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.assert(r.calories = 420, 'expected service_role to still be able to UPDATE recipes.calories');
  perform pg_temp.assert(r.nutrition_source = 'computed', 'expected service_role to still be able to UPDATE recipes.nutrition_source');
  perform pg_temp.assert(r.allergen_labels = array['gluten','laktoz'], 'expected service_role to still be able to UPDATE recipes.allergen_labels');
end;
$$;

\echo 'T4-A2 recipes column-level UPDATE lock SQL test suite: ALL ASSERTIONS PASSED'
