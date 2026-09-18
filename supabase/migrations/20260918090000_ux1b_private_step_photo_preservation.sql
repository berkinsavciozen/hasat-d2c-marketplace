-- UX-1B-M correction: preserve private step photos through atomic recipe rewrites.
--
-- Rollout: apply after 20260917081905_ux1b_atomic_private_recipe_writes.sql and before
-- enabling the mobile atomic-save path. This does not make the bucket private or introduce
-- signed URLs; UX-1C owns that separate media-model change.
--
-- Rollback boundary: disable the dependent mobile path first, then restore
-- rpc_update_private_recipe and drop canonical_private_recipe_update_payload from this migration.
-- Storage objects and user recipe rows are not deleted by rollback.

create or replace function private.canonical_private_recipe_update_payload(
  p_payload jsonb,
  p_recipe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_base_url text := rtrim(
    coalesce(
      nullif(current_setting('app.supabase_url', true), ''),
      'https://efuqpiaavrzimvstpdpm.supabase.co'
    ),
    '/'
  );
  v_public_prefix text;
  v_expected_prefix text;
  v_steps jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_photo text;
  v_object_name text;
  v_ord bigint;
  v_payload jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_recipe_id is null or not exists (
    select 1
    from public.recipes r
    where r.id = p_recipe_id
      and r.owner_id = v_owner
      and r.visibility = 'private'
      and r.status = 'draft'
      and r.author_type = 'kullanici'
  ) then
    raise exception using errcode = '42501', message = 'private_recipe_update_denied';
  end if;

  v_public_prefix := v_base_url || '/storage/v1/object/public/recipe-step-photos/';
  v_expected_prefix := v_owner::text || '/' || p_recipe_id::text || '/';

  for v_elem, v_ord in
    select elem, ord
    from jsonb_array_elements(coalesce(p_payload->'steps', '[]'::jsonb))
      with ordinality as t(elem, ord)
  loop
    if v_elem ? 'photo_url' then
      if jsonb_typeof(v_elem->'photo_url') not in ('string', 'null') then
        raise exception using errcode = '22023', message = 'private_recipe_invalid_step_photo';
      end if;
      v_photo := nullif(btrim(v_elem->>'photo_url'), '');
    else
      select s.photo_url into v_photo
      from public.recipe_steps s
      where s.recipe_id = p_recipe_id and s.step_no = v_ord::integer;
    end if;

    if v_photo is not null then
      if left(v_photo, char_length(v_public_prefix)) = v_public_prefix then
        v_object_name := substr(v_photo, char_length(v_public_prefix) + 1);
      elsif left(v_photo, char_length('recipe-step-photos/')) = 'recipe-step-photos/' then
        v_object_name := substr(v_photo, char_length('recipe-step-photos/') + 1);
      else
        raise exception using errcode = '22023', message = 'private_recipe_invalid_step_photo';
      end if;

      if left(v_object_name, char_length(v_expected_prefix)) <> v_expected_prefix
         or char_length(v_object_name) <= char_length(v_expected_prefix)
         or v_object_name like '%//%'
         or v_object_name ~ '(^|/)\.\.(/|$)'
         or not exists (
           select 1
           from storage.objects o
           where o.bucket_id = 'recipe-step-photos' and o.name = v_object_name
         ) then
        raise exception using errcode = '22023', message = 'private_recipe_invalid_step_photo';
      end if;
      v_photo := v_public_prefix || v_object_name;
    end if;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'instruction', btrim(v_elem->>'instruction'),
        'timer_seconds', (v_elem->>'timer_seconds')::integer,
        'photo_url', v_photo
      )
    );
  end loop;

  v_payload := private.canonical_private_recipe_payload(p_payload);
  return jsonb_set(v_payload, '{steps}', v_steps, true);
end;
$$;

revoke all on function private.canonical_private_recipe_update_payload(jsonb, uuid)
  from public, anon;
grant execute on function private.canonical_private_recipe_update_payload(jsonb, uuid)
  to authenticated;

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
  v_payload jsonb;
  v_existing jsonb;
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
  v_payload := private.canonical_private_recipe_update_payload(p_payload, p_recipe_id);
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'recipe_id', p_recipe_id,
    'expected_version', p_expected_version,
    'payload', v_payload
  )::text, 'UTF8')), 'hex');
  v_existing := private.claim_private_recipe_operation(
    p_operation_key, 'update', null, v_hash
  );
  if v_existing is not null then return v_existing; end if;

  update public.recipes
  set title = v_payload->>'title',
      description = v_payload->>'description',
      servings = (v_payload->>'servings')::integer,
      prep_minutes = (v_payload->>'prep_minutes')::integer,
      cook_minutes = (v_payload->>'cook_minutes')::integer,
      rest_minutes = (v_payload->>'rest_minutes')::integer,
      difficulty = v_payload->>'difficulty',
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
  from jsonb_array_elements(v_payload->'ingredients') with ordinality as t(elem, ord);
  insert into public.recipe_steps(recipe_id, step_no, instruction, photo_url, timer_seconds)
  select p_recipe_id, ord::integer, btrim(elem->>'instruction'), elem->>'photo_url',
         (elem->>'timer_seconds')::integer
  from jsonb_array_elements(v_payload->'steps') with ordinality as t(elem, ord);

  v_result := jsonb_build_object('recipe_id', p_recipe_id, 'version', v_version);
  return private.complete_private_recipe_operation(
    p_operation_key, 'update', v_hash, v_result
  );
end;
$$;

revoke all on function public.rpc_update_private_recipe(uuid, uuid, bigint, jsonb)
  from public, anon;
grant execute on function public.rpc_update_private_recipe(uuid, uuid, bigint, jsonb)
  to authenticated;
