-- UX-1B: atomic, owner-bound and idempotent private recipe writes.
--
-- Rollout order:
--   1. Apply this migration.
--   2. Deploy extract-recipe, estimate-recipe-from-photo and customize-recipe.
--   3. Deploy web/mobile clients that send operation keys and expected versions.
-- The old one-argument rpc_clone_recipe(uuid) remains as a compatibility adapter.
-- Production is not changed by committing this file.
--
-- Rollback (repository/runbook only): deploy the previous clients/Edge Functions first, then drop
-- the new overloads/table/column and restore rpc_clone_recipe(uuid) from
-- 20260910132550_t7a_f11_source_type_and_clone_rpc.sql. Completed private recipes are ordinary
-- user rows and must not be deleted during rollback.

alter table public.recipes
  add column private_edit_version bigint not null default 1,
  add constraint recipes_private_edit_version_positive check (private_edit_version > 0);

comment on column public.recipes.private_edit_version is
  'Optimistic concurrency token for private user-draft updates. Incremented once per successful atomic rewrite.';

-- Existing permissive owner policies only fixed visibility. Restrictive guards make direct
-- authenticated table writes obey the same private/draft/kullanici state as the RPCs. service_role
-- keeps its existing bypass path for editorial automation.
create policy "recipes authenticated private draft insert guard"
  on public.recipes as restrictive for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and visibility = 'private' and status = 'draft'
    and author_type = 'kullanici'
  );
create policy "recipes authenticated private draft update guard"
  on public.recipes as restrictive for update to authenticated
  using (
    owner_id = (select auth.uid()) and visibility = 'private' and status = 'draft'
    and author_type = 'kullanici'
  )
  with check (
    owner_id = (select auth.uid()) and visibility = 'private' and status = 'draft'
    and author_type = 'kullanici'
  );

create policy "recipe ingredients private draft insert guard"
  on public.recipe_ingredients as restrictive for insert to authenticated
  with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  ));
create policy "recipe ingredients private draft update guard"
  on public.recipe_ingredients as restrictive for update to authenticated
  using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  )) with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  ));
create policy "recipe ingredients private draft delete guard"
  on public.recipe_ingredients as restrictive for delete to authenticated
  using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  ));

create policy "recipe steps private draft insert guard"
  on public.recipe_steps as restrictive for insert to authenticated
  with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  ));
create policy "recipe steps private draft update guard"
  on public.recipe_steps as restrictive for update to authenticated
  using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  )) with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  ));
create policy "recipe steps private draft delete guard"
  on public.recipe_steps as restrictive for delete to authenticated
  using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())
      and r.visibility = 'private' and r.status = 'draft' and r.author_type = 'kullanici'
  ));

-- T6 originally scoped its key globally. Make its audit key owner-scoped so the same client UUID is
-- valid for two different users, matching the common ledger contract.
alter table public.ai_customize_requests drop constraint ai_customize_requests_pkey;
alter table public.ai_customize_requests
  add primary key (user_id, idempotency_key);

create table public.private_recipe_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_type text not null,
  operation_key uuid not null,
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (owner_id, operation_type, operation_key),
  constraint private_recipe_operations_type_check check (
    operation_type = any (array[
      'create_manual'::text,
      'create_text'::text,
      'create_photo'::text,
      'create_photo_estimate'::text,
      'create_ai_customize'::text,
      'update'::text,
      'clone'::text
    ])
  ),
  constraint private_recipe_operations_result_shape_check check (
    result is null or (
      jsonb_typeof(result) = 'object'
      and result ? 'recipe_id'
      and result ? 'version'
    )
  )
);

comment on table public.private_recipe_operations is
  'UX-1B idempotency ledger. Scope is owner + operation type + operation key; the canonical request hash rejects key reuse with different input.';

alter table public.private_recipe_operations enable row level security;

create policy "private recipe operations own select"
  on public.private_recipe_operations for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "private recipe operations own insert"
  on public.private_recipe_operations for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "private recipe operations own update"
  on public.private_recipe_operations for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on table public.private_recipe_operations from public, anon;
