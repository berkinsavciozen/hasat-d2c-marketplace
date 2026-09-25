-- F2-S20 fixtures: reference data the T4 closure migration's own FK needs, one fully covered crop,
-- and a helper that seeds a publish-ready job (QA approved, admin approved, both assets) whose
-- draft carries one quantified crop plus one quantity+unit-less "tuz, damak tadına göre" line.
insert into public.crop_config(crop,display_name,default_unit) values ('pul_biber','Pul biber','kg');
insert into public.crop_culinary_meta(crop,is_edible,conversion_hints) values ('pul_biber',true,'{}');

insert into public.crop_nutrition (
  crop, reference_source, reference_source_id, reference_version,
  calories_kcal, protein_g, carbs_g, fat_g, fiber_g
) values (
  'kabak', 'tuber', 'local-test-kabak', 'local-test-v1',
  20, 1.1, 3.3, 0.2, 1.1
);

create or replace function public.f2s20_seed_publish_job(p_title text, p_lock_token text, p_unquantified jsonb)
returns uuid
language plpgsql
as $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
begin
  insert into public.recipe_generation_batches (target_count, locale)
  values (1, 'tr') returning id into v_batch_id;

  insert into public.recipe_generation_jobs (
    batch_id, brief_id, working_title, stage, status, locked_by, locked_at, lock_expires_at
  ) values (
    v_batch_id, gen_random_uuid(), p_title, 'publish', 'running',
    p_lock_token, now(), now() + interval '5 minutes'
  ) returning id into v_job_id;

  insert into public.recipe_drafts (
    job_id, version, title, servings, prep_minutes, cook_minutes, difficulty, visibility,
    allergen_labels, ingredients, steps
  ) values (
    v_job_id, 1, p_title, 4, 10, 20, 'kolay', 'public', '{}'::text[],
    jsonb_build_array(
      jsonb_build_object(
        'crop', 'kabak', 'freeTextName', null, 'quantity', 400, 'unit', 'g', 'note', null,
        'isKeyIngredient', true, 'ingredientClass', 'tarimsal', 'sortOrder', 0
      ),
      p_unquantified
    ),
    jsonb_build_array(jsonb_build_object(
      'stepNo', 1, 'instruction', p_title || ' pişirin.', 'photoUrl', null, 'timerSeconds', null
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
      'allergens', jsonb_build_object('flagged', false, 'notes', null, 'detectedLabels', '[]'::jsonb),
      'requiresHumanReview', true, 'reviewedBy', null, 'reviewedAt', null, 'approved', null
    ),
    true
  );

  insert into public.recipe_admin_reviews (
    job_id, batch_id, draft_id, draft_version, action,
    temperature_reviewed, timing_reviewed, allergens_reviewed, content_reviewed, images_reviewed,
    from_stage, from_status, to_stage, to_status, admin_actor
  ) values (
    v_job_id, v_batch_id, v_draft_id, 1, 'approve', true, true, true, true, true,
    'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved', 'f2s20-test'
  );

  insert into public.recipe_assets (job_id, draft_id, asset_type, storage_path)
  values (v_job_id, v_draft_id, 'hero', p_title || '-16x9.webp'),
         (v_job_id, v_draft_id, 'square', p_title || '-1x1.webp');

  return v_job_id;
end;
$$;
