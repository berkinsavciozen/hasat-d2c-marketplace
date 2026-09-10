-- Real-Postgres integration assertions for 20260910073732_allergen_nutrition_publish_gate.sql.
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

create or replace function pg_temp.seed_publish_job(
  p_title text,
  p_lock_token text,
  p_allergen_labels text[],
  p_include_uncovered_crop boolean default false
) returns table(job_id uuid, draft_id uuid, batch_id uuid)
language plpgsql
as $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
  v_ingredients jsonb;
begin
  insert into public.recipe_generation_batches (target_count, locale)
  values (1, 'tr') returning id into v_batch_id;

  insert into public.recipe_generation_jobs (
    batch_id, brief_id, working_title, stage, status,
    locked_by, locked_at, lock_expires_at
  ) values (
    v_batch_id, gen_random_uuid(), p_title, 'publish', 'running',
    p_lock_token, now(), now() + interval '5 minutes'
  ) returning id into v_job_id;

  v_ingredients := jsonb_build_array(jsonb_build_object(
    'crop', 'kabak', 'freeTextName', null, 'quantity', 100, 'unit', 'g', 'note', null,
    'isKeyIngredient', true, 'ingredientClass', 'tarimsal', 'sortOrder', 0
  ));
  if p_include_uncovered_crop then
    v_ingredients := v_ingredients || jsonb_build_array(jsonb_build_object(
      'crop', 'domates', 'freeTextName', null, 'quantity', 100, 'unit', 'g', 'note', null,
      'isKeyIngredient', false, 'ingredientClass', 'tarimsal', 'sortOrder', 1
    ));
  end if;

  insert into public.recipe_drafts (
    job_id, version, title, servings, prep_minutes, cook_minutes, difficulty, visibility,
    allergen_labels, ingredients, steps
  ) values (
    v_job_id, 1, p_title, 4, 10, 20, 'kolay', 'public', p_allergen_labels,
    v_ingredients,
    jsonb_build_array(jsonb_build_object(
      'stepNo', 1, 'instruction', p_title || ' pisirin.',
      'photoUrl', null, 'timerSeconds', null
    ))
  ) returning id into v_draft_id;

  insert into public.recipe_qa_results (
    job_id, draft_id, draft_version, decision, overall_score, scores,
    blocking_issues, safety_review, approved_for_imaging
  ) values (
    v_job_id, v_draft_id, 1, 'approved', 90, '{}'::jsonb, '[]'::jsonb,
    jsonb_build_object(
      'temperature', jsonb_build_object('flagged', false, 'notes', null),
      'timing', jsonb_build_object('flagged', false, 'notes', null),
      'allergens', jsonb_build_object(
        'flagged', cardinality(p_allergen_labels) > 0,
        'notes', null,
        'detectedLabels', to_jsonb(coalesce(p_allergen_labels, '{}'::text[]))
      ),
      'requiresHumanReview', true,
      'reviewedBy', null,
      'reviewedAt', null,
      'approved', null
    ),
    true
  );

  insert into public.recipe_admin_reviews (
    job_id, batch_id, draft_id, draft_version, action,
    temperature_reviewed, timing_reviewed, allergens_reviewed, content_reviewed, images_reviewed,
    from_stage, from_status, to_stage, to_status, admin_actor
  ) values (
    v_job_id, v_batch_id, v_draft_id, 1, 'approve',
    true, true, true, true, true,
    'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved', 'local-test-admin'
  );

  insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
  values
    (v_job_id, v_draft_id, 'hero', p_title || '-16x9.webp'),
    (v_job_id, v_draft_id, 'square', p_title || '-1x1.webp');

  return query select v_job_id, v_draft_id, v_batch_id;
end;
$$;

-- Migration installation must not rewrite or reject an already-published legacy row.
select pg_temp.assert(
  exists (
    select 1 from public.recipes
    where slug = 'legacy-published-before-gate'
      and status = 'published'
      and allergen_labels is null
      and allergens_reviewed = false
      and nutrition_source is null
  ),
  'legacy published row changed or disappeared during migration installation'
);

