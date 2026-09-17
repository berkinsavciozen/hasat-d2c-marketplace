do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
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
  servings integer check (servings is null or servings > 0),
  prep_minutes integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes integer check (cook_minutes is null or cook_minutes >= 0),
  rest_minutes integer check (rest_minutes is null or rest_minutes >= 0),
  difficulty text check (difficulty is null or difficulty in ('kolay','orta','zor')),
  cuisine text,
  diet_tags text[] not null default '{}',
  required_equipment text[],
  status text not null default 'draft',
  visibility text not null default 'private',
  source_type text not null default 'manual',
  owner_id uuid references auth.users(id),
  author_type text not null default 'hasat',
  cloned_from_recipe_id uuid references public.recipes(id),
  extraction_confidence numeric,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

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
  ingredient_class text check (ingredient_class is null or ingredient_class in ('tarimsal','platform_disi')),
  check (crop is not null or free_text_name is not null)
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_no integer not null,
  instruction text not null,
  photo_url text,
  timer_seconds integer,
  unique (recipe_id, step_no)
);

create table public.ai_customize_requests (
  idempotency_key uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_recipe_id uuid not null references public.recipes(id) on delete cascade,
  status text not null default 'pending',
  created_recipe_id uuid references public.recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.ai_customize_requests enable row level security;

create policy recipes_select on public.recipes for select to authenticated using (
  (visibility='public' and status='published') or owner_id = auth.uid()
);
create policy recipes_insert on public.recipes for insert to authenticated with check (
  owner_id=auth.uid() and visibility='private' and status='draft' and author_type='kullanici'
);
create policy recipes_update on public.recipes for update to authenticated
  using (owner_id=auth.uid()) with check (owner_id=auth.uid() and visibility='private');
create policy recipes_delete on public.recipes for delete to authenticated using (owner_id=auth.uid());

create policy ingredients_select on public.recipe_ingredients for select to authenticated using (
  exists (select 1 from public.recipes r where r.id=recipe_id and ((r.visibility='public' and r.status='published') or r.owner_id=auth.uid()))
);
create policy ingredients_insert on public.recipe_ingredients for insert to authenticated with check (
  exists (select 1 from public.recipes r where r.id=recipe_id and r.owner_id=auth.uid() and r.visibility='private')
);
create policy ingredients_delete on public.recipe_ingredients for delete to authenticated using (
  exists (select 1 from public.recipes r where r.id=recipe_id and r.owner_id=auth.uid() and r.visibility='private')
);
create policy steps_select on public.recipe_steps for select to authenticated using (
  exists (select 1 from public.recipes r where r.id=recipe_id and ((r.visibility='public' and r.status='published') or r.owner_id=auth.uid()))
);
create policy steps_insert on public.recipe_steps for insert to authenticated with check (
  exists (select 1 from public.recipes r where r.id=recipe_id and r.owner_id=auth.uid() and r.visibility='private')
);
create policy steps_delete on public.recipe_steps for delete to authenticated using (
  exists (select 1 from public.recipes r where r.id=recipe_id and r.owner_id=auth.uid() and r.visibility='private')
);
create policy customize_select on public.ai_customize_requests for select to authenticated using (user_id=auth.uid());
create policy customize_insert on public.ai_customize_requests for insert to authenticated with check (user_id=auth.uid());
create policy customize_update on public.ai_customize_requests for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

grant select,insert,update,delete on public.recipes, public.recipe_ingredients, public.recipe_steps to authenticated;
grant select,insert,update on public.ai_customize_requests to authenticated;
grant select on public.recipes, public.recipe_ingredients, public.recipe_steps to anon;

insert into auth.users(id) values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');

insert into public.recipes (
  id, slug, title, status, visibility, source_type, owner_id, author_type
) values
  ('10000000-0000-0000-0000-000000000001','source','Editorial Source','published','public','manual',null,'hasat'),
  ('10000000-0000-0000-0000-000000000002','private-source','Private Source','draft','private','manual','20000000-0000-0000-0000-000000000002','kullanici');
insert into public.recipe_ingredients(recipe_id,sort_order,free_text_name,quantity,unit)
values ('10000000-0000-0000-0000-000000000001',1,'Domates',2,'adet');
insert into public.recipe_steps(recipe_id,step_no,instruction,photo_url,timer_seconds)
values ('10000000-0000-0000-0000-000000000001',1,'Doğra.','https://example.test/source.jpg',60);

create function public.ux1b_force_child_failure() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(to_jsonb(new)->>'free_text_name', to_jsonb(new)->>'instruction') = 'FORCE_FAIL' then
    raise exception 'forced child failure';
  end if;
  return new;
end $$;
create trigger ux1b_force_ingredient_failure before insert on public.recipe_ingredients
for each row execute function public.ux1b_force_child_failure();
create trigger ux1b_force_step_failure before insert on public.recipe_steps
for each row execute function public.ux1b_force_child_failure();
