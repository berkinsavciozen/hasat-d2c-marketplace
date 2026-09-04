-- T4-A — Nutrition contract, part 1: the 5 missing `recipes` nutrition columns + the
-- macro/metadata consistency CHECK + the micronutrients v1 shape CHECK.
--
-- Canonical doc: `04.12 — T3/T4 Veri Sözleşmesi v1.0`, Bölüm 2 (T4 besin değeri sözleşmesi),
-- independently audited (APPROVED WITH REQUIRED CHANGES). Live schema re-verified this round
-- (see PR description): `recipes` already has `calories`, `protein_g`, `carbs_g`, `fat_g`,
-- `fiber_g` (all numeric, nullable) and `micronutrients` (jsonb, nullable) and
-- `nutrition_calculated_at` (timestamptz, nullable) — those are untouched here. This migration
-- only adds the 5 columns §2.1's table lists as missing, plus the two CHECK constraints §2.1/§2.2
-- require and the gate acceptance criteria call out explicitly ("nutrition_source ile coverage
-- birbirini çelişmeyecek biçimde doğrulayan constraint/testlere sahip").
--
-- `allergen_labels` (T3, already live) is deliberately NOT touched — out of scope for this
-- dispatch (T3-A is next in the Claude lane).

alter table public.recipes
  add column nutrition_source text,
  add column nutrition_coverage_pct numeric(5,2),
  add column nutrition_input_hash text,
  add column nutrition_reference_version text,
  add column nutrition_warnings text[] not null default '{}';

alter table public.recipes
  add constraint recipes_nutrition_source_check
    check (nutrition_source is null or nutrition_source = any (array['computed','partial','estimated']));

alter table public.recipes
  add constraint recipes_nutrition_coverage_pct_check
    check (nutrition_coverage_pct is null or (nutrition_coverage_pct >= 0 and nutrition_coverage_pct <= 100));

comment on column public.recipes.nutrition_source is
  '04.12 §2.1. Only set on a successful calculation: computed (100% deterministic coverage), '
  'partial (0% < coverage < 100%, gap filled by estimate), estimated (0% deterministic coverage). '
  'Null together with the other nutrition_* metadata columns whenever the macro fields are '
  'incomplete — see recipes_nutrition_consistency_check.';
comment on column public.recipes.nutrition_coverage_pct is
  '04.12 §2.1. Weight-based (edible grams matched to a deterministic reference / total edible '
  'grams that entered the calculation), NOT row-count-based. 0..100.';
comment on column public.recipes.nutrition_input_hash is
  '04.12 §2.1. Canonical hash of ingredients+quantities+units+servings+conversion+algorithm '
  'input, for idempotency and stale detection.';
comment on column public.recipes.nutrition_reference_version is
  '04.12 §2.1. Version of the TÜBER/USDA mapping + conversion contract used for this row''s '
  'nutrition values. Drives targeted invalidation sweeps when the reference updates.';
comment on column public.recipes.nutrition_warnings is
  '04.12 §2.1. Controlled codes (estimated_quantity, unmatched_ingredient, low_coverage, '
  'stale_reference, ...) for QA/traceability. Not surfaced in the v1 UI.';

-- ===================================================================================================
-- 04.12 §2.1: "Besin alanları null ise nutrition_source, nutrition_coverage_pct,
-- nutrition_calculated_at, nutrition_input_hash ve nutrition_reference_version da null olmalıdır."
--
-- Implemented as a two-way equality rather than a one-way implication: the four macro columns
-- (calories/protein_g/carbs_g/fat_g) are either ALL present or ALL absent, and that must match
-- whether the five nutrition_* metadata columns are ALL present or ALL absent. A one-way
-- implication alone would still let a fully-populated macro row carry a null nutrition_source
-- (metadata silently missing for a "successful" calculation) — the gate acceptance criterion
-- ("nutrition_source ile coverage birbirini çelişmeyecek biçimde doğrulayan constraint") and this
-- dispatch's own negative-test example (full macros + nutrition_source null -> reject) both call
-- for rejecting that state too, so this constraint checks both directions at once.
--
-- fiber_g and micronutrients are deliberately excluded per the dispatch: they may be independently
-- null even when the four required macros and all nutrition_* metadata are present.
-- ===================================================================================================
alter table public.recipes
  add constraint recipes_nutrition_consistency_check
    check (
      (calories is not null and protein_g is not null and carbs_g is not null and fat_g is not null)
      =
      (nutrition_source is not null and nutrition_coverage_pct is not null
       and nutrition_calculated_at is not null and nutrition_input_hash is not null
       and nutrition_reference_version is not null)
    );

-- ===================================================================================================
-- 04.12 §2.2: micronutrients JSON v1 shape validator.
--   { "schema_version": 1, "basis": "per_serving", "values": { <=6 known keys, each a
--     non-negative JSON number } }
-- A JSON number literal can never encode NaN/Infinity (the JSON grammar has no token for them and
-- jsonb's parser rejects anything that isn't a valid JSON number), so "finite" is already
-- structurally guaranteed by jsonb_typeof(v) = 'number' below — no separate finiteness check is
-- needed. A number-as-string (e.g. "12") is rejected by the same typeof check, per §2.2 ("sayı
-- string'i ... kabul edilmez").
-- ===================================================================================================
create or replace function public.is_valid_recipe_micronutrients_v1(p jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  allowed_top text[] := array['schema_version','basis','values'];
  allowed_value_keys text[] := array[
    'sodium_mg','potassium_mg','calcium_mg','iron_mg','vitamin_c_mg','vitamin_a_mcg_rae'
  ];
  k text;
  v jsonb;
begin
  if p is null then
    return true;
  end if;

  if jsonb_typeof(p) is distinct from 'object' then
    return false;
  end if;

  for k in select jsonb_object_keys(p) loop
    if not (k = any (allowed_top)) then
      return false;
    end if;
  end loop;

  if jsonb_typeof(p -> 'schema_version') is distinct from 'number' or (p ->> 'schema_version') <> '1' then
    return false;
  end if;

  if jsonb_typeof(p -> 'basis') is distinct from 'string' or (p ->> 'basis') <> 'per_serving' then
    return false;
  end if;

  if not (p ? 'values') or jsonb_typeof(p -> 'values') is distinct from 'object' then
    return false;
  end if;

  for k, v in select * from jsonb_each(p -> 'values') loop
    if not (k = any (allowed_value_keys)) then
      return false;
    end if;
    if jsonb_typeof(v) is distinct from 'number' then
      return false;
    end if;
    if (v #>> '{}')::numeric < 0 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.is_valid_recipe_micronutrients_v1(jsonb) is
  '04.12 §2.2. Validates the versioned micronutrients JSON shape recipes.micronutrients must '
  'hold (null is valid — "not calculated" is represented by SQL NULL, not an empty object).';

alter table public.recipes
  add constraint recipes_micronutrients_v1_check
    check (public.is_valid_recipe_micronutrients_v1(micronutrients));
