// F2 Recipe Automation — Step 13: recipe-stage-plan orchestration (the Planner vertical slice).
//
// Implements PROMPT 13: resolve/create a `recipe_generation_batches` row from a `RecipeBatchInput`,
// load its narrow read context (seasonal crop candidates, recent recipe mix, existing/duplicate
// recipe sample, editorial constraints), run the Planner through the shared agent-runner seam with
// a required `recipePlanBatchSchema` structured output, gate the result through BOTH deterministic
// Postgres checks — `validate_recipe_plan` (f2s04, structural) and `validate_recipe_plan_diversity`
// (f2s13, the plan-diversity rules PROMPT 13's "Başlangıç kuralları" require) — and only then
// persist one `recipe_plan_briefs` row per brief for admin review. Never creates a
// `recipe_generation_jobs` row itself — that only ever happens later, via
// `fan_out_recipe_plan_batch` (f2s13), after an explicit admin approval (../admin/plan-review.ts).
//
// Planner restrictions enforced here (not just in the prompt): the agent is given ZERO tools (see
// `runPlannerAgent` below — no `tools` field is ever passed), so there is no generic Supabase/SQL
// surface, no publish/delete capability, and no live-DB-write capability reachable from agent
// output at all — every read (crop candidates, recent mix, existing recipes) happens BEFORE the
// call via context.ts, and every write (recipe_generation_batches/recipe_plan_briefs only, never
// recipe_generation_jobs/recipes) happens AFTER it, entirely in this trusted stage-runner code the
// agent's output can only ever flow through, never invoke.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError, toSafeErrorPayload } from "../infra/errors.ts";
import { createAgentRunner, type AgentRunner } from "../infra/agent-runner.ts";
import { recipeBatchInputSchema, recipePlanBatchSchema } from "../schemas.ts";
import type { RecipeBatchInput, RecipeBrief, RecipeErrorPayload, RecipePlanBatch } from "../types.ts";
import {
  loadExistingRecipeSample,
  loadRecentRecipeMix,
  loadSeasonalCropCandidates,
  type ExistingRecipeSummary,
  type RecentRecipeMixEntry,
  type SeasonalCropCandidate,
} from "./context.ts";
import { buildPlannerSystemPrompt } from "./system-prompt.ts";

const PLAN_STAGE = "plan" as const;
const PLANNER_MODEL_ENV_VAR = "RECIPE_PLANNER_MODEL";

export interface BatchRow {
  id: string;
  targetCount: number;
  focusCrops: string[] | null;
  dietFocus: string[];
  locale: string;
  notes: string | null;
  reviewStatus: "pending_review" | "approved" | "rejected";
}

interface BatchQueryRow {
  id: string;
  target_count: number;
  focus_crops: string[] | null;
  diet_focus: string[] | null;
  locale: string;
  notes: string | null;
  review_status: BatchRow["reviewStatus"];
}

function toBatchRow(row: BatchQueryRow): BatchRow {
  return {
    id: row.id,
    targetCount: row.target_count,
    focusCrops: row.focus_crops,
    dietFocus: row.diet_focus ?? [],
    locale: row.locale,
    notes: row.notes,
    reviewStatus: row.review_status,
  };
}

const BATCH_SELECT_COLUMNS = "id, target_count, focus_crops, diet_focus, locale, notes, review_status";

