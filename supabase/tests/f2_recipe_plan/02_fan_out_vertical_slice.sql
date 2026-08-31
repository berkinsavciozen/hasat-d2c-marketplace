-- F2 Recipe Automation — Step 13 SQL test: fan_out_recipe_plan_batch transactional/idempotent
-- behavior + the admin-approval gate.
--
-- Proves, against a real fresh Postgres database (never the live Supabase project — see run.sh):
--   - REQUIRED coverage "admin onayı olmadan fan-out denemesinin reddi": fan-out is refused for a
--     batch that is not review_status='approved'.
--   - REQUIRED coverage "duplicate/idempotent job koruması": calling fan-out twice for the same
--     approved batch never creates a second job for the same brief, whether via a normal repeated
--     call or via a pre-existing job row inserted through some other route.
--   - Excluded briefs are never promoted into a job.

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

-- Seeds a batch with N plan briefs (all crop='kabak' by default, since crop repetition is a
-- diversity-RPC concern, not something fan_out_recipe_plan_batch itself re-checks) at the given
-- review_status. Returns the batch id.
create or replace function pg_temp.seed_plan_batch(
  p_review_status text,
  p_brief_count integer default 2,
  p_exclude_last boolean default false
) returns uuid
language plpgsql
as $$
declare
  v_batch_id uuid;
  i integer;
begin
  insert into public.recipe_generation_batches (target_count, locale, review_status)
  values (p_brief_count, 'tr', p_review_status)
  returning id into v_batch_id;

  for i in 1..p_brief_count loop
    insert into public.recipe_plan_briefs (batch_id, brief_id, working_title, focus_crop, selection_reason, excluded)
    values (
      v_batch_id, gen_random_uuid(), format('Test Brief #%s', i), 'kabak', 'test reason',
      p_exclude_last and i = p_brief_count
    );
  end loop;

  return v_batch_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 1 (REQUIRED coverage: "admin onayı olmadan fan-out denemesinin reddi"): fan-out refused for
-- a pending_review batch.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_batch_id uuid;
  v_failed boolean := false;
  v_error_message text;
begin
  v_batch_id := pg_temp.seed_plan_batch('pending_review', 2);
  begin
    perform public.fan_out_recipe_plan_batch(v_batch_id);
  exception when others then
    v_failed := true;
    v_error_message := sqlerrm;
  end;
  perform pg_temp.assert(v_failed, 'fan-out must be refused for a pending_review batch');
  perform pg_temp.assert(v_error_message like 'FANOUT_BATCH_NOT_APPROVED%', format('expected FANOUT_BATCH_NOT_APPROVED, got: %s', v_error_message));
  perform pg_temp.assert(
    (select count(*) from public.recipe_generation_jobs where batch_id = v_batch_id) = 0,
    'no job may be created when fan-out is refused'
  );
end;
$$;

-- Same refusal for a REJECTED batch.
do $$
declare
  v_batch_id uuid;
  v_failed boolean := false;
begin
  v_batch_id := pg_temp.seed_plan_batch('rejected', 1);
  begin
    perform public.fan_out_recipe_plan_batch(v_batch_id);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.assert(v_failed, 'fan-out must be refused for a rejected batch');
end;
$$;

-- Unknown batch id -> FANOUT_BATCH_NOT_FOUND.
do $$
declare
  v_failed boolean := false;
  v_error_message text;
begin
  begin
    perform public.fan_out_recipe_plan_batch(gen_random_uuid());
  exception when others then
    v_failed := true;
    v_error_message := sqlerrm;
  end;
  perform pg_temp.assert(v_failed, 'fan-out must be refused for an unknown batch id');
  perform pg_temp.assert(v_error_message like 'FANOUT_BATCH_NOT_FOUND%', format('expected FANOUT_BATCH_NOT_FOUND, got: %s', v_error_message));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 2: an approved batch fans out exactly one job per non-excluded brief, at stage=write/
-- status=queued, with recipe_plan_briefs.job_id linked back.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_batch_id uuid;
  v_result jsonb;
  v_job_count integer;
  v_linked_count integer;
