-- F0-24 — Deterministic recipe nutrition calculation engine.
--
-- Closes the gap left by T4-A (PR #95/#96→#97, live): `crop_nutrition` + `recipes.nutrition_*`
-- exist, but nothing ever computed a value into them and `crop_nutrition` was empty. That gap was
-- explicitly out of scope for T4-A per rule #107 (2026-09-04 dispatch) and unassigned since.
--
-- Two new functions:
--   1. `fn_recipe_ingredient_grams(crop, quantity, unit)` — normalizes one recipe_ingredients row's
--      quantity+unit to grams. Deliberately the SAME two-step pattern `fn_culinary_to_canonical`
--      (20260819150000_f2s04_recipe_validation_rpcs.sql via `rpc_recipe_shopping_list`) already
--      uses to reach its intermediate "gram/millilitre base value" (v_base): metric units first
--      (g/gr/gram/kg/ml/l/lt/litre — no crop needed), then `crop_culinary_meta.conversion_hints`
--      for culinary units (bardak, yemek kaşığı, adet, ...). Unlike `fn_culinary_to_canonical`, this
--      function stops at that gram/ml base value instead of converting on into the crop's canonical
--      shopping unit (kg/L) — `crop_nutrition` is always per-100g, so grams is exactly what's
--      needed, and (same simplification `fn_culinary_to_canonical`/`rpc_recipe_shopping_list`
--      already make for liquids) millilitres are treated as gram-equivalent, i.e. density = 1.
--      Also unlike `fn_culinary_to_canonical`, `p_crop` may be null (a free-text ingredient row) —
--      in that case only the metric-unit branch can possibly resolve (there is no crop to look
--      `conversion_hints` up against), which is intentional: a free-text ingredient given in a
--      plain metric unit ("200 g tuz") still has a real, known weight even with no platform crop
--      attached to it.
--   2. `calculate_recipe_nutrition(p_recipe_id)` — sums every recipe_ingredients row's contribution
--      (grams × crop_nutrition.*_per_100g / 100), divides by servings, and writes the result back
--      onto the `recipes` row through the nutrition_* columns T4-A added (respecting the T4-A2
--      column lock: this function is SECURITY INVOKER and granted only to service_role, same as
--      every other pipeline function in this file's family — service_role already holds the
--      table-level UPDATE grant T4-A2 left untouched, and bypasses RLS regardless of INVOKER/
--      DEFINER, so no privilege escalation is needed here).
--
-- Coverage/rows that do NOT enter the calculation (dispatch requirement — these still WIDEN the
-- denominator via nutrition_coverage_pct, they are never silently dropped from it):
--   - `recipe_ingredients.crop is null` (a free-text ingredient, e.g. an off-platform pantry item)
--     UNLESS its own quantity+unit happen to be a plain metric unit (see fn_recipe_ingredient_grams
--     above) — grams unknown otherwise, so it cannot weigh anything and is excluded from both the
--     numerator and denominator, but still raises the 'unmatched_ingredient' warning so it is never
--     silently invisible.
--   - `recipe_ingredients.crop` is set but `fn_recipe_ingredient_grams` still returns null (no
--     metric unit AND no matching `conversion_hints` entry for that unit) — same treatment as above.
--   - `recipe_ingredients.crop` is set and grams ARE known, but `crop_nutrition` has no row for that
--     crop (the 41 crops this dispatch's Task 2 deliberately does not seed) — these DO count toward
--     the denominator (their real weight is known) but not the numerator, correctly dragging
--     coverage down instead of being silently skipped (dispatch Task 1 step 5).
--
-- "Unavailable" (coverage = 0%, i.e. not a single ingredient row could be priced against
-- `crop_nutrition`) is represented as ALL nutrition_* fields NULL — the same "not calculated" state
-- 20260904160000's own test suite already calls out as the valid empty state (see
-- recipes_nutrition_consistency_check) — rather than persisting a fabricated 0-calorie result or
-- inventing an `nutrition_source` value outside the ('computed','partial','estimated') the T4-A
-- CHECK constraint allows. This function only ever writes 'computed' (100% coverage) or 'partial'
-- (0% < coverage < 100%) — it never writes 'estimated': per this dispatch, filling the gap for
-- unmatched ingredients is a separate, later LLM-completion job (out of scope here, see dispatch
-- Task 1 step 7); until that job runs, an incomplete recipe is honestly 'partial', not silently
-- upgraded to a guessed 'estimated' value this engine never produced.
--
-- `servings` null or <= 0 is the same "unavailable" (all-null) outcome, not a division error and
-- not a value computed against a fabricated denominator of 1.
--
-- TRIGGER WIRING (report-only, per dispatch instructions — NOT implemented in this migration, same
-- scope boundary T4-A itself drew 2026-09-04): `calculate_recipe_nutrition` should be invoked by
-- application/Edge Function code (service_role) at:
--   - F2 publish (a recipe transitioning to status = 'published')
--   - F7 post-edit save (an owner/admin edit to recipe_ingredients or servings on an existing recipe)
--   - post T6 AI-customization (a customized recipe copy gets its own ingredients, needs its own calc)
--   - the one-time backfill this dispatch's Task 3 performs directly, see
--     20260909122000_f024_recipe_nutrition_backfill.sql
-- None of the above is wired here; that is T4-B's (or a later dispatch's) job, exactly as T4-A left
-- "no Edge Function calls this yet" for its own RPCs.

