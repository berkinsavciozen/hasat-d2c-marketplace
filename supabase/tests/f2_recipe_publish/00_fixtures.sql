-- F2 Recipe Automation — Step 12 SQL test fixtures.
--
-- Minimal, live-shaped stand-ins for the tables/functions/roles the Step 03/04/05/11 and Step 12
-- migrations depend on via FK/type references, but which those migrations do not themselves
-- create (they are pre-existing live objects). Unlike ../f2_recipe_automation/00_fixtures.sql
-- (which only needs `recipes`/`recipe_ingredients` as narrow duplicate-check stand-ins), the
-- publish RPC actually WRITES `recipes`/`recipe_ingredients`/`recipe_steps`, so this fixture
-- mirrors their full live column set/CHECK constraints/UNIQUE indexes — confirmed via read-only
-- introspection (list_tables + a pg_constraint/pg_indexes query) against project
-- efuqpiaavrzimvstpdpm on 2026-08-26, immediately before writing this suite. See the Step 12
-- completion report for the exact columns/constraints this was checked against.
--
-- Run via supabase/tests/f2_recipe_publish/run.sh — never run manually against a real project.

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

-- Full live column set (see file header) — this is the table the publish RPC actually inserts
-- into, so every CHECK/UNIQUE index the live table enforces is reproduced here, not just the
-- narrow subset ../f2_recipe_automation's own fixture needs for read-only duplicate checks.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  cover_photo_url text,
  servings integer check (servings is null or servings > 0),
  prep_minutes integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes integer check (cook_minutes is null or cook_minutes >= 0),
  difficulty text check (difficulty is null or difficulty = any (array['kolay','orta','zor'])),
  cuisine text,
  diet_tags text[] not null default '{}',
  status text not null default 'draft' check (status = any (array['draft','published'])),
  visibility text not null default 'private' check (visibility = any (array['public','private'])),
  source_type text not null default 'manual' check (source_type = any (array['manual','text','photo','url'])),
  source_url text,
  owner_id uuid references public.profiles(id) on delete cascade,
  author_type text not null default 'hasat' check (author_type = any (array['hasat','ciftci','sef','kullanici'])),
  extraction_confidence numeric check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rest_minutes integer check (rest_minutes is null or rest_minutes >= 0),
  allergen_labels text[],
  required_equipment text[],
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  micronutrients jsonb,
  nutrition_calculated_at timestamptz,
  share_token uuid,
  cloned_from_recipe_id uuid references public.recipes(id)
);

create unique index recipes_slug_key on public.recipes using btree (slug);
create unique index recipes_share_token_key on public.recipes using btree (share_token) where (share_token is not null);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  crop text references public.crop_config(crop) on update cascade on delete set null,
  free_text_name text,
  quantity numeric check (quantity is null or quantity > 0),
  unit text,
  note text,
  is_key_ingredient boolean not null default false,
  created_at timestamptz not null default now(),
  ingredient_class text check (ingredient_class = any (array['tarimsal','platform_disi'])),
  constraint recipe_ingredients_name_present check (
    crop is not null or nullif(btrim(coalesce(free_text_name, '')), '') is not null
  )
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_no integer not null check (step_no > 0),
  instruction text not null,
  photo_url text,
  timer_seconds integer check (timer_seconds is null or timer_seconds > 0),
  created_at timestamptz not null default now()
);

create unique index recipe_steps_recipe_step_key on public.recipe_steps using btree (recipe_id, step_no);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Step 03A switched the Step 04 RPCs (and now the Step 12 RPC) from SECURITY DEFINER to SECURITY
-- INVOKER. Under INVOKER, table-level GRANTs — not just RLS bypass — determine whether the calling
-- role can read/write these pre-existing tables. Live Supabase grants full table-level privileges
-- on these to service_role — mirror that here so this fixture doesn't produce a false failure that
-- would never happen live.
grant select, insert, update on public.profiles, public.crop_config, public.crop_culinary_meta,
  public.recipes, public.recipe_ingredients, public.recipe_steps
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------------------------

insert into public.crop_config (crop, display_name, default_unit, category_group, harvest_window_start_month, harvest_window_end_month, default_photo_url)
values
  ('kabak', 'Kabak', 'adet', 'sebze', 5, 9, null),
  ('domates', 'Domates', 'kg', 'sebze', 5, 10, null);

insert into public.crop_culinary_meta (crop, is_edible, culinary_aliases)
values
  ('kabak', true, '{}'),
  ('domates', true, '{}');

insert into public.profiles default values;
