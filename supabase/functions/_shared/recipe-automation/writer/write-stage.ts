// F2 Recipe Automation — Step 06: recipe-stage-write orchestration (the Writer vertical slice).
//
// Implements PROMPT 06 end to end for exactly one stage: claim a `write`-stage job, load its
// immutable brief + crop context through narrow read/RPC helpers (context.ts), run the Recipe
// Writer through the shared agent-runner seam with a required structured-output schema, validate
// the result through the Step 04 Postgres RPCs (validate-draft.ts), store draft version 1 only
// after both the Zod parse and the Postgres validations pass, record stage-run telemetry, and
// atomically advance to `qa` + dispatch it — using `advanceStageAndDispatch` (P5) so that ordering
// is structural, not a comment-only convention.
//
// Writer restrictions enforced here (not just in the prompt): the agent is given ZERO tools (see
// the `createAgentRunner().run(...)` call below — no `tools` field is ever passed), so there is no
// generic Supabase/SQL surface, no live-recipe-write capability, and no publish access reachable
// from agent output at all — every read (brief, crop context) happens BEFORE the call via
// context.ts, and every write (recipe_drafts only, never `recipes`) happens AFTER it, entirely in
// this trusted stage-runner code the agent's output can only ever flow through, never invoke.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { claimJob, releaseLock } from "../infra/job-lock.ts";
import { failJob } from "../infra/job-state.ts";
import { advanceStageAndDispatch } from "../infra/stage-dispatch.ts";
import { recordStageRun } from "../infra/telemetry.ts";
import { createAgentRunner, type AgentRunner } from "../infra/agent-runner.ts";
import { RecipeAutomationError, toSafeErrorPayload } from "../infra/errors.ts";
import { recipeDraftPayloadSchema } from "../schemas.ts";
import type { RecipeDraftPayload } from "../types.ts";
import { briefFromJobRow, loadCropContext, type WriteStageBrief } from "./context.ts";
import { buildWriterSystemPrompt } from "./system-prompt.ts";
import { validateDraft } from "./validate-draft.ts";

const WRITE_STAGE = "write" as const;
const NEXT_STAGE = "qa" as const;
const NEXT_STAGE_FUNCTION_NAME = "recipe-stage-qa";
const WRITER_MODEL_ENV_VAR = "RECIPE_WRITER_MODEL";

export interface RunWriteStageParams {
  jobId: string;
  /** Injectable for tests — defaults to createAgentRunner() (the real SDK-backed runner). */
  agentRunner?: AgentRunner;
  workerId?: string;
}

export type RunWriteStageOutcome =
  | "not_claimed"
  | "agent_call_failed"
  | "invalid_output"
  | "validation_failed"
  | "stored"
  | "already_stored";

export interface RunWriteStageResult {
  outcome: RunWriteStageOutcome;
  jobId: string;
  draftId?: string;
  claimReason?: string;
  errorCode?: string;
}

/** "no photo" spellings observed across multiple live probe runs (F2 Step 06, P1 preflight — see
 * the completion report) for `coverPhotoUrl`/`steps[].photoUrl` when the model has no real photo to
 * link (always true for the Writer — image generation is a later pipeline stage; see
 * editorial-rules.ts item 8): an empty string, and the literal string `"null"` (not the JSON null
 * value) — OpenAI's Structured Outputs mode requires every property to be present as SOME string,
 * so the model substitutes one of these instead of the `null` the prompt asks for. Deliberately
 * narrow: anything else (a non-empty, non-URL string like "n/a" or garbled text) is a genuinely
 * malformed value and must still fail validation as before — only these two known-equivalent
 * "no photo" spellings are coerced. */
const NO_PHOTO_PLACEHOLDER_VALUES = new Set(["", "null"]);

/**
 * Normalizes the known "no photo" placeholder spellings (see `NO_PHOTO_PLACEHOLDER_VALUES` above)
 * to `null` BEFORE validation, so `recipeDraftPayloadSchema`'s `.url()` check (which correctly
 * rejects both — neither is a valid URL nor JSON `null`) doesn't reject semantically-valid "no
 * photo" output. This is not a validation weakening: every other string still goes through
 * `.url()` unchanged and is rejected exactly as before if it isn't a real URL.
 */