begin
  v_batch_id := pg_temp.seed_plan_batch('approved', 3, true); -- 3 briefs, last one excluded
  v_result := public.fan_out_recipe_plan_batch(v_batch_id);

  perform pg_temp.assert((v_result->>'ok')::boolean = true, 'fan-out of an approved batch must succeed');
  perform pg_temp.assert(jsonb_array_length(v_result->'jobs') = 2, 'excluded brief must not appear in the fan-out result');

  select count(*) into v_job_count from public.recipe_generation_jobs where batch_id = v_batch_id;
  perform pg_temp.assert(v_job_count = 2, format('expected exactly 2 jobs created, got %s', v_job_count));

  perform pg_temp.assert(
    (select bool_and(stage = 'write' and status = 'queued') from public.recipe_generation_jobs where batch_id = v_batch_id),
    'every fanned-out job must start at stage=write, status=queued'
  );

  select count(*) into v_linked_count from public.recipe_plan_briefs where batch_id = v_batch_id and not excluded and job_id is not null;
  perform pg_temp.assert(v_linked_count = 2, 'every non-excluded brief must be linked to its new job');

  perform pg_temp.assert(
    (select job_id from public.recipe_plan_briefs where batch_id = v_batch_id and excluded) is null,
    'an excluded brief must never be linked to a job'
  );

  perform pg_temp.assert(
    (select fanned_out_at from public.recipe_generation_batches where id = v_batch_id) is not null,
    'fanned_out_at must be stamped on the batch'
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Test 3 (REQUIRED coverage: "duplicate/idempotent job koruması"): calling fan-out AGAIN for the
-- same batch must not create a second job for any brief, and must report the SAME job ids back.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_batch_id uuid;
  v_result1 jsonb;
  v_result2 jsonb;
  v_job_count integer;
  v_ids1 uuid[];
  v_ids2 uuid[];
begin
  v_batch_id := pg_temp.seed_plan_batch('approved', 2);
  v_result1 := public.fan_out_recipe_plan_batch(v_batch_id);
  v_result2 := public.fan_out_recipe_plan_batch(v_batch_id);

  select count(*) into v_job_count from public.recipe_generation_jobs where batch_id = v_batch_id;
  perform pg_temp.assert(v_job_count = 2, format('a second fan-out call must not create extra jobs, got %s total', v_job_count));

  select array_agg((j->>'jobId')::uuid order by j->>'briefId') into v_ids1 from jsonb_array_elements(v_result1->'jobs') j;
  select array_agg((j->>'jobId')::uuid order by j->>'briefId') into v_ids2 from jsonb_array_elements(v_result2->'jobs') j;
  perform pg_temp.assert(v_ids1 = v_ids2, 'a repeated fan-out call must report the exact same job ids');

  perform pg_temp.assert(
    not exists (select 1 from jsonb_array_elements(v_result2->'jobs') j where (j->>'created')::boolean),
    'a repeated fan-out call must report every job as already-created (created=false)'
  );
end;
$$;

-- Same idempotency guarantee via the OTHER route: a job for (batch_id, brief_id) already exists
-- (inserted through some other path) BEFORE fan-out is ever called for that batch — the
-- ON CONFLICT DO NOTHING path must link to it, not create a duplicate.
do $$
declare
  v_batch_id uuid;
  v_brief_id uuid;
  v_pre_existing_job_id uuid;
  v_result jsonb;
  v_job_count integer;
begin
  insert into public.recipe_generation_batches (target_count, locale, review_status) values (1, 'tr', 'approved') returning id into v_batch_id;
  v_brief_id := gen_random_uuid();
  insert into public.recipe_plan_briefs (batch_id, brief_id, working_title, focus_crop, selection_reason)
  values (v_batch_id, v_brief_id, 'Test Brief', 'kabak', 'test reason');

  insert into public.recipe_generation_jobs (batch_id, brief_id, working_title, stage, status)
  values (v_batch_id, v_brief_id, 'Test Brief', 'write', 'queued')
  returning id into v_pre_existing_job_id;

  v_result := public.fan_out_recipe_plan_batch(v_batch_id);

  select count(*) into v_job_count from public.recipe_generation_jobs where batch_id = v_batch_id;
  perform pg_temp.assert(v_job_count = 1, 'fan-out must link to a pre-existing job instead of creating a duplicate');
  perform pg_temp.assert(
    ((v_result->'jobs'->0->>'jobId')::uuid) = v_pre_existing_job_id,
    'fan-out must report the pre-existing job id'
  );
  perform pg_temp.assert(
    (select job_id from public.recipe_plan_briefs where batch_id = v_batch_id) = v_pre_existing_job_id,
    'recipe_plan_briefs.job_id must be linked to the pre-existing job'
  );
end;
$$;

\echo 'F2 Step 13 fan-out vertical slice: PASSED'
