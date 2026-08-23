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
--
-- F2 Step 06 preflight corrections (P2/P3/P4 — see Step 06 completion report):
--   * P2: the body was previously built as
--     `jsonb_build_object('jobId', _job_id) || coalesce(_payload, '{}'::jsonb)` — in `jsonb ||`
--     the RIGHT operand wins on key collision, so a caller-supplied `_payload` containing its own
--     `jobId` key silently overwrote the real job id. Operands are now reversed so `_payload` can
--     only ADD routing-hint fields, never override `jobId`.
--   * P3: `_function_name` was spliced into the target URL with no validation at all — any string
--     the caller passed became a POST target. Added a fixed allow-list of the pipeline's own
--     stage-runner function names (Master Plan §7: "her tool dar kapsamli, typed ve allow-list
--     edilmis wrapper'dir"). An unlisted name is refused the same way a null argument already
--     was — silently return, with a `raise log` line so it's still visible in Postgres logs.
--   * P4: the base URL was hard-coded to this one project's own domain — harmless today (this
--     function is only ever called by this project's own service-role client), but means a
--     database COPY (a Supabase branch, staging, a restore-from-backup) would have its RPC call
--     right back into PRODUCTION's Edge Functions. Now reads `app.dispatch_base_url` first (a
--     plain Postgres session/database setting, not a secret — same non-secret-config convention
--     as e.g. `search_path`), falling back to today's literal when unset so behavior is unchanged
--     until a copy of this database is actually given its own setting.

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
  -- P3: the only stage-runner Edge Function names this RPC may ever POST to — one per pipeline
  -- node that actually dispatches automatically. 'awaiting_approval' is deliberately excluded: it
  -- is a human-review resting state, not an autonomous stage-runner. Add a new name here ONLY
  -- when that stage-runner Edge Function actually exists (matches Master Plan §7's "typed and
  -- allow-listed wrapper" requirement — this is not meant to pre-approve future names).
  _allowed_function_names constant text[] := array[
    'recipe-stage-plan',
    'recipe-stage-write',
    'recipe-stage-qa',
    'recipe-stage-revise',
    'recipe-stage-image',
    'recipe-stage-finalize',
    'recipe-stage-publish'
  ];
  _base_url text := coalesce(
    current_setting('app.dispatch_base_url', true),
    'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/'
  );
  _url text;
begin
  if _job_id is null or _function_name is null or _dispatch_key is null then
    return;
  end if;

  if not (_function_name = any (_allowed_function_names)) then
    raise log 'dispatch_recipe_stage refused unknown function_name % for job %', _function_name, _job_id;
    return;
  end if;

  _url := _base_url || _function_name;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-key', _dispatch_key
    ),
    -- P2: _payload first, jobId second — jsonb_build_object('jobId', _job_id) always wins the
    -- collision now, so a payload cannot smuggle in a different jobId.
    body := coalesce(_payload, '{}'::jsonb) || jsonb_build_object('jobId', _job_id)
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
