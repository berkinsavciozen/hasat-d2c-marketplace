# F0-24 lifecycle wiring — connecting `calculate_recipe_nutrition` to real triggers

This directory is the "later dispatch" `20260909120000_f024_recipe_nutrition_calc_engine.sql`'s own
header explicitly deferred: calling the F0-24 nutrition engine from service-role context at real
lifecycle points, rather than only from the one-time backfill migration and the pgTAP test suite.

## Modules

| File | Purpose |
|---|---|
| `recalc.ts` | `invokeNutritionRecalc()` — the best-effort entry point every lifecycle call site uses. `predictNutritionInputHash()` is its idempotency short-circuit, exported separately so it has its own direct test coverage. |

## What is, and isn't, wired

Of the three lifecycle points the calc-engine migration's header named:

| Trigger | Wired? | Where |
|---|---|---|
| F2 publish (`recipe_drafts` → live `recipes`, `status → 'published'`) | **Yes, enforced** | `20260910073732_allergen_nutrition_publish_gate.sql`, inside the publish transaction; `../publish/publish-stage.ts` performs an idempotent post-commit verification |
| F7 post-edit save (owner/admin edits `recipe_ingredients`/`servings` on an existing recipe) | **Yes, but not here — see below** | `../../../../migrations/20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql` |
| T6 / F11 AI-customization clone (`cloned_from_recipe_id`) | **No — not implemented anywhere in this repo** | see below |

### F7 — wired, but as a DB trigger, not an Edge Function call site

F7's one real write path is `saveDraft()` in `hasat-mobile/src/lib/hasat/import.ts` — but that
function writes to `recipes`/`recipe_ingredients` **directly from the client**, RLS-gated to
`owner_id = auth.uid()`, with no server-side/service-role hop in between. There is no Edge
Function or RPC in this repo that F7's flow ever calls, so there is no call site in this directory
(`recalc.ts`'s `invokeNutritionRecalc()`) to attach to for F7 — unlike F2, which already goes
through `publish-stage.ts` as a service-role Edge Function call.

F7 is wired instead by `20260909130000_f024t4b_recipe_nutrition_trigger_wiring.sql`: AFTER
INSERT/UPDATE/DELETE statement-level triggers on `recipe_ingredients` (deduplicated per
`recipe_id` via transition tables) and an AFTER UPDATE row-level trigger on `recipes.servings`
(`WHEN (OLD.servings IS DISTINCT FROM NEW.servings)`), both calling `calculate_recipe_nutrition`
through a `postgres`-owned `SECURITY DEFINER` bridge function — needed because F7's actual writer,
`authenticated`, holds none of the privileges `calculate_recipe_nutrition`'s own body needs
(EXECUTE on itself, SELECT on `crop_nutrition`, column-level UPDATE on `recipes.nutrition_*`) and
none of those are (or should be) granted to it directly. See that migration's own header for the
full discovery/privilege writeup, and `supabase/tests/f024t4b_recipe_nutrition_trigger/` for its
test suite. This directory's own `recalc.ts` contract (below) is unchanged and untouched by that
migration — it still only covers F2's Edge-Function-side call.

### T6 / F11 — investigated, not wired, and why

No "T6" label appears anywhere in the vault's docs. The closest match, F11 ("Tarifler
klonlanabilir olmalı"), is also **v1.1, mobile + RPC** ("kural #106 gereği kopyalama mantığı
Postgres fonksiyonu olarak — client'ta değil") and, per its own scope note, **shares F7's edit
screen** ("klonla → direkt edit moduna düşer"). A repo-wide search for `cloned_from_recipe_id`,
`clone`, and related terms across `hasat-d2c-marketplace` found no implementation — no migration
ever added a `cloned_from_recipe_id` column, no RPC or edge function creates a cloned recipe row.
T6/F11 is genuinely unbuilt, exactly as this dispatch's own instructions anticipated as a possible
outcome ("kural #103 — dürüstçe belirt"). Nothing to wire; no blind hook was added.

## Contract (see `recalc.ts`'s own header for the full detail)

1. **Idempotent** — `predictNutritionInputHash()` mirrors the engine's own `nutrition_input_hash`
   md5() formula (verified byte-for-byte against a live published recipe's real hash during this
   dispatch) to skip the RPC call entirely when nothing that would change its output has changed.
2. **Race-safe, bounded** — detects an ingredient-set change that raced with the RPC call and
   recomputes exactly once more; never loops.
3. **Safe no-op** for a deleted or unpublished recipe, checked before ever calling the RPC.
4. **Post-commit helper never throws** — every failure is logged and returned. F2's authoritative
   publish gate is the database trigger in `20260910073732_allergen_nutrition_publish_gate.sql`,
   which does raise and atomically rolls back an incomplete publish.
5. **Never touches** `calculate_recipe_nutrition`'s own SQL body or grants — `anon`/`authenticated`
   stay revoked (see the PR description for the live `has_function_privilege` check).

## Running the tests

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/nutrition/
```
