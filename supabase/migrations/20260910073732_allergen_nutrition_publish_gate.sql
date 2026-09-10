-- Allergen + nutrition publish hardening.
--
-- 1. Expands the controlled allergen vocabulary for the known Turkish/EU major categories that
--    the original seven-slug contract could not represent (tree nuts other than hazelnut,
--    mustard, celery, sulphites and lupin).
-- 2. Snapshots the exact human admin approval into recipes.allergens_reviewed* during the F2
--    publish transaction.
-- 3. Calculates nutrition inside that same transaction and refuses publication unless coverage
--    is fully computed (100%).
-- 4. Adds a deferred publish gate so direct/non-F2 publish paths cannot bypass the same facts.
--
-- Existing published rows are not rewritten by this migration. The gate applies to newly
-- inserted recipes and genuine draft -> published transitions. Production backfill/review remains
-- a separate, explicit operation.

create or replace function public.is_valid_recipe_allergen_labels(labels text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    case
      when labels is null then true
      when cardinality(labels) = 0 then true
      else
        not exists (
          select 1 from unnest(labels) as v
          where v is null
             or v <> all (array[
               'gluten',
               'laktoz',
               'yumurta',
               'findik-yerfistigi',
               'agac-kuruyemisi',
               'soya',
               'susam',
               'deniz-urunu',
               'hardal',
               'kereviz',
               'sulfit',
               'lupin'
             ])
        )
        and cardinality(labels) = (select count(distinct v) from unnest(labels) as v)
    end;
$$;

comment on function public.is_valid_recipe_allergen_labels(text[]) is
  'Validates recipes.allergen_labels against the controlled 12-slug vocabulary with no null or '
  'duplicate members. NULL remains valid only as an unreviewed draft/legacy state; publish gates '
  'require a non-null array.';

create or replace function public.tg_finalize_recipe_facts_on_publish_job()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reviewed_at timestamptz;
  v_recipe record;
begin
  select ar.created_at
  into v_reviewed_at
  from (
    select id, version
    from public.recipe_drafts
    where job_id = new.id
    order by version desc
    limit 1
  ) as d
  join public.recipe_admin_reviews as ar
    on ar.job_id = new.id
   and ar.draft_id = d.id
   and ar.draft_version = d.version
   and ar.action = 'approve'
  order by ar.created_at desc
  limit 1;

  if v_reviewed_at is null then
    raise exception 'PUBLISH_ALLERGEN_REVIEW_MISSING: no exact approved human review for job %', new.id;
  end if;

  select id, allergen_labels
  into v_recipe
  from public.recipes
  where id = new.recipe_id;

  if not found or v_recipe.allergen_labels is null then
    raise exception 'PUBLISH_ALLERGEN_LABELS_MISSING: recipe % has no controlled allergen assessment', new.recipe_id;
  end if;

  if not public.is_valid_recipe_allergen_labels(v_recipe.allergen_labels) then
    raise exception 'PUBLISH_ALLERGEN_LABELS_INVALID: recipe % has invalid or duplicate allergen labels', new.recipe_id;
  end if;

  update public.recipes
  set allergens_reviewed = true,
      allergens_reviewed_at = v_reviewed_at,
      allergens_reviewed_by = null
  where id = new.recipe_id;

  perform public.calculate_recipe_nutrition(new.recipe_id);

  select *
  into v_recipe
  from public.recipes
  where id = new.recipe_id;

  if v_recipe.nutrition_source is distinct from 'computed'
     or v_recipe.nutrition_coverage_pct is distinct from 100
     or v_recipe.calories is null
     or v_recipe.protein_g is null
     or v_recipe.carbs_g is null
     or v_recipe.fat_g is null
     or v_recipe.nutrition_calculated_at is null
     or v_recipe.nutrition_input_hash is null
     or v_recipe.nutrition_reference_version is null then
    raise exception 'PUBLISH_NUTRITION_INCOMPLETE: recipe % did not reach computed/100 nutrition coverage', new.recipe_id;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_finalize_recipe_facts_on_publish_job() from public, anon, authenticated;

drop trigger if exists recipe_jobs_finalize_recipe_facts on public.recipe_generation_jobs;
create trigger recipe_jobs_finalize_recipe_facts
before update of recipe_id on public.recipe_generation_jobs
for each row
when (old.recipe_id is null and new.recipe_id is not null)
execute function public.tg_finalize_recipe_facts_on_publish_job();

create or replace function public.tg_require_published_recipe_facts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipe record;
begin
  select * into v_recipe from public.recipes where id = new.id;
  if not found or v_recipe.status <> 'published' then
    return null;
  end if;

  if v_recipe.allergen_labels is null
     or v_recipe.allergens_reviewed is distinct from true
     or v_recipe.allergens_reviewed_at is null
     or not public.is_valid_recipe_allergen_labels(v_recipe.allergen_labels) then
    raise exception 'PUBLISH_ALLERGEN_FACTS_INCOMPLETE: recipe % is not human-reviewed with controlled labels', new.id;
  end if;

  if v_recipe.nutrition_source is distinct from 'computed'
     or v_recipe.nutrition_coverage_pct is distinct from 100
     or v_recipe.calories is null
     or v_recipe.protein_g is null
     or v_recipe.carbs_g is null
     or v_recipe.fat_g is null
     or v_recipe.nutrition_calculated_at is null
     or v_recipe.nutrition_input_hash is null
     or v_recipe.nutrition_reference_version is null then
    raise exception 'PUBLISH_NUTRITION_FACTS_INCOMPLETE: recipe % is not computed with 100%% coverage', new.id;
  end if;

  return null;
end;
$$;

revoke all on function public.tg_require_published_recipe_facts() from public, anon, authenticated;

drop trigger if exists recipes_insert_publish_facts_gate on public.recipes;
create constraint trigger recipes_insert_publish_facts_gate
after insert on public.recipes
deferrable initially deferred
for each row execute function public.tg_require_published_recipe_facts();

drop trigger if exists recipes_status_publish_facts_gate on public.recipes;
create constraint trigger recipes_status_publish_facts_gate
after update of status on public.recipes
deferrable initially deferred
for each row
when (old.status is distinct from 'published' and new.status = 'published')
execute function public.tg_require_published_recipe_facts();
