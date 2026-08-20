-- F2 Recipe Automation — Step 03A SQL test suite.
--
-- Plain psql assertions (no pgTAP dependency — none is installed in this project). Run with
-- `psql -v ON_ERROR_STOP=1`; any RAISE EXCEPTION aborts the script with a non-zero exit code, so
-- CI/manual runs fail loudly. See run.sh for the full fresh-database apply-and-test sequence.

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
-- 1. Happy path: batch -> job -> draft -> QA result -> assets
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
begin
  insert into public.recipe_generation_batches (target_count, locale)
  values (5, 'tr')
  returning id into v_batch_id;

  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, focus_crop)
  values (v_batch_id, gen_random_uuid(), 'Firinda Kabak Musakka', 'kabak')
  returning id into v_job_id;

  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (
    v_job_id, 1, 'Firinda Kabak Musakka',
    '[{"crop":"kabak","freeTextName":null,"quantity":3,"unit":"adet","isKeyIngredient":true}]'::jsonb,
    '[{"stepNo":1,"instruction":"Kabaklari dilimleyin."}]'::jsonb
  )
  returning id into v_draft_id;

  insert into public.recipe_qa_results (
    job_id, draft_id, draft_version, decision, overall_score, scores,
    blocking_issues, non_blocking_suggestions, safety_review,
    safety_reviewed_by, safety_reviewed_at, safety_approved, approved_for_imaging
  ) values (
    v_job_id, v_draft_id, 1, 'approved', 88,
    '{"clarity":90,"feasibility":85,"ingredientConsistency":90,"originality":80,"hasatRelevance":95}'::jsonb,
    '[]'::jsonb, '[]'::jsonb,
    '{"temperature":{"flagged":false},"timing":{"flagged":false},"allergens":{"flagged":false,"detectedLabels":[]},"requiresHumanReview":true}'::jsonb,
    (select id from public.profiles limit 1), now(), true, true
  );

  insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
  values (v_job_id, v_draft_id, 'hero', 'recipes/firinda-kabak-musakka-16x9.webp');

  insert into public.recipe_assets (job_id, draft_id, asset_type, step_no, storage_path)
  values (v_job_id, v_draft_id, 'step', 1, 'recipes/firinda-kabak-musakka-step-1.webp');

  perform pg_temp.assert(
    (select count(*) from public.recipe_qa_results where job_id = v_job_id) = 1,
    'happy path: expected exactly one QA result row'
  );
  perform pg_temp.assert(
    (select count(*) from public.recipe_assets where job_id = v_job_id) = 2,
    'happy path: expected exactly two asset rows (hero + step)'
  );
end;
$$;

-- ===================================================================================================
-- 2. Negative: invalid stage/status enum values on recipe_generation_jobs
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_failed boolean := false;
begin
  select id into v_batch_id from public.recipe_generation_batches limit 1;
  begin
    insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage)
    values (v_batch_id, gen_random_uuid(), 'Invalid Stage Job', 'safety_review');
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected an invalid stage value (safety_review, pre-Step-03A vocabulary) to be rejected');
end;
$$;

do $$
declare
  v_batch_id uuid;
  v_failed boolean := false;
begin
  select id into v_batch_id from public.recipe_generation_batches limit 1;
  begin
    insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, status)
    values (v_batch_id, gen_random_uuid(), 'Invalid Status Job', 'pending');
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected an invalid status value (pending, pre-Step-03A vocabulary) to be rejected');
end;
$$;

-- ===================================================================================================
-- 3. Negative: partial lock states must be rejected (all-or-nothing CHECK)
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_failed boolean := false;
begin
  select id into v_batch_id from public.recipe_generation_batches limit 1;
  begin
    insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, locked_by)
    values (v_batch_id, gen_random_uuid(), 'Partial Lock Job', 'edge-fn-invocation-abc');
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected locked_by set without locked_at/lock_expires_at to be rejected');
end;
$$;

do $$
declare
  v_batch_id uuid;
  v_failed boolean := false;
