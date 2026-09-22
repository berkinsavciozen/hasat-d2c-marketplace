-- F0: reconcile legacy recipe column ACLs for the authenticated,
-- SECURITY INVOKER private-recipe RPCs.
--
-- Production preflight found legacy column-level INSERT/UPDATE grants left by
-- older migrations on both anon and authenticated. private_edit_version was the
-- critical missing column for the atomic RPCs, but merely adding that grant
-- would preserve unsafe anon and mutable owner/state columns. Reconcile from a
-- deny-by-default write baseline, then grant only the columns used by the RPCs.
--
-- Table-level and column-level privileges are independently sufficient in
-- PostgreSQL. Clear both forms for INSERT/UPDATE. Catalog-driven column lists
-- also close any later-added column without touching SELECT, DELETE,
-- REFERENCES, TRIGGER, or TRUNCATE privileges.
do $acl$
declare
  v_recipe_columns text;
  v_ingredient_columns text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_recipe_columns
  from pg_attribute a
  where a.attrelid = 'public.recipes'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_ingredient_columns
  from pg_attribute a
  where a.attrelid = 'public.recipe_ingredients'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_recipe_columns is null or v_ingredient_columns is null then
    raise exception 'recipe ACL reconciliation targets are missing';
  end if;

  revoke insert, update on table public.recipes from public, anon, authenticated;
  revoke insert, update on table public.recipe_ingredients from public, anon, authenticated;

  execute format(
    'revoke insert (%1$s), update (%1$s) on table public.recipes from public, anon, authenticated',
    v_recipe_columns
  );
  execute format(
    'revoke insert (%1$s), update (%1$s) on table public.recipe_ingredients from public, anon, authenticated',
    v_ingredient_columns
  );
end
$acl$;

-- INSERT is the union written by create, clone, and T6. Restrictive RLS still
-- requires owner_id=auth.uid(), visibility=private, status=draft, and
-- author_type=kullanici.
grant insert (
  id,
  slug,
  title,
  description,
  cover_photo_url,
  servings,
  prep_minutes,
  cook_minutes,
  rest_minutes,
  difficulty,
  cuisine,
  diet_tags,
  required_equipment,
  extraction_confidence,
  status,
  visibility,
  source_type,
  owner_id,
  author_type,
  cloned_from_recipe_id,
  private_edit_version
) on public.recipes to authenticated;

-- UPDATE excludes ownership, author, visibility, status, source, clone lineage,
-- extraction confidence, source_url, share_token, and created_at.
grant update (
  title,
  description,
  servings,
  prep_minutes,
  cook_minutes,
  rest_minutes,
  difficulty,
  private_edit_version,
  updated_at
) on public.recipes to authenticated;

-- Ingredient replacement deletes the old set and inserts the new set. It does
-- not require UPDATE; the existing authenticated DELETE privilege and
-- restrictive RLS guard remain unchanged.
grant insert (
  recipe_id,
  sort_order,
  crop,
  free_text_name,
  quantity,
  unit,
  note,
  is_key_ingredient,
  ingredient_class
) on public.recipe_ingredients to authenticated;

-- Safe containment rollback: do not restore the legacy broad anon or mutable
-- owner/state grants. If the new RPC path must be stopped, revoke only the two
-- newly required version grants below and fix forward. This intentionally
-- recreates 42501 for atomic create/update without reopening unsafe ACLs:
--   revoke insert (private_edit_version) on public.recipes from authenticated;
--   revoke update (private_edit_version) on public.recipes from authenticated;
