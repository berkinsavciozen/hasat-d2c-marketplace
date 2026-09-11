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
import { sanitizeUnknownCropIngredients } from "../crop-slug-guard.ts";

const WRITE_STAGE = "write" as const;
const NEXT_STAGE = "qa" as const;
const NEXT_STAGE_FUNCTION_NAME = "recipe-stage-qa";
const WRITER_MODEL_ENV_VAR = "RECIPE_WRITER_MODEL";

/** Generous upper bound for the Writer's structured-output token budget — see
 * `AgentRunRequest.maxOutputTokens`'s own docstring for the root cause this closes
 * (AGENT_RUNNER_SDK_CALL_FAILED / "Unexpected end of JSON input" on long drafts, 2026-09-09, the
 * observed cutoff landing mid-object at ~43751 characters of JSON, job
 * ebefea4c-f829-46c6-89de-3ddcfd051746). A full draft can have up to 60 ingredients and 60 steps;
 * 16000 tokens leaves comfortable headroom over that observed cutoff for typical model tokenizers —
 * revisit against real usage.outputTokens numbers from recipe_generation_stage_runs if a draft this
 * size is still observed hitting the limit. */
const WRITER_MAX_OUTPUT_TOKENS = 16000;

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
  | "insert_failed"
  | "stored"
  | "already_stored";

export interface RunWriteStageResult {
  outcome: RunWriteStageOutcome;
  jobId: string;
  draftId?: string;
  claimReason?: string;
  errorCode?: string;
}

/**
 * Bracket paths (the same convention `../revise/allowed-changes.ts`'s `parseIssueFieldPath` uses for
 * QA-issue fields) identifying `coverPhotoUrl`/`steps[].photoUrl` — fields the Writer/Reviser agents
 * must NEVER see or produce a value for at all. Passed as `AgentRunRequest.excludeOutputFields` so
 * `sanitizeForStructuredOutput` drops them entirely from the schema handed to the SDK as
 * `outputType` (see that function's own doc comment).
 *
 * Root cause this replaces (F2 Step 06/08 P1 preflight, and the recurring
 * WRITER_OUTPUT_SCHEMA_INVALID / REVISER_OUTPUT_SCHEMA_INVALID failures that followed):
 * `coverPhotoUrl`/`steps[].photoUrl` are pipeline-owned — image generation happens in a LATER
 * pipeline stage (editorial-rules.ts item 8, revise-rules.ts item 9), so the Writer/Reviser never
 * have a real value to put here and are always instructed to emit `null`. But OpenAI's Structured
 * Outputs mode requires every property to be present as SOME string when the schema has one, so
 * across live runs the model kept substituting a NEW "no photo" spelling for null instead: an empty
 * string, the literal string `"null"`, the literal string `"photoUrl"` (the field's own key name;
 * jobs 72b46d4d-bc0e-4a76-91d4-b2a343a825f7/ce09b38b-77ad-45d2-815b-2787daf904fb,
 * WRITER_OUTPUT_SCHEMA_INVALID, 2026-09-09) — and most recently a fourth, never-seen-before spelling
 * on the Reviser (job 0a047964-12ca-4972-9416-12111f8b8cd8, "Elmalı Fındıklı Kahvaltı Bowl'u",
 * REVISER_OUTPUT_SCHEMA_INVALID, 2026-09-10). Coercing each known spelling to `null` before
 * validation (the previous fix, `normalizeEmptyUrlFields`/`NO_PHOTO_PLACEHOLDER_VALUES`) was
 * structurally whack-a-mole: it could only ever catch spellings already observed, and
 * `../revise/allowed-changes.ts` was ALSO unconditionally force-reverting both fields to the
 * previous draft's own value regardless of what the Reviser produced (`IMMUTABLE_TOP_LEVEL_FIELDS`,
 * `reconcileSteps`'s unconditional `merged.photoUrl = prevRec.photoUrl`) — meaning the Reviser could
 * never make either field stick even when it DID produce a valid value. Excluding both fields from
 * the model-facing schema entirely closes the whole failure class structurally: a model cannot
 * invent a "no value" spelling for a field it was never asked to fill in, so no future spelling can
 * ever reach `recipeDraftPayloadSchema`'s `.url()` check and fail it. */
export const PHOTO_FIELD_EXCLUDE_PATHS = ["coverPhotoUrl", "steps[].photoUrl"] as const;

