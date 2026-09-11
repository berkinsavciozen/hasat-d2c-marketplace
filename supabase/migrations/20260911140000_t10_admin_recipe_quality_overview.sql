-- T10 — Admin recipe data-quality overview: a read-only view over the published catalog's
-- equipment/nutrition/allergen completeness, plus 3 service_role-only write RPCs so a T4/T4-B-style
-- fix (a wrong/missing nutrient value, an ingredient mis-linked to the wrong crop/food key) no
-- longer requires hand-written SQL against the live project.
--
-- Live-schema note (same recurring situation this repo's own migrations already flag repeatedly,
-- e.g. f2s12_recipe_publish_rpc.sql's "no migration source in this repo" for
-- recipes/recipe_ingredients/recipe_steps): `recipe_ingredients.nutrition_food_key` /
-- `.nutrition_exclusion_reason`, `public.ingredient_nutrition_reference`, and the v2
-- `calculate_recipe_nutrition` that resolves against them are already live (confirmed this round
-- via direct inspection of the live Hasat project — `information_schema.columns`,
-- `pg_constraint`, `pg_get_functiondef`) but were applied directly and never landed as a migration
-- file in this repo. This migration only adds new objects on top of that live shape; it does not
-- attempt to retroactively backfill the missing migration history.
--
-- Constraint reuse, not re-implementation: `admin_update_recipe_allergens` validates against the
-- SAME `public.is_valid_recipe_allergen_labels()` the T3-A publish/save path already uses (live
-- version covers all 12 `RECIPE_ALLERGEN_VALUES` slugs — confirmed via `pg_get_functiondef` this
-- round, ahead of what's tracked in this repo's own T3-A migration file, same drift as above).
-- `admin_update_ingredient_nutrition` does NOT re-implement `recipe_ingredients`'s own CHECK/FK
-- constraints (name-present, nutrition_food_key XOR nutrition_exclusion_reason, quantity > 0,
-- nutrition_food_key -> ingredient_nutrition_reference) — its UPDATE runs straight into those,
-- same validation, zero drift risk, translated into a normal Postgres exception the Edge Function
-- layer surfaces as 4xx. `required_equipment` has no DB CHECK (schemas.ts's own comment on
-- RECIPE_EQUIPMENT_VALUES: "application-layer restriction only") so `admin_update_recipe_facts`
-- gets its own validator, `is_valid_recipe_required_equipment`, mirroring the allergen validator's
-- shape and kept value-for-value in sync with RECIPE_EQUIPMENT_VALUES
-- (supabase/functions/_shared/recipe-automation/schemas.ts) by hand, same as that file's own
-- EQUIPMENT_LABELS/src-lib note already accepts for the equivalent frontend list.
--
-- `admin_update_ingredient_nutrition` deliberately does NOT call `calculate_recipe_nutrition`
-- itself (dispatch requirement — admin should see the recalculation as its own explicit step, via
-- POST .../recalculate-nutrition). It does not need to: `recipe_ingredients` already carries T4-B's
-- own `trg_recipe_ingredients_recalc_nutrition_upd` (AFTER UPDATE, FOR EACH STATEMENT,
-- 20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql) — this RPC's own UPDATE fires it
-- exactly like any other writer of that table, recalculating nutrition as a side effect of the one
-- UPDATE statement rather than a second explicit call this function would otherwise have to make.
-- The recalculate-nutrition action (Edge Function calling calculate_recipe_nutrition directly) stays
-- meaningful regardless: it is idempotent and is what an admin uses to force a fresh recompute
-- on demand (e.g. after crop_nutrition/ingredient_nutrition_reference reference data itself changed,
-- not just this recipe's own ingredients).

-- =================================================================================================
-- 1. Read-only quality overview (published/public catalog only — this is a launched-catalog QA
--    tool, not a draft/review queue; F2's own admin-recipe-jobs already covers pre-publish review).
-- =================================================================================================

create or replace view public.admin_recipe_quality_overview
with (security_invoker = true)
as
select
  r.id,
  r.slug,
  r.title,
  r.status,
  r.visibility,
  r.created_at,
  (r.required_equipment is not null and array_length(r.required_equipment, 1) > 0) as has_equipment,
  (r.nutrition_source = 'computed' and r.nutrition_coverage_pct = 100) as nutrition_complete,
  r.nutrition_source,
  r.nutrition_coverage_pct,
  r.nutrition_reference_version,
  (r.allergen_labels is not null) as allergens_reviewed_state,
  r.allergens_reviewed,
  r.allergen_labels,
  (select count(*) from public.recipe_ingredients ri where ri.recipe_id = r.id) as ingredient_count,
  (select count(*) from public.recipe_ingredients ri where ri.recipe_id = r.id
     and ri.crop is null and ri.free_text_name is not null and ri.nutrition_food_key is null
     and ri.nutrition_exclusion_reason is null) as unresolved_ingredient_count
from public.recipes r
where r.status = 'published' and r.visibility = 'public';

comment on view public.admin_recipe_quality_overview is
  'T10. Read-only data-quality overview of the published/public catalog (equipment/nutrition/'
  'allergen completeness). security_invoker so it never silently escalates whichever role queries '
  'it; service_role is the only role granted SELECT below, and service_role bypasses RLS '
  'regardless, same as every other admin-recipe-* read path in this pipeline.';

revoke all on public.admin_recipe_quality_overview from public, anon, authenticated;
grant select on public.admin_recipe_quality_overview to service_role;

-- =================================================================================================
-- 2. is_valid_recipe_required_equipment — required_equipment's controlled vocabulary, mirroring
--    is_valid_recipe_allergen_labels's shape. Null and '{}' both valid (no special equipment
--    required is a real answer, not "not assessed" -- RECIPE_EQUIPMENT_VALUES itself carries
--    'ozel-ekipman-gerekmiyor' for that case, same as the frontend/schemas.ts convention).
-- =================================================================================================

create or replace function public.is_valid_recipe_required_equipment(equipment text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    case
      when equipment is null then true
      when cardinality(equipment) = 0 then true
      else
        not exists (
          select 1 from unnest(equipment) as v
          where v is null
             or v <> all (array[
               'firin', 'ocak', 'mikrodalga', 'airfryer', 'blender', 'mutfak-robotu',
               'duduklu-tencere', 'izgara', 'ozel-ekipman-gerekmiyor'
             ])
        )
        and cardinality(equipment) = (select count(distinct v) from unnest(equipment) as v)
    end;
$$;

comment on function public.is_valid_recipe_required_equipment(text[]) is
  'T10. Validates recipes.required_equipment against RECIPE_EQUIPMENT_VALUES '
  '(supabase/functions/_shared/recipe-automation/schemas.ts) -- kept value-for-value in sync by '
  'hand, same convention that file''s own header already documents for the frontend EQUIPMENT_LABELS '
  'list, since required_equipment carries no DB CHECK of its own. Null/empty both valid.';

revoke all on function public.is_valid_recipe_required_equipment(text[]) from public;
revoke execute on function public.is_valid_recipe_required_equipment(text[]) from anon, authenticated;
grant execute on function public.is_valid_recipe_required_equipment(text[]) to service_role;

-- =================================================================================================
-- 3. admin_update_recipe_allergens
-- =================================================================================================

create or replace function public.admin_update_recipe_allergens(
  p_recipe_id uuid,
  p_allergen_labels text[],
  p_reviewed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_valid_recipe_allergen_labels(p_allergen_labels) then
    raise exception 'ADMIN_UPDATE_ALLERGENS_INVALID_LABELS: allergen_labels must be a duplicate-free '
      'subset of the controlled taxonomy';
  end if;

  update public.recipes
  set allergen_labels = p_allergen_labels,
      allergens_reviewed = p_reviewed,
      -- One-way, same as recipes_allergens_review_consistency_check and the same reasoning T3-A's
      -- own allergens_reviewed_at comment gives: un-reviewing must not destroy the last real
      -- review's timestamp, so it is only ever advanced forward here, never cleared.
      allergens_reviewed_at = case when p_reviewed then now() else allergens_reviewed_at end
  where id = p_recipe_id;

  if not found then
    raise exception 'ADMIN_UPDATE_ALLERGENS_NOT_FOUND: recipe % not found', p_recipe_id;
  end if;
end;
$$;

comment on function public.admin_update_recipe_allergens(uuid, text[], boolean) is
  'T10. Admin-only allergen edit + review-state write. Validates against the same '
  'is_valid_recipe_allergen_labels taxonomy the T3-A publish/save path enforces. SECURITY DEFINER, '
  'service_role-only (see grants below) -- no new client-writable path onto recipes.allergen_labels/'
  'allergens_reviewed, which T4-A2 deliberately locked away from authenticated/anon.';

revoke all on function public.admin_update_recipe_allergens(uuid, text[], boolean) from public;
revoke execute on function public.admin_update_recipe_allergens(uuid, text[], boolean) from anon, authenticated;
grant execute on function public.admin_update_recipe_allergens(uuid, text[], boolean) to service_role;

-- =================================================================================================
-- 4. admin_update_recipe_facts (required_equipment + diet_tags)
-- =================================================================================================

create or replace function public.admin_update_recipe_facts(
  p_recipe_id uuid,
  p_required_equipment text[],
  p_diet_tags text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_valid_recipe_required_equipment(p_required_equipment) then
    raise exception 'ADMIN_UPDATE_FACTS_INVALID_EQUIPMENT: required_equipment must be a '
      'duplicate-free subset of the controlled equipment vocabulary';
  end if;

  -- diet_tags has no controlled DB/application dictionary in this codebase (unlike equipment --
  -- see src/routes/tarifler.index.tsx's own "dietTags/cuisine'in aksine" note): only shape/hygiene
  -- is enforced here (non-null trimmed text, no duplicates), matching how the F2 pipeline itself
  -- treats dietTags elsewhere (schemas.ts's plain nonEmptyTrimmedString array).
  if p_diet_tags is null or exists (
    select 1 from unnest(p_diet_tags) as v where v is null or btrim(v) = ''
  ) then
    raise exception 'ADMIN_UPDATE_FACTS_INVALID_DIET_TAGS: diet_tags must be a non-null array of '
      'non-empty strings';
  end if;
  if cardinality(p_diet_tags) <> (select count(distinct v) from unnest(p_diet_tags) as v) then
    raise exception 'ADMIN_UPDATE_FACTS_INVALID_DIET_TAGS: diet_tags must not contain duplicates';
  end if;

  update public.recipes
  set required_equipment = p_required_equipment,
      diet_tags = p_diet_tags
  where id = p_recipe_id;

  if not found then
    raise exception 'ADMIN_UPDATE_FACTS_NOT_FOUND: recipe % not found', p_recipe_id;
  end if;
end;
$$;

comment on function public.admin_update_recipe_facts(uuid, text[], text[]) is
  'T10. Admin-only required_equipment/diet_tags edit. SECURITY DEFINER, service_role-only.';

revoke all on function public.admin_update_recipe_facts(uuid, text[], text[]) from public;
revoke execute on function public.admin_update_recipe_facts(uuid, text[], text[]) from anon, authenticated;
grant execute on function public.admin_update_recipe_facts(uuid, text[], text[]) to service_role;

-- =================================================================================================
-- 5. admin_update_ingredient_nutrition
-- =================================================================================================

create or replace function public.admin_update_ingredient_nutrition(
  p_ingredient_id uuid,
  p_crop text,
  p_free_text_name text,
  p_quantity numeric,
  p_unit text,
  p_nutrition_food_key text,
  p_nutrition_exclusion_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No pre-validation of crop/free_text_name presence, the nutrition_food_key/
  -- nutrition_exclusion_reason mutual exclusion, quantity > 0, or the nutrition_food_key ->
  -- ingredient_nutrition_reference FK: recipe_ingredients already carries every one of those as a
  -- live CHECK/FK constraint (recipe_ingredients_name_present, recipe_ingredients_nutrition_
  -- resolution_check, recipe_ingredients_nutrition_exclusion_reason_check, recipe_ingredients_
  -- nutrition_food_key_fkey, recipe_ingredients_quantity_check). Re-implementing them here would
  -- only risk drifting from the real constraint; this UPDATE runs straight into them and a
  -- violation surfaces as a normal Postgres exception.
  --
  -- Deliberately does NOT call calculate_recipe_nutrition -- see this migration's header. This
  -- UPDATE already fires recipe_ingredients' own T4-B AFTER UPDATE STATEMENT trigger
  -- (trg_recipe_ingredients_recalc_nutrition_upd), which recalculates nutrition as a side effect
  -- of the statement regardless of what this function's own body does.
  update public.recipe_ingredients
  set crop = p_crop,
      free_text_name = p_free_text_name,
      quantity = p_quantity,
      unit = p_unit,
      nutrition_food_key = p_nutrition_food_key,
      nutrition_exclusion_reason = p_nutrition_exclusion_reason
  where id = p_ingredient_id;

  if not found then
    raise exception 'ADMIN_UPDATE_INGREDIENT_NOT_FOUND: recipe_ingredients row % not found', p_ingredient_id;
  end if;
end;
$$;

comment on function public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text) is
  'T10. Admin-only recipe_ingredients edit (crop/free_text_name/quantity/unit/nutrition_food_key/'
  'nutrition_exclusion_reason). SECURITY DEFINER, service_role-only. Relies on the table''s own '
  'CHECK/FK constraints for validation -- see function body comment. Does NOT itself trigger a '
  'nutrition recalculation beyond what recipe_ingredients'' existing T4-B AFTER UPDATE trigger '
  'already does automatically -- the admin panel''s explicit "recalculate" action '
  '(calculate_recipe_nutrition, called directly, idempotent) is the deliberate second step, not '
  'this function.';

revoke all on function public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text) from public;
revoke execute on function public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text) from anon, authenticated;
grant execute on function public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text) to service_role;
