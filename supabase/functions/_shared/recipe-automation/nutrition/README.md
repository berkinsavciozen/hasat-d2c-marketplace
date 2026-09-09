# F0-24 lifecycle wiring — connecting `calculate_recipe_nutrition` to real triggers

This directory is the "later dispatch" `20260909120000_f024_recipe_nutrition_calc_engine.sql`'s own
header explicitly deferred: calling the F0-24 nutrition engine from service-role context at real
lifecycle points, rather than only from the one-time backfill migration and the pgTAP test suite.

## Modules

| File | Purpose |
|---|---|
| `recalc.ts` | `invokeNutritionRecalc()` — the best-effort entry point every lifecycle call site uses. `predictNutritionInputHash()` is its idempotency short-circuit, exported separately so it has its own direct test coverage. |

## What is, and isn't, wired in this dispatch

Only **one** of the three lifecycle points the migration's header named is actually wired here:

| Trigger | Wired? | Where |
|---|---|---|
| F2 publish (`recipe_drafts` → live `recipes`, `status → 'published'`) | **Yes** | `../publish/publish-stage.ts`, on a genuine (non-idempotent-replay) publish |
| F7 post-edit save (owner/admin edits `recipe_ingredients`/`servings` on an existing recipe) | **No — no real write path exists in this repo** | see below |
| T6 / F11 AI-customization clone (`cloned_from_recipe_id`) | **No — not implemented anywhere in this repo** | see below |

### F7 — investigated, not wired, and why

The vault's `Build/Launch-Scope-Plan.md` (F7 — "Defterime eklediğim kendi tariflerimi
editleyebilmeliyim") describes F7 as a **mobile-only, v1.1 fast-follow** feature ("🤖 mobil,
Defterim-only — web'de kişisel tarif içe aktarma zaten yok, M9'da kalıyor"), not a web/admin
feature. Its one real write path found during this dispatch's investigation is
`saveDraft()` in `hasat-mobile/src/lib/hasat/import.ts` — but that function writes to
`recipes`/`recipe_ingredients`/`recipe_steps` **directly from the client**, RLS-gated to
`owner_id = auth.uid()`, with no server-side/service-role call in between. There is no edge
function or RPC in `hasat-d2c-marketplace` this dispatch could add a `calculate_recipe_nutrition`
call to for F7, and this dispatch's scope explicitly excludes touching `hasat-mobile/**` (a
separate repo's client/UI code, not this repo's backend).

Wiring F7 correctly would need either (a) a new edge function `saveDraft()` calls after its own
writes succeed, or (b) a database trigger on `recipe_ingredients`/`recipes` — both are **new
capability**, not "connect an existing call site to an existing engine", and (b) specifically would
require a new migration this dispatch was told not to add without orchestrator approval. Flagged as
a finding for a follow-up dispatch, not implemented here.

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
4. **Never throws** — every failure is logged (`console.error`) and returned in the result, never
   propagated to the caller's own publish/edit/clone flow.
5. **Never touches** `calculate_recipe_nutrition`'s own SQL body or grants — `anon`/`authenticated`
   stay revoked (see the PR description for the live `has_function_privilege` check).

## Running the tests

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/nutrition/
```
