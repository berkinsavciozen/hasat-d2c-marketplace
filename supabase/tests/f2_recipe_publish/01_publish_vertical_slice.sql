-- F2 Recipe Automation — Step 12 SQL test: publish_recipe_draft transactional/idempotent behavior.
--
-- Proves, against a real fresh Postgres database (never the live Supabase project — see run.sh),
-- that the publish RPC (20260826130000_f2s12_recipe_publish_rpc.sql) actually behaves the way
-- PROMPT 12 requires: every precondition gates before any write, a genuine mid-transaction failure
-- rolls back everything including an already-inserted `recipes` row, and a repeated publish call
-- for an already-published job returns the SAME recipe rather than creating a second one. Same
-- plain-psql-assertion convention as ../f2_recipe_automation/*_vertical_slice.sql — no pgTAP
-- dependency.
--
-- This suite exercises `publish_recipe_draft` directly, at the exact starting state its caller
-- (../../functions/_shared/recipe-automation/publish/publish-stage.ts) always leaves a job in
-- before calling it — `stage='publish', status='running'`, locked by a known token — since that
-- TypeScript orchestration layer itself is covered by publish-stage.test.ts (Deno/fake-client) and
-- cannot run inside a plain-psql suite. `pg_temp.seed_ready_job()` below reproduces that exact
-- state directly.

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

-- Seeds a batch + job (already at stage=publish/status=running, locked by p_lock_token — the
-- exact state claimJob() leaves a job in before publish-stage.ts calls this RPC) + a single-version
-- draft + (optionally) a clean QA result + (optionally) a complete admin approval + (optionally)
-- hero/square recipe_assets rows. Every "optionally" defaults to the fully-ready happy-path shape;
-- each negative test below flips exactly one flag off.
create or replace function pg_temp.seed_ready_job(
  p_title text,
  p_lock_token text,
  p_crop text default 'kabak',
  p_visibility text default 'public',
  p_include_hero boolean default true,
  p_include_square boolean default true,
  p_admin_approve boolean default true,
  p_qa_result text default 'approved' -- 'approved' | 'blocking' | 'none'
) returns table(job_id uuid, draft_id uuid, batch_id uuid)
language plpgsql
as $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;

  insert into public.recipe_generation_jobs (
    batch_id, brief_id, working_title, stage, status, locked_by, locked_at, lock_expires_at
  ) values (
    v_batch_id, gen_random_uuid(), p_title, 'publish', 'running',
    p_lock_token, now(), now() + interval '5 minutes'
  ) returning id into v_job_id;

  insert into public.recipe_drafts (
    job_id, version, title, servings, prep_minutes, cook_minutes, difficulty, visibility, ingredients, steps
  ) values (
    v_job_id, 1, p_title, 4, 10, 20, 'kolay', p_visibility,
    jsonb_build_array(jsonb_build_object(
      'crop', p_crop, 'freeTextName', null, 'quantity', 2, 'unit', 'adet', 'note', null,
      'isKeyIngredient', true, 'ingredientClass', 'tarimsal', 'sortOrder', 0
    )),
    jsonb_build_array(jsonb_build_object(
      'stepNo', 1, 'instruction', p_title || ' pisirin.', 'photoUrl', null, 'timerSeconds', null
    ))
  ) returning id into v_draft_id;

  if p_qa_result = 'approved' then
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores, blocking_issues, safety_review, approved_for_imaging
    ) values (
      v_job_id, v_draft_id, 1, 'approved', 90, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, true
    );
  elsif p_qa_result = 'blocking' then
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores, blocking_issues, safety_review, approved_for_imaging
    ) values (
      v_job_id, v_draft_id, 1, 'approved', 60, '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('code', 'X', 'field', 'title', 'severity', 'blocking', 'message', 'x', 'requiredChange', null)),
      '{}'::jsonb, false
    );
  end if;
  -- p_qa_result = 'none' -> no recipe_qa_results row at all.

  if p_admin_approve then
    insert into public.recipe_admin_reviews (
      job_id, batch_id, draft_id, draft_version, action,
      temperature_reviewed, timing_reviewed, allergens_reviewed, content_reviewed, images_reviewed,
      from_stage, from_status, to_stage, to_status, admin_actor
    ) values (
      v_job_id, v_batch_id, v_draft_id, 1, 'approve',
      true, true, true, true, true,
      'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved', 'test-admin'
    );
  end if;

  if p_include_hero then
    insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
    values (v_job_id, v_draft_id, 'hero', p_title || '-16x9.webp');
  end if;
  if p_include_square then
    insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
    values (v_job_id, v_draft_id, 'square', p_title || '-1x1.webp');
  end if;

  return query select v_job_id, v_draft_id, v_batch_id;
end;
$$;

-- ===================================================================================================
-- 1. Happy path: every precondition met -> recipe created, published, job completed, image field
--    mapped, and the row is actually reachable the way a public reader would find it.
-- ===================================================================================================

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_result jsonb;
  v_recipe_id uuid;
  v_recipe record;
  v_job record;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('Firinda Kabak Dolmasi', 'lock-happy-1');

  v_result := public.publish_recipe_draft(v_job_id, 'lock-happy-1', 'firinda-kabak-dolmasi');

  perform pg_temp.assert((v_result->>'ok')::boolean, 'expected ok=true');
  perform pg_temp.assert(coalesce((v_result->>'alreadyPublished')::boolean, false) = false, 'expected alreadyPublished=false on first publish');
  v_recipe_id := (v_result->>'recipeId')::uuid;
  perform pg_temp.assert(v_recipe_id is not null, 'expected a recipeId');
  perform pg_temp.assert(v_result->>'slug' = 'firinda-kabak-dolmasi', 'expected the requested slug echoed back');

  select * into v_recipe from public.recipes where id = v_recipe_id;
  perform pg_temp.assert(found, 'expected a recipes row to exist');
  perform pg_temp.assert(v_recipe.status = 'published', 'expected recipes.status=published (step 6 of the flow)');
  perform pg_temp.assert(v_recipe.title = 'Firinda Kabak Dolmasi', 'expected the draft title to carry over');
  perform pg_temp.assert(
    v_recipe.cover_photo_url is not null
      and v_recipe.cover_photo_url like '%/storage/v1/object/public/crop-photos/Firinda Kabak Dolmasi-16x9.webp',
    'expected cover_photo_url built from the hero asset''s storage_bucket/storage_path (step 4 of the flow), got: ' || coalesce(v_recipe.cover_photo_url, '<null>')
  );

  perform pg_temp.assert(
    (select count(*) from public.recipe_ingredients where recipe_id = v_recipe_id) = 1,
    'expected 1 recipe_ingredients row (step 2 of the flow)'
  );
  perform pg_temp.assert(
    (select crop from public.recipe_ingredients where recipe_id = v_recipe_id) = 'kabak',
    'expected the ingredient''s crop to carry over'
  );
  perform pg_temp.assert(
    (select count(*) from public.recipe_steps where recipe_id = v_recipe_id) = 1,
    'expected 1 recipe_steps row (step 3 of the flow)'
  );
  perform pg_temp.assert(
    (select instruction from public.recipe_steps where recipe_id = v_recipe_id) = 'Firinda Kabak Dolmasi pisirin.',
    'expected the step instruction to carry over'
  );

  -- Both crop-photos assets are stamped with the new recipe_id, not just the hero one.
  perform pg_temp.assert(
    (select count(*) from public.recipe_assets where job_id = v_job_id and draft_id = v_draft_id and recipe_id = v_recipe_id) = 2,
    'expected both hero and square recipe_assets rows linked to the new recipe'
  );

  select * into v_job from public.recipe_generation_jobs where id = v_job_id;
  perform pg_temp.assert(v_job.recipe_id = v_recipe_id, 'expected job.recipe_id set (step 7 of the flow)');
  perform pg_temp.assert(v_job.status = 'completed', 'expected job.status=completed');
  perform pg_temp.assert(v_job.stage = 'publish', 'expected job.stage to remain publish (the terminal pipeline node)');
  perform pg_temp.assert(v_job.completed_at is not null, 'expected job.completed_at set');
  perform pg_temp.assert(v_job.locked_by is null, 'expected the job lock cleared');

  -- "Successful public fetch": the recipe is now findable exactly the way a public reader's query
  -- would find it (recipes_public_published_idx's own predicate: visibility='public' AND status='published').
  perform pg_temp.assert(
    exists(select 1 from public.recipes where id = v_recipe_id and visibility = 'public' and status = 'published'),
    'expected the new recipe to satisfy the public/published index predicate'
  );
end;
$$;

\echo '1. Happy path: PASSED'

-- ===================================================================================================
-- 2. Duplicate slug: a slug already used by an unrelated, pre-existing recipe is refused, and
--    NOTHING from the failed attempt is left behind.
-- ===================================================================================================

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_failed boolean := false;
  v_recipes_before integer;
  v_ingredients_before integer;
begin
  insert into public.recipes (slug, title) values ('taken-slug', 'Existing Unrelated Recipe');

  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('Yeni Bir Tarif', 'lock-dupe-1');

  select count(*) into v_recipes_before from public.recipes;
  select count(*) into v_ingredients_before from public.recipe_ingredients;

  begin
    perform public.publish_recipe_draft(v_job_id, 'lock-dupe-1', 'taken-slug');
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_SLUG_ALREADY_USED:%';
  end;
  perform pg_temp.assert(v_failed, 'expected PUBLISH_SLUG_ALREADY_USED when the slug is already used');

  perform pg_temp.assert((select count(*) from public.recipes) = v_recipes_before, 'expected no new recipes row after rollback');
  perform pg_temp.assert((select count(*) from public.recipe_ingredients) = v_ingredients_before, 'expected no new recipe_ingredients row after rollback');
  perform pg_temp.assert(
    (select recipe_id from public.recipe_generation_jobs where id = v_job_id) is null,
    'expected job.recipe_id to remain null after rollback'
  );
  perform pg_temp.assert(
    (select status from public.recipe_generation_jobs where id = v_job_id) = 'running',
    'expected the job row itself to be untouched by the raised exception (still running, still locked)'
  );
end;
$$;

\echo '2. Duplicate slug: PASSED'

-- ===================================================================================================
-- 3. Ingredient failure rollback: a draft ingredient with an ingredient_class value neither
--    validate_recipe_structure nor validate_recipe_crop_values inspects, but which the live
--    recipe_ingredients CHECK constraint rejects — a genuine mid-transaction failure (the recipe
--    row is already inserted by this point) that must roll back EVERYTHING, including that recipe.
-- ===================================================================================================

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_failed boolean := false;
  v_recipes_before integer;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('Bozuk Malzeme Tarifi', 'lock-ing-fail-1');

  update public.recipe_drafts
  set ingredients = jsonb_build_array(jsonb_build_object(
    'crop', 'kabak', 'freeTextName', null, 'quantity', 1, 'unit', 'adet', 'note', null,
    'isKeyIngredient', true, 'ingredientClass', 'not_a_real_class', 'sortOrder', 0
  ))
  where id = v_draft_id;

  select count(*) into v_recipes_before from public.recipes;

  begin
    perform public.publish_recipe_draft(v_job_id, 'lock-ing-fail-1', 'bozuk-malzeme-tarifi');
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected a check_violation on the invalid ingredient_class to propagate');

  perform pg_temp.assert(
    (select count(*) from public.recipes) = v_recipes_before,
    'expected the recipe row inserted earlier in the SAME transaction to be rolled back too'
  );
  perform pg_temp.assert(
    not exists(select 1 from public.recipes where slug = 'bozuk-malzeme-tarifi'),
    'expected no recipe with this slug to survive the rollback'
  );
  perform pg_temp.assert(
    (select recipe_id from public.recipe_generation_jobs where id = v_job_id) is null,
    'expected job.recipe_id to remain null after an ingredient-insert rollback'
  );
end;
$$;

\echo '3. Ingredient failure rollback: PASSED'

-- ===================================================================================================
-- 4. Missing asset: the square crop-photos asset is missing -> refused, no recipe created.
-- ===================================================================================================

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_failed boolean := false;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('Eksik Fotografli Tarif', 'lock-asset-1', p_include_square => false);

  begin
    perform public.publish_recipe_draft(v_job_id, 'lock-asset-1', 'eksik-fotografli-tarif');
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_MISSING_ASSETS:%' and sqlerrm like '%square%';
  end;
  perform pg_temp.assert(v_failed, 'expected PUBLISH_MISSING_ASSETS naming the missing square asset');
  perform pg_temp.assert(
    (select recipe_id from public.recipe_generation_jobs where id = v_job_id) is null,
    'expected no recipe on a missing-asset failure'
  );
end;
$$;

\echo '4. Missing asset: PASSED'

-- ===================================================================================================
-- 5. Incomplete safety checklist: no recipe_admin_reviews approve row for this exact draft version
--    -> refused, even though QA and assets are otherwise clean.
-- ===================================================================================================

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_failed boolean := false;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('Onaysiz Tarif', 'lock-checklist-1', p_admin_approve => false);

  begin
    perform public.publish_recipe_draft(v_job_id, 'lock-checklist-1', 'onaysiz-tarif');
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_SAFETY_CHECKLIST_INCOMPLETE:%';
  end;
  perform pg_temp.assert(v_failed, 'expected PUBLISH_SAFETY_CHECKLIST_INCOMPLETE with no admin approve row');
  perform pg_temp.assert(
    (select recipe_id from public.recipe_generation_jobs where id = v_job_id) is null,
    'expected no recipe when the human safety checklist is incomplete'
  );
end;
$$;

\echo '5. Incomplete safety checklist: PASSED'

-- ===================================================================================================
-- 6. QA result missing / not clean: both variants of "matching QA result without blockers" failing.
-- ===================================================================================================

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_failed boolean := false;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('QA Sonucu Yok', 'lock-qa-missing-1', p_qa_result => 'none');
  begin
    perform public.publish_recipe_draft(v_job_id, 'lock-qa-missing-1', 'qa-sonucu-yok');
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_QA_RESULT_MISSING:%';
  end;
  perform pg_temp.assert(v_failed, 'expected PUBLISH_QA_RESULT_MISSING when no recipe_qa_results row exists for this draft version');
end;
$$;

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_failed boolean := false;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('Bloklayici QA Sorunu Var', 'lock-qa-blocking-1', p_qa_result => 'blocking');
  begin
    perform public.publish_recipe_draft(v_job_id, 'lock-qa-blocking-1', 'bloklayici-qa-sorunu-var');
  exception when others then
    v_failed := sqlerrm like 'PUBLISH_QA_NOT_CLEAN:%';
  end;
  perform pg_temp.assert(v_failed, 'expected PUBLISH_QA_NOT_CLEAN when the QA result still has a blocking issue');
end;
$$;

\echo '6. QA result missing/not clean: PASSED'

-- ===================================================================================================
-- 7. Double publish: a repeated call for an already-published job returns the SAME recipe, even
--    under a completely different (wrong) lock token — never a second recipe row.
-- ===================================================================================================

do $$
declare
  v_job_id uuid; v_draft_id uuid; v_batch_id uuid;
  v_result1 jsonb;
  v_result2 jsonb;
begin
  select job_id, draft_id, batch_id into v_job_id, v_draft_id, v_batch_id
    from pg_temp.seed_ready_job('Cift Yayinlama Denemesi', 'lock-double-1');

  v_result1 := public.publish_recipe_draft(v_job_id, 'lock-double-1', 'cift-yayinlama-denemesi');
  perform pg_temp.assert((v_result1->>'ok')::boolean, 'expected the first call to succeed');

  -- Second call uses a DIFFERENT lock token — proving the idempotency short-circuit is keyed on
  -- job.recipe_id alone, checked BEFORE the lock/status assertion (see the RPC's own comment).
  v_result2 := public.publish_recipe_draft(v_job_id, 'a-completely-different-token', 'cift-yayinlama-denemesi');

  perform pg_temp.assert((v_result2->>'ok')::boolean, 'expected the second call to also report ok=true');
  perform pg_temp.assert((v_result2->>'alreadyPublished')::boolean, 'expected alreadyPublished=true on the repeated call');
  perform pg_temp.assert(v_result2->>'recipeId' = v_result1->>'recipeId', 'expected the SAME recipeId on both calls');
  perform pg_temp.assert(
    (select count(*) from public.recipes where slug = 'cift-yayinlama-denemesi') = 1,
    'expected exactly one recipe row despite two publish calls'
  );
end;
$$;

\echo '7. Double publish: PASSED'

\echo 'F2 Step 12 publish-stage vertical slice SQL test: ALL ASSERTIONS PASSED'
