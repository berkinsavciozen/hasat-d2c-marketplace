-- T3-A2 — Remap the 9 legacy free-text `recipes.allergen_labels` values found by T3-A
-- (20260904180000) to the 7-slug controlled taxonomy, then VALIDATE the taxonomy CHECK T3-A added
-- NOT VALID.
--
-- Canonical doc: `Lansman Planı v2` r19, §23.5/§25.
--
-- T3-A's PR (#98) queried live production and found 9 of 13 `recipes` rows with a non-null
-- allergen_labels value used pre-contract free-text labels outside the 7-slug taxonomy (gluten,
-- laktoz, yumurta, findik-yerfistigi, soya, susam, deniz-urunu), so the taxonomy CHECK was added
-- NOT VALID rather than blocking on that data or silently rewriting it. This migration is the
-- follow-up remediation that PR named as out of scope for itself.
--
-- Re-verified live (this dispatch, before writing this migration): the same 9 row ids, same
-- allergen_labels values as originally found -- nothing changed in the interim. See PR description
-- item 4 for the exact re-verification query and its output. The 10th previously-populated row
-- (5fda9180-28d3-454a-9f88-ca66c6c25380, ['yumurta']) already conforms to the taxonomy and is
-- deliberately not touched here. No other `recipes` row is touched.
--
-- Mapping decisions (Berkin-approved, see PR description item 2 and Lansman Planı v2 §25):
--   sut (milk)              -> laktoz               (direct controlled-taxonomy equivalent)
--   findik / fındık (hazelnut) -> findik-yerfistigi  (the taxonomy's tree-nut/peanut slug covers it)
--   bal (honey)              -> dropped from the array (not an allergen, no taxonomy slot)
--   ceviz (walnut)           -> allergen_labels set to null entirely (a DIFFERENT tree-nut species
--                               than hazelnut/peanut; findik-yerfistigi would misrepresent it as
--                               reviewed-and-correct rather than actually assessed, so this row is
--                               dropped back to the "not yet assessed" state rather than mapped to
--                               a wrong slug). Already allergens_reviewed = false, so this was never
--                               shown to a public user under the three-state model either before or
--                               after this migration -- see recipes.allergens_reviewed's own
--                               comment from T3-A.

update public.recipes set allergen_labels = array['laktoz']
where id in (
  'bf2512db-19f5-4850-94a6-3b51d282d8f9',
  '7f3f7fd3-864a-44fe-a17e-a2d0397ae22d',
  '2804361c-72c6-42c8-b526-9941ce8fb91b'
);

-- sut+bal -> laktoz (bal dropped: not an allergen, no taxonomy slot)
update public.recipes set allergen_labels = array['laktoz']
where id = '873933e6-5f5c-4006-9518-91cf5bf90331';

-- fındık/findik -> findik-yerfistigi
update public.recipes set allergen_labels = array['findik-yerfistigi']
where id in (
  '2724d359-5883-42d5-a7eb-7fe6e5784d40',
  '7e16f5db-cccc-4bf8-89ee-7c6fb9fb560b',
  'b5715fe7-a496-4a79-9eca-204df9bc4e5c'
);

-- sut+yumurta -> laktoz+yumurta (yumurta already valid, sut -> laktoz)
update public.recipes set allergen_labels = array['laktoz','yumurta']
where id = '8b6bff41-ca2a-4387-819d-b8fc3aa8f25a';

-- ceviz -> null (no taxonomy slot; dropped to unreviewed/not-yet-assessed rather than mapped to a
-- wrong slug -- see header comment)
update public.recipes set allergen_labels = null
where id = '66b0ced4-3a9e-45bf-bd50-bb91fba38d97';

-- All 9 rows now conform to the taxonomy (and the untouched 10th row already did) -- validate the
-- CHECK T3-A added NOT VALID so it is fully enforced retroactively, not just for new writes.
alter table public.recipes validate constraint recipes_allergen_labels_taxonomy_check;
