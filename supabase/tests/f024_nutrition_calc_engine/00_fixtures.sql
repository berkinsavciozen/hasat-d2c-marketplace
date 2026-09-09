-- F0-24 — SQL test fixtures for the nutrition calculation engine migration
-- (20260909120000_f024_recipe_nutrition_calc_engine.sql).
--
-- Same convention as supabase/tests/t4a_nutrition_schema/00_fixtures.sql: minimal but real-shaped
-- stand-ins for the tables the migration under test reads/writes (`recipes` pre-T4A shape, so the
-- real T4-A migration can add its columns on top; `crop_config`; plus this suite's own additions,
-- `crop_culinary_meta`, `crop_nutrition`, `recipe_ingredients`), applied to a FRESH local database.
--
-- Run via supabase/tests/f024_nutrition_calc_engine/run.sh — never run manually against a real
-- project.

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

create table public.crop_config (
  crop text primary key,
  display_name text not null,
  default_unit text not null default 'kg'
);

create table public.crop_culinary_meta (
  crop text primary key references public.crop_config(crop) on update cascade on delete cascade,
  is_edible boolean not null default true,
  culinary_aliases text[] not null default '{}',
  conversion_hints jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pre-T4A `recipes` shape — the real T4-A migration (applied by run.sh right after this file) adds
-- nutrition_source/nutrition_coverage_pct/nutrition_input_hash/nutrition_reference_version/
-- nutrition_warnings + its CHECK constraints on top of this.
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

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  crop text references public.crop_config(crop),
  free_text_name text,
  quantity numeric,
  unit text,
  is_key_ingredient boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete
  on public.crop_config, public.crop_culinary_meta, public.recipes, public.recipe_ingredients
  to anon, authenticated, service_role;

-- ===================================================================================================
-- Seed data: two real, priced crops (domates/biber), and one crop that exists in crop_config/
-- crop_culinary_meta but deliberately has NO crop_nutrition row yet — the "one of the 41 unseeded
-- crops" case dispatch Task 1 step 5 calls out (known weight, but must still drag coverage down).
-- ===================================================================================================

insert into public.crop_config (crop, display_name, default_unit) values
  ('domates', 'Domates', 'kg'),
  ('biber', 'Biber', 'kg'),
  ('gizemli_ot', 'Gizemli Ot', 'kg');

insert into public.crop_culinary_meta (crop, is_edible, conversion_hints) values
  ('domates', true, '{}'::jsonb),
  ('biber', true, '{"adet": 100}'::jsonb),
  ('gizemli_ot', true, '{}'::jsonb);
