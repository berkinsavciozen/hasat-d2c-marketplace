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
// Pinned to 0.3.9 — the last @openai/agents release whose zod peer dependency range
// ("^3.25.40 || ^4.0", per npm) still accepts a zod v3 install. Every version from 0.4.0 onward
// tightens that peer range to "^4.0.0" only, which is incompatible with the zod v3 line this
// pipeline's schemas (schemas.ts) are written against — an unpinned `npm:@openai/agents` resolves
// to whatever is latest (0.17.0 as of this pin), which is zod-v4-only and fails Deno's type-check
// at import time with the local zod v3 types (TS2322/TS2345/TS2740 on `Agent`'s `outputType` and
// `run()`'s return type). This is a dependency pin only — no behavior change to this file's logic.
import { Agent, run as runAgentSdk } from "npm:@openai/agents@0.3.9";
import { z } from "npm:zod@3.25.76";
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
  /** Maximum output tokens for the model's structured response. Passed through to the SDK as
   * `modelSettings.maxTokens` (see `buildAgentConfig` below) — until this fix, this field was
   * declared here but never actually wired into the SDK call, so every caller silently ran at
   * whatever the model's own default output limit is. A full recipe draft (title + description +
   * up to 60 ingredients + up to 60 steps) can exceed that default on a long recipe: three
   * AGENT_RUNNER_SDK_CALL_FAILED jobs on 2026-09-09 (e.g. job
   * ebefea4c-f829-46c6-89de-3ddcfd051746, "Safranlı Horeca Gurme Risotto") failed with
   * "Unexpected end of JSON input" / "Expected ',' or '}' ... at position 43751" — the model's
   * response text was cut off mid-object because it hit that default limit before finishing the
   * JSON. Callers should set this explicitly and generously (writer/write-stage.ts and
   * revise/revise-stage.ts both do). */
  maxOutputTokens?: number;
  /** Zod schema the structured output must satisfy — every real stage call in this pipeline has
   * one (recipeDraftPayloadSchema, recipeQAResultSchema, recipePlanBatchSchema, ...), passed as
   * the SDK Agent's `outputType`, which is what makes the call actually structured rather than
   * free text. Optional only so a caller that genuinely wants unstructured text output can omit
   * it; SdkAgentRunner does NOT default this to a permissive schema; the SDK itself defaults to
   * plain text output when no `outputType` is given. */
  outputSchema?: z.ZodType;
  /** Dot/bracket paths (the SAME convention revise/allowed-changes.ts's `parseIssueFieldPath` uses
   * for QA-issue fields, e.g. `"coverPhotoUrl"`, `"steps[].photoUrl"`) to remove ENTIRELY from the
   * schema handed to the SDK as `outputType`, via `sanitizeForStructuredOutput`'s `excludePaths`
   * parameter — the model never sees these keys and can never produce a value for them, at all.
   * For fields the pipeline itself owns (never the model's to set — see write-stage.ts's
   * `mergeImmutablePhotoFields`), this is strictly stronger than validating-then-overriding the
   * model's value after the fact: a model can invent a brand-new "no value" spelling for a field it
   * CAN see (that was the whole recurring REVISER_OUTPUT_SCHEMA_INVALID failure class this closes —
   * see mergeImmutablePhotoFields's own doc comment), but it cannot invent any value at all for a
   * field that was never part of the schema it was asked to fill in. The caller's own final
   * `safeParse` still runs against the FULL, unmodified schema (unaffected by this option) — this
   * only narrows what shape the provider API itself is told to target. */
  excludeOutputFields?: readonly string[];
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

/** A JSON.parse failure because the model's response text was cut off mid-object — the exact
 * symptom of the missing-maxOutputTokens bug this file's `AgentRunRequest.maxOutputTokens` docstring
 * describes (three jobs 2026-09-09, "Unexpected end of JSON input" / "Expected ',' or '}' ... at
 * position 43751"). Unlike a genuine schema/guardrail rejection, the SAME input has a real chance of
 * completing under the now-wired token budget, or even on a plain retry — so this is checked BEFORE
 * NON_RETRYABLE_FAILURE_PATTERN and overrides it (a JSON.parse SyntaxError's own message text can
 * otherwise incidentally match that pattern's "schema" substring). Kept even after the
 * maxOutputTokens fix: a sufficiently long draft can still exceed any fixed budget. */
