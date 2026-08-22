// F2 Recipe Automation — Step 05: shared error type + safe-payload construction.
//
// Every stage-runner Edge Function in this pipeline reports failures using
// `recipeErrorPayloadSchema` (schemas.ts) — the only shape allowed to cross a stage boundary or
// land in `recipe_generation_jobs.last_error` / `recipe_generation_stage_runs.error`. That schema
// documents its own contract: "message must be safe to surface (no stack traces, no secret
// values, no raw provider payloads) — callers are responsible for sanitizing before constructing
// this object; the schema enforces shape, not content redaction." This module is that
// sanitization layer, shared by job-state.ts, stage-dispatch.ts and telemetry.ts so every caller
// redacts the same way instead of reinventing it per stage.

import { recipeErrorPayloadSchema } from "../schemas.ts";
import type { RecipeErrorPayload, RecipeJobStage } from "../types.ts";

export interface RecipeAutomationErrorParams {
  /** SCREAMING_SNAKE_CASE, matches recipeErrorPayloadSchema.code's regex. */
  code: string;
  message: string;
  stage?: RecipeJobStage | null;
  retryable?: boolean;
  /** Structured context — passed through redactUnsafeDetails() before ever being persisted. */
  details?: Record<string, unknown>;
}

/**
 * The only error type infra code in this pipeline should throw deliberately. Anything else
 * (a thrown network error, a Postgres error, a provider SDK exception, ...) is an *unexpected*
 * error and should be converted with `toSafeErrorPayload()` below, not re-thrown as-is.
 */
export class RecipeAutomationError extends Error {
  readonly code: string;
  readonly stage: RecipeJobStage | null;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(params: RecipeAutomationErrorParams) {
    super(params.message);
    this.name = "RecipeAutomationError";
    this.code = params.code;
    this.stage = params.stage ?? null;
    this.retryable = params.retryable ?? false;
    this.details = params.details;
  }

  toPayload(occurredAt: string = new Date().toISOString()): RecipeErrorPayload {
    return recipeErrorPayloadSchema.parse({
      code: this.code,
      message: this.message,
      stage: this.stage,
      retryable: this.retryable,
      occurredAt,
      details: this.details ? redactUnsafeDetails(this.details) as Record<string, unknown> : undefined,
    });
  }
}

// Keys whose *values* are dropped outright, anywhere in a details object, regardless of nesting.
// Deliberately broad (better to over-redact observability detail than leak a credential into a
// row every service-role-scoped Edge Function and dashboard can read).
const UNSAFE_KEY_PATTERN =
  /(key|token|secret|password|passwd|credential|authorization|api[-_]?key|bearer|cookie|jwt|dsn)/i;
const REDACTED = "[redacted]";
const MAX_REDACT_DEPTH = 6;

/**
 * Recursively strips values behind secret-shaped keys and caps depth/size so a pathological or
 * malicious `details` payload can't blow up a telemetry insert. Shape (arrays/objects/primitives)
 * is otherwise preserved — this is defense-in-depth, not a substitute for callers passing safe
 * data in the first place.
 */
export function redactUnsafeDetails(value: unknown, depth = 0): unknown {
  if (depth >= MAX_REDACT_DEPTH) return "[max-depth]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redactUnsafeDetails(v, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (count++ >= 50) break;
      out[k] = UNSAFE_KEY_PATTERN.test(k) ? REDACTED : redactUnsafeDetails(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 4000) {
    return value.slice(0, 4000) + "…[truncated]";
  }
  return value;
}

/**
 * Converts an arbitrary caught value (an Error, a Postgres/PostgREST error object, a thrown
 * string, ...) into a safe RecipeErrorPayload. Never throws itself.
 */
export function toSafeErrorPayload(
  err: unknown,
  opts: { code?: string; stage?: RecipeJobStage | null; retryable?: boolean } = {},
): RecipeErrorPayload {
  if (err instanceof RecipeAutomationError) return err.toPayload();

  const message = err instanceof Error
    ? err.message
    : typeof err === "string"
    ? err
    : safeStringify(err);

  return recipeErrorPayloadSchema.parse({
    code: opts.code ?? "UNEXPECTED_ERROR",
    message: message.slice(0, 2000),
    stage: opts.stage ?? null,
    retryable: opts.retryable ?? false,
    occurredAt: new Date().toISOString(),
  });
}

export function isRetryableError(err: unknown): boolean {
  return err instanceof RecipeAutomationError ? err.retryable : false;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 2000) ?? String(value);
  } catch {
    return "[unserializable error value]";
  }
}