begin
  select id into v_batch_id from public.recipe_generation_batches limit 1;
  begin
    insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, locked_at, lock_expires_at)
    values (v_batch_id, gen_random_uuid(), 'Partial Lock Job 2', now(), now() + interval '5 minutes');
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected locked_at/lock_expires_at set without locked_by to be rejected');
end;
$$;

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
begin
  select id into v_batch_id from public.recipe_generation_batches limit 1;
  -- All three set together must be accepted (the only valid non-null combination).
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, locked_by, locked_at, lock_expires_at)
  values (v_batch_id, gen_random_uuid(), 'Fully Locked Job', 'edge-fn-invocation-abc', now(), now() + interval '5 minutes')
  returning id into v_job_id;
  perform pg_temp.assert(v_job_id is not null, 'expected a fully-set lock triple to be accepted');
end;
$$;

-- ===================================================================================================
-- 4. Negative: QA imaging approval with blocking issues must be rejected
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count) values (1) returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title)
  values (v_batch_id, gen_random_uuid(), 'QA Imaging Gate Job') returning id into v_job_id;
  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (v_job_id, 1, 'QA Imaging Gate Job', '[{"crop":"kabak","quantity":1,"unit":"adet"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb)
  returning id into v_draft_id;

  begin
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores,
      blocking_issues, safety_review, approved_for_imaging
    ) values (
      v_job_id, v_draft_id, 1, 'revision_required', 40,
      '{"clarity":50,"feasibility":50,"ingredientConsistency":50,"originality":50,"hasatRelevance":50}'::jsonb,
      '[{"code":"UNUSED_INGREDIENT","field":"ingredients[0]","severity":"blocking","message":"x","requiredChange":"y"}]'::jsonb,
      '{"temperature":{"flagged":false},"timing":{"flagged":false},"allergens":{"flagged":false,"detectedLabels":[]},"requiresHumanReview":true}'::jsonb,
      true
    );
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected approved_for_imaging=true with non-empty blocking_issues to be rejected');
end;
$$;

-- ===================================================================================================
-- 5. Negative: QA decision='approved' without the mandatory human safety sign-off
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count) values (1) returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title)
  values (v_batch_id, gen_random_uuid(), 'QA Safety Gate Job') returning id into v_job_id;
  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (v_job_id, 1, 'QA Safety Gate Job', '[{"crop":"kabak","quantity":1,"unit":"adet"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb)
  returning id into v_draft_id;

  begin
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores, safety_review
    ) values (
      v_job_id, v_draft_id, 1, 'approved', 95,
      '{"clarity":95,"feasibility":95,"ingredientConsistency":95,"originality":95,"hasatRelevance":95}'::jsonb,
      '{"temperature":{"flagged":false},"timing":{"flagged":false},"allergens":{"flagged":false,"detectedLabels":[]},"requiresHumanReview":true}'::jsonb
      -- safety_approved defaults to NULL — no human sign-off recorded.
    );
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected decision=approved with no human safety sign-off (safety_approved NULL) to be rejected');
end;
$$;

