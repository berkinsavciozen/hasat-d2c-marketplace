-- T4-A — SQL test suite for the nutrition contract migrations.

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

-- ===================================================================================================
-- (1) crop_nutrition grants: anon/authenticated denied on every privilege after the migration
--     (proving the explicit revoke actually undid the default-privilege grant reproduced in the
--     fixtures); service_role keeps full access.
-- ===================================================================================================

do $$
begin
  perform pg_temp.assert(not has_table_privilege('anon', 'public.crop_nutrition', 'select'), 'expected anon to be denied select on crop_nutrition');
  perform pg_temp.assert(not has_table_privilege('anon', 'public.crop_nutrition', 'insert'), 'expected anon to be denied insert on crop_nutrition');
  perform pg_temp.assert(not has_table_privilege('anon', 'public.crop_nutrition', 'update'), 'expected anon to be denied update on crop_nutrition');
  perform pg_temp.assert(not has_table_privilege('anon', 'public.crop_nutrition', 'delete'), 'expected anon to be denied delete on crop_nutrition');

  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.crop_nutrition', 'select'), 'expected authenticated to be denied select on crop_nutrition');
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.crop_nutrition', 'insert'), 'expected authenticated to be denied insert on crop_nutrition');
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.crop_nutrition', 'update'), 'expected authenticated to be denied update on crop_nutrition');
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.crop_nutrition', 'delete'), 'expected authenticated to be denied delete on crop_nutrition');

  perform pg_temp.assert(has_table_privilege('service_role', 'public.crop_nutrition', 'select'), 'expected service_role to keep select on crop_nutrition');
  perform pg_temp.assert(has_table_privilege('service_role', 'public.crop_nutrition', 'insert'), 'expected service_role to keep insert on crop_nutrition');
  perform pg_temp.assert(has_table_privilege('service_role', 'public.crop_nutrition', 'update'), 'expected service_role to keep update on crop_nutrition');
  perform pg_temp.assert(has_table_privilege('service_role', 'public.crop_nutrition', 'delete'), 'expected service_role to keep delete on crop_nutrition');
end;
$$;

-- Negative: anon/authenticated cannot actually touch the table (not just missing has_table_privilege
-- on paper) -- this is the DB-level mechanism a PostgREST 401/403 rests on, same reasoning as
-- B-2's negative REVOKE test.
do $$
declare
  v_raised boolean := false;
begin
  set role anon;
  begin
    perform 1 from public.crop_nutrition limit 1;
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected anon selecting crop_nutrition directly to raise insufficient_privilege');
end;
$$;

do $$
declare
  v_raised boolean := false;
begin
  set role authenticated;
  begin
    insert into public.crop_nutrition (crop, reference_source, reference_version)
    values ('domates', 'tuber', 'v1');
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected authenticated inserting into crop_nutrition directly to raise insufficient_privilege');
end;
$$;

-- Positive: service_role (the RLS-bypassing admin/service path) can read and write freely.
do $$
begin
  set role service_role;
  insert into public.crop_nutrition (crop, reference_source, reference_version, calories_kcal, protein_g, carbs_g, fat_g)
  values ('domates', 'tuber', 'tuber-2026.1', 18, 0.9, 3.9, 0.2);
  reset role;
  perform pg_temp.assert(
    (select count(*) from public.crop_nutrition where crop = 'domates') = 1,
    'expected service_role insert into crop_nutrition to succeed'
  );
end;
$$;

-- ===================================================================================================
-- (2) recipes_nutrition_consistency_check: positive + negative cases.
-- ===================================================================================================

-- Positive: all nutrition fields null (the "unavailable" state) is accepted.
insert into public.recipes (slug, title, servings)
values ('unavailable-recipe', 'Besin Bilgisi Olmayan Tarif', 4);

