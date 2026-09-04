-- T4-A2 — SQL test fixtures for the recipes column-level UPDATE lock migration
-- (20260904170000_t4a2_recipes_nutrition_allergen_column_lock.sql).
--
-- Same convention as supabase/tests/t4a_nutrition_schema/00_fixtures.sql: a minimal but
-- real-shaped `recipes` stand-in (the full pre-T4-A 32-column shape, confirmed live via
-- information_schema.columns) plus `crop_config` and `set_updated_at()` (needed only because this
-- migration is applied on top of the real T4-A migrations below, not because this suite tests
-- them again). RLS is deliberately NOT enabled on this fixture table: this suite's whole subject
-- is the column-level GRANT/REVOKE layer, which is independent of and sits underneath RLS —
-- isolating it here keeps a locked-column failure from being confused with an RLS failure.
--
-- Run via supabase/tests/t4a2_recipes_column_lock/run.sh — never run manually against a real
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
  display_name text not null
);

insert into public.crop_config (crop, display_name) values ('domates', 'Domates');

-- Full pre-T4-A `recipes` shape (32 columns), matching the live project exactly as re-verified
-- for this dispatch via information_schema.columns.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  cover_photo_url text,
  servings integer,
  prep_minutes integer,
  cook_minutes integer,
  difficulty text,
  cuisine text,
  diet_tags text[] not null default '{}',
  status text not null default 'draft',
  visibility text not null default 'private',
  source_type text not null default 'manual',
  source_url text,
  owner_id uuid,
  author_type text not null default 'hasat',
  extraction_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rest_minutes integer,
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
  cloned_from_recipe_id uuid
);

-- Reproduces the live project's actual grant shape (table-wide, no column restriction) so this
-- suite's REVOKE proves it narrows a real broad grant, not one that was never given.
grant select, insert, update, delete on public.recipes, public.crop_config to anon, authenticated, service_role;