-- ===================================================================================================
-- 6. Negative: cross-job draft/QA-result mismatch (relational-integrity fix)
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_a uuid;
  v_job_b uuid;
  v_draft_a uuid;
  v_draft_b uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count) values (2) returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title)
  values (v_batch_id, gen_random_uuid(), 'Job A') returning id into v_job_a;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title)
  values (v_batch_id, gen_random_uuid(), 'Job B') returning id into v_job_b;

  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (v_job_a, 1, 'Job A Draft', '[{"crop":"kabak","quantity":1,"unit":"adet"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb)
  returning id into v_draft_a;
  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (v_job_b, 1, 'Job B Draft', '[{"crop":"kabak","quantity":1,"unit":"adet"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb)
  returning id into v_draft_b;

  begin
    -- job_id = Job A, but draft_id = Job B's draft. Must be rejected by the composite FK.
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores, safety_review
    ) values (
      v_job_a, v_draft_b, 1, 'manual_review_required', 50,
      '{"clarity":50,"feasibility":50,"ingredientConsistency":50,"originality":50,"hasatRelevance":50}'::jsonb,
      '{"temperature":{"flagged":false},"timing":{"flagged":false},"allergens":{"flagged":false,"detectedLabels":[]},"requiresHumanReview":true}'::jsonb
    );
  exception when foreign_key_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected a QA result with job_id from job A but draft_id belonging to job B to be rejected (cross-job mismatch)');
end;
$$;

-- ===================================================================================================
-- 7. Negative: cross-job draft/asset mismatch (relational-integrity fix)
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_a uuid;
  v_job_b uuid;
  v_draft_a uuid;
  v_draft_b uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count) values (2) returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title)
  values (v_batch_id, gen_random_uuid(), 'Job C') returning id into v_job_a;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title)
  values (v_batch_id, gen_random_uuid(), 'Job D') returning id into v_job_b;

  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (v_job_a, 1, 'Job C Draft', '[{"crop":"kabak","quantity":1,"unit":"adet"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb)
  returning id into v_draft_a;
  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (v_job_b, 1, 'Job D Draft', '[{"crop":"kabak","quantity":1,"unit":"adet"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb)
  returning id into v_draft_b;

  begin
    insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
    values (v_job_a, v_draft_b, 'hero', 'recipes/mismatch-16x9.webp');
  exception when foreign_key_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected an asset with job_id from job C but draft_id belonging to job D to be rejected (cross-job mismatch)');
end;
$$;

-- ===================================================================================================
-- 8. Negative: duplicate non-step and duplicate step assets
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count) values (1) returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title)
  values (v_batch_id, gen_random_uuid(), 'Duplicate Asset Job') returning id into v_job_id;
  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (v_job_id, 1, 'Duplicate Asset Job', '[{"crop":"kabak","quantity":1,"unit":"adet"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb)
  returning id into v_draft_id;

  insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
  values (v_job_id, v_draft_id, 'hero', 'recipes/dup-16x9-a.webp');
  begin
    insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
    values (v_job_id, v_draft_id, 'hero', 'recipes/dup-16x9-b.webp');
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected a second hero asset for the same (job, draft) to be rejected');

  v_failed := false;
  insert into public.recipe_assets (job_id, draft_id, asset_type, step_no, storage_path)
  values (v_job_id, v_draft_id, 'step', 1, 'recipes/dup-step-1-a.webp');
  begin
    insert into public.recipe_assets (job_id, draft_id, asset_type, step_no, storage_path)
    values (v_job_id, v_draft_id, 'step', 1, 'recipes/dup-step-1-b.webp');
  exception when unique_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected a second step-1 asset for the same (job, draft) to be rejected');
end;
$$;

-- ===================================================================================================
-- 9. RPC: validate_recipe_plan — duplicate brief titles are now BLOCKING, not a silent warning
-- ===================================================================================================

do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_plan('{
    "briefs": [
      {"workingTitle": "Firinda Kabak", "focusCrop": "kabak"},
      {"workingTitle": "firinda kabak", "focusCrop": "domates"}
    ]
  }'::jsonb);

  perform pg_temp.assert((v_result->>'valid')::boolean = false, 'expected duplicate brief titles to make the plan invalid');
  perform pg_temp.assert(
    exists (
      select 1 from jsonb_array_elements(v_result->'issues') i
      where i->>'code' = 'BRIEF_TITLE_DUPLICATE' and i->>'severity' = 'blocking'
    ),
    'expected a BRIEF_TITLE_DUPLICATE issue with severity=blocking'
  );
end;
$$;

-- ===================================================================================================
-- 10. RPC: validate_recipe_structure — fractional stepNo/servings return structured issues, no crash
-- ===================================================================================================

do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_structure('{
    "title": "Test",
    "servings": 2.5,
    "ingredients": [{"crop": "kabak", "quantity": 1, "unit": "adet"}],
    "steps": [{"stepNo": 1.5, "instruction": "x"}]
  }'::jsonb);

  perform pg_temp.assert((v_result->>'valid')::boolean = false, 'expected fractional servings/stepNo to make the draft invalid');
  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_result->'issues') i where i->>'code' = 'SERVINGS_NOT_INTEGER'),
    'expected a SERVINGS_NOT_INTEGER issue for servings=2.5'
  );
  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_result->'issues') i where i->>'code' = 'STEP_NO_NOT_INTEGER'),
    'expected a STEP_NO_NOT_INTEGER issue for stepNo=1.5'
  );
