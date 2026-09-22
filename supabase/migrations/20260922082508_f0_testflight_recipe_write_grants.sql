-- F0: restore only the column privileges required by the authenticated,
-- SECURITY INVOKER private-recipe RPCs.
--
-- Root cause: the consolidated production baseline intentionally omitted broad
-- authenticated INSERT/UPDATE grants on recipes and recipe_ingredients. UX-1B
-- then exposed SECURITY INVOKER RPCs whose bodies write those tables. PostgreSQL
-- therefore raises 42501 before the existing restrictive owner/private/draft/
-- kullanici RLS policies can run.
--
-- Column grants are deliberate. In particular, authenticated cannot directly
-- UPDATE owner_id, author_type, visibility, status, source_type,
-- cloned_from_recipe_id, or extraction_confidence. INSERT includes the union of
-- columns explicitly written by create/clone/T6; restrictive INSERT RLS still
-- requires owner_id=auth.uid(), visibility=private, status=draft, and
-- author_type=kullanici.
--
-- recipe_steps already has the required INSERT/DELETE grants. Both child tables
-- already have DELETE for atomic replacement. recipe_saves already has its full
-- authenticated CRUD grant plus owner-bound RLS and is intentionally unchanged.
-- anon and PUBLIC receive no new privileges.
--
-- Rollback/runbook (repository guidance only; do not run while fixed clients are live):
--   revoke insert (
--     id, slug, title, description, cover_photo_url, servings, prep_minutes,
--     cook_minutes, rest_minutes, difficulty, cuisine, diet_tags,
--     required_equipment, extraction_confidence, status, visibility,
--     source_type, owner_id, author_type, cloned_from_recipe_id,
--     private_edit_version
--   ) on public.recipes from authenticated;
--   revoke update (
--     title, description, servings, prep_minutes, cook_minutes, rest_minutes,
--     difficulty, private_edit_version, updated_at
--   ) on public.recipes from authenticated;
--   revoke insert (
--     recipe_id, sort_order, crop, free_text_name, quantity, unit, note,
--     is_key_ingredient, ingredient_class
--   ) on public.recipe_ingredients from authenticated;
-- Rolling back recreates the launch-blocking 42501 failures. Revert clients
-- first and confirm no fixed binary depends on these RPCs before considering it.

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
