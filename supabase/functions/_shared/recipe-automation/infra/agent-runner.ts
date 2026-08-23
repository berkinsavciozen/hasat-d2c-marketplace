// F2 Recipe Automation — Step 05/06: agent runner seam.
//
// Content agents (Planner/Writer/QA/...) were explicitly OUT OF SCOPE for Step 05 (PROMPT 05).
// What that step built instead was a stable seam to build against: one typed interface that hides
// whether a given call goes through an SDK (the OpenAI Agents SDK referenced by the Step 01 spike
// — npm-distributed, not guaranteed Deno-Edge-compatible at the time) or a Deno-native
// implementation (a direct `fetch` against the provider's HTTP API, no SDK dependency). Callers
// depend only on `AgentRunner`/`createAgentRunner` below; which concrete class actually runs is an
// infra decision made once, here, via `RECIPE_AGENT_RUNTIME`.
//
// F2 Step 06 (P1 preflight gate): Step 01's second gate — "prove a live, structured-output SDK
// call actually works on this runtime" — was still open when Step 06 started. It is now closed:
// `spike-agents-sdk-poc` (deployed to the live `efuqpiaavrzimvstpdpm` project, not part of this
// repo — see docs/recipe-automation/01-runtime-feasibility-spikes.md for its origin) was invoked
// live via `net.http_get` from this same project (OPENAI_API_KEY is set as a project secret) and
// returned `status: "ok"`, a Zod-schema-validated `finalOutput`, a real `traceId`/`lastResponseId`,
// and non-zero token `usage` (`inputTokens`/`outputTokens`/`totalTokens`) — see the Step 06
// completion report for the exact trace id, latency and usage numbers captured. Per Step 01's own
// decision rule ("SDK if live structured-agent call passes"), the SDK path is the one implemented
// for real below; `DEFAULT_RUNTIME_ENV_VAR` now defaults to `"sdk"` instead of `"deno-native"`.
// `DenoNativeAgentRunner` is left as a NOT_IMPLEMENTED stub — the untaken alternative, kept only so
// the seam still has two names if a future migration off the SDK is ever needed.
import { Agent, run as runAgentSdk } from "npm:@openai/agents";
import { z } from "npm:zod@3.23.8";
import { RecipeAutomationError } from "./errors.ts";

export interface AgentRunRequest {
  /** Free text for now — content agents (planner/writer/qa/...) don't have a fixed name enum
   * yet; that belongs to whichever step actually defines them. */
  agentName: string;
  systemPrompt: string;
  /** Provider-agnostic input payload — shape is the calling stage's responsibility. Passed to the
   * SDK as the agent's user-turn input: a string is passed through as-is, anything else is
   * JSON.stringify'd first (the SDK's `run()` takes a string/message-list input, not an arbitrary
   * object). */
  input: unknown;
  model?: string;
  provider?: string;
  traceId?: string;
  maxOutputTokens?: number;
  /** Zod schema the structured output must satisfy — every real stage call in this pipeline has
   * one (recipeDraftPayloadSchema, recipeQAResultSchema, recipePlanBatchSchema, ...), passed as
   * the SDK Agent's `outputType`, which is what makes the call actually structured rather than
   * free text. Optional only so a caller that genuinely wants unstructured text output can omit
   * it; SdkAgentRunner does NOT default this to a permissive schema; the SDK itself defaults to
   * plain text output when no `outputType` is given. */
  outputSchema?: z.ZodType;
  /** Passed through to the SDK's `run()` as `maxTurns`. Defaults to 4 — enough for one tool call
   * plus the final structured response, matching the Step 01 spike's own budget. */
  maxTurns?: number;
}

export interface AgentRunUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AgentRunResult {
  output: unknown;
  provider: string;
  model: string;
  usage: AgentRunUsage | null;
  durationMs: number;
  /** Provider SDK's raw response, if any — for the caller's own debugging use only. Never pass
   * this to telemetry.ts; it may contain prompt/provider content telemetry.ts must not store. */
  raw?: unknown;
}

