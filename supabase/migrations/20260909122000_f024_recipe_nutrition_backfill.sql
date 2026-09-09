-- F0-24 — Task 3: one-time backfill.
--
-- Runs `calculate_recipe_nutrition` (20260909120000) directly, once, for every recipe that has at
-- least one recipe_ingredients row with a platform crop (crop is not null) — so the 26 crops just
-- seeded (20260909121000) actually land on the live `recipes` rows immediately after this migration
-- applies, instead of waiting on a sweep/trigger that isn't wired up yet (F2 publish / F7 edit-save
-- / T6 AI-customize wiring is explicitly out of scope for this dispatch, same boundary T4-A drew for
-- itself on 2026-09-04 — see 20260909120000's header). Calling the function directly here, rather
-- than only nulling nutrition_calculated_at for a future sweep to pick up, is what actually gets
-- "the majority of the 33 published recipes filled with real numbers" the dispatch asks for.
--
-- Idempotent and safe to re-run: calculate_recipe_nutrition always fully overwrites a recipe's
-- nutrition_* columns from its current recipe_ingredients + crop_nutrition state, and a recipe
-- with no gram-priceable ingredient at all just gets left in (or reset to) the all-NULL
-- "unavailable" state it already started in — never an error.
--
-- Runs as whatever role applies migrations (this project's migration runner), not as service_role
-- via PostgREST — the T4-A2 column lock only restricts anon/authenticated, so this is unaffected by
-- it, same as every other migration-time DML in this repo.

do $$
declare
  r record;
begin
  for r in
    select rec.id
    from public.recipes rec
    where exists (
      select 1 from public.recipe_ingredients ri
      where ri.recipe_id = rec.id and ri.crop is not null
    )
  loop
    perform public.calculate_recipe_nutrition(r.id);
  end loop;
end;
$$;
