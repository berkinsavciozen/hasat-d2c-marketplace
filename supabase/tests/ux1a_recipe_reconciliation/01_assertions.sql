\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

create temp table clone_ids (
  label text primary key,
  id uuid not null
);

do $$
begin
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.rpc_clone_recipe(uuid)', 'execute'),
    'authenticated must execute rpc_clone_recipe'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.rpc_clone_recipe(uuid)', 'execute'),
    'anon must not execute rpc_clone_recipe'
  );
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);
select public.rpc_clone_recipe('10000000-0000-0000-0000-000000000001') as clone_id \gset
reset role;
insert into pg_temp.clone_ids (label, id) values ('first', :'clone_id'::uuid);

do $$
declare
  cloned record;
begin
  select r.* into cloned
  from public.recipes r
  join pg_temp.clone_ids c on c.id = r.id
  where c.label = 'first';

  perform pg_temp.assert(cloned.id <> '10000000-0000-0000-0000-000000000001'::uuid, 'clone must have a new id');
  perform pg_temp.assert(cloned.owner_id = '20000000-0000-0000-0000-000000000001'::uuid, 'clone owner must be caller');
  perform pg_temp.assert(cloned.visibility = 'private', 'clone must be private');
  perform pg_temp.assert(cloned.status = 'draft', 'clone must be draft');
  perform pg_temp.assert(cloned.source_type = 'clone', 'clone source_type must be clone');
  perform pg_temp.assert(cloned.author_type = 'kullanici', 'clone author_type must be kullanici');
  perform pg_temp.assert(cloned.cloned_from_recipe_id = '10000000-0000-0000-0000-000000000001'::uuid, 'clone must retain source lineage');
  perform pg_temp.assert((select count(*) from public.recipe_ingredients where recipe_id = cloned.id) = 1, 'ingredients must be copied');
  perform pg_temp.assert((select count(*) from public.recipe_steps where recipe_id = cloned.id) = 1, 'steps must be copied');
  perform pg_temp.assert((select photo_url from public.recipe_steps where recipe_id = cloned.id) is null, 'step media must not be copied');
end;
$$;

update public.recipes
set title = 'Kaynak Sonradan Degisti'
where id = '10000000-0000-0000-0000-000000000001';

update public.recipe_ingredients
set free_text_name = 'Kaynak Malzeme Sonradan Degisti'
where recipe_id = '10000000-0000-0000-0000-000000000001';

do $$
declare
  first_clone uuid := (select id from pg_temp.clone_ids where label = 'first');
begin
  perform pg_temp.assert(
    (select title from public.recipes where id = first_clone) = 'Kaynak Tarif',
    'clone must not synchronize later source title edits'
  );
  perform pg_temp.assert(
    (select free_text_name from public.recipe_ingredients where recipe_id = first_clone) = 'Domates',
    'clone ingredients must not synchronize later source edits'
  );
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);
select public.rpc_clone_recipe('10000000-0000-0000-0000-000000000001') as second_clone_id \gset
reset role;
insert into pg_temp.clone_ids (label, id) values ('second', :'second_clone_id'::uuid);

do $$
begin
  perform pg_temp.assert(
    (select id from pg_temp.clone_ids where label = 'second')
      <> (select id from pg_temp.clone_ids where label = 'first'),
    'repeat clone call must create a distinct id (no idempotency)'
  );
end;
$$;

do $$
declare
  denied boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
  begin
    perform public.rpc_clone_recipe('10000000-0000-0000-0000-000000000002');
  exception when others then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'private/user-authored source must not be cloneable');
end;
$$;

do $$
declare
  denied boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
  begin
    insert into public.recipes (slug, title, owner_id, visibility, status, source_type, author_type)
    values ('yasak-public', 'Yasak Public', auth.uid(), 'public', 'published', 'manual', 'kullanici');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'normal authenticated user must not insert public/published recipe');
end;
$$;

do $$
declare
  denied boolean := false;
  first_clone uuid := (select id from pg_temp.clone_ids where label = 'first');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
  begin
    update public.recipes
    set visibility = 'public', status = 'published'
    where id = first_clone;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert(denied, 'normal authenticated user must not publish cloned private draft');
end;
$$;

\echo 'UX-1A T7a/F11 reconciliation SQL test suite: ALL ASSERTIONS PASSED'
