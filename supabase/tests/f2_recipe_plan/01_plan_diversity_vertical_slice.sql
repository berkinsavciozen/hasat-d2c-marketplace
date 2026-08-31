-- F2 Recipe Automation — Step 13 SQL test: validate_recipe_plan_diversity + recipe_plan_briefs'
-- own crop_config FK.
--
-- Proves, against a real fresh Postgres database (never the live Supabase project — see run.sh),
-- the plan-diversity rules PROMPT 13's "Başlangıç kuralları" require. Same plain-psql-assertion
-- convention as ../f2_recipe_automation/*_vertical_slice.sql and ../f2_recipe_publish/
-- 01_publish_vertical_slice.sql — no pgTAP dependency.

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

/** Builds one recipeBriefSchema-shaped jsonb object (camelCase, matching schemas.ts verbatim). */
create or replace function pg_temp.brief(
  p_title text,
  p_crop text,
  p_audience text default 'bireysel',
  p_meal_type text default 'ana_yemek',
  p_difficulty text default 'orta'
) returns jsonb
language sql
as $$
  select jsonb_build_object(
    'briefId', gen_random_uuid(),
    'batchId', gen_random_uuid(),
    'workingTitle', p_title,
    'focusCrop', p_crop,
    'angle', 'test angle',
    'targetDifficulty', p_difficulty,
    'dietTags', '[]'::jsonb,
    'locale', 'tr',
    'audience', p_audience,
    'mealType', p_meal_type,
    'selectionReason', 'test reason'
  );
$$;

create or replace function pg_temp.plan_of(variadic p_briefs jsonb[])
returns jsonb
language sql
as $$
  select jsonb_build_object('briefs', to_jsonb(p_briefs));
$$;

create or replace function pg_temp.has_issue(p_result jsonb, p_code text, p_severity text default null)
returns boolean
language sql
as $$
  select exists (
    select 1 from jsonb_array_elements(p_result->'issues') i
    where i->>'code' = p_code and (p_severity is null or i->>'severity' = p_severity)
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 1: focusCrop missing -> blocking DIVERSITY_CROP_REQUIRED, valid=false.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(pg_temp.brief('Yeni Bir Corba', null))
  );
  perform pg_temp.assert((v_result->>'valid')::boolean = false, 'plan with a missing focusCrop must be invalid');
  perform pg_temp.assert(pg_temp.has_issue(v_result, 'DIVERSITY_CROP_REQUIRED', 'blocking'), 'must report DIVERSITY_CROP_REQUIRED');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 2 (REQUIRED coverage: "primary crop crop_config dışıysa reddi"): focusCrop not in
-- crop_config -> blocking DIVERSITY_CROP_NOT_IN_CONFIG, valid=false.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(pg_temp.brief('Ispanakli Borek', 'ispanak'))
  );
  perform pg_temp.assert((v_result->>'valid')::boolean = false, 'plan with a crop outside crop_config must be invalid');
  perform pg_temp.assert(pg_temp.has_issue(v_result, 'DIVERSITY_CROP_NOT_IN_CONFIG', 'blocking'), 'must report DIVERSITY_CROP_NOT_IN_CONFIG');
end;
$$;

-- Same rule enforced a SECOND, independent way: the crop_config FK on recipe_plan_briefs itself
-- refuses to even PERSIST a brief naming a crop outside crop_config — a direct SQL insert bypassing
-- both the Zod layer and the diversity RPC still cannot create one.
do $$
declare
  v_batch_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  begin
    insert into public.recipe_plan_briefs (batch_id, brief_id, working_title, focus_crop, selection_reason)
    values (v_batch_id, gen_random_uuid(), 'Ispanakli Borek', 'ispanak', 'test reason');
  exception when foreign_key_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'recipe_plan_briefs must refuse a focus_crop outside crop_config (FK)');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 3 (REQUIRED coverage: "plan diversity ihlali reddi"): same primary crop repeated ->