const TRUNCATED_JSON_OUTPUT_PATTERN =
  /unexpected end of json input|unexpected (?:non-whitespace character|token)|expected (?:'|")?[,}\]]/i;

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
 *
 * `excludePaths` (default: none) additionally drops specific fields from the schema ENTIRELY,
 * rather than just relaxing a check on them — using the SAME bracket-path convention
 * revise/allowed-changes.ts's `parseIssueFieldPath` already uses for QA-issue fields: a bare key for
 * a top-level field (`"coverPhotoUrl"`), `.` for a nested object field, and `[]` for "every element
 * of this array" (`"steps[].photoUrl"`). See `AgentRunRequest.excludeOutputFields`'s own docstring
 * for why this exists — pipeline-owned fields the model must never see or set at all, not just
 * fields whose value needs a looser check.
 */
export function sanitizeForStructuredOutput(
  schema: z.ZodTypeAny,
  excludePaths: readonly string[] = [],
): z.ZodTypeAny {
  const excludeSet = new Set(excludePaths);
  return sanitizeNode(schema, "", excludeSet);
}

function sanitizeNode(schema: z.ZodTypeAny, path: string, excludeSet: ReadonlySet<string>): z.ZodTypeAny {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def?.typeName as string | undefined;

  switch (typeName) {
    case "ZodEffects":
      return sanitizeNode(def.schema as z.ZodTypeAny, path, excludeSet);
    case "ZodNullable":
      return sanitizeNode(def.innerType as z.ZodTypeAny, path, excludeSet).nullable();
    case "ZodOptional":
      return sanitizeNode(def.innerType as z.ZodTypeAny, path, excludeSet).optional();
    case "ZodDefault": {
      const defaultValueFn = def.defaultValue as () => unknown;
      return sanitizeNode(def.innerType as z.ZodTypeAny, path, excludeSet).default(defaultValueFn());
    }
    case "ZodObject": {
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      const newShape: z.ZodRawShape = {};
      for (const [key, value] of Object.entries(shape)) {
        const childPath = path ? `${path}.${key}` : key;
        if (excludeSet.has(childPath)) continue;
        newShape[key] = sanitizeNode(value as z.ZodTypeAny, childPath, excludeSet);
      }
      const rebuilt = z.object(newShape);
      return def.unknownKeys === "strict" ? rebuilt.strict() : rebuilt;
    }
    case "ZodArray": {
      const element = (schema as unknown as z.ZodArray<z.ZodTypeAny>).element;
      const elementPath = `${path}[]`;
      let rebuilt = z.array(sanitizeNode(element, elementPath, excludeSet));
      const minLength = def.minLength as { value: number } | null;
      const maxLength = def.maxLength as { value: number } | null;
      if (minLength) rebuilt = rebuilt.min(minLength.value);
      if (maxLength) rebuilt = rebuilt.max(maxLength.value);
      return rebuilt;
    }
    case "ZodString": {
      const stringDef = def as unknown as z.ZodStringDef;
      const checks = stringDef.checks ?? [];
      if (!checks.some((c) => c.kind === "url")) return schema;
      // Rebuild with the SAME _def, minus the `url` check — the only one OpenAI's Structured
      // Outputs rejects; every other check (min/max/trim/...) is preserved unchanged. The cast on
      // the filtered array is type-only (zod's ZodStringCheck is a discriminated union that
      // Array.filter's predicate doesn't narrow) — the filtered *values* are still exactly the
      // same check objects zod itself produced, just with the "url" one removed.
      return new z.ZodString({
        ...stringDef,
        checks: checks.filter((c) => c.kind !== "url") as z.ZodStringDef["checks"],
      });
    }
    default:
      return schema;
  }
}

/**
 * Pure construction of the config object passed to `new Agent(...)` — split out from `.run()` so
 * tests can assert on the exact config (in particular `modelSettings.maxTokens`, which used to be
 * silently dropped even though `AgentRunRequest.maxOutputTokens` was a defined field — see that
 * field's own docstring for the 2026-09-09 root-cause writeup) without ever constructing a real
 * `Agent` or making a network call. `modelSettings.maxTokens` is the SDK's actual parameter name for
 * this (`@openai/agents-core`'s `ModelSettings.maxTokens`, verified against the pinned 0.3.9
 * release) — NOT a top-level `maxOutputTokens`/`maxTokens` field on the Agent config itself.
 */
export function buildAgentConfig(request: AgentRunRequest): ConstructorParameters<typeof Agent>[0] {
  // `Agent`'s `outputType` is typed against the SDK's own bundled zod import, which Deno's npm
  // resolution instantiates as a nominally distinct package from this file's `npm:zod@3.25.76` —
  // structurally identical (both are zod v3 ZodObject instances at runtime), but TypeScript
  // treats them as unrelated types. The cast here is type-only; `sanitizeForStructuredOutput`
  // still runs, and the SDK's own runtime `zodToJsonSchema` conversion works off the schema's
  // actual shape, not this static type. Real correctness is enforced by the caller re-parsing
  // the raw output against the full, original schema afterward (see that function's docstring).
  const outputType = request.outputSchema
    ? (sanitizeForStructuredOutput(request.outputSchema, request.excludeOutputFields ?? []) as unknown as
      ConstructorParameters<typeof Agent>[0]["outputType"])
    : undefined;
  return {
    name: request.agentName,
    instructions: request.systemPrompt,
    ...(request.model ? { model: request.model } : {}),
    ...(outputType ? { outputType } : {}),
    ...(request.maxOutputTokens ? { modelSettings: { maxTokens: request.maxOutputTokens } } : {}),
  };
}

class SdkAgentRunner implements AgentRunner {
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const agent = new Agent(buildAgentConfig(request));

    const inputText = typeof request.input === "string" ? request.input : JSON.stringify(request.input);
    const startedAt = Date.now();

    // No explicit type annotation on `result`: `runAgentSdk` is overloaded (streaming vs.
    // non-streaming), and `Awaited<ReturnType<typeof runAgentSdk>>` resolves to the *last*
    // overload (the streaming one) rather than the one this specific, non-streaming call actually
    // selects — inferring from the call expression itself picks the right overload instead.
    let result;
    try {
      result = await runAgentSdk(agent, inputText, { maxTurns: request.maxTurns ?? 4 });
    } catch (e) {
      const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      const retryable = TRUNCATED_JSON_OUTPUT_PATTERN.test(message) || !NON_RETRYABLE_FAILURE_PATTERN.test(message);
      throw new RecipeAutomationError({
        code: "AGENT_RUNNER_SDK_CALL_FAILED",
        message,
        retryable,
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
