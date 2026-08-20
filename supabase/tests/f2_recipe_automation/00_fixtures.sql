-- F2 Recipe Automation — Step 03A SQL test fixtures.
--
-- Minimal, live-shaped stand-ins for the tables/functions/roles the Step 03 (tables) and Step 04
-- (RPC) migrations depend on via FK/type references, but which those migrations do not themselves
-- create (they are pre-existing live objects). Column set is intentionally the subset those two
-- migrations actually reference — not a full mirror of the live schema.
--
-- Run via supabase/tests/f2_recipe_automation/run.sh — never run manually against a real project.

-- ---------------------------------------------------------------------------------------------
-- Roles (mirrors Supabase's anon / authenticated / service_role split)
-- ---------------------------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------------------------
-- Pre-existing live tables/functions the F2 migrations reference but do not create
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table public.crop_config (
  crop text primary key,
  display_name text not null,
  default_unit text not null,
  category_group text,
  harvest_window_start_month int,
  harvest_window_end_month int,
  default_photo_url text
);

create table public.crop_culinary_meta (
  crop text primary key references public.crop_config(crop),
  is_edible boolean not null,
  culinary_aliases text[] not null default '{}',
  conversion_hints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  status text not null default 'draft' check (status = any (array['draft', 'published'])),
  visibility text not null default 'private' check (visibility = any (array['public', 'private'])),
  created_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  crop text references public.crop_config(crop),
  is_key_ingredient boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Step 03A switched the Step 04 RPCs from SECURITY DEFINER to SECURITY INVOKER (see that
-- migration's header). Under INVOKER, table-level GRANTs — not just RLS bypass — determine
-- whether the calling role can read these pre-existing tables. Live Supabase grants full
-- table-level privileges on these to service_role (confirmed via information_schema.role_table_
-- grants against project efuqpiaavrzimvstpdpm) — RLS is what actually restricts anon/
-- authenticated there, not GRANT/REVOKE. Mirror that here so this fixture doesn't produce a false
-- "service_role can't read crop_config" failure that would never happen live.
grant select on public.profiles, public.crop_config, public.crop_culinary_meta, public.recipes, public.recipe_ingredients
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------------------------

insert into public.crop_config (crop, display_name, default_unit, category_group, harvest_window_start_month, harvest_window_end_month, default_photo_url)
values
  ('kabak', 'Kabak', 'adet', 'sebze', 5, 9, null),
  ('domates', 'Domates', 'kg', 'sebze', 5, 10, null),
  -- Step 03A regression fixture: a crop_config row with NO crop_culinary_meta row at all. Before
  -- the Step 03A fix, get_seasonal_crop_candidates' INNER JOIN-equivalent EXISTS filter silently
  -- dropped this crop from every result set, regardless of parameters.
  ('bilinmeyen_sebze', 'Bilinmeyen Sebze', 'adet', 'sebze', 1, 12, null),
  -- Explicitly non-edible, WITH a crop_culinary_meta row — should only be filtered out when the
  -- caller explicitly asks for p_edible_only = true.
  ('sus_bitkisi', 'Sus Bitkisi', 'adet', 'sus', 1, 12, null);

insert into public.crop_culinary_meta (crop, is_edible, culinary_aliases)
values
  ('kabak', true, '{}'),
  ('domates', true, '{}'),
  ('sus_bitkisi', false, '{}');

insert into public.profiles default values;
