-- T3-A — SQL test suite for the allergen contract schema migration.
--
-- Run order (see run.sh): 00_fixtures.sql -> the real T4-A migrations (160000, 161000) -> the real
-- T4-A2 migration (170000) -> the real T3-A migration (180000) -> this file. By the time these
-- assertions run, `recipes` has its full post-T3-A shape (32 original columns + 5 T4-A nutrition_*
-- columns + the 3 T3-A allergen review-state columns), T4-A2's column-lock allow-list is in
-- place, and T3-A's own taxonomy/consistency CHECKs and (implicit, by omission from the
-- allow-list) column lock are in place.

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

-- ===================================================================================================
-- (1) recipes_allergen_labels_taxonomy_check: positive (valid slugs, null, empty array) + negative
--     (out-of-taxonomy slug, duplicate slug).
-- ===================================================================================================

-- Positive: null (not yet assessed).
insert into public.recipes (slug, title, servings)
values ('allergen-null', 'Henuz Degerlendirilmemis', 4);

-- Positive: empty array (assessed, confirmed allergen-free -- reviewed_without_labels state).
insert into public.recipes (slug, title, servings, allergen_labels)
values ('allergen-empty', 'Degerlendirildi Alerjen Yok', 4, '{}');

-- Positive: a single controlled slug.
insert into public.recipes (slug, title, servings, allergen_labels)
values ('allergen-single', 'Tek Alerjen', 4, array['gluten']);

-- Positive: all 7 controlled slugs at once, each exactly once.
insert into public.recipes (slug, title, servings, allergen_labels)
values ('allergen-all-seven', 'Yedi Alerjen', 4, array[
  'gluten', 'laktoz', 'yumurta', 'findik-yerfistigi', 'soya', 'susam', 'deniz-urunu'
]);

