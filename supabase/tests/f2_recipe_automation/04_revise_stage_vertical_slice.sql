-- F2 Recipe Automation — Step 08 SQL test: the revise stage's Postgres-layer contract against the
-- SAME version-1 kabak draft `02_write_stage_vertical_slice.sql` stored and
-- `03_qa_stage_vertical_slice.sql` already validated at the qa stage.
--
-- This does NOT re-capture a live Reviser-agent call — no live-call gate was open for Step 08 the
-- way Step 06's P1 preflight was for the Writer's SDK path (same situation Step 07 documented for
-- QA; see the Step 08 completion report). It exercises exactly what revise-stage.ts itself does at
-- the Postgres layer once it HAS a corrected `RecipeDraftPayload` in hand: storing it as the NEXT
-- draft version (never overwriting version 1), re-running the same deterministic validation RPCs
-- against it, and proving the DB-level guarantees revise-stage.ts deliberately relies on rather
-- than re-implementing: the `recipe_drafts_job_id_version_key` unique constraint (idempotency — a
-- retried/duplicate revise call can never create two rows at the same version) and the
-- `revision_count` CHECK cap (the two-automatic-revision limit holds even if application code ever
-- tried to bypass it).
--
-- Run via supabase/tests/f2_recipe_automation/run.sh, after 03_qa_stage_vertical_slice.sql —
-- depends on that script's job/version-1-draft already existing in the test database. Unlike that
-- script (which stored an 'approved' QA result), this test stores its OWN 'revision_required' QA
-- result against the same version-1 draft. Step 08A added `recipe_qa_results_job_draft_version_key`
-- (unique on (job_id, draft_id, draft_version) — see that migration's header and
-- 03_qa_stage_vertical_slice.sql's own new assertion for it), so the two scripts can no longer both
-- have a live row for this exact triple at once: this script first removes 03's 'approved' row for
-- this triple, then stores its own 'revision_required' one — the real pipeline invariant this
-- constraint now enforces is exactly "one QA verdict per exact draft version", never "one script's
-- fixture data coexisting with another's for the same version".

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

do $$
declare
  v_job_id uuid;
  v_draft_id uuid;
  v_draft_version int;
  v_draft jsonb;
  v_revised_ingredients jsonb;
  v_revised_draft jsonb;
  v_structure jsonb;
  v_crop_values jsonb;
  v_slug jsonb;
  v_normalized jsonb;
  v_qa_result_id uuid;
  v_revised_draft_id uuid;
  v_second_insert_failed boolean := false;
  v_revision_cap_failed boolean := false;
  v_scores jsonb := '{"clarity":70,"feasibility":75,"ingredientConsistency":60,"originality":80,"hasatRelevance":90}'::jsonb;
  v_safety_review jsonb := '{"temperature":{"flagged":false,"notes":null},"timing":{"flagged":false,"notes":null},"allergens":{"flagged":false,"notes":null,"detectedLabels":[]},"requiresHumanReview":true,"reviewedBy":null,"reviewedAt":null,"approved":null}'::jsonb;
  v_blocking_issues jsonb := '[{"code":"UNUSED_INGREDIENT","field":"ingredients[6]","severity":"blocking","message":"domates salcasi hicbir adimda acikca kullanilmiyor.","requiredChange":"Malzeme listesinden cikarin veya bir adimda kullanildigini belirtin."}]'::jsonb;
begin
  -- Pick up the job/draft `02_write_stage_vertical_slice.sql` already stored and
  -- `03_qa_stage_vertical_slice.sql` already re-validated (title "Fırında Kabak Musakka", version 1).
  select d.job_id, d.id, d.version, jsonb_build_object(
    'jobId', d.job_id, 'briefId', null, 'title', d.title, 'description', d.description,
    'coverPhotoUrl', d.cover_photo_url, 'servings', d.servings, 'prepMinutes', d.prep_minutes,
    'cookMinutes', d.cook_minutes, 'restMinutes', d.rest_minutes, 'difficulty', d.difficulty,
    'cuisine', d.cuisine, 'dietTags', to_jsonb(d.diet_tags), 'allergenLabels', to_jsonb(d.allergen_labels),
    'requiredEquipment', to_jsonb(d.required_equipment), 'sourceType', d.source_type,
    'authorType', d.author_type, 'visibility', d.visibility, 'ownerId', d.owner_id,
    'extractionConfidence', d.extraction_confidence, 'ingredients', d.ingredients, 'steps', d.steps
  )
  into v_job_id, v_draft_id, v_draft_version, v_draft
  from public.recipe_drafts d
  join public.recipe_generation_jobs j on j.id = d.job_id
  where j.working_title = 'Fırında Kabak Musakka' and d.version = 1
  order by d.created_at desc
  limit 1;

  perform pg_temp.assert(v_job_id is not null, 'expected the Step 06 vertical slice job/draft to already exist');
  perform pg_temp.assert(v_job_id in (select id from public.recipe_generation_jobs where revision_count = 0), 'expected the job to start with revision_count=0');

  -- 1. Store the 'revision_required' QA result this revise pass is reacting to. Like
  --    03_qa_stage_vertical_slice.sql's own QA verdict, this is SYNTHETIC, not a live-captured QA
  --    agent call (no live-call gate was open for Step 08 either — see the Step 08 completion
  --    report): a plausible UNUSED_INGREDIENT finding on "domates salçası", in the same shape
  --    qa-stage.ts's qaResultToInsertRow() produces. 03_qa_stage_vertical_slice.sql already stored
  --    an 'approved' verdict for this EXACT (job_id, draft_id, draft_version) triple; Step 08A's new
  --    recipe_qa_results_job_draft_version_key unique constraint means only one row can ever exist
  --    for it, so remove that row first — simulating the real invariant "one QA verdict per exact
  --    draft version" (a job cannot simultaneously have been both approved and sent to revise for
  --    the same draft), not a schema workaround.
  delete from public.recipe_qa_results
  where job_id = v_job_id and draft_id = v_draft_id and draft_version = v_draft_version;

  insert into public.recipe_qa_results (
    job_id, draft_id, draft_version, recipe_id, decision, overall_score, scores,
    blocking_issues, non_blocking_suggestions, safety_review, approved_for_imaging, model
  ) values (
    v_job_id, v_draft_id, v_draft_version, null, 'revision_required', 62, v_scores,
    v_blocking_issues, '[]'::jsonb, v_safety_review, false, 'test-qa-model'
  )
  returning id into v_qa_result_id;

  perform pg_temp.assert(v_qa_result_id is not null, 'expected the recipe_qa_results insert to succeed');

  -- 2. Build the corrected draft — the SAME targeted-fix shape revise-stage.ts's Reviser agent is
  --    instructed to produce (revise-rules.ts item 2): everything restated unchanged except the
  --    one flagged ingredient removed.
  v_revised_ingredients := (select jsonb_agg(elem) from jsonb_array_elements(v_draft->'ingredients') elem
    where elem->>'freeTextName' is distinct from 'domates salçası');
  perform pg_temp.assert(jsonb_array_length(v_revised_ingredients) = jsonb_array_length(v_draft->'ingredients') - 1, 'expected exactly one ingredient removed');
  v_revised_draft := v_draft || jsonb_build_object('ingredients', v_revised_ingredients);

  -- 3. Deterministic Postgres validations against the REVISED draft — the same RPCs
  --    revise-stage.ts's validateDraft() (reused from writer/validate-draft.ts) calls, one revision
  --    pass later than 03_qa_stage_vertical_slice.sql's own re-check.
  v_structure := public.validate_recipe_structure(v_revised_draft);
  perform pg_temp.assert((v_structure->>'valid')::boolean, 'expected the revised draft to pass validate_recipe_structure, got: ' || v_structure::text);

  v_crop_values := public.validate_recipe_crop_values(v_revised_draft);
  perform pg_temp.assert((v_crop_values->>'valid')::boolean, 'expected the revised draft to pass validate_recipe_crop_values, got: ' || v_crop_values::text);

  v_slug := public.validate_recipe_slug('firinda-kabak-musakka');
  perform pg_temp.assert((v_slug->>'valid')::boolean, 'expected the candidate slug to still validate at the revise stage, got: ' || v_slug::text);

  v_normalized := public.normalize_recipe_units(v_revised_draft->'ingredients');
  perform pg_temp.assert(jsonb_array_length(v_normalized) = jsonb_array_length(v_revised_draft->'ingredients'), 'normalize_recipe_units must not drop or add ingredients');

  -- 4. Store the revised draft as version 2 — NEXT version, never overwriting version 1 (PROMPT 08:
  --    "Save as next unique version", "Preserve all prior drafts and QA results") — the same insert
  --    shape revise-stage.ts's draftToInsertRow() produces.
  insert into public.recipe_drafts (
    job_id, version, title, description, cover_photo_url, servings, prep_minutes, cook_minutes,
    rest_minutes, difficulty, cuisine, diet_tags, allergen_labels, required_equipment, source_type,
    author_type, visibility, owner_id, extraction_confidence, ingredients, steps
  ) values (
    v_job_id, v_draft_version + 1, v_revised_draft->>'title', v_revised_draft->>'description',
    v_revised_draft->>'coverPhotoUrl', (v_revised_draft->>'servings')::int,
    (v_revised_draft->>'prepMinutes')::int, (v_revised_draft->>'cookMinutes')::int,
    (v_revised_draft->>'restMinutes')::int, v_revised_draft->>'difficulty', v_revised_draft->>'cuisine',
    array(select jsonb_array_elements_text(v_revised_draft->'dietTags')),
    case when v_revised_draft->'allergenLabels' is null or v_revised_draft->'allergenLabels' = 'null'::jsonb
      then null else array(select jsonb_array_elements_text(v_revised_draft->'allergenLabels')) end,
    array(select jsonb_array_elements_text(v_revised_draft->'requiredEquipment')), v_revised_draft->>'sourceType',
    v_revised_draft->>'authorType', v_revised_draft->>'visibility', null,
    (v_revised_draft->>'extractionConfidence')::numeric, v_normalized, v_revised_draft->'steps'
  )
  returning id into v_revised_draft_id;

  perform pg_temp.assert(v_revised_draft_id is not null, 'expected the version-2 draft insert to succeed');
  perform pg_temp.assert(v_revised_draft_id != v_draft_id, 'expected a NEW draft row, not an update of version 1');

  -- 5. Version 1 is untouched (PROMPT 08: "Preserve all prior drafts and QA results").
  perform pg_temp.assert(
    (select title from public.recipe_drafts where id = v_draft_id) = (v_draft->>'title'),
    'expected the version-1 draft row to remain unmodified'
  );
  perform pg_temp.assert(
    (select count(*) from public.recipe_drafts where job_id = v_job_id) = 2,
    'expected exactly two recipe_drafts rows for this job (version 1 preserved, version 2 added)'
  );

  -- 6. Increment revision_count atomically alongside the stage transition — the same single-UPDATE
  --    shape advanceStageAndDispatch's `patch` parameter produces (job-state.ts's advanceStage:
  --    stage/status/lock columns and the caller's `patch` in ONE UPDATE, never two).
  update public.recipe_generation_jobs
  set stage = 'qa', status = 'queued', revision_count = 1
  where id = v_job_id;

  perform pg_temp.assert(
    (select revision_count from public.recipe_generation_jobs where id = v_job_id) = 1,
    'expected revision_count to be 1 after one automatic revision'
  );

  -- 7. Idempotency at the DB layer (PROMPT 08: "Retry/double invocation must not create two
  --    versions with the same number") — recipe_drafts_job_id_version_key (job_id, version) unique
  --    constraint, the SAME guarantee 02_write_stage_vertical_slice.sql proved for version 1.
  begin
    insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
    values (v_job_id, v_draft_version + 1, 'duplicate revise attempt', '[{"freeTextName":"x"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb);
  exception when unique_violation then
    v_second_insert_failed := true;
  end;
  perform pg_temp.assert(v_second_insert_failed, 'expected a second version=2 draft for the same job to violate the unique constraint');

  -- 8. The two-automatic-revision cap holds at the DB layer independently of the application-level
  --    check in revise-stage.ts (PROMPT 08: "Maximum two automatic revisions") —
  --    recipe_generation_jobs' own CHECK (revision_count >= 0 and revision_count <= 2) rejects 3.
  begin
    update public.recipe_generation_jobs set revision_count = 3 where id = v_job_id;
  exception when check_violation then
    v_revision_cap_failed := true;
  end;
  perform pg_temp.assert(v_revision_cap_failed, 'expected revision_count=3 to violate the CHECK constraint (max 2 automatic revisions)');
  perform pg_temp.assert(
    (select revision_count from public.recipe_generation_jobs where id = v_job_id) = 1,
    'expected the rejected update to leave revision_count unchanged at 1'
  );

  -- 9. revision_count=2 (the cap itself) is a legitimate, allowed value — only exceeding it is
  --    rejected. Confirms the CHECK is an inclusive upper bound, not an off-by-one.
  update public.recipe_generation_jobs set revision_count = 2 where id = v_job_id;
  perform pg_temp.assert(
    (select revision_count from public.recipe_generation_jobs where id = v_job_id) = 2,
    'expected revision_count=2 (the cap itself) to be a valid value'
  );

  raise notice 'F2 Step 08 revise-stage vertical slice (kabak): revised_draft_id=%, qa_result_id=%, structure=%, crop_values=%',
    v_revised_draft_id, v_qa_result_id, v_structure->>'valid', v_crop_values->>'valid';
end;
$$;

\echo 'F2 Step 08 revise-stage vertical slice (kabak) SQL test: ALL ASSERTIONS PASSED'
