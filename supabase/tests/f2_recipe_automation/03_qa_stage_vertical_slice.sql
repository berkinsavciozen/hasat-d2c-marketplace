-- F2 Recipe Automation — Step 07 SQL test: the QA stage's Postgres-layer contract against the
-- SAME version-1 kabak draft `02_write_stage_vertical_slice.sql` just stored.
--
-- This does NOT re-capture a live QA-agent call (no live-call gate was open for Step 07 the way
-- Step 06's P1 preflight was for the Writer's SDK path — see the Step 07 completion report). It
-- exercises exactly what qa-stage.ts itself does at the Postgres layer once it HAS a
-- RecipeQAResult in hand: re-running the same deterministic validation RPCs against the current
-- draft, calling find_recipe_duplicates for real, storing a `recipe_qa_results` row tied to the
-- EXACT (job_id, draft_id, draft_version) triple, and proving the DB-level guarantees qa-stage.ts
-- deliberately never tries to route around (the composite FK, the blocking-issues/
-- approved_for_imaging CHECK, and the human-safety-signoff CHECK) actually hold independently of
-- the Zod layer.
--
-- Run via supabase/tests/f2_recipe_automation/run.sh, after 02_write_stage_vertical_slice.sql —
-- depends on that script's v_job_id/v_draft_id (version 1) already existing in the test database.

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
  v_structure jsonb;
  v_crop_values jsonb;
  v_slug jsonb;
  v_duplicates jsonb;
  v_qa_result_id uuid;
  v_wrong_version_failed boolean := false;
  v_imaging_check_failed boolean := false;
  v_safety_check_failed boolean := false;
  v_duplicate_triple_failed boolean := false;
  v_scores jsonb := '{"clarity":90,"feasibility":85,"ingredientConsistency":90,"originality":80,"hasatRelevance":95}'::jsonb;
  v_safety_review jsonb := '{"temperature":{"flagged":false,"notes":null},"timing":{"flagged":false,"notes":null},"allergens":{"flagged":false,"notes":null,"detectedLabels":[]},"requiresHumanReview":true,"reviewedBy":null,"reviewedAt":null,"approved":null}'::jsonb;
