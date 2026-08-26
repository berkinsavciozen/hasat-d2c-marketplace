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

**Step 05 (Edge Function infrastructure):** `infra/` (this directory) holds the shared,
content-agent-agnostic Edge Function plumbing every stage-runner imports — admin/dispatch
auth, the service-role client, atomic job claim, compare-and-set stage transitions, next-stage
dispatch, the agent-runner seam, error/redaction helpers, and stage-run telemetry. See
`infra/README.md`.

**Step 06 (Writer vertical slice):** `writer/` holds the first content agent — `recipe-stage-write`
(entrypoint at `../recipe-stage-write/index.ts`), for one manually created kabak `RecipeBrief`. See
`writer/README.md`. `infra/agent-runner.ts`'s SDK path is now implemented for real (the Step 01
live-call gate passed — see that file's header).

**Step 07 (QA vertical slice):** `qa/` holds the second content agent — `recipe-stage-qa`
(entrypoint at `../recipe-stage-qa/index.ts`) — claims a `qa`-stage job, resolves the exact current
draft version, re-runs the Step 04 deterministic Postgres validations (reusing `writer/
validate-draft.ts` as-is — those checks are draft-shape checks, not Writer-specific), calls the QA
agent with the brief/draft/validation/duplicate-candidates/prior-QA-history, stores the resulting
`RecipeQAResult`, and routes the job (approved -> image, revision_required -> revise,
manual_review_required -> stays at `qa` with status=awaiting_approval, a human review queue). See
`qa/README.md`.

**Step 08 (revise-loop vertical slice):** `revise/` holds the third content agent —
`recipe-stage-revise` (entrypoint at `../recipe-stage-revise/index.ts`) — "the Writer in
constrained revision mode": claims a `revise`-stage job, resolves the LATEST QA result for it and
the exact draft version that result reviewed (not "the current highest version" — see
`revise/context.ts`'s header for why that distinction matters once this stage itself starts
creating new draft versions), enforces the two-automatic-revision cap
(`recipe_generation_jobs.revision_count`, capped at 2 by both a DB CHECK and this stage's own
routing logic — after the cap, routes to the same manual-review resting state QA's own
`manual_review_required` uses instead of looping), runs the Reviser agent with the previous draft +
QA blocking issues only (never the full QA result), stores the result as the NEXT draft version
(never a patch, never overwriting a prior version), and routes back to `qa` with `revision_count`
incremented atomically in the same CAS update via `advanceStageAndDispatch`'s `patch` parameter.
See `revise/README.md`. Still no Planner/Image/Finalize logic.

**Step 09 (Image vertical slice):** `image/` holds the fourth content agent —
`recipe-stage-image` (entrypoint at `../recipe-stage-image/index.ts`) — claims an `image`-stage
job, loads the exact QA-approved draft (`context.ts`), builds the Gemini prompt deterministically
from the draft (`prompt.ts` — see its header for why this is NOT an agent-runner call, unlike
Writer/QA/Reviser), generates one square source image via the Lovable AI Gateway
(`gemini-client.ts` — Gate A: adopts whatever that route actually returns, no new infra added to
chase 2048; see the Step 09 completion report), chops 14% off the right/bottom and center-crops
16:9 + 1:1 with no resize (`geometry.ts`, `imagescript` via `jsr:@matmen/imagescript`), encodes
WebP q82 with metadata stripped by construction (`webp-codec.ts` — Gate B: `@jsquash/webp`, its
known WASM self-locate/init failure fixed by vendoring the `.wasm` binaries and manually
instantiating them — see `vendor/README.md`), runs a warning-only outer-pixel frame-suspicion
check (`frame-suspicion.ts` — never auto-repairs, never blocks), uploads to the existing
`crop-photos` bucket (`storage.ts`), stores `recipe_assets` rows, and advances to `finalize`.
Idempotent per (job, draft, asset_type) — reuses an existing source/variant instead of paying for
another Gemini generation. **Sandbox note:** `geometry.ts`/`gemini-client.ts`/`image-stage.ts`
and their test files depend on `jsr:@matmen/imagescript`, which is blocked in the Claude Code
session that wrote this step (same class of pre-existing limitation as `esm.sh` blocking
`supabase-admin.test.ts`) — `webp-codec.ts` (Gate B) has no such dependency and was fully verified.

**Step 11 (Admin review surface):** `admin/` holds the pipeline's first human-facing surface — the
admin review of a job parked at `awaiting_approval` (batch/job list, draft detail with content/
images/QA/RPC-validation/revision-history/frame-warnings, and the four review actions: approve,
reject, request revision, retry failed stage). Entrypoints:
`../admin-recipe-jobs/index.ts`, `../admin-recipe-job-detail/index.ts`,
`../admin-recipe-review-action/index.ts` — same timing-safe `x-admin-key`/service-role auth
convention as `../admin-kpi/index.ts`, no `is_admin`/RLS/Lovable session. Approval is mechanically
gated by a NEW table, `recipe_admin_reviews`
(`../../migrations/20260826120000_f2s11_recipe_admin_reviews.sql`), whose own CHECK constraint
refuses an `action='approve'` row unless all five human-checklist items are true — see
`admin/README.md` for why this is a new table rather than `recipe_qa_results.safety_approved`.
Never invokes a `recipe-stage-*` Edge Function, never writes to `recipe_drafts`/`recipe_qa_results`/
`recipe_assets`. See `admin/README.md`.

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

`--allow-net` is required only to fetch the `npm:zod@3.25.76` dependency on first run (cached
afterwards); no network calls happen inside the tests themselves. The suite uses Deno's built-in
`node:assert` instead of `jsr:@std/assert` / `deno.land/std` so it has no dependency on hosts an
egress policy might block.

For the migration/RPC SQL test suite (fresh-database apply + assertions), see
`supabase/tests/f2_recipe_automation/run.sh`.