-- The complete controlled vocabulary and an explicit empty assessment are valid; null remains a
-- valid draft/legacy storage state but is not a valid publish state.
select pg_temp.assert(public.is_valid_recipe_allergen_labels(array[
  'gluten', 'laktoz', 'yumurta', 'findik-yerfistigi', 'agac-kuruyemisi', 'soya',
  'susam', 'deniz-urunu', 'hardal', 'kereviz', 'sulfit', 'lupin'
]), 'all 12 controlled slugs should be valid');
select pg_temp.assert(public.is_valid_recipe_allergen_labels('{}'::text[]), 'explicit [] should be valid');
select pg_temp.assert(public.is_valid_recipe_allergen_labels(null), 'null remains valid for draft/legacy rows');
select pg_temp.assert(not public.is_valid_recipe_allergen_labels(array['sut']), 'free text should be invalid');
select pg_temp.assert(not public.is_valid_recipe_allergen_labels(array['laktoz', 'laktoz']), 'duplicates should be invalid');

-- Successful F2 publish: the job->recipe link trigger snapshots the exact admin approval and
-- invokes the real nutrition engine before the transaction can commit.
do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_result jsonb; v_recipe_id uuid; v_recipe record; v_approved_at timestamptz;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
  from pg_temp.seed_publish_job('Gate Happy Path', 'gate-happy-lock', '{}'::text[]);

  select created_at into v_approved_at
  from public.recipe_admin_reviews
  where job_id = v_job_id and draft_id = v_draft_id and action = 'approve';

  v_result := public.publish_recipe_draft(v_job_id, 'gate-happy-lock', 'gate-happy-path');
  v_recipe_id := (v_result->>'recipeId')::uuid;
  select * into v_recipe from public.recipes where id = v_recipe_id;

  perform pg_temp.assert(v_recipe.status = 'published', 'happy path recipe should publish');
  perform pg_temp.assert(v_recipe.allergen_labels = '{}'::text[], 'explicit [] should survive publish');
  perform pg_temp.assert(v_recipe.allergens_reviewed, 'allergens_reviewed should be snapshotted');
  perform pg_temp.assert(v_recipe.allergens_reviewed_at = v_approved_at, 'review timestamp should equal exact approval timestamp');
  perform pg_temp.assert(v_recipe.nutrition_source = 'computed', 'nutrition should be computed');
  perform pg_temp.assert(v_recipe.nutrition_coverage_pct = 100, 'nutrition coverage should be 100');
  perform pg_temp.assert(v_recipe.calories is not null and v_recipe.nutrition_input_hash is not null, 'nutrition facts should be materialized');
end;
$$;

-- Invalid labels must make the entire F2 publish statement roll back.
do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid; v_failed boolean := false;
  v_recipe_count bigint;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
  from pg_temp.seed_publish_job('Gate Invalid Allergen', 'gate-invalid-lock', array['sut']);
  select count(*) into v_recipe_count from public.recipes;
  begin
    perform public.publish_recipe_draft(v_job_id, 'gate-invalid-lock', 'gate-invalid-allergen');
  exception when others then
    v_failed := sqlerrm like '%recipes_allergen_labels_taxonomy_check%'
      or sqlerrm like 'PUBLISH_ALLERGEN_LABELS_INVALID:%';
  end;
  perform pg_temp.assert(v_failed, 'invalid allergen publish should fail');
  perform pg_temp.assert((select count(*) from public.recipes) = v_recipe_count, 'invalid allergen publish left a recipe row');
  perform pg_temp.assert((select recipe_id is null and status = 'running' from public.recipe_generation_jobs where id = v_job_id), 'invalid allergen publish changed the job');
  perform pg_temp.assert((select bool_and(recipe_id is null) from public.recipe_assets where job_id = v_job_id), 'invalid allergen publish linked assets');