async function countPlanBriefs(client: SupabaseClient, batchId: string): Promise<number> {
  // A plain row-count select (never `{ count: 'exact', head: true }`) — batches are capped at 25
  // briefs (recipe_generation_batches.target_count's own CHECK, f2s03), so fetching the id column
  // for every matching row is negligible, and this stays uniformly testable against both a real
  // PostgREST connection and the in-memory fake client used by this module's own unit tests.
  const { data, error } = await client
    .from("recipe_plan_briefs")
    .select("id")
    .eq("batch_id", batchId);
  if (error) {
    throw new RecipeAutomationError({
      code: "PLAN_BRIEF_COUNT_QUERY_FAILED",
      message: "failed to count existing recipe_plan_briefs rows",
      stage: PLAN_STAGE,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return (data as unknown[] | null)?.length ?? 0;
}

/**
 * Resolves the batch this planning attempt targets — an existing row (retry of a failed attempt,
 * or an idempotent repeat of an already-planned batch) or a freshly created one. Never creates a
 * `recipe_plan_briefs` row itself. When an explicit `batchId` is given and already resolves to a
 * row, that row's OWN stored fields are used as the source of truth for planning (not whatever the
 * caller passed this time) — a retry should re-plan the SAME request, not silently swap it out.
 */
async function resolveOrCreateBatch(
  client: SupabaseClient,
  input: RecipeBatchInput,
): Promise<{ batch: BatchRow; existingBriefCount: number }> {
  if (input.batchId) {
    const { data, error } = await client
      .from("recipe_generation_batches")
      .select(BATCH_SELECT_COLUMNS)
      .eq("id", input.batchId)
      .maybeSingle();
    if (error) {
      throw new RecipeAutomationError({
        code: "PLAN_BATCH_LOOKUP_FAILED",
        message: "failed to look up recipe_generation_batches by batchId",
        stage: PLAN_STAGE,
        retryable: true,
        details: { pgCode: (error as { code?: string }).code },
      });
    }
    if (data) {
      const batch = toBatchRow(data as BatchQueryRow);
      const existingBriefCount = await countPlanBriefs(client, batch.id);
      return { batch, existingBriefCount };
    }
  }

  const { data, error } = await client
    .from("recipe_generation_batches")
    .insert({
      ...(input.batchId ? { id: input.batchId } : {}),
      requested_by: input.requestedBy,
      target_count: input.targetCount,
      focus_crops: input.focusCrops,
      diet_focus: input.dietFocus,
      locale: input.locale,
      notes: input.notes,
      // Explicit rather than relying on the column's own DB-side default (f2s13) — this same
      // insert call is exercised against the in-memory fake client in plan-stage.test.ts, which
      // has no notion of column defaults.
      review_status: "pending_review",
    })
    .select(BATCH_SELECT_COLUMNS)
    .single();

  if (error) {
    throw new RecipeAutomationError({
      code: "PLAN_BATCH_CREATE_FAILED",
      message: "failed to create recipe_generation_batches row",
      stage: PLAN_STAGE,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return { batch: toBatchRow(data as BatchQueryRow), existingBriefCount: 0 };
}

async function recordPlanError(client: SupabaseClient, batchId: string, error: RecipeErrorPayload): Promise<void> {
  const { error: updateError } = await client
    .from("recipe_generation_batches")
    .update({ plan_error: error })
    .eq("id", batchId);
  if (updateError) {
    console.error("recordPlanError update failed", updateError);
  }
}

export interface RunPlanStageParams {
  batchInput: unknown;
  /** Injectable for tests — defaults to createAgentRunner() (the real SDK-backed runner). */
  agentRunner?: AgentRunner;
}

export type RunPlanStageOutcome =
  | "invalid_batch_input"
  | "already_planned"
  | "batch_not_reviewable"
  | "agent_call_failed"
  | "invalid_output"
  | "brief_count_mismatch"
  | "structural_validation_failed"
  | "diversity_validation_failed"
  | "planned";

export interface RunPlanStageResult {
  outcome: RunPlanStageOutcome;
  batchId?: string;
  briefCount?: number;
  errorCode?: string;
  issues?: unknown[];
}

interface ValidationRpcResult {
  valid: boolean;
  issues: Array<{ code: string; field: string; severity: string; message: string; requiredChange: string | null }>;
}

async function callValidationRpc(
  client: SupabaseClient,
  fn: "validate_recipe_plan" | "validate_recipe_plan_diversity",
  planJson: Record<string, unknown>,
): Promise<ValidationRpcResult> {
  const { data, error } = fn === "validate_recipe_plan"
    ? await client.rpc(fn, { p_plan: planJson })
    : await client.rpc(fn, { p_plan: planJson, p_options: {} });
  if (error) {
    throw new RecipeAutomationError({
      code: `${fn.toUpperCase()}_RPC_FAILED`,
      message: `${fn} RPC failed`,
      stage: PLAN_STAGE,
      retryable: true,
      details: { pgCode: (error as { code?: string }).code },
    });
  }
  return data as ValidationRpcResult;
}

function briefToInsertRow(batchId: string, brief: RecipeBrief) {
  return {
    batch_id: batchId,
    brief_id: brief.briefId,
    working_title: brief.workingTitle,
    focus_crop: brief.focusCrop,
    angle: brief.angle,
    target_difficulty: brief.targetDifficulty,
    diet_tags: brief.dietTags,
    locale: brief.locale,
    audience: brief.audience,
    meal_type: brief.mealType,
    selection_reason: brief.selectionReason,
  };
}

async function runPlannerAgent(
  agentRunner: AgentRunner,
  batch: BatchRow,
  cropCandidates: SeasonalCropCandidate[],
  recentMix: RecentRecipeMixEntry[],
  existingRecipes: ExistingRecipeSummary[],
) {
  return agentRunner.run({
    agentName: "recipe-planner",
    systemPrompt: buildPlannerSystemPrompt(),
    // Deliberately no `tools` field — the Planner agent has zero callable tools. Every read it
    // needs is already folded into this input; it can only return structured output, never call
    // back into Supabase/SQL, never publish, never fan out jobs itself.
    input: {
      batchId: batch.id,
      batchInput: {
        targetCount: batch.targetCount,
        focusCrops: batch.focusCrops,
        dietFocus: batch.dietFocus,
        locale: batch.locale,
        notes: batch.notes,
      },
      seasonalCropCandidates: cropCandidates,
      recentRecipeMix: recentMix,
      existingRecipeSample: existingRecipes,
    },
    outputSchema: recipePlanBatchSchema,
    model: Deno.env.get(PLANNER_MODEL_ENV_VAR) || undefined,
  });
}

/**
 * Runs the plan stage for one batch. Never throws for an ordinary content/provider failure — those
 * are reported via `recordPlanError` and reflected in the returned `outcome`; only an unexpected
 * infrastructure error (a DB call that itself failed) throws, the same convention every other
 * stage-runner in this pipeline uses.
 */
export async function runPlanStage(
  client: SupabaseClient,
  params: RunPlanStageParams,
): Promise<RunPlanStageResult> {
  const parsedInput = recipeBatchInputSchema.safeParse(params.batchInput);
  if (!parsedInput.success) {
    return { outcome: "invalid_batch_input" };
  }

  const { batch, existingBriefCount } = await resolveOrCreateBatch(client, parsedInput.data);

  // Idempotency (PROMPT 13, same discipline write-stage.ts uses for its version-1 draft): a plan
  // may already exist from a prior attempt that produced and stored valid briefs — never re-plan
  // (and never spend another agent call) once that has happened.
  if (existingBriefCount > 0) {
    return { outcome: "already_planned", batchId: batch.id, briefCount: existingBriefCount };
  }

  // A batch already decided by an admin (approved/rejected) with zero stored briefs is an
  // inconsistent state this function should never try to "fix" by planning into it — refuse rather
  // than silently populating a batch an admin has already moved past.
  if (batch.reviewStatus !== "pending_review") {
    return { outcome: "batch_not_reviewable", batchId: batch.id };
  }

  const agentRunner = params.agentRunner ?? createAgentRunner();

  // When editorial constraints already name the crops to use, don't let seasonality narrow the
  // candidate list out from under that instruction — filter to the requested crops instead, so
  // rule 1 (focusCrop must be a candidate) and rule 9 (focusCrop must be in focusCrops when given)
  // are never in tension for the model.
  const hasFocusCrops = Boolean(batch.focusCrops && batch.focusCrops.length > 0);
  const [allCandidates, recentMix, existingRecipes] = await Promise.all([
    loadSeasonalCropCandidates(client, { onlyInSeason: !hasFocusCrops, edibleOnly: true, limit: 60 }),
    loadRecentRecipeMix(client, { days: 30, limit: 20 }),
    loadExistingRecipeSample(client, { limit: 30 }),
  ]);
  const cropCandidates = hasFocusCrops
    ? allCandidates.filter((c) => batch.focusCrops!.includes(c.crop))
    : allCandidates;

  let agentResult;
  try {
    agentResult = await runPlannerAgent(agentRunner, batch, cropCandidates, recentMix, existingRecipes);
  } catch (e) {
    const error = toSafeErrorPayload(e, {
      code: "PLANNER_AGENT_CALL_FAILED",
      stage: PLAN_STAGE,
      retryable: e instanceof RecipeAutomationError ? e.retryable : true,
    });
    await recordPlanError(client, batch.id, error);
    return { outcome: "agent_call_failed", batchId: batch.id, errorCode: error.code };
  }

  // The Planner is never trusted to generate `briefId` itself — same principle as the top-level
  // `batchId` override just below: it is a pure internal identity field with no content-bearing
  // role, so a model asked to independently emit N of them (a known structured-output failure mode
  // for semantically-empty "id" placeholders) can and does sometimes repeat one across briefs
  // within a batch. Replacing every brief's `briefId` with a fresh server-side UUID here, before
  // `recipePlanBatchSchema`'s own unique-briefId refine ever sees the output, makes that collision
  // structurally impossible rather than merely detected.
  const rawOutput = agentResult.output as Record<string, unknown>;
  const rawBriefs = rawOutput.briefs;
  const briefsWithFreshIds = Array.isArray(rawBriefs)
    ? rawBriefs.map((brief) =>
      brief && typeof brief === "object" ? { ...brief, briefId: crypto.randomUUID() } : brief
    )
    : rawBriefs;

  const parsed = recipePlanBatchSchema.safeParse({
    ...rawOutput,
    batchId: batch.id,
    briefs: briefsWithFreshIds,
  });

  if (!parsed.success) {
    const error = toSafeErrorPayload(parsed.error, {
      code: "PLANNER_OUTPUT_SCHEMA_INVALID",
      stage: PLAN_STAGE,
      retryable: true,
    });
    await recordPlanError(client, batch.id, error);
    return { outcome: "invalid_output", batchId: batch.id, errorCode: error.code };
  }

  const plan: RecipePlanBatch = parsed.data;

  // "Structured output ile TAM OLARAK istenen sayıda RecipeBrief objesi üret" (PROMPT 13) — the
  // Zod schema alone only bounds 1..25; the exact count against this batch's own targetCount is
  // checked here.
  if (plan.briefs.length !== batch.targetCount) {
    const error = toSafeErrorPayload(
      `planner produced ${plan.briefs.length} briefs, expected exactly ${batch.targetCount}`,
      { code: "PLANNER_BRIEF_COUNT_MISMATCH", stage: PLAN_STAGE, retryable: true },
    );
    await recordPlanError(client, batch.id, error);
    return { outcome: "brief_count_mismatch", batchId: batch.id, errorCode: error.code };
  }

  const planJson = { briefs: plan.briefs } as unknown as Record<string, unknown>;

  const structural = await callValidationRpc(client, "validate_recipe_plan", planJson);
  if (!structural.valid) {
    const blocking = structural.issues.filter((i) => i.severity === "blocking");
    const error = toSafeErrorPayload(
      `plan failed validate_recipe_plan: ${blocking.map((i) => i.code).join(", ")}`,
      { code: "PLANNER_STRUCTURAL_VALIDATION_FAILED", stage: PLAN_STAGE, retryable: true },
    );
    await recordPlanError(client, batch.id, error);
    return { outcome: "structural_validation_failed", batchId: batch.id, errorCode: error.code, issues: structural.issues };
  }

  const diversity = await callValidationRpc(client, "validate_recipe_plan_diversity", planJson);
  await client.from("recipe_generation_batches").update({ diversity_report: diversity }).eq("id", batch.id);

  if (!diversity.valid) {
    const blocking = diversity.issues.filter((i) => i.severity === "blocking");
    const error = toSafeErrorPayload(
      `plan failed validate_recipe_plan_diversity: ${blocking.map((i) => i.code).join(", ")}`,
      { code: "PLANNER_DIVERSITY_VALIDATION_FAILED", stage: PLAN_STAGE, retryable: true },
    );
    await recordPlanError(client, batch.id, error);
    return { outcome: "diversity_validation_failed", batchId: batch.id, errorCode: error.code, issues: diversity.issues };
  }

  const insertResult = await client
    .from("recipe_plan_briefs")
    .insert(plan.briefs.map((brief) => briefToInsertRow(batch.id, brief)))
    .select("id");

  if (insertResult.error) {
    // A unique(batch_id, brief_id) collision means a concurrent/duplicate invocation already
    // stored this plan's briefs between our existence check and this insert — idempotent success,
    // not an error, same convention write-stage.ts uses for its own draft-insert race.
    const raced = await countPlanBriefs(client, batch.id);
    if (raced === 0) {
      throw new RecipeAutomationError({
        code: "PLAN_BRIEFS_INSERT_FAILED",
        message: "recipe_plan_briefs insert failed",
        stage: PLAN_STAGE,
        retryable: true,
        details: { pgCode: (insertResult.error as { code?: string }).code },
      });
    }
    return { outcome: "already_planned", batchId: batch.id, briefCount: raced };
  }

  await client
    .from("recipe_generation_batches")
    .update({ planner_model: agentResult.model, planned_at: new Date().toISOString(), plan_error: null })
    .eq("id", batch.id);

  return { outcome: "planned", batchId: batch.id, briefCount: plan.briefs.length };
}
