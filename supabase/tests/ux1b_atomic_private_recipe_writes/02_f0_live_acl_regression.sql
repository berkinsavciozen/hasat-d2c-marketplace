\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

-- Reproduce the live 2026-09-22 ACL drift after the UX-1B RPCs exist.
revoke insert, update on table public.recipes from authenticated;
revoke insert, update on table public.recipe_ingredients from authenticated;

select pg_temp.assert(
  has_function_privilege('authenticated','public.rpc_create_private_recipe(uuid,text,jsonb,uuid,text)','execute'),
  'authenticated can reach create RPC'
);
select pg_temp.assert(
  not has_column_privilege('authenticated','public.recipes','title','insert'),
  'fixture reproduces missing live recipes INSERT'
);
select pg_temp.assert(
  not has_column_privilege('authenticated','public.recipes','title','update'),
  'fixture reproduces missing live recipes UPDATE'
);
select pg_temp.assert(
  not has_column_privilege('authenticated','public.recipe_ingredients','recipe_id','insert'),
  'fixture reproduces missing live ingredient INSERT'
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

-- Favorite/save uses a separate table contract and was not part of the drift.
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