/**
 * Fills in `coverPhotoUrl`/`steps[].photoUrl` on raw structured-output JSON that no longer contains
 * these keys at all (they were excluded from the schema via `PHOTO_FIELD_EXCLUDE_PATHS` — see that
 * constant's doc comment for why). `previous` is the exact prior draft version these values are
 * carried forward from verbatim (`null` for the Writer's first version — there is no prior draft
 * yet); steps are matched by their ORIGINAL `stepNo` (the same identity
 * `../revise/allowed-changes.ts` uses), falling back to `null` for any step with no previous
 * counterpart (a newly-added step, which can only happen when `revise-rules.ts`/`allowed-changes.ts`
 * granted `stepsWhole`). Exported so `../revise/revise-stage.ts` (F2 Step 08) can reuse it as-is: the
 * Reviser agent produces the same `RecipeDraftPayload` shape and is subject to the identical
 * structural constraint, not Writer-specific.
 */
export function mergeImmutablePhotoFields(
  output: Record<string, unknown>,
  previous: RecipeDraftPayload | null,
): Record<string, unknown> {
  const previousPhotoUrlByStepNo = new Map<number, string | null>();
  for (const step of previous?.steps ?? []) {
    previousPhotoUrlByStepNo.set(step.stepNo, step.photoUrl);
  }
  const steps = Array.isArray(output.steps)
    ? output.steps.map((step) => {
      if (!step || typeof step !== "object") return step;
      const stepRecord = step as Record<string, unknown>;
      const stepNo = stepRecord.stepNo;
      const photoUrl = typeof stepNo === "number" && previousPhotoUrlByStepNo.has(stepNo)
        ? previousPhotoUrlByStepNo.get(stepNo)!
        : null;
      return { ...stepRecord, photoUrl };
    })
    : output.steps;
  return {
    ...output,
    coverPhotoUrl: previous?.coverPhotoUrl ?? null,
    steps,
  };
}

/**
 * Extracts ONLY `coverPhotoUrl`/`steps[].photoUrl` from a raw (pre-validation) agent output, for
 * diagnostic use when `recipeDraftPayloadSchema.safeParse` fails — deliberately narrow (no other
 * field, no PII) so it's safe to attach to `recipe_generation_stage_runs.output`/`.error` even
 * though that raw output hasn't been validated yet. Transitional: now that
 * `PHOTO_FIELD_EXCLUDE_PATHS` keeps these fields out of the model-facing schema entirely, a parse
 * failure should never actually be caused by either of them again — this exists to make that
 * verifiable from stored telemetry instead of assumed.
 */