export interface AgentRunner {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export type AgentRuntimeMode = "sdk" | "deno-native";

const DEFAULT_RUNTIME_ENV_VAR = "RECIPE_AGENT_RUNTIME";
const DEFAULT_PROVIDER = "openai";

/** Error names/messages that mean "the model's own output didn't fit the request" — retrying the
 * exact same input is very unlikely to help, so these are NOT marked retryable. Everything else
 * (network errors, provider 5xx/timeouts, rate limits) defaults to retryable — the more common
 * case for a transient failure worth a stage retry. */
const NON_RETRYABLE_FAILURE_PATTERN = /max.?turns|guardrail|schema|output.*type|zod/i;

/** Sums usage across every per-turn raw model response the SDK recorded. `result.rawResponses[]`
 * is where @openai/agents (0.x) exposes this — defensive about the exact shape since it isn't part
 * of this project's own contract, returns null rather than throwing if usage can't be found. */
function extractUsage(result: unknown): AgentRunUsage | null {
  const r = result as { rawResponses?: unknown; state?: { _modelResponses?: unknown } };
  const responses = (Array.isArray(r?.rawResponses) ? r.rawResponses : undefined) ??
    (Array.isArray(r?.state?._modelResponses) ? r.state?._modelResponses : undefined);
  if (!Array.isArray(responses) || responses.length === 0) return null;

  let inputTokens = 0, outputTokens = 0, totalTokens = 0, found = false;
  for (const resp of responses) {
    const u = (resp as { usage?: Record<string, unknown> })?.usage;
    if (!u) continue;
    found = true;
    inputTokens += Number(u.inputTokens ?? u.input_tokens ?? 0);
    outputTokens += Number(u.outputTokens ?? u.output_tokens ?? 0);
    totalTokens += Number(u.totalTokens ?? u.total_tokens ?? 0);
  }
  return found ? { inputTokens, outputTokens, totalTokens } : null;
}

function extractTraceId(result: unknown): string | null {
  const r = result as { state?: { _trace?: { traceId?: string } }; traceId?: string };
  return r?.state?._trace?.traceId ?? r?.traceId ?? null;
}

/**
 * Live-verified findings (F2 Step 06, P1 preflight — see the Step 06 completion report for the
 * exact probe evidence and reproduction) about what a zod@3.23.8 schema can safely be handed to
 * `@openai/agents`' `outputType` (which converts it to an OpenAI Structured Outputs JSON Schema):
 *
 *   1. `.refine(...)` (a `ZodEffects` wrapper — every top-level payload schema in this pipeline has
 *      at least one, e.g. `recipeDraftPayloadSchema`/`recipeQAResultSchema`/`recipePlanBatchSchema`)
 *      makes the conversion silently produce an incomplete request, rejected with
 *      `400 Missing required parameter: 'text.format.type'`. Reproduced in isolation with a trivial
 *      two-field `.strict().refine(...)` schema — nesting/array complexity is NOT the cause,
 *      `.refine()` alone is; the identical schema without `.refine()` works.
 *   2. `z.string().url()` (`recipeDraftPayloadSchema.coverPhotoUrl`/`steps[].photoUrl`) converts to
 *      JSON Schema `{"type":"string","format":"uri"}`. OpenAI's Structured Outputs only accepts a
 *      fixed allow-list of string `format` values (`date-time`, `time`, `date`, `duration`,
 *      `email`, `hostname`, `ipv4`, `ipv6`, `uuid`) — `uri` is not one of them, and the call is
 *      rejected with `400 Invalid schema for response_format ... 'uri' is not a valid format`.
 *
 * `sanitizeForStructuredOutput` below fixes both, recursively, using only zod's own public builder
 * API (`z.object`/`z.array`/`.nullable()`/`.optional()`/`.default()`/`.strict()`/`.min()`/`.max()`)
 * to reconstruct — never mutating the caller's original schema in place. This does NOT weaken
 * validation anywhere: every caller in this pipeline (write-stage.ts and its future QA/Planner
 * siblings) always re-parses the SDK's raw output against the FULL, UNMODIFIED original schema —
 * refine and `.url()` both still enforced — immediately afterward; that re-parse is the actual
 * correctness gate. This function only affects what shape the provider API itself is told to
 * target, so the model is still nudged toward the right structure without the call being rejected
 * outright by a JSON-Schema feature OpenAI's Structured Outputs doesn't support.
 */
export function sanitizeForStructuredOutput(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def?.typeName as string | undefined;

  switch (typeName) {
    case "ZodEffects":
      return sanitizeForStructuredOutput(def.schema as z.ZodTypeAny);
    case "ZodNullable":
      return sanitizeForStructuredOutput(def.innerType as z.ZodTypeAny).nullable();
    case "ZodOptional":
      return sanitizeForStructuredOutput(def.innerType as z.ZodTypeAny).optional();
    case "ZodDefault": {
      const defaultValueFn = def.defaultValue as () => unknown;
      return sanitizeForStructuredOutput(def.innerType as z.ZodTypeAny).default(defaultValueFn());
    }
    case "ZodObject": {
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      const newShape: z.ZodRawShape = {};
      for (const [key, value] of Object.entries(shape)) {
        newShape[key] = sanitizeForStructuredOutput(value as z.ZodTypeAny);
      }
      let rebuilt = z.object(newShape);
      if (def.unknownKeys === "strict") rebuilt = rebuilt.strict();
      return rebuilt;
    }
    case "ZodArray": {
      const element = (schema as unknown as z.ZodArray<z.ZodTypeAny>).element;
      let rebuilt = z.array(sanitizeForStructuredOutput(element));
      const minLength = def.minLength as { value: number } | null;
      const maxLength = def.maxLength as { value: number } | null;
      if (minLength) rebuilt = rebuilt.min(minLength.value);
      if (maxLength) rebuilt = rebuilt.max(maxLength.value);
      return rebuilt;
    }
    case "ZodString": {
      const checks = (def.checks as Array<{ kind: string }>) ?? [];
      if (!checks.some((c) => c.kind === "url")) return schema;
      // Rebuild with the SAME _def, minus the `url` check — the only one OpenAI's Structured
      // Outputs rejects; every other check (min/max/trim/...) is preserved unchanged.
      return new z.ZodString({
        ...(def as unknown as z.ZodStringDef),
        checks: checks.filter((c) => c.kind !== "url"),
      });
    }
    default:
      return schema;
  }
}

class SdkAgentRunner implements AgentRunner {
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const agent = new Agent({
      name: request.agentName,
      instructions: request.systemPrompt,
      ...(request.model ? { model: request.model } : {}),
      ...(request.outputSchema ? { outputType: sanitizeForStructuredOutput(request.outputSchema) } : {}),
    });