end;
$$;

-- Null labels pass the legacy CHECK but must fail the publish-only gate and roll back.
do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid; v_failed boolean := false;
  v_recipe_count bigint;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
  from pg_temp.seed_publish_job('Gate Null Allergen', 'gate-null-lock', null);
  select count(*) into v_recipe_count from public.recipes;
  begin
    perform public.publish_recipe_draft(v_job_id, 'gate-null-lock', 'gate-null-allergen');
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_ALLERGEN_LABELS_MISSING:%';
  end;
  perform pg_temp.assert(v_failed, 'null allergen publish should fail at publish gate');
  perform pg_temp.assert((select count(*) from public.recipes) = v_recipe_count, 'null allergen publish left a recipe row');
  perform pg_temp.assert((select recipe_id is null and status = 'running' from public.recipe_generation_jobs where id = v_job_id), 'null allergen publish changed the job');
end;
$$;

-- A real partial nutrition calculation must abort and roll back the whole F2 publish.
do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid; v_failed boolean := false;
  v_recipe_count bigint;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
  from pg_temp.seed_publish_job('Gate Partial Nutrition', 'gate-partial-lock', array['laktoz'], true);
  select count(*) into v_recipe_count from public.recipes;
  begin
    perform public.publish_recipe_draft(v_job_id, 'gate-partial-lock', 'gate-partial-nutrition');
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_NUTRITION_INCOMPLETE:%';
  end;
  perform pg_temp.assert(v_failed, 'partial nutrition publish should fail');
  perform pg_temp.assert((select count(*) from public.recipes) = v_recipe_count, 'partial nutrition publish left a recipe row');
  perform pg_temp.assert((select recipe_id is null and status = 'running' from public.recipe_generation_jobs where id = v_job_id), 'partial nutrition publish changed the job');
  perform pg_temp.assert((select bool_and(recipe_id is null) from public.recipe_assets where job_id = v_job_id), 'partial nutrition publish linked assets');
end;
$$;

-- Direct INSERT/UPDATE paths cannot bypass the deferred publish gate.
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.recipes (slug, title, servings, status, visibility, allergen_labels)
    values ('direct-published-bypass', 'Direct Published Bypass', 4, 'published', 'public', '{}');
    set constraints recipes_insert_publish_facts_gate immediate;
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_ALLERGEN_FACTS_INCOMPLETE:%';
  end;
  perform pg_temp.assert(v_failed, 'direct published insert should fail');
  perform pg_temp.assert(not exists(select 1 from public.recipes where slug = 'direct-published-bypass'), 'direct published insert survived');
end;
$$;

do $$
declare v_id uuid; v_failed boolean := false;
begin
  insert into public.recipes (slug, title, servings, status, visibility, allergen_labels)
  values ('direct-update-bypass', 'Direct Update Bypass', 4, 'draft', 'private', '{}')
  returning id into v_id;
  begin
    update public.recipes set status = 'published' where id = v_id;
    set constraints recipes_status_publish_facts_gate immediate;
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_ALLERGEN_FACTS_INCOMPLETE:%';
  end;
  perform pg_temp.assert(v_failed, 'draft to published bypass should fail');
  perform pg_temp.assert((select status = 'draft' from public.recipes where id = v_id), 'failed update did not roll back to draft');
end;
$$;

-- Internal trigger functions are not callable by Data API roles.
select pg_temp.assert(
  not has_function_privilege('anon', 'public.tg_finalize_recipe_facts_on_publish_job()', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_finalize_recipe_facts_on_publish_job()', 'execute')
  and not has_function_privilege('anon', 'public.tg_require_published_recipe_facts()', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_require_published_recipe_facts()', 'execute'),
  'anon/authenticated unexpectedly have EXECUTE on internal trigger functions'
);

\echo 'Allergen + nutrition publish gate integration assertions: PASSED'
