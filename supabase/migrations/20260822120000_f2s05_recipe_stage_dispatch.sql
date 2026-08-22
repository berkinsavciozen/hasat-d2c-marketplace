-- F2 Recipe Automation — Step 05: next-stage dispatch RPC.
--
-- Mirrors public.dispatch_sms / public.dispatch_push (see
-- 20260720073613_d61a683e-0286-4e36-9c82-4d0418efb009.sql and the live project's dispatch_push,
-- which has no committed migration source but is visible in the generated Supabase types) — a
-- thin net.http_post call wrapped in `exception when others` so a downstream HTTP failure never
-- raises back to the caller. Here the caller is a stage-runner Edge Function that just committed
-- a job's stage/status advance (job-state.ts's advanceStage) and wants to nudge the next stage to
-- start immediately; the advance itself is already durable by the time this runs, so a failure
-- inside this function only means the next stage starts later (via a future reconciliation sweep
-- or manual re-dispatch) rather than immediately — never a lost or corrupted job.
--
-- Unlike dispatch_sms/dispatch_push, this function takes no `_user_id`/notif_prefs lookup — it is
-- an internal service-to-service call, gated instead by `_dispatch_key`, a shared secret the
-- caller (stage-dispatch.ts) reads from RECIPE_STAGE_DISPATCH_SECRET. The key is deliberately
-- narrower-blast-radius than SUPABASE_SERVICE_ROLE_KEY: it authenticates "you may ask a stage
-- runner to start," nothing else, so embedding it in a net.http_post header (visible in pg_net's
-- own request log) is an acceptable, bounded exposure the same way dispatch_sms's hardcoded anon
-- key is.
--
-- SECURITY INVOKER (not DEFINER): per the Step 03A reconciliation's `SECURITY DEFINER` reassessment
-- (see 20260819120000_f2s03_recipe_automation_schema.sql's RPCs), service_role already has
-- `rolbypassrls = true` on the live project, and this function is only ever called by a
-- service-role Supabase client (stage-dispatch.ts) — DEFINER would be a needless escalation here.
--
-- Not applied to any Supabase environment in this step — see supabase/tests/f2_recipe_stage_dispatch/
-- for its local-only test suite, following the same fresh-local-PostgreSQL convention as the
-- f2_recipe_automation suite.

create or replace function public.dispatch_recipe_stage(
  _job_id uuid,
  _function_name text,
  _dispatch_key text,
  _payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $function$
declare
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/' || _function_name;
begin
  if _job_id is null or _function_name is null or _dispatch_key is null then
    return;
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-key', _dispatch_key
    ),
    body := jsonb_build_object('jobId', _job_id) || coalesce(_payload, '{}'::jsonb)
  );
exception when others then
  raise log 'dispatch_recipe_stage failed for job %/%: %', _job_id, _function_name, sqlerrm;
end;
$function$;

comment on function public.dispatch_recipe_stage(uuid, text, text, jsonb) is
  'F2 Step 05. Best-effort next-stage nudge, mirrors dispatch_sms/dispatch_push. Never the '
  'source of truth for job stage/status — see job-state.ts.';

revoke all on function public.dispatch_recipe_stage(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_recipe_stage(uuid, text, text, jsonb) to service_role;
