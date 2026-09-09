-- F0-24/T4-B — SQL test fixtures for the recipe_ingredients/recipes.servings nutrition recalc
-- trigger migration (20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql).
--
-- Same convention as the other suites in this repo (see supabase/tests/t4a2_recipes_column_lock/
-- and supabase/tests/b3_delete_own_account_banned_until_fix/ for the two patterns combined here):
--   - `recipes` fixture shape copied from t4a2_recipes_column_lock/00_fixtures.sql (the full
--     pre-T4-A 32-column shape, including owner_id/visibility/status), so the REAL T4-A/T4-A2/
--     F0-24/F0-24b migrations this suite applies on top (see run.sh) run unmodified against it.
--   - `recipe_ingredients`/`crop_config`/`crop_culinary_meta` fixture shape copied from
--     f024_nutrition_calc_engine/00_fixtures.sql.
--   - `auth.uid()` stub copied from b3_delete_own_account_banned_until_fix/00_fixtures.sql (reads
--     the `request.jwt.claim.sub` GUC, same shape PostgREST itself uses) — needed here (unlike
--     t4a2's and f024's own suites) because this suite's whole point is proving the trigger works
--     for a real `authenticated` + RLS-gated caller, not just service_role/superuser.
--   - RLS policies on `recipes`/`recipe_ingredients` copied verbatim (same `qual`/`with_check`
--     text) from the live Hasat project's `pg_policies`, re-confirmed for this PR — without these,
--     an `authenticated` INSERT/UPDATE/DELETE test would not exercise the real ownership gate this
--     migration's trigger is meant to work underneath.
--
-- Run via supabase/tests/f024t4b_recipe_nutrition_trigger/run.sh — never run manually against a
-- real project.

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

-- Stand-in for auth.uid(): reads a custom GUC instead of a real JWT, exactly the same shape
-- PostgREST's own auth.uid() reads (current_setting('request.jwt.claim.sub', true)).
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

-- Full pre-T4-A `recipes` shape (32 columns), matching t4a2_recipes_column_lock/00_fixtures.sql
-- (itself re-verified against the live project's information_schema.columns).
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
  created_at timestamptz not null default now()
);

-- Reproduces the live project's actual pre-T4-A2 grant shape (table-wide, no column restriction)
-- so the real T4-A2 migration this suite applies afterward proves it narrows a real broad grant.
grant select, insert, update, delete on public.recipes to anon, authenticated, service_role;
grant select, insert, update, delete on public.recipe_ingredients to anon, authenticated, service_role;
grant select, insert, update, delete on public.crop_config, public.crop_culinary_meta to anon, authenticated, service_role;

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

-- RLS policies copied verbatim (same predicates) from the live project's pg_policies, re-confirmed
-- for this PR.
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
-- fn_recipe_ingredient_grams (no crop_culinary_meta conversion_hints needed) — keeps this suite's
-- arithmetic hand-computable, same simplification f024_nutrition_calc_engine's own suite makes.
insert into public.crop_config (crop, display_name, default_unit) values ('domates', 'Domates', 'kg');
insert into public.crop_culinary_meta (crop, is_edible, conversion_hints) values ('domates', true, '{}'::jsonb);
