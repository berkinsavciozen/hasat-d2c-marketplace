-- Admin cover regeneration — assertion suite for 20260925083635_admin_set_recipe_cover.sql.

\set ON_ERROR_STOP on
\o /dev/null

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

-- The three recipe_assets-shaped rows the Edge Function sends for `p_slug`, image-stage style.
create or replace function pg_temp.assets(p_slug text, p_trace text default 'req_1')
returns jsonb
language sql
as $$
  select jsonb_build_array(
    jsonb_build_object('asset_type', 'source', 'storage_path', p_slug || '-source.png', 'content_type', 'image/png',
      'width_px', 1024, 'height_px', 1024, 'source_width_px', 1024, 'source_height_px', 1024,
      'prompt', 'p', 'processing_params', jsonb_build_object('chopFraction', 0.14), 'provider', 'google-gemini',
      'model', 'google/gemini-2.5-flash-image', 'trace_id', p_trace),
    jsonb_build_object('asset_type', 'hero', 'storage_path', p_slug || '-16x9.webp', 'content_type', 'image/webp',
      'width_px', 880, 'height_px', 495, 'source_width_px', 1024, 'source_height_px', 1024, 'quality', 82,
      'prompt', 'p', 'processing_params', jsonb_build_object('chopFraction', 0.14), 'validation_status', 'passed',
      'validation_results', jsonb_build_object('suspicious', false), 'provider', 'google-gemini',
      'model', 'google/gemini-2.5-flash-image', 'trace_id', p_trace),
    jsonb_build_object('asset_type', 'square', 'storage_path', p_slug || '-1x1.webp', 'content_type', 'image/webp',
      'width_px', 880, 'height_px', 880, 'source_width_px', 1024, 'source_height_px', 1024, 'quality', 82,
      'prompt', 'p', 'processing_params', jsonb_build_object('chopFraction', 0.14), 'validation_status', 'warning',
      'validation_results', jsonb_build_object('suspicious', true), 'provider', 'google-gemini',
      'model', 'google/gemini-2.5-flash-image', 'trace_id', p_trace)
  )
$$;

create or replace function pg_temp.expect_error(p_sql text, p_prefix text, msg text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (no error raised)', msg;
exception when others then
  if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  if position(p_prefix in sqlerrm) <> 1 then
    raise exception 'ASSERTION FAILED: % (got "%")', msg, sqlerrm;
  end if;
end;
$$;

-- ---- fixtures ------------------------------------------------------------------------------------
insert into public.recipes (id, slug, title, cover_photo_url, status) values
  ('00000000-0000-0000-0000-00000000000a', 'safranli-zerde', 'Safranlı Zerde',
   'https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/safranli-zerde-1x1.webp', 'published'),
  ('00000000-0000-0000-0000-00000000000b', 'legacy-iki', 'Legacy İki', null, 'published'),
  ('00000000-0000-0000-0000-00000000000c', 'f2-tarif', 'F2 Tarif',
   'https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/f2-tarif-16x9.webp', 'published'),
  ('00000000-0000-0000-0000-00000000000d', 'job-var-asset-yok', 'Job Var Asset Yok', null, 'published');

-- F2-published recipe: real batch/job/draft + its three assets
insert into public.recipe_generation_batches (id, target_count, status) values
  ('00000000-0000-0000-0000-0000000000b1', 3, 'active');
insert into public.recipe_generation_jobs (id, batch_id, brief_id, recipe_id, working_title, stage, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', gen_random_uuid(),
   '00000000-0000-0000-0000-00000000000c', 'F2 Tarif', 'publish', 'queued'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', gen_random_uuid(),
   '00000000-0000-0000-0000-00000000000d', 'Job Var', 'publish', 'queued');
insert into public.recipe_drafts (id, job_id, version, title, ingredients, steps) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 1, 'F2 Tarif', '[{}]', '[{}]'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 1, 'Job Var v1', '[{}]', '[{}]'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 2, 'Job Var v2', '[{}]', '[{}]');
insert into public.recipe_assets (job_id, draft_id, recipe_id, asset_type, storage_path, content_type, trace_id)
select '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2',
  '00000000-0000-0000-0000-00000000000c', t, p, ct, 'old'
from (values ('source', 'f2-tarif-source.png', 'image/png'), ('hero', 'f2-tarif-16x9.webp', 'image/webp'),
             ('square', 'f2-tarif-1x1.webp', 'image/webp')) v(t, p, ct);

