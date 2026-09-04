-- T4-A2 — Column-level UPDATE lock on `recipes` nutrition + allergen_labels columns.
--
-- Canonical doc: `Lansman Planı v2` r12, §18.1/§19.
--
-- A deeper audit of the risk flagged in PR #95 (T4-A) item 8 found the actual mechanism:
-- `information_schema.column_privileges` shows `authenticated` holding UPDATE on ALL 32
-- (pre-T4-A) columns of `recipes` — a single table-wide `GRANT UPDATE`, granted at table
-- creation, with no column-level restriction (confirmed live: grantor `postgres`, one row per
-- column, no narrower grant anywhere in this repo's migrations). The `recipes auth update own
-- private` RLS policy only checks `owner_id = auth.uid()` and `visibility = 'private'` — it
-- authorizes an UPDATE statement, it does not and structurally cannot restrict *which columns*
-- that statement touches. So today, any authenticated owner of a private recipe can set
-- `calories`, `allergen_labels`, etc. directly via PostgREST, regardless of what the (not yet
-- built) nutrition engine computed or what a human reviewer approved.
--
-- Berkin's decision: nutrition fields must not be client-writable. §3.2's allergen trust model
-- ("insan onayı olmadan bir alerjen etiketi gerçek gibi sunulmaz") rests on the same guarantee for
-- `allergen_labels` — if an owner can edit that array directly, the human-review gate is
-- decorative. Both are locked together here since they share the exact same underlying gap.
--
-- DEPENDS ON PR #95 (20260904160000_t4a_recipe_nutrition_columns.sql): 5 of the 13 columns locked
-- below (nutrition_source/nutrition_coverage_pct/nutrition_input_hash/nutrition_reference_version/
-- nutrition_warnings) only exist once that migration has run. This migration is built on top of
-- the T4-A branch and must be applied strictly after it — see PR description item 3.
--
-- This migration ONLY revokes UPDATE on the 13 columns below. It does not touch SELECT/INSERT/
-- DELETE, any table-level grant, or any RLS policy, and it does not touch `status`, `author_type`,
-- `source_type`, `extraction_confidence`, `share_token`, or `cloned_from_recipe_id` — those are
-- researched but deliberately NOT locked in this migration (see PR description item 5). `title`,
-- `description`, `servings`, and every other column an owner legitimately edits remain untouched
-- and updatable — see supabase/tests/t4a2_recipes_column_lock/ for the positive regression proof.
--
-- IMPORTANT POSTGRES SUBTLETY (found by this migration's own test suite, first run against the
-- naive one-step approach): a bare `REVOKE UPDATE (col) ON TABLE t FROM role` does NOT override an
-- existing *table-level* `GRANT UPDATE ON TABLE t TO role`. Table privileges and column privileges
-- are separate, independently-sufficient grants — a role holding the table-level UPDATE privilege
-- can still update every column regardless of any column-specific REVOKE, because
-- has_column_privilege() (and Postgres's actual permission check on UPDATE) treats the table-level
-- grant as authorizing all of its columns. `recipes` currently has exactly this table-level grant
-- for both `authenticated` and `anon` (see file header). So the only correct way to restrict which
-- columns these roles may update is: revoke the table-level UPDATE entirely, then re-grant UPDATE
-- only on the columns that must remain client-writable — which is what this migration does.
--
-- The 24 columns re-granted below are every `recipes` column EXCEPT the 13 locked ones: this is a
-- pure narrowing, not a behavior change for anything else an owner already edits.

revoke update on public.recipes from authenticated;
revoke update on public.recipes from anon;

grant update (
  id,
  slug,
  title,
  description,
  cover_photo_url,
  servings,
  prep_minutes,
  cook_minutes,
  difficulty,
  cuisine,
  diet_tags,
  status,
  visibility,
  source_type,
  source_url,
  owner_id,
  author_type,
  extraction_confidence,
  created_at,
  updated_at,
  rest_minutes,
  required_equipment,
  share_token,
  cloned_from_recipe_id
) on public.recipes to authenticated;

-- anon never has an UPDATE-granting RLS policy on recipes (only `authenticated` does, via
-- "recipes auth update own private") — this is pure defense-in-depth, closing the same table-wide
-- grant gap symmetrically rather than leaving a live table-level privilege that only RLS's
-- default-deny happens to be covering. Same 24-column allow-list as authenticated, for parity.
grant update (
  id,
  slug,
  title,
  description,
  cover_photo_url,
  servings,
  prep_minutes,
  cook_minutes,
  difficulty,
  cuisine,
  diet_tags,
  status,
  visibility,
  source_type,
  source_url,
  owner_id,
  author_type,
  extraction_confidence,
  created_at,
  updated_at,
  rest_minutes,
  required_equipment,
  share_token,
  cloned_from_recipe_id
) on public.recipes to anon;
