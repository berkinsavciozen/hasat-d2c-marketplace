-- F2 Recipe Automation — Step 14: periodic retry / stale-lock reconciliation sweep.
--
-- Closes the gap identified in production on 2026-09-01 (batch e1c728ff-3086-407a-a83a-e6871fcce852
-- and two independently-discovered follow-on jobs): `dispatch_recipe_stage` is only ever called
-- right after a successful `advanceStage()` (see 20260822120000_f2s05_recipe_stage_dispatch.sql's
-- own header) — nothing ever calls it again for a job that instead ends its attempt via
-- `failJob()` (status='retryable') or whose worker crashed mid-stage (status='running' past its
-- lock's TTL). Both categories previously required a manual, one-off operator intervention to
-- unstick. `../functions/_shared/recipe-automation/infra/sweep.ts`'s `runRetrySweep()` is the
-- reconciliation logic itself (unit-tested there); this migration is only the periodic trigger.
--
-- Schedule mechanism: pg_cron (already installed, `1.6.4`) calling `net.http_post` (already
-- installed, `0.20.3`) directly against the new `recipe-stage-sweep` Edge Function, mirroring the
-- existing `sync-izmir-hal-prices` cron job's own shape exactly (see that job in `cron.job`).
--
-- Deliberately NOT calling `dispatch_recipe_stage` directly from this cron job's SQL command: that
-- RPC takes `_dispatch_key` (RECIPE_STAGE_DISPATCH_SECRET) as a plain parameter, and
-- `cron.job.command` is plaintext, readable by anyone with SELECT on `cron.job` — embedding that
-- secret there would be a real exposure-model regression versus today, where it lives in exactly
-- one place (Edge Function env, read via `Deno.env.get`). `recipe-stage-sweep` instead keeps
-- `verify_jwt = true` (unlike its `x-admin-key`-gated recipe-stage-* siblings) and is authenticated
-- here the same way `sync-izmir-hal-prices` already authenticates its own scheduled call — the
-- project's own anon API key, the same value already visible in that pre-existing cron job's
-- stored command. `recipe-stage-sweep`'s own handler reads RECIPE_STAGE_DISPATCH_SECRET from ITS
-- OWN environment (Supabase project secrets are shared across every function in a project) when it
-- calls `dispatch_recipe_stage` — no secret is ever read from or stored in Postgres.
--
-- Cadence: every 5 minutes — matches job-lock.ts's own `DEFAULT_LOCK_DURATION_MS` (5 minutes), so a
-- stale lock is picked up at most one tick after it actually expires. `runRetrySweep()` caps each
-- tick at 50 jobs per category (`SWEEP_BATCH_LIMIT`), so a large backlog is worked off over several
-- ticks rather than in one unbounded pass.
select cron.schedule(
  'recipe-stage-sweep',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/recipe-stage-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
