# Recipe Automation — canonical contracts

Zod schemas (`schemas.ts`) and their inferred TypeScript types (`types.ts`) for every payload
that crosses a stage boundary in the F2 Recipe Automation pipeline. See
`docs/recipe-automation/00-repo-audit-decision-log.md` and
`docs/recipe-automation/01-runtime-feasibility-spikes.md` for the live-schema evidence and
runtime findings these contracts are built against.

No agents or edge functions are implemented here — this is the shared validation layer later
stages (plan, write, qa, revise, image, finalize, awaiting_approval, publish) import. The
persistence tables (`supabase/migrations/20260819120000_f2s03_recipe_automation_schema.sql`) and
validation RPCs (`supabase/migrations/20260819150000_f2s04_recipe_validation_rpcs.sql`) mirror
these contracts field-for-field; see `supabase/tests/f2_recipe_automation/` for their SQL test
suite.

**Step 03A (foundation reconciliation, PRs #40–#42):** the stage/status enums, `RecipeQAResult`,
and `RecipePlanBatch` below were realigned to RecipeAutomation.md §3/§5.3's canonical
state-machine and QA-routing contract. In particular: `RecipeJobStage`/`RecipeJobStatus` now use
the Master Plan's own vocabulary verbatim (`plan|write|qa|revise|image|finalize|
awaiting_approval|publish` / `queued|running|retryable|failed|awaiting_approval|approved|
rejected|completed|cancelled`); `RecipeQAResult` carries `draftId`/`draftVersion`, a `decision`
(`approved|revision_required|manual_review_required`), named `scores`, and split
`blockingIssues`/`nonBlockingSuggestions` (see `recipeQAIssueSchema` — the same shape the Step 04
RPCs' `issues` arrays now emit); and `RecipePlanBatch` no longer carries a singular `jobId`
(one plan produces many briefs; `RecipeBrief.briefId` is the stable identity that survives into
drafting/QA/revision history instead).

## Running the tests

This repo has no existing Edge Function test convention (see decision log §5), so this module
uses Deno's built-in test runner directly:

```sh
deno test --allow-net supabase/functions/_shared/recipe-automation/schemas.test.ts
```

`--allow-net` is required only to fetch the `npm:zod@3.23.8` dependency on first run (cached
afterwards); no network calls happen inside the tests themselves. The suite uses Deno's built-in
`node:assert` instead of `jsr:@std/assert` / `deno.land/std` so it has no dependency on hosts an
egress policy might block.

For the migration/RPC SQL test suite (fresh-database apply + assertions), see
`supabase/tests/f2_recipe_automation/run.sh`.
