-- F2 Recipe Automation — Step 13 SQL test fixtures.
--
-- Same minimal, live-shaped stand-ins as ../f2_recipe_automation/00_fixtures.sql (this suite's own
-- migration prerequisites are f2s03/f2s04/f2s05, the same ones that fixture supports) plus one
-- seeded `recipes`/`recipe_ingredients` row so find_recipe_duplicates (reused by
-- validate_recipe_plan_diversity, f2s13) has a real exact/near-duplicate target to match against.
--
-- Run via supabase/tests/f2_recipe_plan/run.sh — never run manually against a real project.

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

grant select on public.profiles, public.crop_config, public.crop_culinary_meta, public.recipes, public.recipe_ingredients
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------------------------

insert into public.crop_config (crop, display_name, default_unit, category_group, harvest_window_start_month, harvest_window_end_month, default_photo_url)
values
  ('kabak', 'Kabak', 'adet', 'sebze', 5, 9, null),
  ('domates', 'Domates', 'kg', 'sebze', 5, 10, null),
  ('patlican', 'Patlican', 'adet', 'sebze', 6, 9, null);

insert into public.crop_culinary_meta (crop, is_edible, culinary_aliases)
values
  ('kabak', true, '{}'),
  ('domates', true, '{}'),
  ('patlican', true, '{}');

insert into public.profiles default values;

-- One existing PUBLISHED recipe, for validate_recipe_plan_diversity's near/exact-duplicate checks
-- (find_recipe_duplicates, f2s04) to have something real to match against.
insert into public.recipes (slug, title, status, visibility)
values ('firinda-kabak-musakka', 'Firinda Kabak Musakka', 'published', 'public');

insert into public.recipe_ingredients (recipe_id, crop, is_key_ingredient)
select id, 'kabak', true from public.recipes where slug = 'firinda-kabak-musakka';