function normalizeEmptyUrlFields(output: Record<string, unknown>): Record<string, unknown> {
  const normalizeUrl = (value: unknown) =>
    typeof value === "string" && NO_PHOTO_PLACEHOLDER_VALUES.has(value) ? null : value;
  const steps = Array.isArray(output.steps)
    ? output.steps.map((step) =>
      step && typeof step === "object"
        ? { ...(step as Record<string, unknown>), photoUrl: normalizeUrl((step as Record<string, unknown>).photoUrl) }
        : step
    )
    : output.steps;
  return {
    ...output,
    coverPhotoUrl: normalizeUrl(output.coverPhotoUrl),
    steps,
  };
}

function draftToInsertRow(jobId: string, draft: RecipeDraftPayload, normalizedIngredients: RecipeDraftPayload["ingredients"]) {
  return {
    job_id: jobId,
    version: 1,
    title: draft.title,
    description: draft.description,
    cover_photo_url: draft.coverPhotoUrl,
    servings: draft.servings,
    prep_minutes: draft.prepMinutes,
    cook_minutes: draft.cookMinutes,
    rest_minutes: draft.restMinutes,
    difficulty: draft.difficulty,
    cuisine: draft.cuisine,
    diet_tags: draft.dietTags,
    allergen_labels: draft.allergenLabels,
    required_equipment: draft.requiredEquipment,
    source_type: draft.sourceType,
    author_type: draft.authorType,
    visibility: draft.visibility,
    owner_id: draft.ownerId,
    extraction_confidence: draft.extractionConfidence,
    ingredients: normalizedIngredients,
    steps: draft.steps,
  };
}

