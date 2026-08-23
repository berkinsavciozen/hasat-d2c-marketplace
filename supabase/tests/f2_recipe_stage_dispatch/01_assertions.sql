-- F2 Recipe Automation — Step 05 SQL test suite for dispatch_recipe_stage.

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
-- 1. Happy path: fires exactly one net.http_post call with the expected url/headers/body
-- ===================================================================================================

do $$
declare
  v_job_id uuid := gen_random_uuid();
  v_call net.http_post_calls%rowtype;
begin
  perform public.dispatch_recipe_stage(v_job_id, 'recipe-stage-write', 'test-dispatch-secret', '{"batchId":"b1"}'::jsonb);

  select * into v_call from net.http_post_calls order by id desc limit 1;

  perform pg_temp.assert(v_call.id is not null, 'expected a net.http_post call to be recorded');
  perform pg_temp.assert(
    v_call.url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/recipe-stage-write',
    'expected url to target the given function name'
  );
  perform pg_temp.assert(
    v_call.headers ->> 'x-admin-key' = 'test-dispatch-secret',
    'expected dispatch key to be forwarded as x-admin-key'
  );
  perform pg_temp.assert(
    (v_call.body ->> 'jobId') = v_job_id::text,
    'expected body to include jobId'
  );
  perform pg_temp.assert(
    (v_call.body ->> 'batchId') = 'b1',
    'expected extra payload fields to be merged into the body'
  );
end;
$$;

-- ===================================================================================================
-- 1b. P2 regression: a _payload carrying its own 'jobId' key must NOT be able to override the real
--     job id — jsonb_build_object('jobId', _job_id) must win the '||' merge, not lose to it.
-- ===================================================================================================

do $$
declare
  v_job_id uuid := gen_random_uuid();
  v_spoofed_job_id uuid := gen_random_uuid();
  v_call net.http_post_calls%rowtype;
begin
  perform public.dispatch_recipe_stage(
    v_job_id, 'recipe-stage-write', 'test-dispatch-secret',
    jsonb_build_object('jobId', v_spoofed_job_id, 'batchId', 'b1')
  );

  select * into v_call from net.http_post_calls order by id desc limit 1;

  perform pg_temp.assert(
    (v_call.body ->> 'jobId') = v_job_id::text,
    'expected the real job id to win over a payload-supplied jobId, got ' || (v_call.body ->> 'jobId')
  );
  perform pg_temp.assert(
    (v_call.body ->> 'jobId') is distinct from v_spoofed_job_id::text,
    'a payload jobId must never reach the dispatched body'
  );
  perform pg_temp.assert(
    (v_call.body ->> 'batchId') = 'b1',
    'non-colliding payload fields must still pass through'
  );
end;
$$;

-- ===================================================================================================
-- 1c. P3: allow-listed function name dispatches; unlisted name is refused with no HTTP call.
-- ===================================================================================================

do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from net.http_post_calls;

  perform public.dispatch_recipe_stage(gen_random_uuid(), 'not-a-real-stage-function', 'test-dispatch-secret');

  select count(*) into v_after from net.http_post_calls;
  perform pg_temp.assert(v_after = v_before, 'expected no net.http_post call for a non-allow-listed function_name');
end;
$$;

do $$
declare
  v_job_id uuid := gen_random_uuid();
  v_call net.http_post_calls%rowtype;
begin
  perform public.dispatch_recipe_stage(v_job_id, 'recipe-stage-qa', 'test-dispatch-secret');

  select * into v_call from net.http_post_calls order by id desc limit 1;
  perform pg_temp.assert(
    v_call.url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/recipe-stage-qa',
    'expected an allow-listed function_name to dispatch normally'
  );
end;
$$;

-- ===================================================================================================
-- 1d. P4: app.dispatch_base_url overrides the hard-coded default when set on the session/database.
-- ===================================================================================================