grant select, insert, update on table public.private_recipe_operations to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.validate_private_recipe_payload(p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_title text;
  v_ingredients jsonb;
  v_steps jsonb;
  v_number numeric;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_payload';
  end if;

  v_title := btrim(coalesce(p_payload->>'title', ''));
  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_title';
  end if;

  if p_payload ? 'description'
     and jsonb_typeof(p_payload->'description') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_description';
  end if;
  if char_length(coalesce(p_payload->>'description', '')) > 4000 then
    raise exception using errcode = '22023', message = 'private_recipe_description_too_long';
  end if;

  foreach v_title in array array['servings', 'prep_minutes', 'cook_minutes', 'rest_minutes'] loop
    if p_payload ? v_title and jsonb_typeof(p_payload->v_title) not in ('number', 'null') then
      raise exception using errcode = '22023', message = 'private_recipe_invalid_numeric_field';
    end if;
    if jsonb_typeof(p_payload->v_title) = 'number' then
      v_number := (p_payload->>v_title)::numeric;
      if trunc(v_number) <> v_number
         or (v_title = 'servings' and v_number <= 0)
         or (v_title <> 'servings' and v_number < 0) then
        raise exception using errcode = '22023', message = 'private_recipe_invalid_numeric_field';
      end if;
    end if;
  end loop;

  if p_payload ? 'difficulty'
     and jsonb_typeof(p_payload->'difficulty') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_difficulty';
  end if;
  if nullif(p_payload->>'difficulty', '') is not null
     and p_payload->>'difficulty' not in ('kolay', 'orta', 'zor') then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_difficulty';
  end if;

  if p_payload ? 'cuisine' and jsonb_typeof(p_payload->'cuisine') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_cuisine';
  end if;
  if char_length(coalesce(p_payload->>'cuisine', '')) > 80 then
    raise exception using errcode = '22023', message = 'private_recipe_cuisine_too_long';
  end if;

  if p_payload ? 'extraction_confidence'
     and jsonb_typeof(p_payload->'extraction_confidence') not in ('number', 'null') then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_confidence';
  end if;
  if jsonb_typeof(p_payload->'extraction_confidence') = 'number'
     and ((p_payload->>'extraction_confidence')::numeric < 0
       or (p_payload->>'extraction_confidence')::numeric > 1) then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_confidence';
  end if;

  if p_payload ? 'diet_tags' and jsonb_typeof(p_payload->'diet_tags') <> 'array' then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_diet_tags';
  end if;
  if jsonb_array_length(coalesce(p_payload->'diet_tags', '[]'::jsonb)) > 10
     or exists (
       select 1 from jsonb_array_elements(coalesce(p_payload->'diet_tags', '[]'::jsonb)) t(value)
       where jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 1 and 40
     ) then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_diet_tags';
  end if;

  v_ingredients := coalesce(p_payload->'ingredients', '[]'::jsonb);
  v_steps := coalesce(p_payload->'steps', '[]'::jsonb);
  if jsonb_typeof(v_ingredients) <> 'array' or jsonb_typeof(v_steps) <> 'array' then
    raise exception using errcode = '22023', message = 'private_recipe_invalid_children';
  end if;
  if jsonb_array_length(v_ingredients) > 60 or jsonb_array_length(v_steps) > 40 then
    raise exception using errcode = '22023', message = 'private_recipe_too_many_children';
  end if;
  if jsonb_array_length(v_ingredients) + jsonb_array_length(v_steps) = 0 then
    raise exception using errcode = '22023', message = 'private_recipe_children_required';
  end if;

  for v_item in select value from jsonb_array_elements(v_ingredients) loop
    if jsonb_typeof(v_item) <> 'object'
       or (nullif(btrim(v_item->>'crop'), '') is null and nullif(btrim(v_item->>'free_text_name'), '') is null)
       or char_length(coalesce(v_item->>'crop', '')) > 80
       or char_length(coalesce(v_item->>'free_text_name', '')) > 200
       or char_length(coalesce(v_item->>'unit', '')) > 40
       or char_length(coalesce(v_item->>'note', '')) > 400
       or (v_item ? 'quantity' and jsonb_typeof(v_item->'quantity') not in ('number', 'null'))
       or (jsonb_typeof(v_item->'quantity') = 'number' and (v_item->>'quantity')::numeric <= 0)
       or (v_item ? 'unit' and jsonb_typeof(v_item->'unit') not in ('string', 'null'))
       or (v_item ? 'note' and jsonb_typeof(v_item->'note') not in ('string', 'null'))
       or (v_item ? 'ingredient_class' and jsonb_typeof(v_item->'ingredient_class') not in ('string', 'null'))
       or (nullif(v_item->>'ingredient_class', '') is not null and v_item->>'ingredient_class' not in ('tarimsal', 'platform_disi')) then
      raise exception using errcode = '22023', message = 'private_recipe_invalid_ingredient';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(v_steps) loop
    if jsonb_typeof(v_item) <> 'object'
       or char_length(btrim(coalesce(v_item->>'instruction', ''))) not between 1 and 4000
       or (v_item ? 'timer_seconds' and jsonb_typeof(v_item->'timer_seconds') not in ('number', 'null'))
       or (jsonb_typeof(v_item->'timer_seconds') = 'number'
           and ((v_item->>'timer_seconds')::numeric <= 0
             or trunc((v_item->>'timer_seconds')::numeric) <> (v_item->>'timer_seconds')::numeric)) then
      raise exception using errcode = '22023', message = 'private_recipe_invalid_step';
    end if;
  end loop;
end;
$$;

revoke all on function private.validate_private_recipe_payload(jsonb) from public, anon;
grant execute on function private.validate_private_recipe_payload(jsonb) to authenticated;

create or replace function public.rpc_create_private_recipe(
  p_operation_key uuid,
  p_operation_type text,
  p_payload jsonb,
  p_source_recipe_id uuid default null,
  p_request_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text;
  v_op public.private_recipe_operations%rowtype;
  v_recipe_id uuid := gen_random_uuid();
  v_source_type text;
  v_result jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_operation_key is null then
    raise exception using errcode = '22023', message = 'operation_key_required';
  end if;
  v_source_type := case p_operation_type
    when 'create_manual' then 'manual'
    when 'create_text' then 'text'
    when 'create_photo' then 'photo'
    when 'create_photo_estimate' then 'photo_estimate'
    when 'create_ai_customize' then 'ai_customize'
    else null
  end;
  if v_source_type is null then
    raise exception using errcode = '22023', message = 'invalid_create_operation_type';
  end if;
  if p_operation_type = 'create_ai_customize' then
    if p_source_recipe_id is null or not exists (
      select 1 from public.recipes
      where id = p_source_recipe_id and visibility = 'public' and status = 'published' and author_type <> 'kullanici'
    ) then
      raise exception using errcode = '42501', message = 'source_recipe_not_eligible';
    end if;
  elsif p_source_recipe_id is not null then
    raise exception using errcode = '22023', message = 'unexpected_source_recipe_id';
  end if;

  perform private.validate_private_recipe_payload(p_payload);
  if p_request_hash is not null and p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  v_hash := coalesce(
    p_request_hash,
    md5(jsonb_build_object('payload', p_payload, 'source_recipe_id', p_source_recipe_id)::text)
  );

  insert into public.private_recipe_operations(owner_id, operation_type, operation_key, request_hash)
  values (v_owner, p_operation_type, p_operation_key, v_hash)
  on conflict do nothing;

  select * into v_op from public.private_recipe_operations
  where owner_id = v_owner and operation_type = p_operation_type and operation_key = p_operation_key
  for update;
  if v_op.request_hash <> v_hash then
    raise exception using errcode = '22023', message = 'private_recipe_idempotency_conflict';
  end if;
  if v_op.result is not null then
    return v_op.result;
  end if;

  insert into public.recipes (
    id, slug, title, description, servings, prep_minutes, cook_minutes, rest_minutes,
    difficulty, cuisine, diet_tags, extraction_confidence, status, visibility, source_type,
    owner_id, author_type, cloned_from_recipe_id, private_edit_version
  ) values (
    v_recipe_id,
    'private-' || replace(v_recipe_id::text, '-', ''),
    btrim(p_payload->>'title'),
    nullif(btrim(p_payload->>'description'), ''),
    (p_payload->>'servings')::integer,
    (p_payload->>'prep_minutes')::integer,
    (p_payload->>'cook_minutes')::integer,
    (p_payload->>'rest_minutes')::integer,
    nullif(p_payload->>'difficulty', ''),
    nullif(btrim(p_payload->>'cuisine'), ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'diet_tags', '[]'::jsonb))), '{}'::text[]),
    (p_payload->>'extraction_confidence')::numeric,
    'draft', 'private', v_source_type, v_owner, 'kullanici', p_source_recipe_id, 1
  );

  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  )
  select v_recipe_id, ord::integer, nullif(btrim(elem->>'crop'), ''),
         nullif(btrim(elem->>'free_text_name'), ''), (elem->>'quantity')::numeric,
         nullif(btrim(elem->>'unit'), ''), nullif(btrim(elem->>'note'), ''),
         coalesce((elem->>'is_key_ingredient')::boolean, false), nullif(elem->>'ingredient_class', '')
  from jsonb_array_elements(coalesce(p_payload->'ingredients', '[]'::jsonb)) with ordinality as t(elem, ord);

  insert into public.recipe_steps(recipe_id, step_no, instruction, timer_seconds)
  select v_recipe_id, ord::integer, btrim(elem->>'instruction'), (elem->>'timer_seconds')::integer
  from jsonb_array_elements(coalesce(p_payload->'steps', '[]'::jsonb)) with ordinality as t(elem, ord);

  v_result := jsonb_build_object('recipe_id', v_recipe_id, 'version', 1);
  update public.private_recipe_operations set result = v_result, completed_at = now()
  where owner_id = v_owner and operation_type = p_operation_type and operation_key = p_operation_key;
  return v_result;