end;
$$;

do $$
declare
  v_result jsonb;
begin
  -- timerSeconds fractional must also be caught structurally, not raise.
  v_result := public.validate_recipe_structure('{
    "title": "Test",
    "ingredients": [{"crop": "kabak", "quantity": 1, "unit": "adet"}],
    "steps": [{"stepNo": 1, "instruction": "x", "timerSeconds": 90.25}]
  }'::jsonb);
  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_result->'issues') i where i->>'code' = 'STEP_TIMER_NOT_INTEGER'),
    'expected a STEP_TIMER_NOT_INTEGER issue for timerSeconds=90.25'
  );
end;
$$;

-- ===================================================================================================
-- 11. RPC: validate_recipe_ingredient_coverage — invalid isKeyIngredient boolean does not crash
-- ===================================================================================================

do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_ingredient_coverage('{
    "ingredients": [{"crop": "kabak", "quantity": 1, "unit": "adet", "isKeyIngredient": "yes"}],
    "steps": [{"stepNo": 1, "instruction": "Kabaklari dilimleyin."}]
  }'::jsonb);

  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_result->'issues') i where i->>'code' = 'INGREDIENT_IS_KEY_NOT_BOOLEAN'),
    'expected an INGREDIENT_IS_KEY_NOT_BOOLEAN warning for isKeyIngredient="yes" instead of a raised error'
  );
end;
$$;

-- ===================================================================================================
-- 12. RPC: validate_recipe_ingredient_coverage — regex-metacharacter ingredient names do not crash
-- ===================================================================================================

do $$
declare
  v_result jsonb;
begin
  v_result := public.validate_recipe_ingredient_coverage('{
    "ingredients": [{"crop": null, "freeTextName": "a+b(c) özel malzeme", "quantity": 1, "unit": "adet", "isKeyIngredient": true}],
    "steps": [{"stepNo": 1, "instruction": "Baska bir seyi anlatan bir adim."}]
  }'::jsonb);
  perform pg_temp.assert(v_result is not null, 'expected validate_recipe_ingredient_coverage not to raise on a regex-metacharacter freeTextName');
  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_result->'issues') i where i->>'code' = 'INGREDIENT_UNUSED'),
    'expected the unmatched a+b(c) ingredient to still be flagged as unused (regex escaping did not just silently swallow the check)'
  );
end;
$$;

-- ===================================================================================================
-- 13. RPC: normalize_recipe_units — empty-unit normalization no longer nulls the whole ingredient
-- ===================================================================================================

do $$
declare
  v_result jsonb;
begin
  v_result := public.normalize_recipe_units('[
    {"crop": "kabak", "freeTextName": null, "quantity": 3, "unit": "", "note": "orta boy"}
  ]'::jsonb);

  perform pg_temp.assert(jsonb_array_length(v_result) = 1, 'expected normalize_recipe_units to return exactly one element');
  perform pg_temp.assert(
    jsonb_typeof(v_result->0) = 'object',
    'expected the ingredient object to survive empty-unit normalization, not collapse into JSON null (the pre-Step-03A jsonb_set bug)'
  );
  perform pg_temp.assert((v_result->0->>'note') = 'orta boy', 'expected unrelated fields (note) to survive normalization untouched');
  perform pg_temp.assert(jsonb_typeof(v_result->0->'unit') = 'null', 'expected unit to normalize to JSON null for an empty-string input');
end;
$$;

do $$
declare
  v_result jsonb;
begin
  -- Recognized alias still normalizes correctly (regression guard for the fix above).
  v_result := public.normalize_recipe_units('[{"crop": "kabak", "unit": "yk"}]'::jsonb);
  perform pg_temp.assert((v_result->0->>'unit') = 'yemek_kasigi', 'expected "yk" to normalize to "yemek_kasigi"');
end;
$$;

-- ===================================================================================================
-- 14. RPC: get_seasonal_crop_candidates — crop_config remains the full candidate universe
-- ===================================================================================================

