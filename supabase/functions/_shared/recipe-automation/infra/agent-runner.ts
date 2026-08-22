// F2 Recipe Automation — Step 05: agent runner seam.
//
// Content agents (Planner/Writer/QA/...) are explicitly OUT OF SCOPE for this step — see
// PROMPT 05. What those later steps need already, though, is a stable seam to build against: one
// typed interface that hides whether a given call goes through an SDK (e.g. the OpenAI Agents
// SDK referenced by the Step 01 spike — npm-distributed, not guaranteed Deno-Edge-compatible) or
// a Deno-native implementation (a direct `fetch` against the provider's HTTP API, no SDK
// dependency). Callers depend only on `AgentRunner`/`createAgentRunner` below; which concrete
// class actually runs is an infra decision made once, here, via `RECIPE_AGENT_RUNTIME`.
//
// Neither implementation makes a real provider call yet — that is Step 06+ (Writer) and the
// separate Step 01 "live OpenAI Agents SDK call" gate. Both throw a clear, typed
// NOT_IMPLEMENTED error so a premature call fails loudly instead of silently returning fake data.
import { RecipeAutomationError } from "./errors.ts";

export interface AgentRunRequest {
  /** Free text for now — content agents (planner/writer/qa/...) don't have a fixed name enum
   * yet; that belongs to whichever step actually defines them. */
  agentName: string;
  systemPrompt: string;
  /** Provider-agnostic input payload — shape is the calling stage's responsibility. */
  input: unknown;
  model?: string;
  provider?: string;
  traceId?: string;
  maxOutputTokens?: number;
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

class SdkAgentRunner implements AgentRunner {
  run(_request: AgentRunRequest): Promise<AgentRunResult> {
    return Promise.reject(
      new RecipeAutomationError({
        code: "AGENT_RUNNER_NOT_IMPLEMENTED",
        message: "SDK agent runner has no content-agent implementation yet (Step 06+)",
        retryable: false,
      }),
    );
  }
}

class DenoNativeAgentRunner implements AgentRunner {
  run(_request: AgentRunRequest): Promise<AgentRunResult> {
    return Promise.reject(
      new RecipeAutomationError({
        code: "AGENT_RUNNER_NOT_IMPLEMENTED",
        message: "Deno-native agent runner has no content-agent implementation yet (Step 06+)",
        retryable: false,
      }),
    );
  }
}

/**
 * Selects the concrete AgentRunner based on `RECIPE_AGENT_RUNTIME` ("sdk" | "deno-native"),
 * defaulting to "deno-native" (no npm SDK dependency, the safer default for an Edge Function
 * runtime until the SDK's Deno compatibility is confirmed by the Step 01 gate). Callers never
 * branch on the mode themselves — this is the one place that decision is made.
 */
export function createAgentRunner(mode?: AgentRuntimeMode): AgentRunner {
  const resolved = mode ?? (Deno.env.get(DEFAULT_RUNTIME_ENV_VAR) as AgentRuntimeMode | undefined) ??
    "deno-native";
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
