# Recipe QA — the F2 Step 07 vertical slice

The second content-agent stage-runner in the pipeline: `qa`. Implements PROMPT 07 end to end for
the current draft of a job that has already cleared the `write` stage. The actual HTTP entrypoint
is `../../recipe-stage-qa/index.ts`; everything here is the orchestration/content logic that
entrypoint delegates to, kept HTTP-free so it's directly unit-testable.

## Modules

| File | Purpose |
|---|---|
| `qa-stage.ts` | `runQAStage()` — claim the job, resolve the current draft, check idempotency, run deterministic Postgres validation, run the QA agent, validate its output, store the `RecipeQAResult`, record telemetry, route (approved -> image, revision_required -> revise, manual_review_required -> parked at `qa`). The one place all of the above is sequenced. |
| `context.ts` | Narrow read/RPC helpers: `loadCurrentDraft()` (highest-`version` `recipe_drafts` row for a job, rebuilt into a `RecipeDraftPayload`), `loadDuplicateCandidates()` (calls ONLY `find_recipe_duplicates`), `loadPriorQaHistory()` (prior `recipe_qa_results` rows for this job, most recent first — no reviewer PII). |
| `qa-rules.ts` | Content-level evaluation rules a JSON Schema can't express: how the five named `scores` map to "cooking plausibility" and "unsupported health claims" (neither has its own score bucket), the independent temperature/timing/allergen safety flags, the never-set-`safetyReview.approved` restriction, and the approved/revision_required/manual_review_required routing rule. |
| `system-prompt.ts` | Assembles the QA agent's system prompt from the evaluation rules + a short framing paragraph. |

`writer/validate-draft.ts` (the Step 04 Postgres RPC aggregation) and `writer/context.ts`'s
`briefFromJobRow()`/`slug.ts`'s `slugifyTitle()` are reused as-is from the Writer stage — none of
those are Writer-specific, they operate on a draft/job row shape common to both stages.

## QA restrictions, and where each is actually enforced

- **No direct live recipe writes**: `qa-stage.ts` only ever writes to `recipe_qa_results`. It never
  imports or references `recipes`/`recipe_ingredients`/`recipe_steps`.
- **No generic Supabase or SQL tool**: the agent itself is given **zero tools** (see the
  `agentRunner.run(...)` call in `qa-stage.ts` — no `tools` field). Every read the QA agent needs
  (brief, current draft, deterministic validation output, duplicate candidates, prior QA history)
  happens BEFORE the call via `context.ts` + `writer/validate-draft.ts`; the only write happens
  AFTER it, in trusted stage-runner code the model's output can only flow through, never invoke.
- **QA score can never bypass human safety review or publish approval**: `qa-stage.ts` never sets
  `recipe_qa_results.safety_approved`/`safety_reviewed_by`/`safety_reviewed_at` — those stay null,
  written only by a human at a later gate. `recipeQAResultSchema`'s own refine (schemas.ts) already
  rejects any agent output that tries to set `safetyReview.approved=true` without a reviewer
  identity/timestamp neither the agent nor this stage has access to, and the DB-level CHECK on
  `recipe_qa_results.safety_approved` enforces the same rule independently of the Zod layer.
- **Independent temperature/timing/allergen flags**: `qa-rules.ts` instructs the agent to set these
  three `safetyReview` sub-flags independently of its overall `decision` — `recipeSafetyReviewSchema`
  (schemas.ts) requires `requiresHumanReview: true` on every result regardless of content, so this
  can never be silently dropped.
- **Deterministic validation runs BEFORE the agent, not after**: a blocking Postgres-level finding
  against the current draft fails the job (`outcome: "deterministic_validation_failed"`) without
  ever spending an agent call — mirrors `write-stage.ts`'s own validation gate, one stage later.

## A known gap, out of scope for this step

`recipe_qa_results` has no DB-level unique constraint on `(job_id, draft_id, draft_version)` (only
the composite FK to `recipe_drafts`, which is about ownership, not multiplicity) — unlike
`recipe_drafts_job_id_version_key`, which is what makes the Writer stage's own idempotency check
race-safe at the DB layer. `qa-stage.ts`'s idempotency check (`findExistingQaResult` in
`qa-stage.ts`) is therefore an application-level check-then-insert, not a DB-enforced one: two
genuinely concurrent invocations against the same draft could each pass the check before either
inserts, producing two `recipe_qa_results` rows for the same draft. A migration adding that unique
constraint would close this gap, but `supabase/migrations/**` is outside this step's allowed paths
(see the Step 07 task brief) — flagged here and in the Step 07 completion report rather than fixed.

## Running the tests

Same convention as `../infra/`/`../writer/`:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/qa/
```

`qa-stage.test.ts` uses `../infra/testing/fake-supabase-client.ts` plus a fake `AgentRunner` — no
live model call, no live Supabase project.
