-- UX-1F-A: expiring, owner-bound private recipe share grants.
--
-- This replaces the legacy raw recipes.share_token UUID and anonymous preview
-- RPCs with a private grant/clone ledger. Raw 256-bit tokens are returned once,
-- accepted only in authenticated RPC request bodies, and persisted only as a
-- SHA-256 digest. Existing raw tokens are invalidated during cutover.
--
-- The public RPCs are SECURITY INVOKER. Their narrowly-scoped helpers live in
-- the non-exposed private schema, are SECURITY DEFINER with an empty search_path,
-- and repeat auth/ownership checks even when called directly from SQL.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Retire every legacy token without reopening the F0 column UPDATE ACL. Keep
-- the nullable column temporarily so the pre-UX-1F-B reader projection does not
-- fail during staged rollout; the constraint prevents it becoming a token store.
update public.recipes set share_token = null where share_token is not null;
alter table public.recipes
  add constraint recipes_share_token_retired check (share_token is null) not valid;
alter table public.recipes validate constraint recipes_share_token_retired;

drop function if exists public.rpc_generate_recipe_share_token(uuid);
drop function if exists public.rpc_revoke_recipe_share_token(uuid);
drop function if exists public.rpc_get_shared_recipe(uuid);
drop function if exists public.rpc_clone_shared_recipe(uuid);

create table private.recipe_share_grants (
  id uuid primary key default gen_random_uuid(),
  source_recipe_id uuid not null references public.recipes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_digest bytea not null unique,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  rotated_from_grant_id uuid unique
    references private.recipe_share_grants(id) on delete set null,
  constraint recipe_share_grants_digest_length check (octet_length(token_digest) = 32),
  constraint recipe_share_grants_expiry_order check (expires_at > created_at),
  constraint recipe_share_grants_revoke_shape check (
    (revoked_at is null and revoke_reason is null)
    or (revoked_at is not null and revoke_reason in ('owner_revoked', 'rotated'))
  )
);

comment on table private.recipe_share_grants is
  'UX-1F-A non-exposed grant ledger. token_digest is SHA-256 of a one-time-returned 256-bit token; raw tokens are never stored.';

create index recipe_share_grants_owner_source_created_idx
  on private.recipe_share_grants(owner_id, source_recipe_id, created_at desc);

alter table private.recipe_share_grants enable row level security;
create policy "recipe share grants deny direct authenticated access"
  on private.recipe_share_grants as restrictive for all to authenticated
  using (false) with check (false);
revoke all on table private.recipe_share_grants from public, anon, authenticated, service_role;

create table private.recipe_share_clone_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_key uuid not null,
  grant_id uuid not null,
  source_recipe_id uuid not null,
  request_digest bytea not null,
  result_recipe_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (owner_id, operation_key),
  constraint recipe_share_clone_operations_digest_length
    check (octet_length(request_digest) = 32),
  constraint recipe_share_clone_operations_result_shape check (
    (result_recipe_id is null and completed_at is null)
    or (result_recipe_id is not null and completed_at is not null)
  )
);

comment on table private.recipe_share_clone_operations is
  'UX-1F-A idempotency ledger. Grant/source identifiers are deliberately not foreign keys so deletion cannot invalidate a completed clone replay record.';

alter table private.recipe_share_clone_operations enable row level security;
create policy "recipe share clone operations deny direct authenticated access"
  on private.recipe_share_clone_operations as restrictive for all to authenticated
  using (false) with check (false);
revoke all on table private.recipe_share_clone_operations
  from public, anon, authenticated, service_role;

