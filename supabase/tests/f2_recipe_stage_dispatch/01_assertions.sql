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
  perform public.dispatch_recipe_stage(v_job_id, 'recipe-writer', 'test-dispatch-secret', '{"batchId":"b1"}'::jsonb);

  select * into v_call from net.http_post_calls order by id desc limit 1;

  perform pg_temp.assert(v_call.id is not null, 'expected a net.http_post call to be recorded');
  perform pg_temp.assert(
    v_call.url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/recipe-writer',
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
-- 2. Negative: any of job_id/function_name/dispatch_key null short-circuits with no HTTP call
-- ===================================================================================================

do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from net.http_post_calls;

  perform public.dispatch_recipe_stage(null, 'recipe-writer', 'k');
  perform public.dispatch_recipe_stage(gen_random_uuid(), null, 'k');
  perform public.dispatch_recipe_stage(gen_random_uuid(), 'recipe-writer', null);

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
    perform public.dispatch_recipe_stage(gen_random_uuid(), 'recipe-writer', 'test-dispatch-secret');
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
