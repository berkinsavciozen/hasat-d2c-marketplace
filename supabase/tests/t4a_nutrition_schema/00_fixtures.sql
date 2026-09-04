-- T4-A — SQL test fixtures for the nutrition contract migrations
-- (20260904160000_t4a_recipe_nutrition_columns.sql,
--  20260904161000_t4a_crop_nutrition_reference_table.sql).
--
-- Same convention as supabase/tests/b1_dispatch_push_revoke/00_fixtures.sql and
-- supabase/tests/b2_harvest_reminders_revoke/00_fixtures.sql: minimal stand-ins for the
-- anon/authenticated/service_role roles, plus the minimal *actual* production shape of the
-- tables the two migrations touch (`recipes`, `crop_config`) and the one pre-existing shared
-- function they reference (`set_updated_at`), so the suite proves the real migrations' DDL
-- instead of a stand-in schema.
--
-- Crucially, this fixture also reproduces the live project's `ALTER DEFAULT PRIVILEGES` grant
-- (confirmed via information_schema.role_table_grants against the real Hasat project — every new
-- `public` table gets full CRUD granted to anon/authenticated automatically). Without that, the
-- `crop_nutrition` REVOKE test below would trivially pass for the wrong reason (nothing was ever
-- granted) instead of proving the migration's explicit revoke actually undoes a real default
-- grant — the same reasoning documented in the B-1/B-2 fixtures for their target functions.
--
-- Run via supabase/tests/t4a_nutrition_schema/run.sh — never run manually against a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Reproduces this project's real default-privilege posture (see header) so that the migration's
-- explicit `revoke all ... from anon, authenticated` on crop_nutrition is proven against a table
-- that actually started out world-writable, not one that was never granted anything.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- ===================================================================================================
-- Pre-existing shared trigger function (already live in the real project; not part of either T4-A
-- migration, only referenced by crop_nutrition's updated_at trigger).
-- ===================================================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ===================================================================================================
-- Minimal schema: just enough of crop_config/recipes for the two T4-A migrations' DDL (new
-- columns, new constraints, new table + FK) to apply and be exercised end to end.
-- ===================================================================================================

create table public.crop_config (
  crop text primary key,
  display_name text not null
);

insert into public.crop_config (crop, display_name) values
  ('domates', 'Domates'),
  ('biber', 'Biber');

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  servings integer,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  micronutrients jsonb,
  nutrition_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.crop_config, public.recipes
  to anon, authenticated, service_role;
