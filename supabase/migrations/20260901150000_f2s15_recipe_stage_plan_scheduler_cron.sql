-- F2 Recipe Automation — Step 15: weekly automatic Planner run + admin-adjustable schedule.
--
-- Closes the last "must be triggered by hand" gap in the Planner (Step 13): nothing previously
-- called `recipe-stage-plan` on any kind of schedule — a new batch only ever existed because
-- someone made a direct, RECIPE_STAGE_DISPATCH_SECRET-authenticated HTTP call. `cron.schedule(...)`
-- below is that missing periodic trigger, calling the new `recipe-stage-plan-scheduler` Edge
-- Function — NOT `recipe-stage-plan` itself, which stays gated by RECIPE_STAGE_DISPATCH_SECRET, an
-- Edge-Function-only secret that must never be embedded in `cron.job.command`.
--
-- Auth: identical shape to `recipe-stage-sweep`'s own f2s14 cron job — `recipe-stage-plan-scheduler`
-- keeps the platform default `verify_jwt = true` (no entry in supabase/config.toml, same as every
-- other function in this pipeline that relies on the default instead of opting out), and this cron
-- job authenticates the exact same way `recipe-stage-sweep`'s job does: the project's own public
-- anon API key, passed as both `apikey` and `Authorization: Bearer` headers (the identical value
-- already stored, in plaintext, in that pre-existing f2s14 cron job — not a new exposure).
-- RECIPE_STAGE_DISPATCH_SECRET is NEVER read by `recipe-stage-plan-scheduler` and never appears in
-- this file — `cron.job.command` is plaintext, readable by anyone with SELECT on `cron.job`, so
-- that secret stays exactly where it already lived (each recipe-stage-* Edge Function's own env),
-- never duplicated here.
--
-- Default cadence: weekly, Monday 06:00 UTC (`0 6 * * 1`) — an operator-adjustable default, not a
-- hard-coded one. `admin-recipe-plan-schedule` (Edge Function) lets an admin switch this job
-- between weekly/monthly/off via the two narrow RPCs below, never by writing a free-text cron
-- expression directly.
select cron.schedule(
  'recipe-stage-plan-weekly',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/recipe-stage-plan-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- =================================================================================================
-- Admin-adjustable schedule RPCs — narrow, SECURITY DEFINER, cron-schema-only surface.
-- =================================================================================================
-- `cron.job` lives in the `cron` extension schema, owned by a privileged role — service_role (the
-- only role any Edge Function in this pipeline ever authenticates as, admin-auth.ts) has no direct
-- SELECT/UPDATE grant on it, unlike every application table in `public`, where service_role's own
-- `rolbypassrls` already covers access (the f2s04 migration's own "SECURITY INVOKER, not DEFINER"
-- reasoning). These two functions are SECURITY DEFINER for that reason alone — to hand
-- service_role exactly two narrow operations on the `recipe-stage-plan-weekly` row of `cron.job`,
-- nothing else: no generic `cron.job` read/write surface, no ability to touch any OTHER cron job
-- (`recipe-stage-sweep`, `sync-izmir-hal-prices`, ...), and `set_recipe_plan_schedule` accepts
-- exactly the two schedule strings `admin-recipe-plan-schedule`'s fixed preset allow-list ever
-- calls it with — re-validated here too, so this RPC can never become a free-text cron-expression
-- writer even if a future caller forgets to validate first.

create or replace function public.get_recipe_plan_schedule()
returns table (schedule text, active boolean)
language sql
stable
security definer
set search_path to 'public', 'cron'
as $function$
  select j.schedule, j.active
  from cron.job j
  where j.jobname = 'recipe-stage-plan-weekly';
$function$;

comment on function public.get_recipe_plan_schedule() is
  'F2 Step 15. Read-only: the recipe-stage-plan-weekly cron job''s current schedule/active state. '
  'Returns zero rows if the job has been unscheduled entirely.';

revoke all on function public.get_recipe_plan_schedule() from public, anon, authenticated;
grant execute on function public.get_recipe_plan_schedule() to service_role;

create or replace function public.set_recipe_plan_schedule(_cron text, _active boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'cron'
as $function$
declare
  -- The ONLY cron expressions this function will ever apply when _active is true — matches
  -- admin-recipe-plan-schedule/index.ts's own fixed preset allow-list exactly.
  _allowed_schedules constant text[] := array['0 6 * * 1', '0 6 1 * *'];
  _job_id bigint;
begin
  if _active and not (_cron = any (_allowed_schedules)) then
    raise exception 'set_recipe_plan_schedule: unsupported cron expression %', _cron;
  end if;

  select j.jobid into _job_id from cron.job j where j.jobname = 'recipe-stage-plan-weekly';
  if _job_id is null then
    raise exception 'set_recipe_plan_schedule: recipe-stage-plan-weekly cron job not found';
  end if;

  if _active then
    perform cron.alter_job(_job_id, schedule => _cron, active => true);
  else
    perform cron.alter_job(_job_id, active => false);
  end if;
end;
$function$;

comment on function public.set_recipe_plan_schedule(text, boolean) is
  'F2 Step 15. Switches the recipe-stage-plan-weekly cron job between a fixed set of presets '
  '(weekly/monthly) or off. Refuses any _cron value outside that fixed allow-list when _active is '
  'true.';

revoke all on function public.set_recipe_plan_schedule(text, boolean) from public, anon, authenticated;
grant execute on function public.set_recipe_plan_schedule(text, boolean) to service_role;