begin
  -- Pick up the job/draft `02_write_stage_vertical_slice.sql` already stored (title "Fırında Kabak
  -- Musakka", job stage left at 'write' there — this test moves it to 'qa' itself, mirroring what
  -- advanceStageAndDispatch already proved elsewhere; the stage value itself isn't under test here).
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

  -- 1. Deterministic Postgres validations, re-run against "the exact current draft version" — the
  --    SAME RPCs qa-stage.ts's validateDraft() (reused from writer/validate-draft.ts) calls.
  v_structure := public.validate_recipe_structure(v_draft);
  perform pg_temp.assert((v_structure->>'valid')::boolean, 'expected the current draft to pass validate_recipe_structure at the qa stage too, got: ' || v_structure::text);

  v_crop_values := public.validate_recipe_crop_values(v_draft);
  perform pg_temp.assert((v_crop_values->>'valid')::boolean, 'expected the current draft to pass validate_recipe_crop_values at the qa stage too, got: ' || v_crop_values::text);

  v_slug := public.validate_recipe_slug('firinda-kabak-musakka');
  perform pg_temp.assert((v_slug->>'valid')::boolean, 'expected the candidate slug to still validate at the qa stage, got: ' || v_slug::text);

  -- 2. Duplicate-candidate scan (PROMPT 07 step 4) — a real find_recipe_duplicates call. Nothing is
  --    published in this fresh test database, so it must report no matches.
  v_duplicates := to_jsonb(array(select public.find_recipe_duplicates(v_draft->>'title', 'kabak', 'firinda-kabak-musakka', 5)));
  perform pg_temp.assert(jsonb_array_length(v_duplicates) = 0, 'expected no duplicate candidates against an empty recipes table, got: ' || v_duplicates::text);

  -- 3. Store the QA result linked to the EXACT draft (job_id, draft_id, draft_version) — the same
  --    shape qa-stage.ts's qaResultToInsertRow() produces for an 'approved' decision. safety_*
  --    columns stay null/false: an automated QA pass never sets them (a human does, later).
  insert into public.recipe_qa_results (
    job_id, draft_id, draft_version, recipe_id, decision, overall_score, scores,
    blocking_issues, non_blocking_suggestions, safety_review,
    safety_reviewed_by, safety_reviewed_at, safety_approved, approved_for_imaging, model
  ) values (
    v_job_id, v_draft_id, v_draft_version, null, 'approved', 88, v_scores,
    '[]'::jsonb, '[]'::jsonb, v_safety_review,
    null, null, null, true, 'test-qa-model'
  )
  returning id into v_qa_result_id;

  perform pg_temp.assert(v_qa_result_id is not null, 'expected the recipe_qa_results insert to succeed');

  -- 4. "Exact draft" enforcement (Step 03A's composite FK): a QA result naming a draft_version that
  --    does not exist for this job (job_id, draft_id, 2) must be rejected, not silently accepted.
  begin
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores,
      safety_review, approved_for_imaging
    ) values (
      v_job_id, v_draft_id, 2, 'approved', 88, v_scores, v_safety_review, true
    );
  exception when foreign_key_violation then
    v_wrong_version_failed := true;
  end;
  perform pg_temp.assert(v_wrong_version_failed, 'expected a QA result naming a nonexistent draft_version to violate the composite FK');

  -- 5. QA score can never bypass publish approval: approved_for_imaging=true while blocking_issues
  --    is non-empty must be rejected at the DB layer, independent of the Zod refine.
  begin
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores,
      blocking_issues, safety_review, approved_for_imaging
    ) values (
      v_job_id, v_draft_id, v_draft_version, 'revision_required', 40, v_scores,
      '[{"code":"X","field":"title","severity":"blocking","message":"x","requiredChange":null}]'::jsonb,
      v_safety_review, true
    );
  exception when check_violation then
    v_imaging_check_failed := true;
  end;
  perform pg_temp.assert(v_imaging_check_failed, 'expected approved_for_imaging=true with a non-empty blocking_issues to violate the CHECK constraint');

  -- 6. QA score can never bypass human safety review: safety_approved=true with no recorded human
  --    reviewer identity/timestamp must be rejected — an automated QA pass has no path around this.
  begin
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores,
      safety_review, safety_approved, approved_for_imaging
    ) values (
      v_job_id, v_draft_id, v_draft_version, 'approved', 88, v_scores,
      v_safety_review, true, true
    );
  exception when check_violation then
    v_safety_check_failed := true;
  end;
  perform pg_temp.assert(v_safety_check_failed, 'expected safety_approved=true with no reviewer identity/timestamp to violate the CHECK constraint');

  -- 7. Step 08A: at most one recipe_qa_results row may ever name the same EXACT (job_id, draft_id,
  --    draft_version) triple — recipe_qa_results_job_draft_version_key, added to close the
  --    concurrency gap this file's own module docs used to flag as "known, out of scope for this
  --    step" (see this migration's Step 08A header note). A second QA verdict for the SAME draft
  --    version this test already stored one for (step 3 above) must be rejected as a duplicate, not
  --    silently accepted as a second row.
  begin
    insert into public.recipe_qa_results (
      job_id, draft_id, draft_version, decision, overall_score, scores, safety_review
    ) values (
      v_job_id, v_draft_id, v_draft_version, 'revision_required', 40, v_scores, v_safety_review
    );
  exception when unique_violation then
    v_duplicate_triple_failed := true;
  end;
  perform pg_temp.assert(v_duplicate_triple_failed, 'expected a second recipe_qa_results row for the same (job_id, draft_id, draft_version) triple to violate the new unique constraint');
  perform pg_temp.assert(
    (select count(*) from public.recipe_qa_results where job_id = v_job_id and draft_id = v_draft_id and draft_version = v_draft_version) = 1,
    'expected exactly one recipe_qa_results row for this exact draft version after the rejected duplicate insert'
  );

  raise notice 'F2 Step 07 QA-stage vertical slice (kabak): qa_result_id=%, duplicates=%', v_qa_result_id, jsonb_array_length(v_duplicates);
end;
$$;

\echo 'F2 Step 07 QA-stage vertical slice (kabak) SQL test: ALL ASSERTIONS PASSED'
