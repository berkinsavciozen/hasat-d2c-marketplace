# Recipe Revise — the F2 Step 08 vertical slice

The revision-loop stage-runner: `revise`. Implements PROMPT 08 end to end — "the Writer in
constrained revision mode" — for a job QA routed here with a `revision_required` decision. The
actual HTTP entrypoint is `../../recipe-stage-revise/index.ts`; everything here is the
orchestration/content logic that entrypoint delegates to, kept HTTP-free so it's directly
unit-testable.

## Modules

| File | Purpose |
|---|---|
| `revise-stage.ts` | `runReviseStage()` — claim the job, resolve the current draft + the QA result that sent it here, enforce the two-automatic-revision cap, check idempotency, run the Reviser agent, validate its output (Zod + the Step 04 Postgres RPCs), store it as the NEXT draft version, record telemetry, and route back to `qa` with `revision_count` incremented atomically. |
| `context.ts` | `loadQaResultForDraft()` — the ONE new read this stage needs: the `recipe_qa_results` row tied to the exact current draft. The current draft itself is loaded via `../qa/context.ts`'s `loadCurrentDraft()`, reused as-is. |
| `revise-rules.ts` | Content-level constraints a JSON Schema can't express: fix only what `blockingIssues` flags, restate everything else byte-for-byte, never touch `jobId`/`briefId`/`sourceType`/`authorType`/`visibility`/`ownerId`/photo fields as part of a content revision. |
| `system-prompt.ts` | Assembles the Reviser agent's system prompt from the revision rules + a short framing paragraph. |

`../writer/context.ts`'s `briefFromJobRow()`, `../writer/write-stage.ts`'s
`normalizeEmptyUrlFields()`, `../writer/validate-draft.ts`'s `validateDraft()`, and
`../qa/context.ts`'s `loadCurrentDraft()` are all reused as-is — none of those are Writer/QA-
specific, they operate on the same job/draft row shape every stage in this pipeline shares.

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

## Running the tests

Same convention as `../infra/`/`../writer/`/`../qa/`:

```sh
deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/revise/
```

`revise-stage.test.ts` uses `../infra/testing/fake-supabase-client.ts` plus a fake `AgentRunner` —
no live model call, no live Supabase project.
