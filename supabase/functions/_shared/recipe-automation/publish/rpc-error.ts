// F2 Recipe Automation — Step 12: maps publish_recipe_draft's RAISE EXCEPTION codes back to a
// typed outcome + retryability, the same way every other stage's precondition branches are typed
// (see finalize-stage.ts's RunFinalizeStageOutcome). The RPC (../../migrations/
// 20260826130000_f2s12_recipe_publish_rpc.sql) always raises with a `CODE: human message` shape —
// SCREAMING_SNAKE_CASE code, colon, then free text — matching recipeErrorPayloadSchema.code's own
// regex, so the two layers never need two independent vocabularies for the same failure.
import type { RunPublishStageOutcome } from "./publish-stage.ts";

export interface ParsedPublishRpcError {
  code: string;
  message: string;
  outcome: RunPublishStageOutcome;
  retryable: boolean;
}

const CODE_PATTERN = /^([A-Z][A-Z0-9_]*):\s*(.*)$/s;

const OUTCOME_BY_CODE: Record<string, { outcome: RunPublishStageOutcome; retryable: boolean }> = {
  PUBLISH_JOB_NOT_FOUND: { outcome: "job_not_found", retryable: false },
  PUBLISH_LOCK_LOST: { outcome: "lock_lost", retryable: true },
  PUBLISH_LOCK_LOST_AT_COMMIT: { outcome: "lock_lost", retryable: true },
  PUBLISH_SLUG_INVALID_FORMAT: { outcome: "slug_invalid", retryable: false },
  PUBLISH_NO_DRAFT: { outcome: "no_current_draft", retryable: true },
  PUBLISH_QA_RESULT_MISSING: { outcome: "no_approved_qa_result", retryable: false },
  PUBLISH_QA_NOT_CLEAN: { outcome: "no_approved_qa_result", retryable: false },
  PUBLISH_SAFETY_CHECKLIST_INCOMPLETE: { outcome: "safety_checklist_incomplete", retryable: false },
  PUBLISH_MISSING_ASSETS: { outcome: "missing_assets", retryable: true },
  PUBLISH_VALIDATION_FAILED: { outcome: "postgres_validation_failed", retryable: false },
  PUBLISH_SLUG_ALREADY_USED: { outcome: "slug_already_used", retryable: false },
  PUBLISH_FINAL_VALIDATION_FAILED: { outcome: "final_validation_failed", retryable: false },
};

/** Parses a PostgrestError (or any thrown value with a `message`) from `client.rpc("publish_recipe_draft", ...)`
 * into a typed outcome. An unrecognized shape (a raw Postgres error the RPC didn't itself raise —
 * an unexpected constraint violation, a connection failure) falls back to a generic retryable
 * infra failure rather than throwing, matching `toSafeErrorPayload`'s "never throw" contract. */
export function parsePublishRpcError(err: unknown): ParsedPublishRpcError {
  const rawMessage = err && typeof err === "object" && "message" in err
    ? String((err as { message: unknown }).message)
    : String(err);

  const match = CODE_PATTERN.exec(rawMessage);
  if (match) {
    const [, code, rest] = match;
    const mapped = OUTCOME_BY_CODE[code];
    if (mapped) {
      return { code, message: rest || rawMessage, outcome: mapped.outcome, retryable: mapped.retryable };
    }
    return { code, message: rest || rawMessage, outcome: "unexpected_error", retryable: true };
  }

  return { code: "PUBLISH_RPC_UNEXPECTED_ERROR", message: rawMessage, outcome: "unexpected_error", retryable: true };
}
