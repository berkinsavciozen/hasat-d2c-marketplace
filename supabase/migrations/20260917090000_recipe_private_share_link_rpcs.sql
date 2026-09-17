-- Private recipe share link + "deftere kaydet" (save-to-notebook) — closes the dead
-- `recipes.share_token` column (uuid, unique partial index `recipes_share_token_key` already live)
-- that F11/T6 left unused. Scope confirmed with Berkin: public recipe sharing (`/tarifler/$slug`,
-- `rpc_clone_recipe`) is untouched — this is a SEPARATE feature for the user's own private
-- (`tariflerim`) drafts: an owner can mint a link to a private recipe, anyone with the link can
-- preview it (even signed out), and a signed-in visitor who is not the owner can save a copy into
-- their own notebook.
--
-- Live-schema note: `share_token` is `uuid`, not `text` — the dispatch that requested this assumed
-- text, but `gen_random_uuid()` already gives a URL-safe, cryptographically random value with zero
-- extra encoding, so the RPCs below just use the column's real type.
--
-- security invoker vs definer, decided per-function the same way this repo's existing RPCs are
-- (rpc_clone_recipe / rpc_consume_mobile_handoff_nonce headers):
--   - rpc_generate_recipe_share_token / rpc_revoke_recipe_share_token only ever touch the caller's
--     OWN row (owner_id = auth.uid()), and `recipes auth read public or own` / `recipes auth update
--     own private` (plus T4-A2's column-level UPDATE grant, which already lists `share_token`) cover
--     that fully — SECURITY INVOKER, no privilege bridge needed.
--   - rpc_get_shared_recipe and rpc_clone_shared_recipe both need to read a private recipe owned by
--     a DIFFERENT user (the whole point of a share link) — no RLS policy grants that, so these two
--     are SECURITY DEFINER, with search_path locked down and every reference schema-qualified.
--
-- rpc_get_shared_recipe returns a deliberately narrow jsonb payload (recipe core fields +
-- ingredients + steps) — no owner_id/status/allergen-review internals, since this is a public,
-- unauthenticated preview surface. Ownership is never resolved client-side; rpc_clone_shared_recipe
-- rejects self-cloning server-side and the frontend surfaces that error rather than trying to guess.
--
-- rpc_clone_shared_recipe mirrors rpc_clone_recipe's copy semantics exactly (same field list, same
-- slug-uniqueness loop, step photo_url intentionally not copied, allergen/nutrition columns left at
-- DB defaults so the saved copy is never treated as pre-reviewed) — new source_type value
-- 'shared_clone' distinguishes it from F11's public-catalog 'clone' in analytics/admin views.
--
-- Rollback: pure addition. Dropping the 4 functions below and reverting recipes_source_type_check
-- to its previous array fully undoes this migration; no existing data is touched.

alter table public.recipes
  drop constraint recipes_source_type_check;

alter table public.recipes
  add constraint recipes_source_type_check
  check (source_type = any (array[
    'manual'::text, 'text'::text, 'photo'::text, 'url'::text,
    'ai_customize'::text, 'photo_estimate'::text, 'clone'::text, 'shared_clone'::text
  ]));

-- =================================================================================================
-- 1. rpc_generate_recipe_share_token — idempotent: an existing token is returned as-is so the link
--    never changes underneath someone who already shared it.
-- =================================================================================================

create or replace function public.rpc_generate_recipe_share_token(p_recipe_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select share_token into v_token
  from public.recipes
  where id = p_recipe_id and owner_id = auth.uid() and visibility = 'private';

  if not found then
    raise exception 'RECIPE_SHARE_NOT_ELIGIBLE: recipe % is not an owned private recipe', p_recipe_id;
  end if;

  if v_token is not null then
    return v_token;
  end if;

  v_token := gen_random_uuid();

  update public.recipes
  set share_token = v_token
  where id = p_recipe_id and owner_id = auth.uid() and visibility = 'private';

  return v_token;
end;
$$;

comment on function public.rpc_generate_recipe_share_token(uuid) is
  'Private-recipe share link: idempotently mints (or returns the existing) recipes.share_token for '
  'a caller-owned private recipe. SECURITY INVOKER — owner_id = auth.uid() read/update is already '
  'covered by RLS + T4-A2''s column grant, no bridge needed.';

revoke all on function public.rpc_generate_recipe_share_token(uuid) from public;
grant execute on function public.rpc_generate_recipe_share_token(uuid) to authenticated;

-- =================================================================================================
-- 2. rpc_revoke_recipe_share_token — owner "paylaşımı durdur": clears the token so the existing
--    link stops resolving (rpc_get_shared_recipe's WHERE simply no longer matches anything).
-- =================================================================================================

create or replace function public.rpc_revoke_recipe_share_token(p_recipe_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.recipes
  set share_token = null
  where id = p_recipe_id and owner_id = auth.uid();

  if not found then
    raise exception 'RECIPE_SHARE_REVOKE_NOT_FOUND: recipe % is not owned by caller', p_recipe_id;
  end if;
end;
$$;

comment on function public.rpc_revoke_recipe_share_token(uuid) is
  'Private-recipe share link: clears share_token on a caller-owned recipe, invalidating any '
  'previously issued link. SECURITY INVOKER, same RLS coverage as rpc_generate_recipe_share_token.';

revoke all on function public.rpc_revoke_recipe_share_token(uuid) from public;
grant execute on function public.rpc_revoke_recipe_share_token(uuid) to authenticated;

-- =================================================================================================
-- 3. rpc_get_shared_recipe — anon-callable, read-only preview. Narrow payload by design: only the
--    fields a recipe-preview page needs, never owner_id/status/allergen-review internals.
-- =================================================================================================

create or replace function public.rpc_get_shared_recipe(p_share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe record;
begin
  select id, title, description, cover_photo_url, servings, prep_minutes, cook_minutes,
         rest_minutes, difficulty, cuisine, diet_tags, required_equipment
  into v_recipe
  from public.recipes
  where share_token = p_share_token and visibility = 'private';

  if v_recipe.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'recipe', jsonb_build_object(
      'id', v_recipe.id,
      'title', v_recipe.title,
      'description', v_recipe.description,
      'cover_photo_url', v_recipe.cover_photo_url,
      'servings', v_recipe.servings,
      'prep_minutes', v_recipe.prep_minutes,
      'cook_minutes', v_recipe.cook_minutes,
      'rest_minutes', v_recipe.rest_minutes,
      'difficulty', v_recipe.difficulty,
      'cuisine', v_recipe.cuisine,
      'diet_tags', coalesce(to_jsonb(v_recipe.diet_tags), '[]'::jsonb),
      'required_equipment', coalesce(to_jsonb(v_recipe.required_equipment), '[]'::jsonb)
    ),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'sort_order', ri.sort_order,
        'crop', ri.crop,
        'free_text_name', ri.free_text_name,
        'quantity', ri.quantity,
        'unit', ri.unit,
        'note', ri.note,
        'is_key_ingredient', ri.is_key_ingredient
      ) order by ri.sort_order)
      from public.recipe_ingredients ri
      where ri.recipe_id = v_recipe.id
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rs.id,
        'step_no', rs.step_no,
        'instruction', rs.instruction,
        'photo_url', rs.photo_url,
        'timer_seconds', rs.timer_seconds
      ) order by rs.step_no)
      from public.recipe_steps rs
      where rs.recipe_id = v_recipe.id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.rpc_get_shared_recipe(uuid) is
  'Private-recipe share link: anon-callable read-only preview by share_token. Returns null when the '
  'token does not match an active private recipe. SECURITY DEFINER — bypasses RLS on purpose (the '
  'whole point is reading another user''s private row), payload is a deliberately narrow jsonb '
  '(no owner_id/status/allergen-review fields).';