create or replace function private.validate_recipe_share_expiry(p_expires_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_expires_at is null
     or p_expires_at < clock_timestamp() + interval '5 minutes'
     or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception using errcode = '22023', message = 'recipe_share_invalid_expiry';
  end if;
end;
$$;

create or replace function private.create_recipe_share_grant(
  p_recipe_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_grant_id uuid;
  v_token text;
begin
  if v_owner_id is null then
    raise exception using errcode = '28000', message = 'recipe_share_authentication_required';
  end if;
  perform private.validate_recipe_share_expiry(p_expires_at);

  perform 1
  from public.recipes r
  where r.id = p_recipe_id
    and r.owner_id = v_owner_id
    and r.visibility = 'private'
    and r.status = 'draft'
    and r.author_type = 'kullanici'
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'recipe_share_source_not_eligible';
  end if;

  loop
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into private.recipe_share_grants(
      source_recipe_id, owner_id, token_digest, expires_at
    ) values (
      p_recipe_id, v_owner_id, sha256(convert_to(v_token, 'UTF8')), p_expires_at
    )
    on conflict (token_digest) do nothing
    returning id into v_grant_id;
    exit when v_grant_id is not null;
  end loop;

  return jsonb_build_object(
    'grant_id', v_grant_id,
    'token', v_token,
    'expires_at', p_expires_at
  );
end;
$$;

create or replace function private.list_recipe_share_grants(p_recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception using errcode = '28000', message = 'recipe_share_authentication_required';
  end if;

  if p_recipe_id is not null and not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.owner_id = v_owner_id
  ) then
    raise exception using errcode = '22023', message = 'recipe_share_source_not_owned';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'grant_id', g.id,
      'source_recipe_id', g.source_recipe_id,
      'created_at', g.created_at,
      'expires_at', g.expires_at,
      'revoked_at', g.revoked_at,
      'status', case
        when g.revoke_reason = 'rotated' then 'rotated'
        when g.revoked_at is not null then 'revoked'
        when g.expires_at <= clock_timestamp() then 'expired'
        else 'active'
      end
    ) order by g.created_at desc)
    from private.recipe_share_grants g
    where g.owner_id = v_owner_id
      and (p_recipe_id is null or g.source_recipe_id = p_recipe_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function private.rotate_recipe_share_grant(
  p_grant_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_old private.recipe_share_grants%rowtype;
  v_new_grant_id uuid;
  v_token text;
begin
  if v_owner_id is null then
    raise exception using errcode = '28000', message = 'recipe_share_authentication_required';
  end if;
  perform private.validate_recipe_share_expiry(p_expires_at);

  select * into v_old
  from private.recipe_share_grants g
  where g.id = p_grant_id and g.owner_id = v_owner_id;

  if v_old.id is null
     or v_old.revoked_at is not null
     or v_old.expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'recipe_share_grant_not_active';
  end if;

  -- Recipe-before-grant lock order matches source deletion and clone, avoiding
  -- a grant/source deadlock while still linearizing eligibility with rotation.
  perform 1 from public.recipes r
  where r.id = v_old.source_recipe_id
    and r.owner_id = v_owner_id
    and r.visibility = 'private'
    and r.status = 'draft'
    and r.author_type = 'kullanici'
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'recipe_share_grant_not_active';
  end if;

  select * into v_old
  from private.recipe_share_grants g
  where g.id = p_grant_id and g.owner_id = v_owner_id
  for update;
  if v_old.id is null or v_old.revoked_at is not null
     or v_old.expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'recipe_share_grant_not_active';
  end if;

  update private.recipe_share_grants
  set revoked_at = clock_timestamp(), revoke_reason = 'rotated'
  where id = v_old.id;

  loop
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into private.recipe_share_grants(
      source_recipe_id, owner_id, token_digest, expires_at, rotated_from_grant_id
    ) values (
      v_old.source_recipe_id, v_owner_id, sha256(convert_to(v_token, 'UTF8')),
      p_expires_at, v_old.id
    )
    on conflict (token_digest) do nothing
    returning id into v_new_grant_id;
    exit when v_new_grant_id is not null;
  end loop;

  return jsonb_build_object(
    'grant_id', v_new_grant_id,
    'rotated_from_grant_id', v_old.id,
    'token', v_token,
    'expires_at', p_expires_at
  );
end;
$$;

create or replace function private.revoke_recipe_share_grant(p_grant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_grant private.recipe_share_grants%rowtype;
begin
  if v_owner_id is null then
    raise exception using errcode = '28000', message = 'recipe_share_authentication_required';
  end if;

  select * into v_grant
  from private.recipe_share_grants g
  where g.id = p_grant_id and g.owner_id = v_owner_id
  for update;
  if v_grant.id is null then
    raise exception using errcode = '22023', message = 'recipe_share_grant_not_found';
  end if;

  if v_grant.revoked_at is null then
    update private.recipe_share_grants
    set revoked_at = clock_timestamp(), revoke_reason = 'owner_revoked'
    where id = v_grant.id;
  end if;

  return jsonb_build_object('grant_id', v_grant.id, 'status',
    case when v_grant.revoke_reason = 'rotated' then 'rotated' else 'revoked' end
  );
end;
$$;

create or replace function private.resolve_recipe_share(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_share record;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'recipe_share_authentication_required';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'recipe_share_invalid_or_inactive';
  end if;

  select g.id as grant_id, g.source_recipe_id, g.expires_at,
         r.title, r.description, r.servings, r.prep_minutes, r.cook_minutes,
         r.rest_minutes, r.difficulty, r.cuisine, r.diet_tags, r.required_equipment
    into v_share
  from private.recipe_share_grants g
  join public.recipes r on r.id = g.source_recipe_id
  where g.token_digest = sha256(convert_to(p_token, 'UTF8'))
    and g.revoked_at is null
    and g.expires_at > clock_timestamp()
    and r.visibility = 'private'
    and r.status = 'draft'
    and r.author_type = 'kullanici'
    and r.owner_id = g.owner_id;

  if v_share.grant_id is null then
    raise exception using errcode = '22023', message = 'recipe_share_invalid_or_inactive';
  end if;

  return jsonb_build_object(
    'expires_at', v_share.expires_at,
    'recipe', jsonb_build_object(
      'title', v_share.title,
      'description', v_share.description,
      'servings', v_share.servings,
      'prep_minutes', v_share.prep_minutes,
      'cook_minutes', v_share.cook_minutes,
      'rest_minutes', v_share.rest_minutes,
      'difficulty', v_share.difficulty,
      'cuisine', v_share.cuisine,
      'diet_tags', coalesce(to_jsonb(v_share.diet_tags), '[]'::jsonb),
      'required_equipment', coalesce(to_jsonb(v_share.required_equipment), '[]'::jsonb)
    ),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sort_order', ri.sort_order,
        'crop', ri.crop,
        'free_text_name', ri.free_text_name,
        'quantity', ri.quantity,
        'unit', ri.unit,
        'note', ri.note,
        'is_key_ingredient', ri.is_key_ingredient
      ) order by ri.sort_order, ri.id)
      from public.recipe_ingredients ri where ri.recipe_id = v_share.source_recipe_id
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'step_no', rs.step_no,
        'instruction', rs.instruction,
        'timer_seconds', rs.timer_seconds
      ) order by rs.step_no, rs.id)
      from public.recipe_steps rs where rs.recipe_id = v_share.source_recipe_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.clone_recipe_share(
  p_token text,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_grant private.recipe_share_grants%rowtype;
  v_source record;
  v_existing private.recipe_share_clone_operations%rowtype;
  v_request_digest bytea;
  v_new_recipe_id uuid;
  v_slug text;
  v_attempt integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'recipe_share_authentication_required';
  end if;
  if p_operation_key is null then
    raise exception using errcode = '22023', message = 'recipe_share_operation_key_required';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'recipe_share_invalid_or_inactive';
  end if;

  select g.* into v_grant
  from private.recipe_share_grants g
  where g.token_digest = sha256(convert_to(p_token, 'UTF8'))
    and g.revoked_at is null
    and g.expires_at > clock_timestamp();

  if v_grant.id is null then
    raise exception using errcode = '22023', message = 'recipe_share_invalid_or_inactive';
  end if;

  select r.id, r.slug, r.title, r.description, r.servings, r.prep_minutes,
         r.cook_minutes, r.rest_minutes, r.difficulty, r.cuisine, r.diet_tags,
         r.required_equipment, r.owner_id
    into v_source
  from public.recipes r
  where r.id = v_grant.source_recipe_id
    and r.owner_id = v_grant.owner_id
    and r.visibility = 'private'
    and r.status = 'draft'
    and r.author_type = 'kullanici'
  for share;

  if v_source.id is null then
    raise exception using errcode = '22023', message = 'recipe_share_invalid_or_inactive';
  end if;
  if v_source.owner_id = v_user_id then
    raise exception using errcode = '22023', message = 'recipe_share_cannot_clone_own';
  end if;

  -- Re-lock and revalidate the grant after the source lock. This preserves the
  -- recipe-before-grant order used by source deletion and closes revoke/expiry
  -- races between the initial digest lookup and snapshot creation.
  select g.* into v_grant
  from private.recipe_share_grants g
  where g.id = v_grant.id
    and g.token_digest = sha256(convert_to(p_token, 'UTF8'))
    and g.source_recipe_id = v_source.id
    and g.owner_id = v_source.owner_id
    and g.revoked_at is null
    and g.expires_at > clock_timestamp()
  for share;
  if v_grant.id is null then
    raise exception using errcode = '22023', message = 'recipe_share_invalid_or_inactive';
  end if;

  -- Lock children with the source so the clone is a transactionally coherent snapshot.
  perform 1 from public.recipe_ingredients ri
    where ri.recipe_id = v_source.id for share;
  perform 1 from public.recipe_steps rs
    where rs.recipe_id = v_source.id for share;

  v_request_digest := sha256(convert_to(jsonb_build_object(
    'contract_version', 1,
    'grant_id', v_grant.id,
    'source_recipe_id', v_source.id
  )::text, 'UTF8'));

  insert into private.recipe_share_clone_operations(
    owner_id, operation_key, grant_id, source_recipe_id, request_digest
  ) values (
    v_user_id, p_operation_key, v_grant.id, v_source.id, v_request_digest
  )
  on conflict (owner_id, operation_key) do nothing;

  if not found then
    select * into v_existing
    from private.recipe_share_clone_operations o
    where o.owner_id = v_user_id and o.operation_key = p_operation_key
    for update;

    if v_existing.grant_id <> v_grant.id
       or v_existing.source_recipe_id <> v_source.id
       or v_existing.request_digest <> v_request_digest then
      raise exception using errcode = '22023', message = 'recipe_share_idempotency_conflict';
    end if;
    if v_existing.result_recipe_id is null then
      raise exception using errcode = '40001', message = 'recipe_share_operation_in_progress';
    end if;
    return jsonb_build_object(
      'recipe_id', v_existing.result_recipe_id,
      'replayed', true
    );
  end if;

  loop
    v_slug := coalesce(nullif(v_source.slug, ''), 'tarif') || '-defter-'
      || encode(extensions.gen_random_bytes(4), 'hex')
      || case when v_attempt = 0 then '' else '-' || v_attempt::text end;
    exit when not exists (select 1 from public.recipes r where r.slug = v_slug);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception using errcode = '54000', message = 'recipe_share_slug_exhausted';
    end if;
  end loop;

  -- No cover/step media and no cloned_from foreign key are copied. The new row
  -- is an independent private draft snapshot that survives source/grant deletion.
  insert into public.recipes (
    slug, title, description, servings, prep_minutes, cook_minutes, rest_minutes,
    difficulty, cuisine, diet_tags, required_equipment,
    status, visibility, source_type, owner_id, author_type, cloned_from_recipe_id
  ) values (
    v_slug, v_source.title, v_source.description, v_source.servings,
    v_source.prep_minutes, v_source.cook_minutes, v_source.rest_minutes,
    v_source.difficulty, v_source.cuisine, v_source.diet_tags,
    v_source.required_equipment,
    'draft', 'private', 'shared_clone', v_user_id, 'kullanici', null
  ) returning id into v_new_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note,
    is_key_ingredient, ingredient_class
  )
  select v_new_recipe_id, ri.sort_order, ri.crop, ri.free_text_name, ri.quantity,
         ri.unit, ri.note, ri.is_key_ingredient, ri.ingredient_class
  from public.recipe_ingredients ri
  where ri.recipe_id = v_source.id
  order by ri.sort_order, ri.id;

  insert into public.recipe_steps(recipe_id, step_no, instruction, timer_seconds)
  select v_new_recipe_id, rs.step_no, rs.instruction, rs.timer_seconds
  from public.recipe_steps rs
  where rs.recipe_id = v_source.id
  order by rs.step_no, rs.id;

  update private.recipe_share_clone_operations
  set result_recipe_id = v_new_recipe_id, completed_at = clock_timestamp()
  where owner_id = v_user_id and operation_key = p_operation_key;

  return jsonb_build_object('recipe_id', v_new_recipe_id, 'replayed', false);
end;
$$;

-- Public Data API boundary. These wrappers never touch tables directly.
create or replace function public.rpc_create_recipe_share_grant(
  p_recipe_id uuid,
  p_expires_at timestamptz
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_recipe_share_grant(p_recipe_id, p_expires_at) $$;

create or replace function public.rpc_list_recipe_share_grants(p_recipe_id uuid default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.list_recipe_share_grants(p_recipe_id) $$;

create or replace function public.rpc_rotate_recipe_share_grant(
  p_grant_id uuid,
  p_expires_at timestamptz
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.rotate_recipe_share_grant(p_grant_id, p_expires_at) $$;

create or replace function public.rpc_revoke_recipe_share_grant(p_grant_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.revoke_recipe_share_grant(p_grant_id) $$;

create or replace function public.rpc_resolve_recipe_share(p_token text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.resolve_recipe_share(p_token) $$;

create or replace function public.rpc_clone_shared_recipe(
  p_token text,
  p_operation_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.clone_recipe_share(p_token, p_operation_key) $$;

revoke all on function private.validate_recipe_share_expiry(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.create_recipe_share_grant(uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.list_recipe_share_grants(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.rotate_recipe_share_grant(uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.revoke_recipe_share_grant(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.resolve_recipe_share(text)
  from public, anon, authenticated, service_role;
revoke all on function private.clone_recipe_share(text,uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.validate_recipe_share_expiry(timestamptz) to authenticated;
grant execute on function private.create_recipe_share_grant(uuid,timestamptz) to authenticated;
grant execute on function private.list_recipe_share_grants(uuid) to authenticated;
grant execute on function private.rotate_recipe_share_grant(uuid,timestamptz) to authenticated;
grant execute on function private.revoke_recipe_share_grant(uuid) to authenticated;
grant execute on function private.resolve_recipe_share(text) to authenticated;
grant execute on function private.clone_recipe_share(text,uuid) to authenticated;

revoke all on function public.rpc_create_recipe_share_grant(uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_list_recipe_share_grants(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_rotate_recipe_share_grant(uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_revoke_recipe_share_grant(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_resolve_recipe_share(text)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_clone_shared_recipe(text,uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.rpc_create_recipe_share_grant(uuid,timestamptz) to authenticated;
grant execute on function public.rpc_list_recipe_share_grants(uuid) to authenticated;
grant execute on function public.rpc_rotate_recipe_share_grant(uuid,timestamptz) to authenticated;
grant execute on function public.rpc_revoke_recipe_share_grant(uuid) to authenticated;
grant execute on function public.rpc_resolve_recipe_share(text) to authenticated;
grant execute on function public.rpc_clone_shared_recipe(text,uuid) to authenticated;

comment on function public.rpc_create_recipe_share_grant(uuid,timestamptz) is
  'UX-1F-A owner-only grant creation. Returns the raw token exactly once; callers must not log it.';
comment on function public.rpc_clone_shared_recipe(text,uuid) is
  'UX-1F-A authenticated, operation-key-idempotent clone of an active private recipe share.';