async function findExistingVersion1Draft(client: SupabaseClient, jobId: string): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("recipe_drafts")
    .select("id")
    .eq("job_id", jobId)
    .eq("version", 1)
    .maybeSingle();
  if (error) {
    throw new RecipeAutomationError({
      code: "DRAFT_EXISTENCE_CHECK_FAILED",
      message: "failed to check for an existing version-1 draft",
      stage: WRITE_STAGE,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as { id: string } | null) ?? null;
}

async function runWriterAgent(
  client: SupabaseClient,
  agentRunner: AgentRunner,
  jobId: string,
  brief: WriteStageBrief,
) {
  const cropContext = brief.focusCrop ? await loadCropContext(client, brief.focusCrop) : null;
  return agentRunner.run({
    agentName: "recipe-writer",
    systemPrompt: buildWriterSystemPrompt(),
    // Deliberately no `tools` field — the Writer agent has zero callable tools. Every read it
    // needs is already folded into this input; it can only return structured output, never call
    // back into Supabase/SQL or anything else.
    input: { jobId, brief, cropContext },
    outputSchema: recipeDraftPayloadSchema,
    model: Deno.env.get(WRITER_MODEL_ENV_VAR) || undefined,
  });
}

/**
 * Runs the write stage for one job. Never throws for an ordinary content/provider failure — those
 * are reported via `failJob` and reflected in the returned `outcome`; only an unexpected
 * infrastructure error (a DB call that itself failed) throws, the same convention job-lock.ts/
 * job-state.ts already use.
 */
export async function runWriteStage(
  client: SupabaseClient,
  params: RunWriteStageParams,
): Promise<RunWriteStageResult> {
  const claim = await claimJob(client, {
    jobId: params.jobId,
    expectedStage: WRITE_STAGE,
    workerId: params.workerId,
  });
  if (!claim.claimed) {
    return { outcome: "not_claimed", jobId: params.jobId, claimReason: claim.reason };
  }

  const { row, lockToken } = claim.job;
  const brief = briefFromJobRow(row);
  const attempt = Number(row.attempt ?? 1);
  const agentRunner = params.agentRunner ?? createAgentRunner();

  // Idempotency (PROMPT 06): a version-1 draft may already exist from a prior attempt that
  // produced and stored a valid draft, then crashed/timed out BEFORE advancing the job (leaving
  // it still claimable at `write`). Detect that first and skip the agent call entirely — no
  // duplicate spend, no attempt to insert a second version-1 row.
  let existing: { id: string } | null;
  try {
    existing = await findExistingVersion1Draft(client, params.jobId);
  } catch (e) {
    await releaseLock(client, { jobId: params.jobId, lockToken });
    throw e;
  }

  if (existing) {
    const advanceResult = await advanceStageAndDispatch(
      client,
      { jobId: params.jobId, lockToken, fromStage: WRITE_STAGE, toStage: NEXT_STAGE, toStatus: "queued" },
      { functionName: NEXT_STAGE_FUNCTION_NAME, payload: { batchId: brief.batchId } },
    );
    void advanceResult; // best-effort — see advanceStageAndDispatch's own contract
    return { outcome: "already_stored", jobId: params.jobId, draftId: existing.id };
  }

  const startedAt = new Date().toISOString();

  let agentResult;
  try {
    agentResult = await runWriterAgent(client, agentRunner, params.jobId, brief);
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "WRITER_AGENT_CALL_FAILED",
      stage: WRITE_STAGE,
      retryable: e instanceof RecipeAutomationError ? e.retryable : true,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: WRITE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: WRITE_STAGE, error });
    return { outcome: "agent_call_failed", jobId: params.jobId, errorCode: error.code };
  }

  const parsed = recipeDraftPayloadSchema.safeParse({
    ...normalizeEmptyUrlFields(agentResult.output as Record<string, unknown>),
    jobId: params.jobId,
    briefId: brief.briefId,
  });

  if (!parsed.success) {
    const error = toSafeErrorPayload(parsed.error, {
      code: "WRITER_OUTPUT_SCHEMA_INVALID",
      stage: WRITE_STAGE,
      retryable: false,
    });
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: WRITE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: WRITE_STAGE, error });
    return { outcome: "invalid_output", jobId: params.jobId, errorCode: error.code };
  }

  const draft = parsed.data;
  const validation = await validateDraft(client, draft);
  const blockingIssues = validation.issues.filter((issue) => issue.severity === "blocking");

  if (!validation.valid || blockingIssues.length > 0) {
    const error = toSafeErrorPayload(
      `draft failed Postgres validation: ${blockingIssues.map((i) => i.code).join(", ")}`,
      { code: "WRITER_DRAFT_VALIDATION_FAILED", stage: WRITE_STAGE, retryable: false },
    );
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: WRITE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: { issues: blockingIssues },
      provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: WRITE_STAGE, error });
    return { outcome: "validation_failed", jobId: params.jobId, errorCode: error.code };
  }

  const insertResult = await client
    .from("recipe_drafts")
    .insert(draftToInsertRow(params.jobId, draft, validation.normalizedIngredients))
    .select("id")
    .single();

  let draftId: string;
  if (insertResult.error) {
    // A unique(job_id, version) collision means a concurrent/duplicate invocation already stored
    // version 1 between our existence check and this insert — treat that as the idempotent
    // success case rather than an error, instead of failing a job that actually has a valid draft.
    const raced = await findExistingVersion1Draft(client, params.jobId);
    if (!raced) {
      throw new RecipeAutomationError({
        code: "DRAFT_INSERT_FAILED",
        message: "recipe_drafts insert failed",
        stage: WRITE_STAGE,
        retryable: true,
        details: { pgCode: (insertResult.error as { code?: string }).code },
      });
    }
    draftId = raced.id;
  } else {
    draftId = (insertResult.data as { id: string }).id;
  }

  await recordStageRun(client, {
    jobId: params.jobId, batchId: brief.batchId, stage: WRITE_STAGE, status: "completed",
    attempt, startedAt, finishedAt: new Date().toISOString(),
    output: { draftId, version: 1, candidateSlug: validation.candidateSlug },
    provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
  });

  const advanceResult = await advanceStageAndDispatch(
    client,
    { jobId: params.jobId, lockToken, fromStage: WRITE_STAGE, toStage: NEXT_STAGE, toStatus: "queued" },
    { functionName: NEXT_STAGE_FUNCTION_NAME, payload: { batchId: brief.batchId } },
  );
  void advanceResult; // best-effort — see advanceStageAndDispatch's own contract

  return { outcome: "stored", jobId: params.jobId, draftId };
}