-- Negative: an out-of-taxonomy slug must be rejected.
do $$
begin
  begin
    insert into public.recipes (slug, title, servings, allergen_labels)
    values ('allergen-bad-slug', 'Gecersiz Slug', 4, array['findik']);
    perform pg_temp.assert(false, 'expected an out-of-taxonomy allergen slug to violate recipes_allergen_labels_taxonomy_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- Negative: a legacy free-text label (matching the live data found before writing this migration)
-- must be rejected too, proving this isn't just an ASCII/formatting quirk.
do $$
begin
  begin
    insert into public.recipes (slug, title, servings, allergen_labels)
    values ('allergen-legacy-free-text', 'Eski Serbest Metin', 4, array['sut']);
    perform pg_temp.assert(false, 'expected a legacy free-text allergen label to violate recipes_allergen_labels_taxonomy_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- Negative: a repeated (duplicate) slug must be rejected even though every individual slug is
-- valid on its own.
do $$
begin
  begin
    insert into public.recipes (slug, title, servings, allergen_labels)
    values ('allergen-duplicate-slug', 'Tekrarlanan Slug', 4, array['gluten', 'gluten']);
    perform pg_temp.assert(false, 'expected a duplicate allergen slug to violate recipes_allergen_labels_taxonomy_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- Negative: one valid slug + one out-of-taxonomy slug in the same array must still be rejected
-- (the whole array is invalid, not just the bad element).
do $$
begin
  begin
    insert into public.recipes (slug, title, servings, allergen_labels)
    values ('allergen-mixed-valid-invalid', 'Karisik Gecerli Gecersiz', 4, array['gluten', 'findik']);
    perform pg_temp.assert(false, 'expected a mix of one valid and one invalid allergen slug to violate recipes_allergen_labels_taxonomy_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- ===================================================================================================
-- (2) recipes_allergens_review_consistency_check: positive + negative cases.
-- ===================================================================================================

-- Positive: unreviewed (false), allergens_reviewed_at null -- the default state.
insert into public.recipes (slug, title, servings, allergens_reviewed)
values ('consistency-unreviewed', 'Denetlenmemis', 4, false);

-- Positive: reviewed (true) with allergens_reviewed_at set.
insert into public.recipes (slug, title, servings, allergens_reviewed, allergens_reviewed_at)
values ('consistency-reviewed', 'Denetlenmis', 4, true, now());

-- Positive: reviewed (true) with allergens_reviewed_at set but allergens_reviewed_by left null --
-- proving reviewed_by is NOT required by this constraint (see migration file + PR description
-- item 3: only allergens_reviewed_at is "zorunlu" per 04.12 §3.2).
insert into public.recipes (slug, title, servings, allergens_reviewed, allergens_reviewed_at, allergens_reviewed_by)
values ('consistency-reviewed-no-reviewer', 'Denetleyen Belirtilmemis', 4, true, now(), null);

-- Positive: an un-reviewed row (false) that still carries allergens_reviewed_at/by from a PRIOR
-- review -- proving the one-way rule, unlike a two-way rule, does not force clearing audit history
-- when a recipe is flipped back to unreviewed (e.g. after being edited and needing re-review).
insert into public.recipes (
  slug, title, servings, allergens_reviewed, allergens_reviewed_at, allergens_reviewed_by
) values (
  'consistency-unreviewed-with-history', 'Yeniden Denetim Bekliyor',
  4, false, now() - interval '3 days', '00000000-0000-0000-0000-0000000000bb'
);

-- Negative: reviewed = true but allergens_reviewed_at is null -> must be rejected (the literal
-- 04.12 §3.2 requirement).
do $$
begin
  begin
    insert into public.recipes (slug, title, servings, allergens_reviewed, allergens_reviewed_at)
    values ('consistency-bad-reviewed-no-at', 'Gecersiz Denetim', 4, true, null);
    perform pg_temp.assert(false, 'expected allergens_reviewed = true with null allergens_reviewed_at to violate recipes_allergens_review_consistency_check');
  exception when check_violation then
    -- expected
  end;
end;
$$;

-- ===================================================================================================
-- (3) Column-level UPDATE lock: has_column_privilege denies authenticated/anon on all 3 new
--     columns; service_role keeps it. Same pattern as t4a2_recipes_column_lock.
-- ===================================================================================================

do $$
declare
  locked_cols text[] := array['allergens_reviewed', 'allergens_reviewed_at', 'allergens_reviewed_by'];
  c text;
begin
  foreach c in array locked_cols loop
    perform pg_temp.assert(
      not has_column_privilege('authenticated', 'public.recipes', c, 'update'),
      format('expected authenticated to be denied UPDATE on recipes.%I', c)
    );
    perform pg_temp.assert(
      not has_column_privilege('anon', 'public.recipes', c, 'update'),
      format('expected anon to be denied UPDATE on recipes.%I', c)
    );
    perform pg_temp.assert(
      has_column_privilege('service_role', 'public.recipes', c, 'update'),
      format('expected service_role to keep UPDATE on recipes.%I', c)
    );
  end loop;
end;
$$;

-- ===================================================================================================
-- (4) Negative: authenticated actually cannot UPDATE any of the 3 locked columns directly (not
--     just has_column_privilege on paper) -- the DB-level mechanism a PostgREST 401/403 rests on,
--     same reasoning as B-1/B-2/T4-A/T4-A2's own negative REVOKE tests.
-- ===================================================================================================

insert into public.recipes (id, slug, title, description, servings, owner_id, visibility, status)
values ('00000000-0000-0000-0000-000000000001', 'kilitli-test-tarifi', 'Kilitli Test Tarifi', 'baslangic aciklamasi', 4,
        '00000000-0000-0000-0000-0000000000aa', 'private', 'draft');

create or replace function pg_temp.try_locked_update(colname text, value_sql text)
returns boolean
language plpgsql
as $$
declare
  v_raised boolean := false;
begin
  set role authenticated;
  begin
    execute format(
      'update public.recipes set %I = %s where id = $1',
      colname, value_sql
    ) using '00000000-0000-0000-0000-000000000001'::uuid;
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  return v_raised;
end;
$$;

do $$
begin
  perform pg_temp.assert(pg_temp.try_locked_update('allergens_reviewed', 'true'), 'expected authenticated UPDATE of recipes.allergens_reviewed to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('allergens_reviewed_at', 'now()'), 'expected authenticated UPDATE of recipes.allergens_reviewed_at to raise insufficient_privilege');
  perform pg_temp.assert(pg_temp.try_locked_update('allergens_reviewed_by', $q$'00000000-0000-0000-0000-0000000000aa'::uuid$q$), 'expected authenticated UPDATE of recipes.allergens_reviewed_by to raise insufficient_privilege');
end;
$$;

-- Sanity: none of the locked-column attempts above actually mutated the row.
do $$
declare
  r record;
begin
  select * into r from public.recipes where id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.assert(r.allergens_reviewed = false, 'expected recipes.allergens_reviewed to remain untouched (default false) after the rejected UPDATE attempts');
  perform pg_temp.assert(r.allergens_reviewed_at is null, 'expected recipes.allergens_reviewed_at to remain untouched after the rejected UPDATE attempts');
  perform pg_temp.assert(r.allergens_reviewed_by is null, 'expected recipes.allergens_reviewed_by to remain untouched after the rejected UPDATE attempts');
end;
$$;

-- ===================================================================================================
-- (5) service_role (the admin review path) can still write all 3 locked columns freely.
-- ===================================================================================================

do $$
begin
  set role service_role;
  update public.recipes
    set allergens_reviewed = true,
        allergens_reviewed_at = now(),
        allergens_reviewed_by = '00000000-0000-0000-0000-0000000000aa'
    where id = '00000000-0000-0000-0000-000000000001';
  reset role;
end;
$$;

do $$
declare
  r record;
begin
  select * into r from public.recipes where id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.assert(r.allergens_reviewed = true, 'expected service_role to still be able to UPDATE recipes.allergens_reviewed');
  perform pg_temp.assert(r.allergens_reviewed_at is not null, 'expected service_role to still be able to UPDATE recipes.allergens_reviewed_at');
  perform pg_temp.assert(r.allergens_reviewed_by = '00000000-0000-0000-0000-0000000000aa', 'expected service_role to still be able to UPDATE recipes.allergens_reviewed_by');
end;
$$;

-- ===================================================================================================
-- (6) 04.12 §4 gate-criteria fixtures: the schema must be able to represent all four states the
--     public-facing three-state model (plus visibility) distinguishes, without any of this
--     migration's constraints blocking a legitimate one. Actual public-filtering logic (which of
--     these a public/unauthenticated reader may see) is T3-B's scope, not this migration's -- these
--     rows only prove the schema layer itself has no gap for any of the four states.
-- ===================================================================================================

-- reviewed-label: allergens_reviewed = true, allergen_labels populated.
insert into public.recipes (
  slug, title, servings, visibility, allergens_reviewed, allergens_reviewed_at, allergens_reviewed_by, allergen_labels
) values (
  'gate-reviewed-with-labels', 'Denetlendi Etiketli', 4, 'public',
  true, now(), '00000000-0000-0000-0000-0000000000aa', array['gluten', 'susam']
);

-- reviewed-empty: allergens_reviewed = true, allergen_labels explicitly empty (confirmed
-- allergen-free by a human, not merely unassessed).
insert into public.recipes (
  slug, title, servings, visibility, allergens_reviewed, allergens_reviewed_at, allergens_reviewed_by, allergen_labels
) values (
  'gate-reviewed-without-labels', 'Denetlendi Alerjensiz', 4, 'public',
  true, now(), '00000000-0000-0000-0000-0000000000aa', '{}'
);

-- unreviewed: allergens_reviewed = false, regardless of whether allergen_labels happens to carry
-- an automatically detected value -- the three-state model's whole point is that this label must
-- never surface publicly while unreviewed.
insert into public.recipes (
  slug, title, servings, visibility, allergens_reviewed, allergen_labels
) values (
  'gate-unreviewed', 'Denetlenmemis Otomatik Etiket', 4, 'public',
  false, array['soya']
);

-- private-recipe: an owner's own private recipe, unreviewed -- combines both gates (visibility AND
-- review state); this migration only proves the row is representable, not that a private/unreviewed
-- recipe's labels are actually withheld from other users (that enforcement is RLS/query-layer, out
-- of scope here).
insert into public.recipes (
  slug, title, servings, visibility, owner_id, allergens_reviewed, allergen_labels
) values (
  'gate-private-unreviewed', 'Ozel Denetlenmemis Tarif', 4, 'private',
  '00000000-0000-0000-0000-0000000000cc', false, array['yumurta']
);

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes where slug in (
      'gate-reviewed-with-labels', 'gate-reviewed-without-labels', 'gate-unreviewed', 'gate-private-unreviewed'
    )) = 4,
    'expected all four 04.12 gate-criteria fixture rows to have inserted successfully'
  );
end;
$$;

\echo 'T3-A allergen contract schema SQL test suite: ALL ASSERTIONS PASSED'
