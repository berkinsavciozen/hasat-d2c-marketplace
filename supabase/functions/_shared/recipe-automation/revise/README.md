# Recipe Revise — the F2 Step 08 vertical slice

The revision-loop stage-runner: `revise`. Implements PROMPT 08 end to end — "the Writer in
constrained revision mode" — for a job QA routed here with a `revision_required` decision. The
actual HTTP entrypoint is `../../recipe-stage-revise/index.ts`; everything here is the
orchestration/content logic that entrypoint delegates to, kept HTTP-free so it's directly
unit-testable.

## Modules

| File | Purpose |
|---|---|
| `revise-stage.ts` | `runReviseStage()` — claim the job, resolve the current draft + the QA result that sent it here, enforce the two-automatic-revision cap, check idempotency, derive the allowed-change surface and reject an unlocatable blocking issue (Step 08A, see below), run the Reviser agent, reject a candidate that changed anything outside that surface (Step 08A), validate its output (Zod + the Step 04 Postgres RPCs), store it as the NEXT draft version, record telemetry, and route back to `qa` with `revision_count` incremented atomically. |
| `allowed-changes.ts` | Step 08A: `computeAllowedChangeSurface()` derives a deterministic, per-field/per-index mutation surface from `blockingIssues` alone; `findOutOfScopeChanges()` diffs the candidate draft against the exact previous one and reports every change outside that surface. See below. |
| `context.ts` | `loadLatestQaResult()`/`loadDraftByVersion()` — the reads this stage needs: the LATEST `recipe_qa_results` row for the job, and the EXACT `recipe_drafts` row at the version that result named (see this file's own module header for why "latest QA result", not "current highest draft version"). |
| `revise-rules.ts` | Content-level constraints a JSON Schema can't express: fix only what `blockingIssues` flags, restate everything else byte-for-byte, never touch `jobId`/`briefId`/`sourceType`/`authorType`/`visibility`/`ownerId`/photo fields as part of a content revision. `allowed-changes.ts` is the mechanical check that this actually happened, not just an instruction the model is told. |
| `system-prompt.ts` | Assembles the Reviser agent's system prompt from the revision rules + a short framing paragraph. |

`../writer/context.ts`'s `briefFromJobRow()`, `../writer/write-stage.ts`'s
`normalizeEmptyUrlFields()`, and `../writer/validate-draft.ts`'s `validateDraft()` are all reused
as-is — none of those are Writer-specific, they operate on the same job/draft row shape every
stage in this pipeline shares.

## Step 08A: constrained revision boundary enforcement

The finding this closes: revise-rules.ts item 2 always TOLD the Reviser agent "fix only blocking
issues and preserve everything else", but until now nothing MECHANICALLY checked that the agent
actually did — a model could accept a complete regenerated draft that changed an unrelated field
(or an identity/server-owned one) and it would pass through as long as it satisfied schema +
Postgres validation, neither of which has any notion of "unrelated to what QA flagged".

`allowed-changes.ts` closes this in two steps, both driven ONLY by `qaResult.blockingIssues` —
`nonBlockingSuggestions` is never consulted, so a non-blocking suggestion can never grant mutation
permission:

1. **`computeAllowedChangeSurface(blockingIssues)`** parses each issue's `field` against the SAME
   bracket-path convention the Step 04 Postgres validation RPCs already emit (`title`,
   `ingredients`, `ingredients[2]`, `ingredients[2].crop`, `steps[3]`, `steps[3].instruction` — see
   `20260819150000_f2s04_recipe_validation_rpcs.sql`'s own `format(...)` calls). A `field` that
   doesn't resolve to a recognized, mutable, in-range location — free text, an identity/pipeline
   field name, an index-less bracket like `steps[].stepNo` (`STEP_NO_NOT_NUMBER`'s own shape when
   it can't even identify which step) — grants nothing. If even ONE blocking issue is unresolvable
   this way, `revise-stage.ts` never calls the Reviser at all: it routes the job straight to manual
   review (the same resting state the revision-cap branch uses), because a QA verdict too vague to
   locate isn't one a targeted, mechanically-checked revision can safely act on.
2. **`findOutOfScopeChanges(previous, candidate, surface)`** diffs the Reviser's full candidate
   draft against the EXACT previous draft (never "the current highest version") and returns every
   changed field/index outside that surface. `revise-stage.ts` rejects the candidate outright if
   this returns anything — no partial acceptance of "the good part" of a drifted candidate.
   Identity/server-owned fields (`coverPhotoUrl`, `sourceType`, `authorType`, `visibility`,
   `ownerId`, `extractionConfidence`) and every step's `photoUrl` are checked UNCONDITIONALLY,
   regardless of what any issue names — never grantable, per revise-rules.ts items 5/9.

Both failure modes have their own outcome: `"unresolvable_blocking_issue"` (routes to manual
review, no agent call, no draft stored) and `"out_of_scope_change"` (rejects via `failJob` with
`retryable: true` — the SAME job stays claimable at `revise` afterward, so a rejected candidate
never consumes a draft version or `revision_count`; only a genuinely accepted revision does, via
the existing `advanceStageAndDispatch` path).

Deliberately conservative, not exhaustive — see `allowed-changes.ts`'s own module header for the
exact structural shapes it does and doesn't reconcile (e.g. it does not attempt to reconcile
revise-rules.ts item 6's "renumber remaining steps after an ingredient-driven step removal"; that
shape fails CLOSED — rejected as out-of-scope — rather than guessed at).

## Why "the Writer in constrained revision mode", not a new agent

PROMPT 08 (`01_Claude_Orchestrator_Prompt_Queue.md`) describes this stage as the Writer run with a
narrower brief: same `recipeDraftPayloadSchema` output contract, same crop/allergen/step
conventions, but constrained to fixing exactly what QA flagged. `revise-rules.ts` restates the
relevant Writer conventions inline (rather than importing `../writer/editorial-rules.ts`) so the
Reviser's complete instruction set is readable in one file, with one addition editorial-rules.ts
doesn't need: "do not change anything the blocking issues did not flag" (item 2) — the one rule
that makes this a targeted revision instead of a second, independent draft.

## The two-automatic-revision cap

`recipe_generation_jobs.revision_count` (int, `check (revision_count >= 0 and revision_count <=
2)` — 20260819120000_f2s03_recipe_automation_schema.sql) is the counter. `revise-stage.ts` reads it
off the freshly-claimed job row, BEFORE doing any work: if it's already at `MAX_AUTOMATIC_REVISIONS`
(2), this would be a THIRD automatic revision attempt — refused outright (no agent call, no new
draft version), and the job is routed straight to the same manual-review resting state QA's own
`manual_review_required` decision uses (`stage='qa', status='awaiting_approval'`), via
`advanceStage` directly (no next-stage function to dispatch to for a human decision — same
rationale as `qa/qa-stage.ts`'s own manual-review path). Otherwise, once a revision is
successfully stored, `revision_count` is incremented via `advanceStageAndDispatch`'s own `patch`
parameter, so the CAS stage transition and the counter increment commit together atomically — no
separate update, no window where one could happen without the other.

## Revise restrictions, and where each is actually enforced

- **No direct live recipe writes**: `revise-stage.ts` only ever writes to `recipe_drafts`. It never
  imports or references `recipes`/`recipe_ingredients`/`recipe_steps`, and never writes
  `recipe_qa_results` itself — the new draft version is re-graded fresh by `qa` on the next pass,
  not self-certified here.
- **No generic Supabase or SQL tool**: the agent itself is given **zero tools** (see the
  `agentRunner.run(...)` call in `revise-stage.ts` — no `tools` field). Every read the Reviser
  needs (brief, previous draft, QA blocking issues) happens BEFORE the call via `context.ts` +
  `../qa/context.ts`; the only write happens AFTER it, in trusted stage-runner code the model's
  output can only flow through, never invoke.
- **"Structured QA blocking issues only" as input, not the full QA result** (PROMPT 08): the
  Reviser agent is handed `blockingIssues` alone — never `scores`, `nonBlockingSuggestions`, or
  `safetyReview` — see `runReviserAgent`'s `input` object. Keeps this a targeted fix, not a second
  QA judgment call.
- **`jobId`/`briefId` are server-forced, never trusted from the agent's output**: identical pattern
  to `write-stage.ts`/`qa-stage.ts` — `parsed = recipeDraftPayloadSchema.safeParse({ ...output,
  jobId: params.jobId, briefId: brief.briefId })`.
- **Output is a complete new draft, never a patch** (PROMPT 08): `recipeDraftPayloadSchema` has no
  partial/patch variant — the Reviser's raw output is parsed against the exact same full schema
  the Writer's output is, and stored as a whole new `recipe_drafts` row. Nothing in this stage
  merges the agent's output onto the previous draft; the agent is *instructed* (rules item 2) to
  restate unaffected fields itself.
- **Retry/double invocation cannot create two draft versions with the same number** (PROMPT 08):
  `recipe_drafts_job_id_version_key` (`unique(job_id, version)` —
  20260819120000_f2s03_recipe_automation_schema.sql) is the DB-level guarantee; `revise-stage.ts`'s
  own pre-insert `findExistingDraftVersion` check plus its "on unique_violation, re-check and treat
  as idempotent success" insert handling (mirrors `write-stage.ts`'s own version-1 insert exactly)
  is the application-level half of the same guarantee — race-safe at the DB layer either way,
  unlike QA's own `recipe_qa_results` idempotency check (see `../qa/README.md`'s "known gap").

## A previously-known gap, now closed (Step 08A)

`qa/README.md` used to flag `recipe_qa_results` having no DB-level uniqueness on `(job_id,
draft_id, draft_version)` as "known, out of scope for that step" — two genuinely concurrent QA
invocations against the same draft version could each pass `qa-stage.ts`'s own
check-then-insert idempotency check before either inserted, producing two rows for one draft
version. Step 08A added `recipe_qa_results_job_draft_version_key` (unique on `(job_id, draft_id,
draft_version)`) to `20260819120000_f2s03_recipe_automation_schema.sql` — an in-place correction,
since all three F2 migrations remain unapplied to any environment — with a fresh-DB regression
test in `03_qa_stage_vertical_slice.sql` (`supabase/tests/f2_recipe_automation/`). This module's own
`loadLatestQaResult` (anchored on "most recent by `checked_at`") no longer has to arbitrate between
two rows that should never have coexisted in the first place.

## Running the tests

Same convention as `../infra/`/`../writer/`/`../qa/`:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/revise/
```

`revise-stage.test.ts` uses `../infra/testing/fake-supabase-client.ts` plus a fake `AgentRunner` —
no live model call, no live Supabase project. `allowed-changes.test.ts` is standalone by design —
it only imports `../types.ts` (pure Zod-inferred types) and the shared fixtures, never
`revise-stage.ts`/`../infra/agent-runner.ts` — so it has no Supabase/OpenAI dependency at all and
can run on its own:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/revise/allowed-changes.test.ts
```
