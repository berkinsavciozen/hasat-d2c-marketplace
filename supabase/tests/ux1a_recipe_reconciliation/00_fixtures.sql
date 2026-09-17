-- UX-1A — isolated fixtures for the recovered T7a/F11 production contract.
-- Run only through run.sh against its disposable local database.

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

create schema auth;
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  cover_photo_url text,
  servings integer,
  prep_minutes integer,
  cook_minutes integer,
  rest_minutes integer,
  difficulty text,
  cuisine text,
  diet_tags text[] not null default '{}',
  required_equipment text[],
  status text not null default 'draft',
  visibility text not null default 'private',
  source_type text not null default 'manual',
  owner_id uuid,
  author_type text not null default 'hasat',
  cloned_from_recipe_id uuid references public.recipes(id),
  constraint recipes_source_type_check
    check (source_type = any (array['manual','text','photo','url','ai_customize']::text[]))
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  crop text,
  free_text_name text,
  quantity numeric,
  unit text,
  note text,
  is_key_ingredient boolean not null default false,
  ingredient_class text
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_no integer not null,
  instruction text not null,
  photo_url text,
  timer_seconds integer
);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

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

create policy "recipe_ingredients auth read via visible recipe" on public.recipe_ingredients
for select to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = recipe_id
    and ((r.visibility = 'public' and r.status = 'published') or r.owner_id = auth.uid())
));

create policy "recipe_ingredients auth insert own recipe" on public.recipe_ingredients
for insert to authenticated
with check (exists (
  select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()
));

create policy "recipe_steps auth read via visible recipe" on public.recipe_steps
for select to authenticated
using (exists (
  select 1 from public.recipes r
  where r.id = recipe_id
    and ((r.visibility = 'public' and r.status = 'published') or r.owner_id = auth.uid())
));

create policy "recipe_steps auth insert own recipe" on public.recipe_steps
for insert to authenticated
with check (exists (
  select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()
));

grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.recipe_steps to authenticated;
grant select on public.recipes, public.recipe_ingredients, public.recipe_steps to anon;
grant all on public.recipes, public.recipe_ingredients, public.recipe_steps to service_role;

insert into public.recipes (
  id, slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
  difficulty, cuisine, diet_tags, required_equipment, status, visibility, source_type, owner_id, author_type
) values (
  '10000000-0000-0000-0000-000000000001', 'kaynak', 'Kaynak Tarif', 'ilk aciklama',
  'https://example.test/cover.jpg', 4, 10, 20, 5, 'kolay', 'turk', array['vegan'],
  array['tencere'], 'published', 'public', 'manual', null, 'hasat'
), (
  '10000000-0000-0000-0000-000000000002', 'ozel-kaynak', 'Ozel Kaynak', null,
  null, 2, 5, 5, null, 'kolay', null, '{}', '{}', 'draft', 'private', 'manual',
  '20000000-0000-0000-0000-000000000002', 'kullanici'
);

insert into public.recipe_ingredients (
  recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
) values (
  '10000000-0000-0000-0000-000000000001', 1, 'domates', 'Domates', 2, 'adet', 'olgun', true, 'tarimsal'
);

insert into public.recipe_steps (recipe_id, step_no, instruction, photo_url, timer_seconds)
values (
  '10000000-0000-0000-0000-000000000001', 1, 'Domatesleri dogra.',
  'https://example.test/source-step.jpg', 60
);