-- =================================================================================================
-- 1. fn_recipe_ingredient_grams — one ingredient row's quantity+unit normalized to grams (or
--    millilitre-as-gram for liquids), or null when it cannot be determined at all.
-- =================================================================================================

create or replace function public.fn_recipe_ingredient_grams(
  p_crop text,
  p_quantity numeric,
  p_unit text
)
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_unit text := lower(btrim(coalesce(p_unit, '')));
  v_base numeric;
  v_hint numeric;
begin
  if p_quantity is null or v_unit = '' then
    return null;
  end if;

  -- 1) Metric units never need a crop or a conversion_hints lookup — same alias set as
  --    fn_culinary_to_canonical's own step 1.
  v_base := case v_unit
              when 'g'     then p_quantity
              when 'gr'    then p_quantity
              when 'gram'  then p_quantity
              when 'kg'    then p_quantity * 1000
              when 'ml'    then p_quantity
              when 'l'     then p_quantity * 1000
              when 'lt'    then p_quantity * 1000
              when 'litre' then p_quantity * 1000
              else null
            end;

  -- 2) Culinary unit: only resolvable when there IS a crop to look conversion_hints up against.
  if v_base is null and p_crop is not null then
    select case
             when jsonb_typeof(m.conversion_hints -> v_unit) = 'number'
             then (m.conversion_hints ->> v_unit)::numeric
           end
      into v_hint
    from public.crop_culinary_meta m
    where m.crop = p_crop;

    if v_hint is not null then
      v_base := p_quantity * v_hint;
    end if;
  end if;

  return v_base;
end;
$$;

comment on function public.fn_recipe_ingredient_grams(text, numeric, text) is
  'F0-24. One recipe_ingredients row''s quantity+unit normalized to grams (ml treated as gram- '
  'equivalent for liquids, matching fn_culinary_to_canonical/rpc_recipe_shopping_list''s existing '
  'density=1 simplification). Null when it cannot be determined (unknown unit with no crop, or no '
  'matching crop_culinary_meta.conversion_hints entry) — never a guessed value.';

revoke all on function public.fn_recipe_ingredient_grams(text, numeric, text) from public;
grant execute on function public.fn_recipe_ingredient_grams(text, numeric, text) to service_role;

-- =================================================================================================
-- 2. calculate_recipe_nutrition — computes and writes recipes.calories/protein_g/carbs_g/fat_g/
--    fiber_g/micronutrients/nutrition_source/nutrition_coverage_pct/nutrition_calculated_at/
--    nutrition_input_hash/nutrition_reference_version/nutrition_warnings for one recipe.
-- =================================================================================================

