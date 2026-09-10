-- State that must exist before the publish-gate migration is installed.
-- The legacy row proves migration installation is non-retroactive.

insert into public.crop_nutrition (
  crop, reference_source, reference_source_id, reference_version,
  calories_kcal, protein_g, carbs_g, fat_g, fiber_g
) values (
  'kabak', 'tuber', 'local-test-kabak', 'local-test-v1',
  20, 1.1, 3.3, 0.2, 1.1
);

insert into public.recipes (
  slug, title, servings, status, visibility, allergen_labels
) values (
  'legacy-published-before-gate', 'Legacy Published Before Gate', 4,
  'published', 'public', null
);