end;
$$;

create or replace function public.rpc_get_private_recipe_operation(
  p_operation_key uuid,
  p_operation_type text,
  p_request_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_op public.private_recipe_operations%rowtype;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_operation_key is null or p_operation_type not in ('create_text','create_photo','create_photo_estimate')
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_operation_identity';
  end if;
  insert into public.private_recipe_operations(owner_id, operation_type, operation_key, request_hash)
  values (v_owner, p_operation_type, p_operation_key, p_request_hash)
  on conflict do nothing;
  select * into v_op from public.private_recipe_operations
  where owner_id=v_owner and operation_type=p_operation_type and operation_key=p_operation_key
  for update;
  if v_op.request_hash <> p_request_hash then
    raise exception using errcode = '22023', message = 'private_recipe_idempotency_conflict';
  end if;
  return v_op.result;
end;
$$;

create or replace function public.rpc_update_private_recipe(
  p_operation_key uuid,
  p_recipe_id uuid,
  p_expected_version bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text;
  v_op public.private_recipe_operations%rowtype;
  v_result jsonb;
  v_version bigint;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_operation_key is null or p_recipe_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_update_identity';
  end if;
  perform private.validate_private_recipe_payload(p_payload);
  v_hash := md5(jsonb_build_object(
    'recipe_id', p_recipe_id, 'expected_version', p_expected_version, 'payload', p_payload
  )::text);

  insert into public.private_recipe_operations(owner_id, operation_type, operation_key, request_hash)
  values (v_owner, 'update', p_operation_key, v_hash)
  on conflict do nothing;
  select * into v_op from public.private_recipe_operations
  where owner_id = v_owner and operation_type = 'update' and operation_key = p_operation_key
  for update;
  if v_op.request_hash <> v_hash then
    raise exception using errcode = '22023', message = 'private_recipe_idempotency_conflict';
  end if;
  if v_op.result is not null then
    return v_op.result;
  end if;

  update public.recipes
  set title = btrim(p_payload->>'title'),
      description = nullif(btrim(p_payload->>'description'), ''),
      servings = (p_payload->>'servings')::integer,
      prep_minutes = (p_payload->>'prep_minutes')::integer,
      cook_minutes = (p_payload->>'cook_minutes')::integer,
      rest_minutes = (p_payload->>'rest_minutes')::integer,
      difficulty = nullif(p_payload->>'difficulty', ''),
      private_edit_version = private_edit_version + 1,
      updated_at = now()
  where id = p_recipe_id
    and owner_id = v_owner
    and visibility = 'private'
    and status = 'draft'
    and author_type = 'kullanici'
    and private_edit_version = p_expected_version
  returning private_edit_version into v_version;

  if v_version is null then
    if exists (
      select 1 from public.recipes
      where id = p_recipe_id and owner_id = v_owner and visibility = 'private'
        and status = 'draft' and author_type = 'kullanici'
    ) then
      raise exception using errcode = '40001', message = 'private_recipe_version_conflict';
    end if;
    raise exception using errcode = '42501', message = 'private_recipe_update_denied';
  end if;

  delete from public.recipe_ingredients where recipe_id = p_recipe_id;
  delete from public.recipe_steps where recipe_id = p_recipe_id;
  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  )
  select p_recipe_id, ord::integer, nullif(btrim(elem->>'crop'), ''),
         nullif(btrim(elem->>'free_text_name'), ''), (elem->>'quantity')::numeric,
         nullif(btrim(elem->>'unit'), ''), nullif(btrim(elem->>'note'), ''),
         coalesce((elem->>'is_key_ingredient')::boolean, false), nullif(elem->>'ingredient_class', '')
  from jsonb_array_elements(coalesce(p_payload->'ingredients', '[]'::jsonb)) with ordinality as t(elem, ord);
  insert into public.recipe_steps(recipe_id, step_no, instruction, timer_seconds)
  select p_recipe_id, ord::integer, btrim(elem->>'instruction'), (elem->>'timer_seconds')::integer
  from jsonb_array_elements(coalesce(p_payload->'steps', '[]'::jsonb)) with ordinality as t(elem, ord);

  v_result := jsonb_build_object('recipe_id', p_recipe_id, 'version', v_version);
  update public.private_recipe_operations set result = v_result, completed_at = now()
  where owner_id = v_owner and operation_type = 'update' and operation_key = p_operation_key;
  return v_result;
end;
$$;

create or replace function public.rpc_clone_recipe(p_source_recipe_id uuid, p_operation_key uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text;
  v_op public.private_recipe_operations%rowtype;
  v_source public.recipes%rowtype;
  v_recipe_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_operation_key is null or p_source_recipe_id is null then
    raise exception using errcode = '22023', message = 'invalid_clone_identity';
  end if;
  select * into v_source from public.recipes where id = p_source_recipe_id;
  if v_source.id is null or v_source.visibility <> 'public' or v_source.status <> 'published'
     or v_source.author_type = 'kullanici' then
    raise exception using errcode = '42501', message = 'source_recipe_not_eligible';
  end if;

  v_hash := md5(jsonb_build_object('source_recipe_id', p_source_recipe_id)::text);
  insert into public.private_recipe_operations(owner_id, operation_type, operation_key, request_hash)
  values (v_owner, 'clone', p_operation_key, v_hash)
  on conflict do nothing;
  select * into v_op from public.private_recipe_operations
  where owner_id = v_owner and operation_type = 'clone' and operation_key = p_operation_key
  for update;
  if v_op.request_hash <> v_hash then
    raise exception using errcode = '22023', message = 'private_recipe_idempotency_conflict';
  end if;
  if v_op.result is not null then return v_op.result; end if;

  insert into public.recipes (
    id, slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
    difficulty, cuisine, diet_tags, required_equipment, status, visibility, source_type, owner_id,
    author_type, cloned_from_recipe_id, private_edit_version
  ) values (
    v_recipe_id, 'private-' || replace(v_recipe_id::text, '-', ''), v_source.title,
    v_source.description, v_source.cover_photo_url, v_source.servings, v_source.prep_minutes,
    v_source.cook_minutes, v_source.rest_minutes, v_source.difficulty, v_source.cuisine,
    v_source.diet_tags, v_source.required_equipment, 'draft', 'private', 'clone', v_owner,
    'kullanici', p_source_recipe_id, 1
  );
  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  )
  select v_recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  from public.recipe_ingredients where recipe_id = p_source_recipe_id;
  insert into public.recipe_steps(recipe_id, step_no, instruction, timer_seconds)
  select v_recipe_id, step_no, instruction, timer_seconds
  from public.recipe_steps where recipe_id = p_source_recipe_id;

  v_result := jsonb_build_object('recipe_id', v_recipe_id, 'version', 1);
  update public.private_recipe_operations set result = v_result, completed_at = now()
  where owner_id = v_owner and operation_type = 'clone' and operation_key = p_operation_key;
  return v_result;
end;
$$;

-- Keep the old signature so already-shipped clients continue to work during rollout. It receives a
-- server-generated key per invocation; new clients must use the two-argument overload for retries.
create or replace function public.rpc_clone_recipe(p_source_recipe_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select (public.rpc_clone_recipe(p_source_recipe_id, gen_random_uuid())->>'recipe_id')::uuid
$$;

-- Preserve T6's existing RPC signature while routing its write through the common primitive. The
-- old camelCase child payload is normalized here, so already-shipped callers remain compatible.
create or replace function public.rpc_create_ai_customized_recipe(
  p_idempotency_key uuid,
  p_source_recipe_id uuid,
  p_title text,
  p_description text,
  p_servings integer,
  p_prep_minutes integer,
  p_cook_minutes integer,
  p_rest_minutes integer,
  p_difficulty text,
  p_ingredients jsonb,
  p_steps jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_payload jsonb;
  v_result jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  v_payload := jsonb_build_object(
    'title', p_title,
    'description', p_description,
    'servings', p_servings,
    'prep_minutes', p_prep_minutes,
    'cook_minutes', p_cook_minutes,
    'rest_minutes', p_rest_minutes,
    'difficulty', p_difficulty,
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'crop', nullif(elem->>'crop', ''),
        'free_text_name', nullif(coalesce(elem->>'freeTextName', elem->>'free_text_name'), ''),
        'quantity', elem->'quantity',
        'unit', elem->'unit',
        'note', elem->'note',
        'is_key_ingredient', coalesce(elem->'isKeyIngredient', elem->'is_key_ingredient', 'false'::jsonb)
      ) order by ord)
      from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) with ordinality as t(elem, ord)
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'instruction', elem->>'instruction',
        'timer_seconds', coalesce(elem->'timerSeconds', elem->'timer_seconds')
      ) order by ord)
      from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) with ordinality as t(elem, ord)
    ), '[]'::jsonb)
  );
  v_result := public.rpc_create_private_recipe(
    p_idempotency_key, 'create_ai_customize', v_payload, p_source_recipe_id
  );
  update public.ai_customize_requests
  set status = 'completed', created_recipe_id = (v_result->>'recipe_id')::uuid, updated_at = now()
  where user_id = v_owner and idempotency_key = p_idempotency_key;
  return (v_result->>'recipe_id')::uuid;
end;
$$;

revoke all on function public.rpc_create_private_recipe(uuid, text, jsonb, uuid, text) from public, anon;
revoke all on function public.rpc_get_private_recipe_operation(uuid, text, text) from public, anon;
revoke all on function public.rpc_update_private_recipe(uuid, uuid, bigint, jsonb) from public, anon;
revoke all on function public.rpc_clone_recipe(uuid, uuid) from public, anon;
revoke all on function public.rpc_clone_recipe(uuid) from public, anon;
grant execute on function public.rpc_create_private_recipe(uuid, text, jsonb, uuid, text) to authenticated;
grant execute on function public.rpc_get_private_recipe_operation(uuid, text, text) to authenticated;
grant execute on function public.rpc_update_private_recipe(uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function public.rpc_clone_recipe(uuid, uuid) to authenticated;
grant execute on function public.rpc_clone_recipe(uuid) to authenticated;
revoke all on function public.rpc_create_ai_customized_recipe(uuid, uuid, text, text, integer, integer, integer, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.rpc_create_ai_customized_recipe(uuid, uuid, text, text, integer, integer, integer, integer, text, jsonb, jsonb) to authenticated;