create or replace function public.calculate_recipe_nutrition(p_recipe_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_servings numeric;
  v_total_grams numeric := 0;    -- denominator: every ingredient whose weight IS known
  v_matched_grams numeric := 0;  -- numerator: of those, the ones crop_nutrition actually covers
  v_calories numeric := 0;
  v_protein numeric := 0;
  v_carbs numeric := 0;
  v_fat numeric := 0;
  v_fiber numeric := 0;
  v_sodium numeric := 0;
  v_potassium numeric := 0;
  v_calcium numeric := 0;
  v_iron numeric := 0;
  v_vitc numeric := 0;
  v_vita numeric := 0;
  v_has_micro boolean := false;
  v_has_unmatched boolean := false;
  v_ref_versions text[] := array[]::text[];
  v_grams numeric;
  v_coverage numeric;
  v_source text;
  v_micronutrients jsonb;
  v_input_hash text;
  v_reference_version text;
  v_warnings text[];
  r record;
begin
  select servings into v_servings from public.recipes where id = p_recipe_id;
  if not found then
    raise exception 'calculate_recipe_nutrition: recipe % not found', p_recipe_id;
  end if;

  for r in
    select ri.crop, ri.quantity, ri.unit,
           cn.calories_kcal, cn.protein_g, cn.carbs_g, cn.fat_g, cn.fiber_g,
           cn.sodium_mg, cn.potassium_mg, cn.calcium_mg, cn.iron_mg,
           cn.vitamin_c_mg, cn.vitamin_a_mcg_rae, cn.reference_version
    from public.recipe_ingredients ri
    left join public.crop_nutrition cn on cn.crop = ri.crop
    where ri.recipe_id = p_recipe_id
  loop
    v_grams := public.fn_recipe_ingredient_grams(r.crop, r.quantity, r.unit);

    if v_grams is null then
      -- Free-text ingredient, or a crop whose quantity/unit can't be normalized at all: not
      -- weighable, so it cannot enter either the numerator or the denominator — but it must not be
      -- silently invisible either.
      v_has_unmatched := true;
      continue;
    end if;

    v_total_grams := v_total_grams + v_grams;

    if r.calories_kcal is null and r.protein_g is null and r.carbs_g is null and r.fat_g is null then
      -- Known weight, but no crop_nutrition row (or an entirely-empty one) for this crop: counts
      -- toward the denominator (dispatch Task 1 step 5 — must drag coverage down, not be skipped),
      -- never toward the numerator.
      v_has_unmatched := true;
      continue;
    end if;

    v_matched_grams := v_matched_grams + v_grams;
    v_calories := v_calories + v_grams * coalesce(r.calories_kcal, 0) / 100;
    v_protein  := v_protein  + v_grams * coalesce(r.protein_g, 0) / 100;
    v_carbs    := v_carbs    + v_grams * coalesce(r.carbs_g, 0) / 100;
    v_fat      := v_fat      + v_grams * coalesce(r.fat_g, 0) / 100;
    v_fiber    := v_fiber    + v_grams * coalesce(r.fiber_g, 0) / 100;

    -- A null individual micronutrient on an otherwise-matched row is treated as a zero
    -- contribution (not "unknown"), the same simplification already applied to the four required
    -- macros above. Harmless for this dispatch's own seed data (Task 2 leaves no macro/micro field
    -- null on any of the 26 rows it inserts) — flagged here for whoever adds a sparser row later.
    if r.sodium_mg is not null or r.potassium_mg is not null or r.calcium_mg is not null
       or r.iron_mg is not null or r.vitamin_c_mg is not null or r.vitamin_a_mcg_rae is not null then
      v_has_micro := true;
    end if;
    v_sodium    := v_sodium    + v_grams * coalesce(r.sodium_mg, 0) / 100;
    v_potassium := v_potassium + v_grams * coalesce(r.potassium_mg, 0) / 100;
    v_calcium   := v_calcium   + v_grams * coalesce(r.calcium_mg, 0) / 100;
    v_iron      := v_iron      + v_grams * coalesce(r.iron_mg, 0) / 100;
    v_vitc      := v_vitc      + v_grams * coalesce(r.vitamin_c_mg, 0) / 100;
    v_vita      := v_vita      + v_grams * coalesce(r.vitamin_a_mcg_rae, 0) / 100;

    if r.reference_version is not null and not (r.reference_version = any (v_ref_versions)) then
      v_ref_versions := v_ref_versions || r.reference_version;
    end if;
  end loop;

  v_warnings := case when v_has_unmatched then array['unmatched_ingredient'] else array[]::text[] end;

  -- "Unavailable": nothing crop_nutrition-priced entered the calculation at all, OR servings is
  -- unusable as a divisor. Every nutrition_* field goes to NULL together (the same "not calculated"
  -- state 20260904160000's recipes_nutrition_consistency_check already treats as valid) instead of
  -- persisting a fabricated zero-calorie "computed"/"estimated" result. This branch is reached
  -- before any division, so it is also what keeps this function free of divide-by-zero errors.
  if v_matched_grams <= 0 or v_servings is null or v_servings <= 0 then
    update public.recipes
    set calories = null,
        protein_g = null,
        carbs_g = null,
        fat_g = null,
        fiber_g = null,
        micronutrients = null,
        nutrition_source = null,
        nutrition_coverage_pct = null,
        nutrition_calculated_at = null,
        nutrition_input_hash = null,
        nutrition_reference_version = null,
        nutrition_warnings = v_warnings
    where id = p_recipe_id;
    return;
  end if;

  v_coverage := round(v_matched_grams / v_total_grams * 100, 2);
  v_source := case when v_matched_grams >= v_total_grams then 'computed' else 'partial' end;

  v_micronutrients := case
    when v_has_micro then jsonb_build_object(
      'schema_version', 1,
      'basis', 'per_serving',
      'values', jsonb_build_object(
        'sodium_mg', round(v_sodium / v_servings, 2),
        'potassium_mg', round(v_potassium / v_servings, 2),
        'calcium_mg', round(v_calcium / v_servings, 2),
        'iron_mg', round(v_iron / v_servings, 2),
        'vitamin_c_mg', round(v_vitc / v_servings, 2),
        'vitamin_a_mcg_rae', round(v_vita / v_servings, 2)
      )
    )
    else null
  end;

  -- crop_nutrition.reference_version is NOT NULL, and v_matched_grams > 0 here implies at least one
  -- matched row contributed one, so v_ref_versions is never empty in this branch.
  v_reference_version := array_to_string(v_ref_versions, '+');

  select md5(
      p_recipe_id::text || '|f024-v1|' || v_servings::text || '|' || v_reference_version || '|' ||
      coalesce(string_agg(
        coalesce(ri.crop, '') || ':' || coalesce(ri.free_text_name, '') || ':' ||
        coalesce(ri.quantity::text, '') || ':' || coalesce(ri.unit, ''),
        ',' order by ri.sort_order, ri.id
      ), '')
    )
    into v_input_hash
    from public.recipe_ingredients ri
    where ri.recipe_id = p_recipe_id;

  update public.recipes
  set calories = round(v_calories / v_servings, 2),
      protein_g = round(v_protein / v_servings, 2),
      carbs_g = round(v_carbs / v_servings, 2),
      fat_g = round(v_fat / v_servings, 2),
      fiber_g = round(v_fiber / v_servings, 2),
      micronutrients = v_micronutrients,
      nutrition_source = v_source,
      nutrition_coverage_pct = v_coverage,
      nutrition_calculated_at = now(),
      nutrition_input_hash = v_input_hash,
      nutrition_reference_version = v_reference_version,
      nutrition_warnings = v_warnings
  where id = p_recipe_id;
end;
$$;

comment on function public.calculate_recipe_nutrition(uuid) is
  'F0-24. Deterministic nutrition engine: recipe_ingredients + crop_culinary_meta.conversion_hints '
  '(via fn_recipe_ingredient_grams) + crop_nutrition -> recipes.calories/protein_g/carbs_g/fat_g/ '
  'fiber_g/micronutrients/nutrition_source/nutrition_coverage_pct/nutrition_calculated_at/ '
  'nutrition_input_hash/nutrition_reference_version/nutrition_warnings. No LLM/estimation step — '
  'only ever writes nutrition_source computed|partial, or leaves every nutrition_* field NULL '
  '(''unavailable''). Not wired to any trigger yet — see file header.';

revoke all on function public.calculate_recipe_nutrition(uuid) from public;
grant execute on function public.calculate_recipe_nutrition(uuid) to service_role;
