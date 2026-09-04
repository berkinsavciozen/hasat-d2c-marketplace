-- T3-A — Allergen contract: the 3 missing `recipes` review-state columns + the allergen taxonomy
-- CHECK + the review-state consistency CHECK.
--
-- Canonical doc: `Lansman Planı v2` r14, §19/§20/§21 + `04.12 — T3/T4 Veri Sözleşmesi v1.0` Bölüm 3
-- (T3 — alerjen sözleşmesi). Decision is final: a THREE-state model
-- (reviewed_with_labels / reviewed_without_labels / unreviewed) — an automatically detected
-- allergen label with no human sign-off is never shown to a public user. The four-state
-- alternative was rejected.
--
-- Live schema re-verified this round (see PR description item 7): `recipes.allergen_labels`
-- (text[], nullable) already exists live but carries NO CHECK constraint at all — any text value
-- is currently writable, not just the 7 controlled slugs. `allergens_reviewed`,
-- `allergens_reviewed_at`, `allergens_reviewed_by` do not exist on `recipes` at all — only
-- `recipe_admin_reviews.allergens_reviewed` (an internal per-review-event flag on a different
-- table) exists, which is exactly the "critical şema bulgusu" 04.12 calls out: the *snapshot*
-- table (`recipes`, what the API actually reads) has nowhere to durably record "has a human
-- reviewed this recipe's allergen labels" outside of the review-process log. This migration adds
-- that missing snapshot state.
--
-- DEPENDS ON PR #95/#97 (T4-A + T4-A2, both confirmed merged to `main` via
-- `git merge-base --is-ancestor` this round): T4-A2's column-level UPDATE lock replaced the old
-- table-wide `GRANT UPDATE ON recipes TO authenticated/anon` with an explicit 24-column allow-list
-- (see 20260904170000_t4a2_recipes_nutrition_allergen_column_lock.sql). This migration
-- deliberately does NOT touch that allow-list and does NOT re-grant UPDATE on the 3 columns added
-- below: a column absent from an allow-list that replaced a table-wide grant starts with no
-- authenticated/anon UPDATE privilege on it at all (Postgres does not retroactively or
-- prospectively extend a table-wide grant that no longer exists to a column added later). This is
-- verified empirically by this migration's own test suite (has_column_privilege +
-- a real attempted UPDATE), not assumed — see supabase/tests/t3a_allergen_schema/.

alter table public.recipes
  add column allergens_reviewed boolean not null default false,
  add column allergens_reviewed_at timestamptz,
  add column allergens_reviewed_by uuid;

comment on column public.recipes.allergens_reviewed is
  '04.12 §3.2 / Lansman Planı v2 §19-21. True only once a human has signed off on this recipe''s '
  'allergen_labels (see recipe_admin_reviews.allergens_reviewed for the per-review-event record '
  'this is snapshotted from on publish/finalize -- copying that into this column is F2''s '
  'publish-copy wiring, out of scope for this migration, see PR description item 6). Defaults to '
  'false, so every pre-existing and newly-inserted row starts unreviewed -- the three-state '
  'public-facing model (reviewed_with_labels / reviewed_without_labels / unreviewed) never shows '
  'an automatically detected label that has not cleared this gate.';
comment on column public.recipes.allergens_reviewed_at is
  '04.12 §3.2. Set together with allergens_reviewed = true (see '
  'recipes_allergens_review_consistency_check). Null while unreviewed. Deliberately NOT '
  'nulled back out if allergens_reviewed is later flipped back to false -- see PR description '
  'item 3 for why this differs from T4-A''s two-way nutrition consistency rule.';
comment on column public.recipes.allergens_reviewed_by is
  '04.12 §3.2. Free uuid, intentionally NOT foreign-keyed -- see PR description item 1/8. This '
  'schema has no admin/staff identity table (public.profiles only models the farmer/buyer '
  'marketplace roles via user_role); the one existing analogous field for "who performed an '
  'admin review action" (recipe_admin_reviews.admin_actor) is itself an unconstrained free-form '
  'text column, not FK''d to anything. Following that same precedent here rather than inventing a '
  'FK target this schema does not have.';

