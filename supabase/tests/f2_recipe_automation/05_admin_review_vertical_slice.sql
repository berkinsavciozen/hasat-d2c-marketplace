-- F2 Recipe Automation — Step 11 SQL test: recipe_admin_reviews mechanical checklist gate.
--
-- Proves, against a real fresh Postgres database (not the live Supabase project — this suite
-- never touches it, see run.sh), that PROMPT 11's "approval must be mechanically impossible until
-- the human checklist is complete — the backend itself must refuse it, not just the UI" is
-- actually enforced by `recipe_admin_reviews`'s own CHECK constraint
-- (20260826120000_f2s11_recipe_admin_reviews.sql), independent of the admin Edge Functions'
-- application-level Zod validation (../../functions/_shared/recipe-automation/admin/checklist.ts).
-- Same plain-psql-assertion convention as 01_assertions.sql — no pgTAP dependency.

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
-- 1. Happy path: a job at awaiting_approval can be approved once every checklist item is true
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
  v_review_id uuid;
begin
  insert into public.recipe_generation_batches (target_count, locale)
  values (3, 'tr')
  returning id into v_batch_id;

  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, gen_random_uuid(), 'F2-S11 Admin Review Test Recipe', 'awaiting_approval', 'awaiting_approval')
  returning id into v_job_id;

  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (
    v_job_id, 1, 'F2-S11 Admin Review Test Recipe',
    '[{"crop":"kabak","freeTextName":null,"quantity":1,"unit":"adet","note":null,"isKeyIngredient":true,"ingredientClass":"tarimsal","sortOrder":0}]'::jsonb,
    '[{"stepNo":1,"instruction":"Kabağı dilimleyin.","photoUrl":null,"timerSeconds":null}]'::jsonb
  )
  returning id into v_draft_id;

  insert into public.recipe_admin_reviews (
    job_id, batch_id, draft_id, draft_version, action,
    temperature_reviewed, timing_reviewed, allergens_reviewed, content_reviewed, images_reviewed,
    from_stage, from_status, to_stage, to_status, admin_actor
  )
  values (
    v_job_id, v_batch_id, v_draft_id, 1, 'approve',
    true, true, true, true, true,
    'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved', 'test-admin'
  )
  returning id into v_review_id;

  perform pg_temp.assert(v_review_id is not null, 'expected the complete-checklist approve row to insert');

  -- The admin Edge Function's own transitionJob() does this same CAS update — mirrored here so this
  -- test proves the end-to-end state, not just the audit-row insert in isolation.
  update public.recipe_generation_jobs set status = 'approved'
  where id = v_job_id and stage = 'awaiting_approval' and status = 'awaiting_approval';

  perform pg_temp.assert(
    (select status from public.recipe_generation_jobs where id = v_job_id) = 'approved',
    'expected the job to move to status=approved'
  );
end;
$$;

-- ===================================================================================================
-- 2. Negative: an 'approve' row with ANY checklist item false must be rejected by the CHECK
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, gen_random_uuid(), 'Incomplete Checklist Job', 'awaiting_approval', 'awaiting_approval')
  returning id into v_job_id;

  begin
    insert into public.recipe_admin_reviews (
      job_id, batch_id, action,
      temperature_reviewed, timing_reviewed, allergens_reviewed, content_reviewed, images_reviewed,
      from_stage, from_status, to_stage, to_status
    )
    values (
      v_job_id, v_batch_id, 'approve',
      true, true, true, true, false, -- images_reviewed still false
      'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved'
    );
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected an approve row with images_reviewed=false to be rejected by the CHECK constraint');
end;
$$;

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, gen_random_uuid(), 'Default Checklist Job', 'awaiting_approval', 'awaiting_approval')
  returning id into v_job_id;

  begin
    -- Every checklist column defaults to false — an 'approve' row inserted WITHOUT explicitly
    -- naming them must still be rejected. This is the exact shape a careless direct-SQL bypass
    -- (or a future caller that forgets to pass the checklist) would produce.
    insert into public.recipe_admin_reviews (job_id, batch_id, action, from_stage, from_status, to_stage, to_status)
    values (v_job_id, v_batch_id, 'approve', 'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved');
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected an approve row with all-default (false) checklist columns to be rejected');
end;
$$;