-- blocking DIVERSITY_CROP_REPEATED by default, valid=false.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(
      pg_temp.brief('Kabakli Corba', 'kabak'),
      pg_temp.brief('Kabakli Pilav', 'kabak')
    )
  );
  perform pg_temp.assert((v_result->>'valid')::boolean = false, 'a plan repeating the same primary crop must be invalid by default');
  perform pg_temp.assert(pg_temp.has_issue(v_result, 'DIVERSITY_CROP_REPEATED', 'blocking'), 'must report DIVERSITY_CROP_REPEATED');
end;
$$;

-- Same repeat, but explicitly allowed via p_options.allowCropRepeat -> no DIVERSITY_CROP_REPEATED.
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(
      pg_temp.brief('Kabakli Corba', 'kabak'),
      pg_temp.brief('Kabakli Pilav', 'kabak')
    ),
    jsonb_build_object('allowCropRepeat', true)
  );
  perform pg_temp.assert(not pg_temp.has_issue(v_result, 'DIVERSITY_CROP_REPEATED'), 'allowCropRepeat=true must suppress the repeat check');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 4: exact title match against an existing recipe -> blocking DIVERSITY_EXACT_DUPLICATE.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(pg_temp.brief('Firinda Kabak Musakka', 'kabak'))
  );
  perform pg_temp.assert((v_result->>'valid')::boolean = false, 'an exact-title duplicate of an existing recipe must be invalid');
  perform pg_temp.assert(pg_temp.has_issue(v_result, 'DIVERSITY_EXACT_DUPLICATE', 'blocking'), 'must report DIVERSITY_EXACT_DUPLICATE');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 5: a near-duplicate (word-overlap, not exact) -> warning only, plan stays valid.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(pg_temp.brief('Yazlik Firinda Kabak Yemegi', 'kabak'))
  );
  perform pg_temp.assert(pg_temp.has_issue(v_result, 'DIVERSITY_NEAR_DUPLICATE', 'warning'), 'must report DIVERSITY_NEAR_DUPLICATE as a warning');
  perform pg_temp.assert((v_result->>'valid')::boolean = true, 'a warning-only near-duplicate must not invalidate the plan');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 6: a clean, diverse plan -> valid=true, no issues at all.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(
      pg_temp.brief('Firinli Domates Corbasi', 'domates', 'bireysel', 'corba'),
      pg_temp.brief('Patlicanli HoReCa Meze Tabagi', 'patlican', 'horeca', 'aperatif_meze')
    )
  );
  perform pg_temp.assert((v_result->>'valid')::boolean = true, 'a clean, diverse two-brief plan must be valid');
  perform pg_temp.assert(jsonb_array_length(v_result->'issues') = 0, 'a clean, diverse plan should carry zero issues');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 7: both briefs the same audience -> warning DIVERSITY_AUDIENCE_NOT_COVERED, still valid.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(
    pg_temp.plan_of(
      pg_temp.brief('Firinli Domates Corbasi', 'domates', 'bireysel'),
      pg_temp.brief('Patlicanli Kizartma', 'patlican', 'bireysel')
    )
  );
  perform pg_temp.assert(pg_temp.has_issue(v_result, 'DIVERSITY_AUDIENCE_NOT_COVERED', 'warning'), 'must warn when only one audience is covered');
  perform pg_temp.assert((v_result->>'valid')::boolean = true, 'an audience-coverage warning must not invalidate the plan');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 8: an empty briefs array -> blocking DIVERSITY_BRIEFS_EMPTY.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan_diversity(jsonb_build_object('briefs', '[]'::jsonb));
  perform pg_temp.assert((v_result->>'valid')::boolean = false, 'an empty briefs array must be invalid');
  perform pg_temp.assert(pg_temp.has_issue(v_result, 'DIVERSITY_BRIEFS_EMPTY', 'blocking'), 'must report DIVERSITY_BRIEFS_EMPTY');
end;
$$;

\echo 'F2 Step 13 plan-diversity vertical slice: PASSED'