revoke all on function public.rpc_get_shared_recipe(uuid) from public;
grant execute on function public.rpc_get_shared_recipe(uuid) to anon, authenticated;

-- =================================================================================================
-- 4. rpc_clone_shared_recipe — the actual "deftere kaydet" write. Mirrors rpc_clone_recipe's copy
--    semantics (see F11 migration) against a share-token-resolved source instead of a public one.
-- =================================================================================================

create or replace function public.rpc_clone_shared_recipe(p_share_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_new_recipe_id uuid;
  v_slug text;
  v_suffix text;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select id, slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes,
         rest_minutes, difficulty, cuisine, diet_tags, required_equipment, owner_id
  into v_source
  from public.recipes
  where share_token = p_share_token and visibility = 'private';

  if v_source.id is null then
    raise exception 'RECIPE_SHARE_LINK_NOT_FOUND: share link is invalid or no longer active';
  end if;

  if v_source.owner_id = auth.uid() then
    raise exception 'RECIPE_SHARE_CANNOT_CLONE_OWN: cannot clone your own recipe';
  end if;

  -- Same app-level uniqueness loop as rpc_clone_recipe (recipes.slug has no DB-level unique
  -- constraint — see that function's own comment).
  loop
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := coalesce(v_source.slug, 'tarif') || '-defter-' || v_suffix
      || case when v_attempt = 0 then '' else '-' || v_attempt::text end;
    exit when not exists (select 1 from public.recipes where slug = v_slug);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not derive a unique slug after % attempts', v_attempt;
    end if;
  end loop;

  -- allergen/nutrition columns deliberately excluded — same reasoning as rpc_clone_recipe: DB
  -- defaults (unreviewed) apply, the saved copy never inherits the source's review state.
  insert into public.recipes (
    slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
    difficulty, cuisine, diet_tags, required_equipment,
    status, visibility, source_type, owner_id, author_type, cloned_from_recipe_id
  ) values (
    v_slug, v_source.title, v_source.description, v_source.cover_photo_url, v_source.servings,
    v_source.prep_minutes, v_source.cook_minutes, v_source.rest_minutes,
    v_source.difficulty, v_source.cuisine, v_source.diet_tags, v_source.required_equipment,
    'draft', 'private', 'shared_clone', auth.uid(), 'kullanici', v_source.id
  )
  returning id into v_new_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  )
  select
    v_new_recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  from public.recipe_ingredients
  where recipe_id = v_source.id;

  -- photo_url intentionally not copied — same known gap as rpc_clone_recipe.
  insert into public.recipe_steps (
    recipe_id, step_no, instruction, timer_seconds
  )
  select
    v_new_recipe_id, step_no, instruction, timer_seconds
  from public.recipe_steps
  where recipe_id = v_source.id;

  return v_new_recipe_id;
end;
$$;

comment on function public.rpc_clone_shared_recipe(uuid) is
  'Private-recipe share link: "deftere kaydet" — resolves a share_token to its private source '
  'recipe and clones it into the caller''s own notebook (owner_id=auth.uid(), visibility=private, '
  'status=draft, author_type=kullanici, source_type=shared_clone). Rejects self-cloning. SECURITY '
  'DEFINER — the source-row read crosses ownership, same as rpc_get_shared_recipe.';

revoke all on function public.rpc_clone_shared_recipe(uuid) from public;
grant execute on function public.rpc_clone_shared_recipe(uuid) to authenticated;