-- ===================================================================================================
-- 3. Positive: reject / request_revision / retry_stage never require the checklist
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, gen_random_uuid(), 'Reject Without Checklist Job', 'awaiting_approval', 'awaiting_approval')
  returning id into v_job_id;

  insert into public.recipe_admin_reviews (job_id, batch_id, action, from_stage, from_status, to_stage, to_status, notes)
  values (v_job_id, v_batch_id, 'reject', 'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'rejected', 'zayıf içerik');

  insert into public.recipe_admin_reviews (job_id, batch_id, action, from_stage, from_status, to_stage, to_status)
  values (v_job_id, v_batch_id, 'request_revision', 'awaiting_approval', 'awaiting_approval', 'revise', 'queued');

  insert into public.recipe_admin_reviews (job_id, batch_id, action, from_stage, from_status, to_stage, to_status)
  values (v_job_id, v_batch_id, 'retry_stage', 'image', 'failed', 'image', 'queued');

  perform pg_temp.assert(
    (select count(*) from public.recipe_admin_reviews where job_id = v_job_id) = 3,
    'expected all three non-approve actions to insert without a checklist'
  );
end;
$$;

-- ===================================================================================================
-- 4. Negative: invalid action value is rejected
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, gen_random_uuid(), 'Invalid Action Job', 'awaiting_approval', 'awaiting_approval')
  returning id into v_job_id;

  begin
    insert into public.recipe_admin_reviews (job_id, batch_id, action, from_stage, from_status, to_stage, to_status)
    values (v_job_id, v_batch_id, 'publish_now', 'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved');
  exception when check_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected an unknown action value to be rejected');
end;
$$;

-- ===================================================================================================
-- 5. Negative: job_id must really belong to batch_id (composite FK, same discipline as
--    recipe_qa_results/recipe_assets/recipe_generation_stage_runs in the Step 03 migration)
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_other_batch_id uuid;
  v_job_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_other_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, gen_random_uuid(), 'Cross Batch Job', 'awaiting_approval', 'awaiting_approval')
  returning id into v_job_id;

  begin
    insert into public.recipe_admin_reviews (job_id, batch_id, action, from_stage, from_status, to_stage, to_status)
    values (v_job_id, v_other_batch_id, 'reject', 'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'rejected');
  exception when foreign_key_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected a job_id/batch_id mismatch to be rejected by the composite FK');
end;
$$;

-- ===================================================================================================
-- 6. Negative: when draft_id is present, (job_id, draft_id, draft_version) must name a real,
--    job-owned recipe_drafts row (same discipline as recipe_qa_results_draft_fk)
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
  v_draft_id uuid;
  v_failed boolean := false;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, gen_random_uuid(), 'Stale Draft Version Job', 'awaiting_approval', 'awaiting_approval')
  returning id into v_job_id;
  insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
  values (
    v_job_id, 1, 'Stale Draft Version Job',
    '[{"crop":"kabak","freeTextName":null,"quantity":1,"unit":"adet","note":null,"isKeyIngredient":true,"ingredientClass":"tarimsal","sortOrder":0}]'::jsonb,
    '[{"stepNo":1,"instruction":"x","photoUrl":null,"timerSeconds":null}]'::jsonb
  )
  returning id into v_draft_id;

  begin
    -- draft_version=2 does not exist for this draft_id (only version 1 does).
    insert into public.recipe_admin_reviews (
      job_id, batch_id, draft_id, draft_version, action,
      temperature_reviewed, timing_reviewed, allergens_reviewed, content_reviewed, images_reviewed,
      from_stage, from_status, to_stage, to_status
    )
    values (
      v_job_id, v_batch_id, v_draft_id, 2, 'approve',
      true, true, true, true, true,
      'awaiting_approval', 'awaiting_approval', 'awaiting_approval', 'approved'
    );
  exception when foreign_key_violation then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'expected a stale/incorrect draft_version to be rejected by the composite draft FK');
end;
$$;

-- ===================================================================================================
-- 7. retry_stage on the JOB ROW ITSELF: a job at status='failed' has completed_at SET (both
--    job-state.ts's failJob() and advanceStage() set it whenever a job lands on a terminal status —
--    'failed' is one of the three). recipe_generation_jobs' own CHECK
--    ("completed_at is null or status = any(array['completed','failed','cancelled'])") means moving
--    back to status='queued' WITHOUT ALSO clearing completed_at is a constraint violation, not just
--    stale data — review-actions.ts's retryStage() clears it in the same UPDATE for exactly this
--    reason. This test proves the fix; dropping `completed_at = null` from that UPDATE reproduces
--    `recipe_generation_jobs_check2` failing here.
-- ===================================================================================================

do $$
declare
  v_batch_id uuid;
  v_job_id uuid;
begin
  insert into public.recipe_generation_batches (target_count, locale) values (1, 'tr') returning id into v_batch_id;
  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status, attempt, completed_at)
  values (v_batch_id, gen_random_uuid(), 'Retry From Failed Job', 'image', 'failed', 3, now())
  returning id into v_job_id;

  -- Mirrors review-actions.ts's retryStage() UPDATE exactly.
  update public.recipe_generation_jobs
  set status = 'queued', attempt = 1, last_error = null, next_attempt_at = null, completed_at = null
  where id = v_job_id and stage = 'image' and status = 'failed';

  perform pg_temp.assert(
    (select status from public.recipe_generation_jobs where id = v_job_id) = 'queued',
    'expected retryStage()''s UPDATE to move a failed job back to queued without a CHECK violation'
  );
  perform pg_temp.assert(
    (select completed_at from public.recipe_generation_jobs where id = v_job_id) is null,
    'expected completed_at to be cleared alongside the status transition'
  );
end;
$$;

\echo 'F2 Step 11 admin-review vertical slice SQL test: ALL ASSERTIONS PASSED'