    const inputText = typeof request.input === "string" ? request.input : JSON.stringify(request.input);
    const startedAt = Date.now();

    let result: Awaited<ReturnType<typeof runAgentSdk>>;
    try {
      result = await runAgentSdk(agent, inputText, { maxTurns: request.maxTurns ?? 4 });
    } catch (e) {
      const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      throw new RecipeAutomationError({
        code: "AGENT_RUNNER_SDK_CALL_FAILED",
        message,
        retryable: !NON_RETRYABLE_FAILURE_PATTERN.test(message),
      });
    }

    return {
      output: result.finalOutput ?? null,
      provider: request.provider ?? DEFAULT_PROVIDER,
      model: request.model ?? "sdk-default",
      usage: extractUsage(result),
      durationMs: Date.now() - startedAt,
      raw: { traceId: extractTraceId(result) },
    };
  }
}

class DenoNativeAgentRunner implements AgentRunner {
  run(_request: AgentRunRequest): Promise<AgentRunResult> {
    return Promise.reject(
      new RecipeAutomationError({
        code: "AGENT_RUNNER_NOT_IMPLEMENTED",
        message: "Deno-native agent runner has no content-agent implementation — the SDK path was " +
          "chosen instead once the Step 01/P1 live-call gate passed (see this file's header)",
        retryable: false,
      }),
    );
  }
}

/**
 * Pure mode-resolution logic, split out from `createAgentRunner` so it's testable without ever
 * constructing (or calling `.run()` on) a real SdkAgentRunner — that would fire a live network
 * request to the model provider, which a unit test must never do.
 */
export function resolveAgentRuntimeMode(mode?: AgentRuntimeMode): AgentRuntimeMode {
  return mode ?? (Deno.env.get(DEFAULT_RUNTIME_ENV_VAR) as AgentRuntimeMode | undefined) ?? "sdk";
}

/**
 * Selects the concrete AgentRunner based on `RECIPE_AGENT_RUNTIME` ("sdk" | "deno-native"),
 * defaulting to "sdk" — the Step 01/P1 live-call gate passed (see this file's header), so the SDK
 * is the implemented, production path. Callers never branch on the mode themselves — this is the
 * one place that decision is made.
 */
export function createAgentRunner(mode?: AgentRuntimeMode): AgentRunner {
  const resolved = resolveAgentRuntimeMode(mode);
  switch (resolved) {
    case "sdk":
      return new SdkAgentRunner();
    case "deno-native":
      return new DenoNativeAgentRunner();
    default:
      throw new RecipeAutomationError({
        code: "AGENT_RUNTIME_MODE_INVALID",
        message: `Unknown RECIPE_AGENT_RUNTIME value: ${String(resolved)}`,
        retryable: false,
      });
  }
}
