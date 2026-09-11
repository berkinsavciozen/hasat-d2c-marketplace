-- T10 — SQL test fixtures for the admin recipe quality-overview migration
-- (20260911140000_t10_admin_recipe_quality_overview.sql).
--
-- Same convention as supabase/tests/f024t4b_recipe_nutrition_trigger/00_fixtures.sql (itself the
-- precedent this suite borrows most from): `recipes` fixture shape copied from
-- t4a2_recipes_column_lock/00_fixtures.sql (full pre-T4-A 32-column shape), `recipe_ingredients`/
-- `crop_config`/`crop_culinary_meta` from f024_nutrition_calc_engine/00_fixtures.sql, `auth.uid()`
-- stub from b3_delete_own_account_banned_until_fix/00_fixtures.sql.
--
-- Two pieces here are NOT copied from any existing fixture, because they have no tracked migration
-- source in this repo at all (same "no migration source in this repo" situation this repo's own
-- migrations already flag repeatedly — see f2s12_recipe_publish_rpc.sql's header): `recipe_
-- ingredients.nutrition_food_key`/`.nutrition_exclusion_reason` (plus their CHECK/FK constraints)
-- and `public.ingredient_nutrition_reference`. Both were confirmed live this round (direct
-- `information_schema`/`pg_constraint` inspection of the Hasat project) and are reproduced here
-- verbatim so 20260911140000's own RPCs run against the real constraint shape.
--
-- Run via supabase/tests/t10_admin_recipe_quality/run.sh — never run manually against a real
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

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

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

-- Full pre-T4-A `recipes` shape (32 columns), same as t4a2_recipes_column_lock/00_fixtures.sql.
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

create trigger trg_recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- Live shape of `ingredient_nutrition_reference` -- confirmed this round via
-- information_schema.columns on the Hasat project. Only food_key/display_name are populated by
-- this suite's seed rows; every other column is left nullable-by-omission (real macro columns are
-- NOT NULL live, but nothing in this suite reads them, so they are typed loosely here to keep the
-- fixture minimal rather than fully mirroring the live NOT NULLs).
create table public.ingredient_nutrition_reference (
  food_key text primary key,
  display_name text not null,
  reference_source text,
  reference_source_id text,
  reference_version text,
  reference_url text,
  calories_kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sodium_mg numeric,
  potassium_mg numeric,
  calcium_mg numeric,
  iron_mg numeric,
  vitamin_c_mg numeric,
  vitamin_a_mcg_rae numeric,
  notes text,
  created_at timestamptz not null default now()
);
revoke all on public.ingredient_nutrition_reference from anon, authenticated;
grant all on public.ingredient_nutrition_reference to service_role;

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  crop text references public.crop_config(crop) on update cascade on delete set null,
  free_text_name text,
  quantity numeric,
  unit text,
  note text,
  is_key_ingredient boolean not null default false,
  ingredient_class text,
  created_at timestamptz not null default now(),
  nutrition_food_key text references public.ingredient_nutrition_reference(food_key),
  nutrition_exclusion_reason text
);

-- Live CHECK/FK constraints on recipe_ingredients, reproduced verbatim (pg_constraint-confirmed
-- this round) -- see this file's header for why they have no tracked migration source.
alter table public.recipe_ingredients
  add constraint recipe_ingredients_ingredient_class_check
    check (ingredient_class = any (array['tarimsal', 'platform_disi']));
alter table public.recipe_ingredients
  add constraint recipe_ingredients_name_present
    check (crop is not null or nullif(btrim(coalesce(free_text_name, '')), '') is not null);
alter table public.recipe_ingredients
  add constraint recipe_ingredients_quantity_check
    check (quantity is null or quantity > 0);
alter table public.recipe_ingredients
  add constraint recipe_ingredients_nutrition_exclusion_reason_check
    check (nutrition_exclusion_reason is null or nutrition_exclusion_reason = any (array[
      'serving_only_unquantified', 'seasoning_to_taste_unquantified', 'trace_flavoring_unquantified'
    ]));
alter table public.recipe_ingredients
  add constraint recipe_ingredients_nutrition_resolution_check
    check (not (nutrition_food_key is not null and nutrition_exclusion_reason is not null));

-- Reproduces the live project's pre-T4-A2 grant shape (table-wide, no column restriction) so the
-- real T4-A2 migration this suite applies afterward proves it narrows a real broad grant.
grant select, insert, update, delete on public.recipes to anon, authenticated, service_role;
grant select, insert, update, delete on public.recipe_ingredients to anon, authenticated, service_role;
grant select, insert, update, delete on public.crop_config, public.crop_culinary_meta to anon, authenticated, service_role;

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy "recipes anon read public published" on public.recipes
  for select to anon
  using (visibility = 'public' and status = 'published');

create policy "recipes auth read public or own" on public.recipes
  for select to authenticated
  using ((visibility = 'public' and status = 'published') or owner_id = auth.uid());

create policy "recipes auth insert own private" on public.recipes
  for insert to authenticated
  with check (owner_id = auth.uid() and visibility = 'private');

create policy "recipes auth update own private" on public.recipes
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and visibility = 'private');

create policy "recipes auth delete own" on public.recipes
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "recipe_ingredients anon read via public recipe" on public.recipe_ingredients
  for select to anon
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id and r.visibility = 'public' and r.status = 'published'
  ));

create policy "recipe_ingredients auth read via visible recipe" on public.recipe_ingredients
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and ((r.visibility = 'public' and r.status = 'published') or r.owner_id = auth.uid())
  ));

create policy "recipe_ingredients auth insert own recipe" on public.recipe_ingredients
  for insert to authenticated
  with check (exists (
    select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.owner_id = auth.uid()
  ));

create policy "recipe_ingredients auth update own recipe" on public.recipe_ingredients
  for update to authenticated
  using (exists (
    select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.owner_id = auth.uid()
  ));

create policy "recipe_ingredients auth delete own recipe" on public.recipe_ingredients
  for delete to authenticated
  using (exists (
    select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.owner_id = auth.uid()
  ));

-- One real, per-100g-priced crop, resolvable via the plain metric-unit branch of
-- fn_recipe_ingredient_grams (no crop_culinary_meta conversion_hints needed) — same simplification
-- f024_nutrition_calc_engine's own suite makes, keeps this suite's arithmetic hand-checkable.
insert into public.crop_config (crop, display_name, default_unit) values ('domates', 'Domates', 'kg');
insert into public.crop_culinary_meta (crop, is_edible, conversion_hints) values ('domates', true, '{}'::jsonb);

insert into public.ingredient_nutrition_reference (food_key, display_name) values ('bulgur_dry', 'Bulgur, kuru');

-- The fixture recipe/ingredient rows are inserted in 01_assertions.sql instead of here: the
-- recipe needs allergens_reviewed (added by the real T3-A migration, applied after this fixtures
-- file per run.sh) and this row must not be written before that column exists.