-- Positive: all four macros + all five metadata fields present (the "computed" state) is accepted.
insert into public.recipes (
  slug, title, servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
  nutrition_input_hash, nutrition_reference_version
) values (
  'computed-recipe', 'Tam Hesaplanan Tarif', 4, 420, 18.5, 45.2, 15.1, 6.0,
  'computed', 100.00, now(), 'hash-computed-1', 'tuber-2026.1'
);

-- Negative: full macros present but nutrition_source (and the rest of the metadata) is null ->
-- must be rejected. This is exactly the dispatch's own example negative case.
do $$
begin
  begin
    insert into public.recipes (slug, title, calories, protein_g, carbs_g, fat_g)
    values ('bad-full-macros-no-meta', 'Bad', 100, 5, 10, 3);
    perform pg_temp.assert(false, 'expected insert with full macros and null nutrition metadata to violate recipes_nutrition_consistency_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- Negative: metadata fully present but one macro (protein_g) missing -> must be rejected (the
-- literal §2.1 direction: "besin alanları null ise ... hepsi de null olmalı", contrapositive).
do $$
begin
  begin
    insert into public.recipes (
      slug, title, calories, carbs_g, fat_g,
      nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
      nutrition_input_hash, nutrition_reference_version
    ) values (
      'bad-partial-macros-full-meta', 'Bad2', 100, 10, 3,
      'computed', 100.00, now(), 'hash-bad', 'tuber-2026.1'
    );
    perform pg_temp.assert(false, 'expected insert with incomplete macros and full nutrition metadata to violate recipes_nutrition_consistency_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- Sanity: fiber_g and micronutrients are excluded from the consistency rule -- full macros/meta
-- with fiber_g and micronutrients both null must still be accepted.
insert into public.recipes (
  slug, title, calories, protein_g, carbs_g, fat_g,
  nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
  nutrition_input_hash, nutrition_reference_version
) values (
  'computed-no-fiber-no-micro', 'Lifsiz Ama Gecerli', 300, 10, 40, 8,
  'computed', 100.00, now(), 'hash-no-fiber', 'tuber-2026.1'
);

-- ===================================================================================================
-- (3) nutrition_source enum + nutrition_coverage_pct range.
-- ===================================================================================================

do $$
begin
  begin
    insert into public.recipes (
      slug, title, calories, protein_g, carbs_g, fat_g,
      nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
      nutrition_input_hash, nutrition_reference_version
    ) values (
      'bad-source-enum', 'Bad3', 100, 5, 10, 3,
      'guessed', 50.00, now(), 'hash-bad-enum', 'tuber-2026.1'
    );
    perform pg_temp.assert(false, 'expected an unrecognized nutrition_source value to violate recipes_nutrition_source_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (
      slug, title, calories, protein_g, carbs_g, fat_g,
      nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
      nutrition_input_hash, nutrition_reference_version
    ) values (
      'bad-coverage-over-100', 'Bad4', 100, 5, 10, 3,
      'computed', 100.01, now(), 'hash-bad-cov1', 'tuber-2026.1'
    );
    perform pg_temp.assert(false, 'expected nutrition_coverage_pct > 100 to violate recipes_nutrition_coverage_pct_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (
      slug, title, calories, protein_g, carbs_g, fat_g,
      nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
      nutrition_input_hash, nutrition_reference_version
    ) values (
      'bad-coverage-negative', 'Bad5', 100, 5, 10, 3,
      'estimated', -0.01, now(), 'hash-bad-cov2', 'tuber-2026.1'
    );
    perform pg_temp.assert(false, 'expected a negative nutrition_coverage_pct to violate recipes_nutrition_coverage_pct_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- Boundary values 0 and 100 are both valid.
insert into public.recipes (
  slug, title, calories, protein_g, carbs_g, fat_g,
  nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
  nutrition_input_hash, nutrition_reference_version
) values (
  'coverage-boundary-0', 'Sinir Deger Sifir', 250, 8, 30, 9,
  'estimated', 0.00, now(), 'hash-cov-0', 'tuber-2026.1'
);

insert into public.recipes (
  slug, title, calories, protein_g, carbs_g, fat_g,
  nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
  nutrition_input_hash, nutrition_reference_version
) values (
  'coverage-boundary-100', 'Sinir Deger Yuz', 250, 8, 30, 9,
  'computed', 100.00, now(), 'hash-cov-100', 'tuber-2026.1'
);

-- ===================================================================================================
-- (4) micronutrients v1 shape: positive + negative cases.
-- ===================================================================================================

-- Positive: fully valid shape, all six values present.
insert into public.recipes (slug, title, micronutrients)
values ('micro-valid-full', 'Mikro Tam', '{
  "schema_version": 1,
  "basis": "per_serving",
  "values": {
    "sodium_mg": 120,
    "potassium_mg": 300,
    "calcium_mg": 40,
    "iron_mg": 1.2,
    "vitamin_c_mg": 15,
    "vitamin_a_mcg_rae": 90
  }
}'::jsonb);

-- Positive: fully valid shape, values object empty (all six keys optional).
insert into public.recipes (slug, title, micronutrients)
values ('micro-valid-empty-values', 'Mikro Bos Values', '{"schema_version": 1, "basis": "per_serving", "values": {}}'::jsonb);

-- Positive: null micronutrients remains valid (not calculated).
insert into public.recipes (slug, title, micronutrients)
values ('micro-null', 'Mikro Yok', null);

do $$
begin
  begin
    insert into public.recipes (slug, title, micronutrients)
    values ('micro-bad-missing-schema-version', 'Bad', '{"basis": "per_serving", "values": {}}'::jsonb);
    perform pg_temp.assert(false, 'expected micronutrients missing schema_version to violate recipes_micronutrients_v1_check');
  exception when check_violation then
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (slug, title, micronutrients)
    values ('micro-bad-schema-version-string', 'Bad', '{"schema_version": "1", "basis": "per_serving", "values": {}}'::jsonb);
    perform pg_temp.assert(false, 'expected micronutrients with schema_version as a JSON string to violate recipes_micronutrients_v1_check');
  exception when check_violation then
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (slug, title, micronutrients)
    values ('micro-bad-basis', 'Bad', '{"schema_version": 1, "basis": "per_100g", "values": {}}'::jsonb);
    perform pg_temp.assert(false, 'expected micronutrients with a non-per_serving basis to violate recipes_micronutrients_v1_check');
  exception when check_violation then
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (slug, title, micronutrients)
    values ('micro-bad-unknown-top-key', 'Bad', '{"schema_version": 1, "basis": "per_serving", "values": {}, "extra": true}'::jsonb);
    perform pg_temp.assert(false, 'expected micronutrients with an unknown top-level key to violate recipes_micronutrients_v1_check');
  exception when check_violation then
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (slug, title, micronutrients)
    values ('micro-bad-unknown-value-key', 'Bad', '{"schema_version": 1, "basis": "per_serving", "values": {"zinc_mg": 5}}'::jsonb);
    perform pg_temp.assert(false, 'expected micronutrients with an unrecognized values key to violate recipes_micronutrients_v1_check');
  exception when check_violation then
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (slug, title, micronutrients)
    values ('micro-bad-negative-value', 'Bad', '{"schema_version": 1, "basis": "per_serving", "values": {"sodium_mg": -1}}'::jsonb);
    perform pg_temp.assert(false, 'expected micronutrients with a negative value to violate recipes_micronutrients_v1_check');
  exception when check_violation then
  end;
end;
$$;

do $$
begin
  begin
    insert into public.recipes (slug, title, micronutrients)
    values ('micro-bad-string-value', 'Bad', '{"schema_version": 1, "basis": "per_serving", "values": {"sodium_mg": "120"}}'::jsonb);
    perform pg_temp.assert(false, 'expected micronutrients with a numeric value encoded as a JSON string to violate recipes_micronutrients_v1_check');
  exception when check_violation then
  end;
end;
$$;

-- ===================================================================================================
-- (5) The four required fixture states (04.12 Bölüm 4 gate acceptance criterion): computed,
--     partial, estimated, unavailable. Inserted as their own named rows and asserted directly, on
--     top of the states already exercised above.
-- ===================================================================================================

-- computed: full deterministic coverage, all macros + metadata present.
insert into public.recipes (
  slug, title, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients,
  nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
  nutrition_input_hash, nutrition_reference_version
) values (
  'fixture-computed', 'Fixture: Computed', 520, 22.0, 60.0, 18.0, 7.5,
  '{"schema_version": 1, "basis": "per_serving", "values": {"sodium_mg": 400, "iron_mg": 2.1}}'::jsonb,
  'computed', 100.00, now(), 'fixture-hash-computed', 'tuber-2026.1'
);

-- partial: deterministic coverage strictly between 0 and 100, gap filled by estimate; macros are
-- still fully populated (the calculation succeeded, just not 100% deterministically).
insert into public.recipes (
  slug, title, calories, protein_g, carbs_g, fat_g, fiber_g,
  nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
  nutrition_input_hash, nutrition_reference_version, nutrition_warnings
) values (
  'fixture-partial', 'Fixture: Partial', 380, 14.0, 50.0, 12.0, 4.0,
  'partial', 62.50, now(), 'fixture-hash-partial', 'tuber-2026.1', array['estimated_quantity']
);

-- estimated: 0% deterministic coverage, result entirely estimated; macros still populated.
insert into public.recipes (
  slug, title, calories, protein_g, carbs_g, fat_g,
  nutrition_source, nutrition_coverage_pct, nutrition_calculated_at,
  nutrition_input_hash, nutrition_reference_version, nutrition_warnings
) values (
  'fixture-estimated', 'Fixture: Estimated', 300, 10.0, 40.0, 9.0,
  'estimated', 0.00, now(), 'fixture-hash-estimated', 'tuber-2026.1', array['unmatched_ingredient']
);

-- unavailable: no calculation has ever succeeded -- every nutrition field is null.
insert into public.recipes (slug, title, servings)
values ('fixture-unavailable', 'Fixture: Unavailable', 2);

do $$
declare
  r record;
begin
  select * into r from public.recipes where slug = 'fixture-computed';
  perform pg_temp.assert(r.nutrition_source = 'computed', 'fixture-computed: expected nutrition_source = computed');
  perform pg_temp.assert(r.nutrition_coverage_pct = 100.00, 'fixture-computed: expected coverage = 100');
  perform pg_temp.assert(r.calories is not null and r.protein_g is not null and r.carbs_g is not null and r.fat_g is not null, 'fixture-computed: expected all macros present');

  select * into r from public.recipes where slug = 'fixture-partial';
  perform pg_temp.assert(r.nutrition_source = 'partial', 'fixture-partial: expected nutrition_source = partial');
  perform pg_temp.assert(r.nutrition_coverage_pct > 0 and r.nutrition_coverage_pct < 100, 'fixture-partial: expected 0 < coverage < 100');

  select * into r from public.recipes where slug = 'fixture-estimated';
  perform pg_temp.assert(r.nutrition_source = 'estimated', 'fixture-estimated: expected nutrition_source = estimated');
  perform pg_temp.assert(r.nutrition_coverage_pct = 0.00, 'fixture-estimated: expected coverage = 0');
  perform pg_temp.assert(r.calories is not null, 'fixture-estimated: expected macros still populated (best-effort estimate, not null)');

  select * into r from public.recipes where slug = 'fixture-unavailable';
  perform pg_temp.assert(
    r.calories is null and r.protein_g is null and r.carbs_g is null and r.fat_g is null
    and r.fiber_g is null and r.micronutrients is null
    and r.nutrition_source is null and r.nutrition_coverage_pct is null
    and r.nutrition_calculated_at is null and r.nutrition_input_hash is null
    and r.nutrition_reference_version is null,
    'fixture-unavailable: expected every nutrition field to be null'
  );
end;
$$;

\echo 'T4-A nutrition contract SQL test suite: ALL ASSERTIONS PASSED'