-- ===================================================================================================
-- 04.12 §3.2: "allergens_reviewed = true ise allergens_reviewed_at zorunlu dolu olmalı."
--
-- Implemented as a ONE-WAY implication, not the two-way equality T4-A used for its nutrition
-- consistency check -- see PR description item 3 for the full reasoning. Short version: T4-A's
-- macro/metadata columns are all written together by the exact same atomic computation every
-- time, so "all present or all absent" is a correct mirror of that single event. Allergen review
-- state is different: allergens_reviewed_at/allergens_reviewed_by are an audit trail of the *last*
-- human review, and un-reviewing a recipe (flipping allergens_reviewed back to false, e.g. because
-- the recipe was edited and needs re-review) should not be forced to destroy who-reviewed-it/
-- when-it-was-last-reviewed history. A two-way rule (false <=> both null) would force exactly that
-- destruction on every un-review. A one-way rule (true -> allergens_reviewed_at is not null) gives
-- 04.12 §3.2's literal requirement without that side effect. allergens_reviewed_by is deliberately
-- NOT required by this constraint even when reviewed = true (04.12 §3.2 only names
-- allergens_reviewed_at as "zorunlu"; see PR description item 3 for why reviewed_by stays optional).
-- ===================================================================================================
alter table public.recipes
  add constraint recipes_allergens_review_consistency_check
    check (allergens_reviewed = false or allergens_reviewed_at is not null);

-- ===================================================================================================
-- Allergen taxonomy: `allergen_labels` must be a unique subset of exactly the 7 controlled slugs
-- (gluten, laktoz, yumurta, findik-yerfistigi, soya, susam, deniz-urunu). Both an out-of-taxonomy
-- slug and a repeated slug are rejected. NULL (not yet assessed) and '{}' (assessed, confirmed
-- allergen-free -- the reviewed_without_labels state) are both valid per 04.12's three-state model.
--
-- Added NOT VALID: live data was queried before writing this migration (see PR description item 4)
-- and 9 of the 13 `recipes` rows that currently carry a non-null allergen_labels value use values
-- outside this taxonomy entirely (e.g. 'sut', 'findik', 'fındık', 'ceviz', 'bal' -- legacy free-text
-- labels from before this contract existed, not a controlled-slug encoding at all). Per this
-- dispatch's explicit instruction, this migration does not silently delete or rewrite that data --
-- see PR description item 4 for the proposed remediation. NOT VALID means the constraint is
-- enforced for every new INSERT/UPDATE from this point on (closing the open write-path gap that is
-- this migration's actual purpose) without failing this migration on the pre-existing rows; those
-- 9 rows are already safe from public exposure regardless, because allergens_reviewed defaults to
-- false for every existing row (see recipes.allergens_reviewed comment above and PR description
-- item 5) -- the three-state model hides them independently of whether this CHECK has been
-- VALIDATEd yet. A follow-up (see PR description item 4) should remap or clear the legacy values
-- and then run `alter table public.recipes validate constraint
-- recipes_allergen_labels_taxonomy_check;` to close the loop.
-- ===================================================================================================
create or replace function public.is_valid_recipe_allergen_labels(labels text[])
returns boolean
language sql
immutable
as $$
  select
    case
      when labels is null then true
      when cardinality(labels) = 0 then true
      else
        not exists (
          select 1 from unnest(labels) as v
          where v is null
             or v <> all (array[
               'gluten', 'laktoz', 'yumurta', 'findik-yerfistigi', 'soya', 'susam', 'deniz-urunu'
             ])
        )
        and cardinality(labels) = (select count(distinct v) from unnest(labels) as v)
    end;
$$;

comment on function public.is_valid_recipe_allergen_labels(text[]) is
  '04.12 §3.1. Validates recipes.allergen_labels: null (not assessed) and ''{}'' (assessed, no '
  'allergens) are both valid; otherwise every element must be one of the 7 controlled slugs and no '
  'slug may repeat.';

alter table public.recipes
  add constraint recipes_allergen_labels_taxonomy_check
    check (public.is_valid_recipe_allergen_labels(allergen_labels))
    not valid;