-- ---- 1. Zerde: no job, no assets -> synthetic job/draft ------------------------------------------
do $$
declare r jsonb; j record;
begin
  r := public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000a', pg_temp.assets('safranli-zerde'));
  perform pg_temp.assert(r->>'coverPhotoUrl' =
    'https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/safranli-zerde-16x9.webp',
    'zerde: returned cover url is the 16:9 hero url');
  perform pg_temp.assert((r->>'createdSyntheticJob')::boolean, 'zerde: synthetic job created');
  perform pg_temp.assert((select cover_photo_url from public.recipes where slug = 'safranli-zerde') = r->>'coverPhotoUrl',
    'zerde: recipes.cover_photo_url updated');
  perform pg_temp.assert((select cover_photo_url from public.recipes where slug = 'safranli-zerde') ~ '-16x9\.webp$',
    'zerde: cover now satisfies DQ-2 COVER_NOT_HERO name rule');
  select * into j from public.recipe_generation_jobs where id = (r->>'jobId')::uuid;
  perform pg_temp.assert(j.stage = 'publish' and j.status = 'completed' and j.completed_at is not null,
    'zerde: synthetic job is terminal publish/completed');
  perform pg_temp.assert(j.recipe_id = '00000000-0000-0000-0000-00000000000a', 'zerde: synthetic job carries recipe_id');
  perform pg_temp.assert((select count(*) from public.recipe_assets where recipe_id = '00000000-0000-0000-0000-00000000000a') = 3,
    'zerde: exactly 3 asset rows');
  perform pg_temp.assert((select count(*) from public.recipe_assets
    where recipe_id = '00000000-0000-0000-0000-00000000000a' and job_id = (r->>'jobId')::uuid
      and draft_id = (r->>'draftId')::uuid and storage_bucket = 'crop-photos') = 3,
    'zerde: all asset rows under the synthetic pair, crop-photos bucket');
  perform pg_temp.assert((select quality = 82 and width_px = 880 and height_px = 495 and validation_status = 'passed'
      and processing_params->>'chopFraction' = '0.14' and model = 'google/gemini-2.5-flash-image'
    from public.recipe_assets where recipe_id = '00000000-0000-0000-0000-00000000000a' and asset_type = 'hero'),
    'zerde: hero row carries image-stage metadata');
  perform pg_temp.assert((select content_type from public.recipe_assets
    where recipe_id = '00000000-0000-0000-0000-00000000000a' and asset_type = 'source') = 'image/png',
    'zerde: source row keeps its sniffed content type');
  perform pg_temp.assert((select count(*) from public.recipe_generation_batches where notes like 'ADMIN COVER REGENERATION%') = 1,
    'zerde: one marker batch');
  perform pg_temp.assert((select status = 'completed' and review_status = 'approved' and fanned_out_at is not null
    from public.recipe_generation_batches where notes like 'ADMIN COVER REGENERATION%'),
    'zerde: marker batch is terminal and out of the plan-review queue');
end;
$$;

-- ---- 2. Zerde again: reuses the same pair, replaces rows ------------------------------------------
do $$
declare r1 jsonb; r2 jsonb;
begin
  select jsonb_build_object('jobId', job_id, 'draftId', draft_id) into r1
  from public.recipe_assets where recipe_id = '00000000-0000-0000-0000-00000000000a' and asset_type = 'hero';
  r2 := public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000a', pg_temp.assets('safranli-zerde', 'req_2'));
  perform pg_temp.assert(not (r2->>'createdSyntheticJob')::boolean, 'zerde re-apply: no new job');
  perform pg_temp.assert(r2->>'jobId' = r1->>'jobId' and r2->>'draftId' = r1->>'draftId', 'zerde re-apply: same pair');
  perform pg_temp.assert((select count(*) from public.recipe_assets where recipe_id = '00000000-0000-0000-0000-00000000000a') = 3,
    'zerde re-apply: still exactly 3 rows');
  perform pg_temp.assert((select bool_and(trace_id = 'req_2') from public.recipe_assets
    where recipe_id = '00000000-0000-0000-0000-00000000000a'), 'zerde re-apply: rows replaced');
end;
$$;

-- ---- 3. a second pre-pipeline recipe shares the marker batch --------------------------------------
do $$
declare r jsonb;
begin
  r := public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000b', pg_temp.assets('legacy-iki'));
  perform pg_temp.assert((r->>'createdSyntheticJob')::boolean, 'legacy-iki: own synthetic job');
  perform pg_temp.assert((select count(*) from public.recipe_generation_batches where notes like 'ADMIN COVER REGENERATION%') = 1,
    'legacy-iki: marker batch reused');
  perform pg_temp.assert((select count(*) from public.recipe_generation_jobs where working_title like 'ADMIN COVER REGENERATION%') = 2,
    'legacy-iki: one synthetic job per recipe');
end;
$$;

