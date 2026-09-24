-- DQ-2 — SQL test fixtures for 20260924120000_dq2_recipe_quality_issues.sql.
--
-- Self-contained: the tables below are reduced copies of the LIVE shapes captured in
-- 20260917120000_baseline_consolidated_schema_2026-09-17.sql (recipes, recipe_ingredients,
-- recipe_steps, recipe_drafts, crop_config, ingredient_measure_reference, the two
-- fn_nutrition_normalize_* helpers) plus a `storage.objects` stub. Only the columns/constraints
-- DQ-2 and the T10 migration it replaces objects from actually touch are reproduced.
--
-- crop_config holds the 70 live crop slugs and ingredient_measure_reference the 17 live
-- normalized units (read-only snapshot, 2026-09-24) so CROP_UNLINKED/UNIT_UNKNOWN behave as live.
--
-- Run via supabase/tests/dq2_recipe_quality_issues/run.sh — never against a real project.

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

-- Stand-in for the live T3-A validator (only referenced by T10's admin_update_recipe_allergens).
create or replace function public.is_valid_recipe_allergen_labels(labels text[])
returns boolean
language sql
immutable
set search_path = ''
as $$ select true $$;

create table public.crop_config (
  crop text primary key,
  display_name text not null,
  default_unit text not null default 'kg'
);

insert into public.crop_config (crop, display_name) values
  ('adaçayı', 'adaçayı'),
  ('anason', 'anason'),
  ('antep_fıstığı', 'antep_fıstığı'),
  ('armut', 'armut'),
  ('arpa', 'arpa'),
  ('ayçiçeği', 'ayçiçeği'),
  ('ayva', 'ayva'),
  ('badem', 'badem'),
  ('bakla', 'bakla'),
  ('biber', 'biber'),
  ('buğday', 'buğday'),
  ('çavdar', 'çavdar'),
  ('çeltik', 'çeltik'),
  ('ceviz', 'ceviz'),
  ('çilek', 'çilek'),
  ('defne', 'defne'),
  ('domates', 'domates'),
  ('elma', 'elma'),
  ('erik', 'erik'),
  ('fındık', 'fındık'),
  ('greyfurt', 'greyfurt'),
  ('gül', 'gül'),
  ('havuç', 'havuç'),
  ('incir', 'incir'),
  ('ıhlamur', 'ıhlamur'),
  ('ıspanak', 'ıspanak'),
  ('kabak', 'kabak'),
  ('kanola', 'kanola'),
  ('karpuz', 'karpuz'),
  ('kavun', 'kavun'),
  ('kayısı', 'kayısı'),
  ('kekik', 'kekik'),
  ('kimyon', 'kimyon'),
  ('kiraz', 'kiraz'),
  ('kuru_fasulye', 'kuru_fasulye'),
  ('lahana', 'lahana'),
  ('lavanta', 'lavanta'),
  ('limon', 'limon'),
  ('mandalina', 'mandalina'),
  ('marul', 'marul'),
  ('mercimek', 'mercimek'),
  ('mısır', 'mısır'),
  ('muz', 'muz'),
  ('nane', 'nane'),
  ('nar', 'nar'),
  ('nohut', 'nohut'),
  ('pamuk', 'pamuk'),
  ('papatya', 'papatya'),
  ('patates', 'patates'),
  ('patlıcan', 'patlıcan'),
  ('portakal', 'portakal'),
  ('pul_biber', 'pul_biber'),
  ('rezene', 'rezene'),
  ('safran', 'safran'),
  ('safran_soğanı', 'safran_soğanı'),
  ('salatalık', 'salatalık'),
  ('sarımsak', 'sarımsak'),
  ('şeftali', 'şeftali'),
  ('şeker_pancarı', 'şeker_pancarı'),
  ('soğan', 'soğan'),
  ('sumak', 'sumak'),
  ('susam', 'susam'),
  ('tıbbi bitkiler', 'tıbbi bitkiler'),
  ('tütün', 'tütün'),
  ('üzüm', 'üzüm'),
  ('vişne', 'vişne'),
  ('yerfıstığı', 'yerfıstığı'),
  ('yulaf', 'yulaf'),
  ('zeytin', 'zeytin'),
  ('zeytinyağı', 'zeytinyağı');

create table public.ingredient_measure_reference (
  target_kind text not null,
  target_key text not null,
  normalized_unit text not null,
  grams_per_unit numeric not null,
  reference_source text not null,
  reference_source_id text not null,
  reference_version text not null,
  reference_url text not null,
  notes text,
  created_at timestamptz not null default now()
);

insert into public.ingredient_measure_reference
  (target_kind, target_key, normalized_unit, grams_per_unit, reference_source, reference_source_id, reference_version, reference_url, notes)
values
  ('food', 'dq2-fixture', 'adet', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'avuc', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'avuç', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'bardak', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'cay bardagi', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'çay bardağı', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'çay kaşığı', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'dal', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'demet', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'diş', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'küçük parça', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'orta boy', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'paket', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'su bardağı', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'tatlı kaşığı', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'tutam', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null),
  ('food', 'dq2-fixture', 'yemek kaşığı', 1, 'fixture', 'fixture', 'fixture', 'https://example.test/', null);

-- Verbatim from the baseline snapshot.
CREATE OR REPLACE FUNCTION public.fn_nutrition_normalize_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(regexp_replace(replace(lower(btrim(coalesce(p_value, ''))), '_', ' '), '\s+', ' ', 'g'), '')
$function$;

CREATE OR REPLACE FUNCTION public.fn_nutrition_normalize_unit(p_unit text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case public.fn_nutrition_normalize_text(p_unit)
    when 'cay kasigi' then 'çay kaşığı'
    when 'çay kasigi' then 'çay kaşığı'
    when 'cay kaşığı' then 'çay kaşığı'
    when 'tatli kasigi' then 'tatlı kaşığı'
    when 'tatlı kasigi' then 'tatlı kaşığı'
    when 'yemek kasigi' then 'yemek kaşığı'
    when 'su bardagi' then 'su bardağı'
    when 'dis' then 'diş'
    else public.fn_nutrition_normalize_text(p_unit)
  end
$function$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  cover_photo_url text,
  servings integer check (servings is null or servings > 0),
  prep_minutes integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes integer check (cook_minutes is null or cook_minutes >= 0),
  rest_minutes integer,
  diet_tags text[] not null default '{}',
  status text not null default 'draft',
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  allergen_labels text[],
  required_equipment text[],
  calories numeric,
  nutrition_source text,
  nutrition_coverage_pct numeric(5,2),
  nutrition_reference_version text,
  allergens_reviewed boolean not null default false,
  allergens_reviewed_at timestamptz
);

create trigger trg_recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  crop text,
  free_text_name text,
  quantity numeric check (quantity is null or quantity > 0),
  unit text,
  note text,
  is_key_ingredient boolean not null default false,
  created_at timestamptz not null default now(),
  ingredient_class text check (ingredient_class = any (array['tarimsal', 'platform_disi'])),
  nutrition_food_key text,
  nutrition_exclusion_reason text,
  constraint recipe_ingredients_name_present check (crop is not null or free_text_name is not null)
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_no integer not null,
  instruction text not null,
  photo_url text,
  timer_seconds integer,
  created_at timestamptz not null default now()
);

create table public.recipe_drafts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  version integer not null,
  title text not null,
  cover_photo_url text,
  servings integer,
  prep_minutes integer,
  cook_minutes integer,
  rest_minutes integer,
  diet_tags text[] not null default '{}',
  allergen_labels text[],
  required_equipment text[],
  ingredients jsonb not null,
  steps jsonb not null,
  nutrition_preview jsonb,
  created_at timestamptz not null default now()
);

create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
insert into storage.objects (bucket_id, name) values
  ('crop-photos', 'dq2-temiz-tarif-16x9.webp');
