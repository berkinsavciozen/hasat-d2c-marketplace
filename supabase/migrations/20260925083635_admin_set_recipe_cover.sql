-- Admin cover regeneration — the one database write behind admin-recipe-regenerate-cover's
-- `POST /{recipeId}/apply`.
--
-- Why: DQ-2's COVER_NOT_HERO flags recipes whose cover is not a stored `-16x9.webp` hero (live
-- example: Safranlı Zerde, whose only file is `safranli-zerde-1x1.webp`). The admin panel had no
-- way to regenerate a cover; the one-off legacy-recipe-image-backfill that did this for 10
-- recipes updated `recipes` directly and is decommissioned. The new Edge Function generates a
-- candidate, an admin approves it, and only then calls this RPC to make it the recipe's cover.
--
-- What it does, in ONE transaction:
--   1. Locks the recipe row; raises ADMIN_SET_COVER_RECIPE_NOT_FOUND if it doesn't exist.
--   2. Validates p_assets: exactly one source/hero/square row each, and the storage paths are the
--      image-stage / finalize asset-contract names for the recipe's OWN slug
--      (`{slug}-source.{png|jpg}`, `{slug}-16x9.webp`, `{slug}-1x1.webp`) — the function can only
--      ever point a recipe at its own files.
--   3. Resolves the (job_id, draft_id) pair recipe_assets' NOT NULL FKs need, in this order:
--        a. the pair the recipe's existing source/hero/square assets already use (re-regeneration,
--           or a recipe the F2 pipeline / legacy backfill published) — rows are replaced in place;
--        b. the recipe's own recipe_generation_jobs row (unique per recipe_id) + its latest draft;
--        c. otherwise (pre-pipeline recipes like Zerde) a synthetic per-recipe job + draft under
--           one shared marker batch — the same shape the legacy backfill left live (one terminal
--           stage='publish'/status='completed' job per recipe, recipe_id set on insert), so
--           recipe-stage-sweep's candidate queries can never match it.
--   4. Replaces that pair's source/hero/square recipe_assets rows with p_assets.
--   5. Sets recipes.cover_photo_url to the hero's public URL, built exactly the way
--      publish_recipe_draft builds it.
--
-- p_assets: a jsonb array of three objects whose keys are recipe_assets column names
-- (asset_type, storage_path, content_type, width_px, height_px, source_width_px,
-- source_height_px, quality, prompt, processing_params, validation_status, validation_results,
-- provider, model, trace_id). job_id / draft_id / recipe_id / storage_bucket are always set here,
-- never taken from the caller.
--
-- Security: SECURITY DEFINER, search_path='', service_role-only — same posture as every
-- admin_update_* RPC (T10 / DQ-2).