export function extractPhotoDiagnostics(output: unknown): Record<string, unknown> {
  const record = output && typeof output === "object" ? output as Record<string, unknown> : {};
  const stepsPhotoUrls = Array.isArray(record.steps)
    ? record.steps.map((step) => (step && typeof step === "object" ? (step as Record<string, unknown>).photoUrl : step))
    : undefined;
  return { coverPhotoUrl: record.coverPhotoUrl, stepsPhotoUrls };
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
    // Never `draft.ownerId` — same principle as the Planner's `briefId` override (plan-stage.ts):
    // the Writer is never trusted to generate an identity field itself. Unlike `briefId`, there is
    // no server-side "fresh identity" for this one either, because these drafts have no real user
    // owner at all — they are `authorType: "hasat"` (AI-authored). A model given zero instructions
    // about `ownerId` has been observed hallucinating a UUID here, which then violates
    // `recipe_drafts_owner_id_fkey` against `profiles.id`. Hard-code null instead of trusting it.
    owner_id: null,
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
    excludeOutputFields: PHOTO_FIELD_EXCLUDE_PATHS,
    maxOutputTokens: WRITER_MAX_OUTPUT_TOKENS,
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
    ...mergeImmutablePhotoFields(agentResult.output as Record<string, unknown>, null),
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
      // Diagnostic only — see extractPhotoDiagnostics's own doc comment. Should never actually be
      // implicated now that PHOTO_FIELD_EXCLUDE_PATHS keeps these fields out of the model-facing
      // schema entirely.
      output: extractPhotoDiagnostics(agentResult.output),
      provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
    });
    await failJob(client, { jobId: params.jobId, lockToken, stage: WRITE_STAGE, error });
    return { outcome: "invalid_output", jobId: params.jobId, errorCode: error.code };
  }

  let draft = parsed.data;
  let validation = await validateDraft(client, draft);
  let blockingIssues = validation.issues.filter((issue) => issue.severity === "blocking");

  // Step 06B (the Writer's equivalent of revise/crop-slug-guard.ts's Step 08B — see that module's
  // own header): the Writer is only ever given crop context for the brief's single `focusCrop`
  // (`runWriterAgent` above), never the full `crop_config` slug list. If it ever crop-matches an
  // ingredient outside that single focus crop, it has no real slug to reach for and can invent one,
  // exactly like the Reviser could before Step 08B. `validate_recipe_crop_values` correctly rejects
  // that as INGREDIENT_CROP_UNKNOWN; force-correct it server-side instead of letting a single
  // invented slug sink the whole job at WRITER_DRAFT_VALIDATION_FAILED (retryable: false), then
  // re-run the full Postgres validation pass exactly once against the corrected draft — the same
  // "override then re-validate" shape revise-stage.ts uses.
  const unknownCropIssues = blockingIssues.filter((issue) => issue.code === "INGREDIENT_CROP_UNKNOWN");
  let sanitizedCropIndices: number[] = [];
  if (unknownCropIssues.length > 0) {
    const sanitized = sanitizeUnknownCropIngredients(draft, unknownCropIssues);
    draft = sanitized.draft;
    sanitizedCropIndices = sanitized.sanitizedIngredientIndices;
    validation = await validateDraft(client, draft);
    blockingIssues = validation.issues.filter((issue) => issue.severity === "blocking");
  }

  if (!validation.valid || blockingIssues.length > 0) {
    const error = toSafeErrorPayload(
      `draft failed Postgres validation: ${blockingIssues.map((i) => i.code).join(", ")}`,
      { code: "WRITER_DRAFT_VALIDATION_FAILED", stage: WRITE_STAGE, retryable: false },
    );
    await recordStageRun(client, {
      jobId: params.jobId, batchId: brief.batchId, stage: WRITE_STAGE, status: "failed",
      attempt, startedAt, finishedAt: new Date().toISOString(), error,
      output: {
        issues: blockingIssues,
        forcedCropFallbackIndices: sanitizedCropIndices.length > 0 ? sanitizedCropIndices : undefined,
      },
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
      // A genuine insert failure (e.g. an FK violation) — not a race. Same pattern as the other
      // three failure branches above: record the failed stage run, fail the job (releasing the
      // lock), and return a normal outcome. Must never throw here — an uncaught throw skips
      // recordStageRun/failJob entirely, leaving the job's lock held and its status stuck at
      // "running" forever (nothing re-claims it until the lock's own TTL expires, and nothing
      // triggers that reclaim automatically).
      const pgCode = (insertResult.error as { code?: string }).code;
      const error = toSafeErrorPayload(
        `recipe_drafts insert failed${pgCode ? ` (pgCode: ${pgCode})` : ""}`,
        { code: "DRAFT_INSERT_FAILED", stage: WRITE_STAGE, retryable: true },
      );
      await recordStageRun(client, {
        jobId: params.jobId, batchId: brief.batchId, stage: WRITE_STAGE, status: "failed",
        attempt, startedAt, finishedAt: new Date().toISOString(), error,
        provider: agentResult.provider, model: agentResult.model, usage: agentResult.usage,
      });
      await failJob(client, { jobId: params.jobId, lockToken, stage: WRITE_STAGE, error });
      return { outcome: "insert_failed", jobId: params.jobId, errorCode: error.code };
    }
    draftId = raced.id;
  } else {
    draftId = (insertResult.data as { id: string }).id;
  }

  await recordStageRun(client, {
    jobId: params.jobId, batchId: brief.batchId, stage: WRITE_STAGE, status: "completed",
    attempt, startedAt, finishedAt: new Date().toISOString(),
    output: {
      draftId, version: 1, candidateSlug: validation.candidateSlug,
      // Present only when the Writer invented a not-in-crop_config slug and it was force-corrected
      // to crop:null/freeTextName — see crop-slug-guard.ts and the Step 06B block above.
      forcedCropFallbackIndices: sanitizedCropIndices.length > 0 ? sanitizedCropIndices : undefined,
    },
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
