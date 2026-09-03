# Recipe Writer — the F2 Step 06 vertical slice

The first content-agent stage-runner in the pipeline: `write`. Implements PROMPT 06 end to end for
one manually created kabak `RecipeBrief` (no Planner yet — that's a later step). The actual HTTP
entrypoint is `../../recipe-stage-write/index.ts`; everything here is the orchestration/content
logic that entrypoint delegates to, kept HTTP-free so it's directly unit-testable.

## Modules

| File | Purpose |
|---|---|
| `write-stage.ts` | `runWriteStage()` — claim the job, check idempotency, run the Writer agent, validate, force-correct any invented not-in-`crop_config` crop slug (Step 06B, see below), store, record telemetry, advance+dispatch. The one place all of the above is sequenced. |
| `context.ts` | Narrow read/RPC helpers: `briefFromJobRow()` (in-memory transform of the already-claimed job row — a job IS a promoted brief, see the f2s03 migration) and `loadCropContext()` (calls ONLY `get_crop_context`, and only ever for the brief's single `focusCrop` — see Step 06B below — never a raw table read or the full `crop_config` list). |
| `editorial-rules.ts` | Content-level constraints a JSON Schema can't express (crop text vs `freeTextName`, difficulty must reflect real complexity, allergen list is first-pass only, no publish/status leakage, photo fields are always null in this stage). |
| `system-prompt.ts` | Assembles the Writer's system prompt from the editorial rules + a short framing paragraph. |
| `slug.ts` | Deterministic `slugifyTitle()` — a candidate slug derived from the draft title, checked via `validate_recipe_slug` at draft time (not persisted; `recipe_drafts` has no slug column). |
| `validate-draft.ts` | Runs the Step 04 Postgres RPCs (`validate_recipe_structure`/`validate_recipe_crop_values`/`validate_recipe_ingredient_coverage`/`validate_recipe_slug`/`normalize_recipe_units`) and aggregates their issues — deterministic logic stays in Postgres, not reimplemented in TypeScript. |
| `../crop-slug-guard.ts` | Step 06B: `sanitizeUnknownCropIngredients()` — the SAME shared module `revise/revise-stage.ts` uses for its own Step 08B (see `../revise/README.md`), reused here as-is. |

## Writer restrictions, and where each is actually enforced

- **No direct live recipe writes / no publish access**: `write-stage.ts` only ever writes to
  `recipe_drafts`. It never imports or references `recipes`/`recipe_ingredients`/`recipe_steps`.
- **No generic Supabase or SQL tool**: the agent itself is given **zero tools** (see the
  `agentRunner.run(...)` call in `write-stage.ts` — no `tools` field). Every read the Writer needs
  (brief, crop context) happens BEFORE the call via `context.ts`; every write happens AFTER it, in
  trusted stage-runner code the model's output can only flow through, never invoke.
- **Crop text only, never `crop_id`**: enforced structurally by `recipeDraftPayloadSchema`'s
  `.strict()` (schemas.ts) — a payload containing a `crop_id` key fails Zod parsing outright, not
  just a prompt instruction.
- **Difficulty only `kolay`/`orta`/`zor`**: `recipeDifficultySchema` (schemas.ts), same enforcement
  point as the live `recipes.difficulty` CHECK constraint.
- **Allergen persistence matches the verified live `recipes.allergen_labels` definition; human
  safety review remains mandatory**: `allergenLabels` is stored exactly as `recipes.allergen_labels`
  is modeled (nullable `text[]`, no enum) — the Writer's list is explicitly framed in
  `editorial-rules.ts` as first-pass only; nothing in this stage sets or implies
  `recipe_qa_results.safety_approved` (that requires a human `reviewedBy`/`reviewedAt`, enforced at
  the DB layer, and only becomes reachable at a later stage).
- **No pipeline status in `recipes.status`**: this stage never touches the `recipes` table at all.

## Step 06B: invented crop slugs (the write-stage half of the Step 08B fix)

A latent gap PR #89 (Step 08B) documented but deliberately left untouched in `revise/README.md`:
`context.ts`'s `loadCropContext()` is only ever called for the brief's single `focusCrop`
(`runWriterAgent` in `write-stage.ts`) — the Writer is never handed the full `crop_config` slug
list, same restriction `revise/context.ts` applies to the Reviser. Until now this never actually
fired in production, because the Writer had no observed tendency to crop-match an ingredient
*outside* its one focus crop — but if it ever does (on its own initiative, or a brief instructing
it to), it has no real slug to reach for and, per `editorial-rules.ts` item 2 ("use the EXACT crop
slug given in the context, never invent one"), can invent one anyway. `validate_recipe_crop_values`
correctly rejects that as `INGREDIENT_CROP_UNKNOWN`; without a guard, that sinks the WHOLE job at
`WRITER_DRAFT_VALIDATION_FAILED` (`retryable: false`) — permanently, with no Step 08B-style
recovery, since (unlike `revise-stage.ts`) nothing here re-validates a corrected draft.

`write-stage.ts` now closes this the same way `revise-stage.ts` closes Step 08B: `validateDraft()`
runs once as usual; if any `INGREDIENT_CROP_UNKNOWN` issues come back, every ingredient they name
is forced from `crop: <invented slug>` to `crop: null, freeTextName: <humanized slug>` via the
SAME shared `../crop-slug-guard.ts` module `revise-stage.ts` imports (see that file and
`../README.md` for why it lives at the `recipe-automation/` root, not duplicated per stage), and
`validateDraft()` runs a second time against the corrected draft. The success-path telemetry
carries `forcedCropFallbackIndices` when this fired, mirroring `revise-stage.ts`'s own output field
of the same name.

## A live-verified finding worth knowing before touching `agent-runner.ts`'s `outputSchema`

Every top-level Zod schema in this pipeline (`recipeDraftPayloadSchema`, `recipeQAResultSchema`,
`recipePlanBatchSchema`) is `.strict().refine(...)`-shaped, and two things about that specifically
break `@openai/agents`' `outputType` conversion to an OpenAI Structured Outputs JSON Schema — see
`infra/agent-runner.ts`'s `sanitizeForStructuredOutput()` for the full write-up, the fix, and the
Step 06 completion report for the live reproduction. In short: `.refine()` wrappers and
`z.string().url()` fields are unwrapped/loosened ONLY for what the SDK is told to target; every
caller still re-validates the SDK's raw output against the FULL original schema afterward, so
nothing here weakens what actually gets stored.

## Running the tests

Same convention as `../infra/`:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/writer/
```

`write-stage.test.ts` uses `../infra/testing/fake-supabase-client.ts` plus a fake `AgentRunner` —
no live model call, no live Supabase project. For the Postgres-layer half of this vertical slice
(the SAME live-captured kabak draft run through the real validation RPCs and stored, with the
idempotency unique-constraint check), see
`supabase/tests/f2_recipe_automation/02_write_stage_vertical_slice.sql`.

`../crop-slug-guard.ts`'s own standalone suite (shared with `revise/`, see Step 06B above) runs
separately, from the `recipe-automation/` root:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/crop-slug-guard.test.ts
```