create or replace function public.admin_set_recipe_cover(p_recipe_id uuid, p_assets jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_marker constant text :=
    'ADMIN COVER REGENERATION — synthetic batch/job/draft created by public.admin_set_recipe_cover '
    '(admin-recipe-regenerate-cover Edge Function) for a recipe that never had a '
    'recipe_generation_jobs row. They exist ONLY to satisfy recipe_assets'' NOT NULL '
    'job_id/draft_id FK, carry no generation content and are terminal (status=completed), so the '
    'pipeline never claims or sweeps them.';
  v_recipe record;
  v_asset jsonb;
  v_types text[];
  v_path text;
  v_job_id uuid;
  v_draft_id uuid;
  v_batch_id uuid;
  v_created_job boolean := false;
  v_hero_path text;
  v_base_url text;
  v_cover_url text;
  v_now timestamptz := now();
begin
  select id, slug into v_recipe from public.recipes where id = p_recipe_id for update;
  if not found then
    raise exception 'ADMIN_SET_COVER_RECIPE_NOT_FOUND: recipe % does not exist', p_recipe_id;
  end if;

  -- ---- 2. validate p_assets ---------------------------------------------------------------------
  if p_assets is null or jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets) <> 3 then
    raise exception 'ADMIN_SET_COVER_INVALID_ASSETS: p_assets must be an array of exactly 3 objects';
  end if;
  select array_agg(e->>'asset_type' order by e->>'asset_type') into v_types
  from jsonb_array_elements(p_assets) e;
  if v_types is distinct from array['hero', 'source', 'square'] then
    raise exception 'ADMIN_SET_COVER_INVALID_ASSETS: p_assets must hold exactly one source, hero and square';
  end if;

  for v_asset in select * from jsonb_array_elements(p_assets)
  loop
    v_path := v_asset->>'storage_path';
    if v_asset->>'asset_type' = 'hero' then
      if v_path is distinct from v_recipe.slug || '-16x9.webp' then
        raise exception 'ADMIN_SET_COVER_INVALID_ASSETS: hero storage_path must be %', v_recipe.slug || '-16x9.webp';
      end if;
      v_hero_path := v_path;
    elsif v_asset->>'asset_type' = 'square' then
      if v_path is distinct from v_recipe.slug || '-1x1.webp' then
        raise exception 'ADMIN_SET_COVER_INVALID_ASSETS: square storage_path must be %', v_recipe.slug || '-1x1.webp';
      end if;
    else
      if v_path is null or v_path not in (v_recipe.slug || '-source.png', v_recipe.slug || '-source.jpg') then
        raise exception 'ADMIN_SET_COVER_INVALID_ASSETS: source storage_path must be %-source.png or .jpg', v_recipe.slug;
      end if;
    end if;
    if v_asset->>'asset_type' in ('hero', 'square') and v_asset->>'content_type' is distinct from 'image/webp' then
      raise exception 'ADMIN_SET_COVER_INVALID_ASSETS: % content_type must be image/webp', v_asset->>'asset_type';
    end if;
  end loop;

  -- ---- 3. resolve (job_id, draft_id) ------------------------------------------------------------
  -- a. the pair this recipe's cover assets already live under
  select a.job_id, a.draft_id into v_job_id, v_draft_id
  from public.recipe_assets a
  where a.recipe_id = p_recipe_id and a.asset_type in ('source', 'hero', 'square')
  order by (a.asset_type = 'hero') desc, a.created_at desc
  limit 1;

  -- b. the recipe's own generation job (recipe_generation_jobs.recipe_id is unique) + latest draft
  if v_job_id is null then
    select j.id, d.id into v_job_id, v_draft_id
    from public.recipe_generation_jobs j
    join lateral (
      select d.id from public.recipe_drafts d where d.job_id = j.id order by d.version desc limit 1
    ) d on true
    where j.recipe_id = p_recipe_id;
  end if;

  -- c. synthetic per-recipe job + draft under one shared marker batch
  if v_job_id is null then
    select b.id into v_batch_id
    from public.recipe_generation_batches b
    where b.notes = c_marker
    order by b.created_at
    limit 1;

    if v_batch_id is null then
      insert into public.recipe_generation_batches (
        target_count, diet_focus, notes, status, started_at, completed_at,
        review_status, reviewed_by, reviewed_at, fanned_out_at
      ) values (
        1, '{}', c_marker, 'completed', v_now, v_now,
        'approved', 'admin-recipe-regenerate-cover', v_now, v_now
      )
      returning id into v_batch_id;
    end if;

    -- recipe_id is set on INSERT (not UPDATE) so recipe_jobs_finalize_recipe_facts — a BEFORE
    -- UPDATE OF recipe_id trigger meant for real publish jobs — never fires for this row.
    insert into public.recipe_generation_jobs (
      batch_id, brief_id, recipe_id, working_title, stage, status,
      started_at, finished_at, completed_at
    ) values (
      v_batch_id, gen_random_uuid(), p_recipe_id, c_marker || ' — ' || v_recipe.slug, 'publish', 'completed',
      v_now, v_now, v_now
    )
    returning id into v_job_id;

    insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
    values (
      v_job_id, 1, c_marker || ' — ' || v_recipe.slug,
      jsonb_build_array(jsonb_build_object(
        'crop', null, 'freeTextName', 'admin-cover-placeholder', 'quantity', null, 'unit', null,
        'note', null, 'isKeyIngredient', false, 'ingredientClass', null, 'sortOrder', 0)),
      jsonb_build_array(jsonb_build_object(
        'stepNo', 1, 'instruction', 'Admin cover regeneration placeholder draft — carries no recipe content.',
        'photoUrl', null, 'timerSeconds', null))
    )
    returning id into v_draft_id;

    v_created_job := true;
  end if;

  -- ---- 4. replace the pair's cover assets -------------------------------------------------------
  delete from public.recipe_assets
  where job_id = v_job_id and draft_id = v_draft_id and asset_type in ('source', 'hero', 'square');

  insert into public.recipe_assets (
    job_id, draft_id, recipe_id, asset_type, storage_bucket, storage_path, content_type,
    width_px, height_px, source_width_px, source_height_px, quality, prompt, processing_params,
    validation_status, validation_results, provider, model, trace_id
  )
  select
    v_job_id, v_draft_id, p_recipe_id, r.asset_type, 'crop-photos', r.storage_path,
    coalesce(r.content_type, 'image/webp'),
    r.width_px, r.height_px, r.source_width_px, r.source_height_px, r.quality, r.prompt,
    r.processing_params, r.validation_status, r.validation_results,
    coalesce(r.provider, 'google-gemini'), r.model, r.trace_id
  from jsonb_array_elements(p_assets) e,
    lateral jsonb_populate_record(null::public.recipe_assets, e) r;

  -- ---- 5. point the recipe at the hero ----------------------------------------------------------
  v_base_url := coalesce(current_setting('app.supabase_url', true), 'https://efuqpiaavrzimvstpdpm.supabase.co');
  v_cover_url := v_base_url || '/storage/v1/object/public/crop-photos/' || v_hero_path;
  update public.recipes set cover_photo_url = v_cover_url where id = p_recipe_id;

  return jsonb_build_object(
    'recipeId', p_recipe_id,
    'slug', v_recipe.slug,
    'coverPhotoUrl', v_cover_url,
    'jobId', v_job_id,
    'draftId', v_draft_id,
    'createdSyntheticJob', v_created_job
  );
end;
$$;

comment on function public.admin_set_recipe_cover(uuid, jsonb) is
  'Admin cover regeneration: replaces a recipe''s source/hero/square recipe_assets rows and sets '
  'recipes.cover_photo_url to the hero. Called only by the admin-recipe-regenerate-cover Edge '
  'Function after an admin approved the candidate. service_role only.';

revoke all on function public.admin_set_recipe_cover(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_recipe_cover(uuid, jsonb) to service_role;