-- ---- 4. F2-published recipe: rows replaced under its real job/draft ------------------------------
do $$
declare r jsonb;
begin
  r := public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000c', pg_temp.assets('f2-tarif', 'req_new'));
  perform pg_temp.assert(not (r->>'createdSyntheticJob')::boolean, 'f2: no synthetic job');
  perform pg_temp.assert(r->>'jobId' = '00000000-0000-0000-0000-0000000000c1'
    and r->>'draftId' = '00000000-0000-0000-0000-0000000000c2', 'f2: real pair reused');
  perform pg_temp.assert((select count(*) from public.recipe_assets where job_id = '00000000-0000-0000-0000-0000000000c1') = 3,
    'f2: still exactly 3 rows');
  perform pg_temp.assert((select bool_and(trace_id = 'req_new') from public.recipe_assets
    where job_id = '00000000-0000-0000-0000-0000000000c1'), 'f2: old rows replaced');
  perform pg_temp.assert((select status from public.recipe_generation_jobs where id = '00000000-0000-0000-0000-0000000000c1') = 'queued',
    'f2: real job untouched');
end;
$$;

-- ---- 5. recipe with a job but no assets: job + LATEST draft --------------------------------------
do $$
declare r jsonb;
begin
  r := public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000d', pg_temp.assets('job-var-asset-yok'));
  perform pg_temp.assert(not (r->>'createdSyntheticJob')::boolean, 'job-var: no synthetic job');
  perform pg_temp.assert(r->>'jobId' = '00000000-0000-0000-0000-0000000000d1'
    and r->>'draftId' = '00000000-0000-0000-0000-0000000000d3', 'job-var: latest draft version used');
end;
$$;

-- ---- 6. errors: nothing changes ------------------------------------------------------------------
create temp table snapshot as
  select (select count(*) from public.recipe_assets) assets,
         (select count(*) from public.recipe_generation_jobs) jobs,
         (select cover_photo_url from public.recipes where slug = 'safranli-zerde') zerde_cover;

select pg_temp.expect_error(
  $q$select public.admin_set_recipe_cover('00000000-0000-0000-0000-0000000000ff', pg_temp.assets('yok'))$q$,
  'ADMIN_SET_COVER_RECIPE_NOT_FOUND', 'unknown recipe -> NOT_FOUND');
select pg_temp.expect_error(
  $q$select public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000a', pg_temp.assets('baska-tarif'))$q$,
  'ADMIN_SET_COVER_INVALID_ASSETS', 'another recipe''s file names -> INVALID_ASSETS');
select pg_temp.expect_error(
  $q$select public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000a',
       (select jsonb_agg(e) from jsonb_array_elements(pg_temp.assets('safranli-zerde')) e where e->>'asset_type' <> 'square')
         || jsonb_build_array((pg_temp.assets('safranli-zerde'))->1))$q$,
  'ADMIN_SET_COVER_INVALID_ASSETS', 'duplicate hero / missing square -> INVALID_ASSETS');
select pg_temp.expect_error(
  $q$select public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000a', '{}'::jsonb)$q$,
  'ADMIN_SET_COVER_INVALID_ASSETS', 'non-array -> INVALID_ASSETS');
select pg_temp.expect_error(
  $q$select public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000a',
       jsonb_set(pg_temp.assets('safranli-zerde'), '{1,content_type}', '"image/png"'))$q$,
  'ADMIN_SET_COVER_INVALID_ASSETS', 'hero not webp -> INVALID_ASSETS');
select pg_temp.expect_error(
  $q$select public.admin_set_recipe_cover('00000000-0000-0000-0000-00000000000a',
       jsonb_set(pg_temp.assets('safranli-zerde'), '{0,storage_path}', '"safranli-zerde-candidate-source.png"'))$q$,
  'ADMIN_SET_COVER_INVALID_ASSETS', 'candidate file name -> INVALID_ASSETS');

select pg_temp.assert(
  (select assets from snapshot) = (select count(*) from public.recipe_assets)
  and (select jobs from snapshot) = (select count(*) from public.recipe_generation_jobs)
  and (select zerde_cover from snapshot) = (select cover_photo_url from public.recipes where slug = 'safranli-zerde'),
  'errors left every table unchanged');

-- ---- 7. grants -----------------------------------------------------------------------------------
select pg_temp.assert(has_function_privilege('service_role', 'public.admin_set_recipe_cover(uuid, jsonb)', 'execute'),
  'service_role can execute');
select pg_temp.assert(not has_function_privilege('anon', 'public.admin_set_recipe_cover(uuid, jsonb)', 'execute'),
  'anon cannot execute');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.admin_set_recipe_cover(uuid, jsonb)', 'execute'),
  'authenticated cannot execute');
select pg_temp.assert((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where proname = 'admin_set_recipe_cover'), 'security definer with empty search_path');
