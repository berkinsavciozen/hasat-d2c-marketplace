\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

-- Reproduce the live 2026-09-22 attacl state after UX-1B: legacy migrations
-- left broad column INSERT/UPDATE on anon and authenticated, while the later
-- private_edit_version column received neither privilege.
alter table public.recipes
  add column if not exists source_url text,
  add column if not exists share_token uuid;
revoke insert, update on table public.recipes from anon, authenticated;
revoke insert, update on table public.recipe_ingredients from anon, authenticated;

grant insert (
  id, slug, title, description, cover_photo_url, servings, prep_minutes,
  cook_minutes, difficulty, cuisine, diet_tags, status, visibility, source_type,
  source_url, owner_id, author_type, extraction_confidence, created_at,
  updated_at, rest_minutes, required_equipment, share_token,
  cloned_from_recipe_id
) on public.recipes to anon, authenticated;
grant update (
  id, slug, title, description, cover_photo_url, servings, prep_minutes,
  cook_minutes, difficulty, cuisine, diet_tags, status, visibility, source_type,
  source_url, owner_id, author_type, extraction_confidence, created_at,
  updated_at, rest_minutes, required_equipment, share_token,
  cloned_from_recipe_id
) on public.recipes to anon, authenticated;

grant insert (
  recipe_id, sort_order, crop, free_text_name, quantity, unit, note,
  is_key_ingredient, ingredient_class
) on public.recipe_ingredients to anon, authenticated;
grant update (
  sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient,
  ingredient_class
) on public.recipe_ingredients to anon, authenticated;

select pg_temp.assert(
  has_function_privilege('authenticated','public.rpc_create_private_recipe(uuid,text,jsonb,uuid,text)','execute'),
  'authenticated can reach create RPC'
);
select pg_temp.assert(
  has_column_privilege('authenticated','public.recipes','title','insert')
  and has_column_privilege('anon','public.recipes','title','insert'),
  'fixture reproduces broad legacy recipe INSERT'
);
select pg_temp.assert(
  has_column_privilege('authenticated','public.recipes','owner_id','update')
  and has_column_privilege('anon','public.recipes','owner_id','update'),
  'fixture reproduces mutable owner/state UPDATE'
);
select pg_temp.assert(
  has_column_privilege('authenticated','public.recipe_ingredients','crop','update')
  and has_column_privilege('anon','public.recipe_ingredients','crop','update'),
  'fixture reproduces broad ingredient UPDATE'
);
select pg_temp.assert(
  not has_column_privilege('authenticated','public.recipes','private_edit_version','insert')
  and not has_column_privilege('authenticated','public.recipes','private_edit_version','update'),
  'fixture reproduces missing version grants'
);

set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
do $$
begin
  begin
    perform public.rpc_create_private_recipe(
      '30000000-0000-4000-8000-000000000030',
      'create_manual',
      '{"title":"F0 pre-fix","steps":[{"instruction":"Test"}]}'::jsonb
    );
    raise exception 'expected pre-fix permission denial';
  exception when insufficient_privilege then
    perform pg_temp.assert(
      sqlerrm like 'permission denied for table recipes%',
      'live drift fails at recipes privilege before RLS'
    );
  end;
end $$;
reset role;

-- Favorite/save uses a separate table contract and is not changed by F0.
create table public.recipe_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);
alter table public.recipe_saves enable row level security;
create policy "recipe_saves own select" on public.recipe_saves for select to authenticated
  using (user_id = auth.uid());
create policy "recipe_saves own insert" on public.recipe_saves for insert to authenticated
  with check (user_id = auth.uid());
create policy "recipe_saves own update" on public.recipe_saves for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recipe_saves own delete" on public.recipe_saves for delete to authenticated
  using (user_id = auth.uid());
grant select, insert, update, delete on table public.recipe_saves to authenticated;
