-- One-off bearer-token gate for supabase/functions/legacy-recipe-image-backfill.
--
-- NOT part of the F2 Recipe Automation pipeline — this table has nothing to do with
-- recipe_generation_jobs/recipe_drafts/recipe_qa_results/recipe_assets and is never read by any
-- of those tables' RPCs or Edge Functions.
--
-- Why this exists: legacy-recipe-image-backfill needs its own request-level authorization (the
-- same shared-secret convention every other admin/stage-runner function in this codebase uses,
-- infra/admin-auth.ts's ADMIN_DASHBOARD_KEY / RECIPE_STAGE_DISPATCH_SECRET), but the operator
-- driving this one-off backfill has full service-role Postgres access (via the Supabase
-- management tooling) and NO way to read or provision an Edge Function secret through that same
-- access path. Rather than leave the function reachable by anyone holding the project's public
-- anon key (verify_jwt=true alone would not be a real gate), this table lets the operator
-- self-issue an unguessable bearer token directly in Postgres (a service-role-only operation,
-- RLS + REVOKE below) and have the function check it — equivalent in spirit to an env-var shared
-- secret, provisioned through a path the operator actually has.
--
-- Lifecycle: rows are created immediately before running the backfill and deleted (or the whole
-- table dropped) once legacy-recipe-image-backfill is decommissioned (see that function's own
-- header). Safe to `drop table public.legacy_recipe_image_backfill_auth;` at that point.
create table public.legacy_recipe_image_backfill_auth (
  token uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note text
);

comment on table public.legacy_recipe_image_backfill_auth is
  'One-off bearer-token gate for the legacy-recipe-image-backfill Edge Function only. Not part of '
  'the F2 pipeline. Safe to drop once that function is decommissioned.';

alter table public.legacy_recipe_image_backfill_auth enable row level security;
revoke all on table public.legacy_recipe_image_backfill_auth from anon, authenticated;
grant all on table public.legacy_recipe_image_backfill_auth to service_role;