do $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows
  from public.get_seasonal_crop_candidates(p_limit := 100) t;

  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_rows) r where r->>'crop' = 'bilinmeyen_sebze'),
    'expected a crop_config row with NO crop_culinary_meta row to still appear in the default candidate universe'
  );
  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_rows) r where r->>'crop' = 'sus_bitkisi'),
    'expected a crop with is_edible=false to still appear when p_edible_only is not requested'
  );
end;
$$;

do $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows
  from public.get_seasonal_crop_candidates(p_edible_only := true, p_limit := 100) t;

  perform pg_temp.assert(
    exists (select 1 from jsonb_array_elements(v_rows) r where r->>'crop' = 'bilinmeyen_sebze'),
    'expected a crop with NO crop_culinary_meta row to be treated as edible-by-default even with p_edible_only=true'
  );
  perform pg_temp.assert(
    not exists (select 1 from jsonb_array_elements(v_rows) r where r->>'crop' = 'sus_bitkisi'),
    'expected an explicitly is_edible=false crop to be excluded once p_edible_only=true is requested'
  );
end;
$$;

-- ===================================================================================================
-- 15. Security: SECURITY INVOKER (not DEFINER) on every F2 function
-- ===================================================================================================

do $$
declare
  v_definer_count int;
begin
  select count(*) into v_definer_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_seasonal_crop_candidates', 'get_crop_context', 'get_recent_recipe_mix',
      'search_existing_recipes', 'find_recipe_duplicates', 'validate_recipe_slug',
      'validate_recipe_plan', 'validate_recipe_structure', 'validate_recipe_crop_values',
      'validate_recipe_ingredient_coverage', 'normalize_recipe_units'
    )
    and p.prosecdef = true;
  perform pg_temp.assert(v_definer_count = 0, 'expected zero SECURITY DEFINER functions among the Step 04 RPCs (all must be INVOKER)');
end;
$$;

-- ===================================================================================================
-- 16. Grants: anon/authenticated denied on automation tables and RPCs; service_role allowed
-- ===================================================================================================

do $$
declare
  v_denied boolean := false;
begin
  set local role anon;
  begin
    perform 1 from public.recipe_generation_batches limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  perform pg_temp.assert(v_denied, 'expected anon to be denied SELECT on recipe_generation_batches');
end;
$$;

do $$
declare
  v_denied boolean := false;
begin
  set local role authenticated;
  begin
    perform 1 from public.recipe_qa_results limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  perform pg_temp.assert(v_denied, 'expected authenticated to be denied SELECT on recipe_qa_results');
end;
$$;

do $$
declare
  v_denied boolean := false;
begin
  set local role anon;
  begin
    perform public.validate_recipe_slug('test-slug');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  perform pg_temp.assert(v_denied, 'expected anon to be denied EXECUTE on validate_recipe_slug');
end;
$$;

do $$
declare
  v_denied boolean := false;
begin
  set local role authenticated;
  begin
    perform public.get_seasonal_crop_candidates();
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  perform pg_temp.assert(v_denied, 'expected authenticated to be denied EXECUTE on get_seasonal_crop_candidates');
end;
$$;

do $$
declare
  v_result jsonb;
  v_count int;
begin
  set local role service_role;
  v_result := public.validate_recipe_slug('firinda-kabak-musakka');
  select count(*) into v_count from public.recipe_generation_batches;
  reset role;
  perform pg_temp.assert(v_result is not null, 'expected service_role to successfully execute validate_recipe_slug');
  perform pg_temp.assert(v_count >= 0, 'expected service_role to successfully SELECT recipe_generation_batches');
end;
$$;

-- ===================================================================================================
-- 17. recipes.status remains draft|published only — no F2 migration writes to it
-- ===================================================================================================

do $$
declare
  v_recipe_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipes (slug, title) values ('status-check-recipe', 'Status Check') returning id into v_recipe_id;
  begin
    update public.recipes set status = 'in_review' where id = v_recipe_id;
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected recipes.status to reject any value outside draft|published');
end;
$$;

\echo 'F2 recipe automation SQL test suite: ALL ASSERTIONS PASSED'