-- Default-fallback case runs FIRST, deliberately, before app.dispatch_base_url is ever touched in
-- this session: once a custom (never-declared-in-postgresql.conf) GUC placeholder has been set via
-- set_config even once, this Postgres version's current_setting(name, true) stops returning a true
-- SQL NULL for it (it reports the empty string instead) for the rest of the session/database, even
-- under set_config's is_local=true "SET LOCAL" semantics or an explicit NULL value — so there is no
-- reliable in-session way to "unset" it again once touched. Ordering the assertions this way tests
-- the real unset case honestly instead of relying on that behavior.
do $$
declare
  v_job_id uuid := gen_random_uuid();
  v_call net.http_post_calls%rowtype;
begin
  perform public.dispatch_recipe_stage(v_job_id, 'recipe-stage-write', 'test-dispatch-secret');

  select * into v_call from net.http_post_calls order by id desc limit 1;
  perform pg_temp.assert(
    v_call.url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/recipe-stage-write',
    'expected the hard-coded default url when app.dispatch_base_url is unset, got ' || v_call.url
  );
end;
$$;

do $$
declare
  v_job_id uuid := gen_random_uuid();
  v_call net.http_post_calls%rowtype;
begin
  perform set_config('app.dispatch_base_url', 'https://staging-copy.supabase.co/functions/v1/', true);
  perform public.dispatch_recipe_stage(v_job_id, 'recipe-stage-write', 'test-dispatch-secret');

  select * into v_call from net.http_post_calls order by id desc limit 1;
  perform pg_temp.assert(
    v_call.url = 'https://staging-copy.supabase.co/functions/v1/recipe-stage-write',
    'expected app.dispatch_base_url to override the hard-coded default, got ' || v_call.url
  );
end;
$$;

-- ===================================================================================================
-- 2. Negative: any of job_id/function_name/dispatch_key null short-circuits with no HTTP call
-- ===================================================================================================

do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from net.http_post_calls;

  perform public.dispatch_recipe_stage(null, 'recipe-stage-write', 'k');
  perform public.dispatch_recipe_stage(gen_random_uuid(), null, 'k');
  perform public.dispatch_recipe_stage(gen_random_uuid(), 'recipe-stage-write', null);

  select count(*) into v_after from net.http_post_calls;
  perform pg_temp.assert(v_after = v_before, 'expected no net.http_post call when a required argument is null');
end;
$$;

-- ===================================================================================================
-- 3. Exception isolation: a raising net.http_post must not propagate out of dispatch_recipe_stage
-- ===================================================================================================

create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
as $$
begin
  raise exception 'simulated network failure';
end;
$$;

do $$
declare
  v_failed boolean := false;
begin
  begin
    perform public.dispatch_recipe_stage(gen_random_uuid(), 'recipe-stage-write', 'test-dispatch-secret');
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.assert(not v_failed, 'expected dispatch_recipe_stage to swallow a net.http_post failure, not raise');
end;
$$;

-- Restore the recording stub for any assertions after this point.
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
as $$
declare
  _id bigint;
begin
  insert into net.http_post_calls (url, headers, body) values (url, headers, body) returning id into _id;
  return _id;
end;
$$;

-- ===================================================================================================
-- 4. Grants: anon/authenticated denied, service_role allowed
-- ===================================================================================================

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.dispatch_recipe_stage(uuid,text,text,jsonb)', 'execute'),
    'expected anon to be denied execute on dispatch_recipe_stage'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.dispatch_recipe_stage(uuid,text,text,jsonb)', 'execute'),
    'expected authenticated to be denied execute on dispatch_recipe_stage'
  );
  perform pg_temp.assert(
    has_function_privilege('service_role', 'public.dispatch_recipe_stage(uuid,text,text,jsonb)', 'execute'),
    'expected service_role to be allowed execute on dispatch_recipe_stage'
  );
end;
$$;

\echo 'F2 recipe stage dispatch SQL test suite: ALL ASSERTIONS PASSED'
