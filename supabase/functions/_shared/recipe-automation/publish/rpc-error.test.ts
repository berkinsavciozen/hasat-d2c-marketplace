import assert from "node:assert/strict";
import { parsePublishRpcError } from "./rpc-error.ts";

Deno.test("parsePublishRpcError: maps a known PUBLISH_ code to its typed outcome", () => {
  const parsed = parsePublishRpcError({ message: 'PUBLISH_SLUG_ALREADY_USED: slug "x" is already used' });
  assert.equal(parsed.code, "PUBLISH_SLUG_ALREADY_USED");
  assert.equal(parsed.outcome, "slug_already_used");
  assert.equal(parsed.retryable, false);
  assert.equal(parsed.message, 'slug "x" is already used');
});

Deno.test("parsePublishRpcError: retryable codes are flagged retryable", () => {
  for (const code of ["PUBLISH_LOCK_LOST", "PUBLISH_LOCK_LOST_AT_COMMIT", "PUBLISH_NO_DRAFT", "PUBLISH_MISSING_ASSETS"]) {
    const parsed = parsePublishRpcError({ message: `${code}: some detail` });
    assert.equal(parsed.retryable, true, `expected ${code} to be retryable`);
  }
});

Deno.test("parsePublishRpcError: non-retryable content/state codes are flagged non-retryable", () => {
  for (
    const code of [
      "PUBLISH_JOB_NOT_FOUND",
      "PUBLISH_SLUG_INVALID_FORMAT",
      "PUBLISH_QA_RESULT_MISSING",
      "PUBLISH_QA_NOT_CLEAN",
      "PUBLISH_SAFETY_CHECKLIST_INCOMPLETE",
      "PUBLISH_VALIDATION_FAILED",
      "PUBLISH_SLUG_ALREADY_USED",
      "PUBLISH_FINAL_VALIDATION_FAILED",
    ]
  ) {
    const parsed = parsePublishRpcError({ message: `${code}: some detail` });
    assert.equal(parsed.retryable, false, `expected ${code} to be non-retryable`);
  }
});

Deno.test("parsePublishRpcError: an unrecognized CODE: message shape falls back to a retryable unexpected_error", () => {
  const parsed = parsePublishRpcError({ message: "SOME_OTHER_CODE: unrelated failure" });
  assert.equal(parsed.code, "SOME_OTHER_CODE");
  assert.equal(parsed.outcome, "unexpected_error");
  assert.equal(parsed.retryable, true);
});

Deno.test("parsePublishRpcError: a raw Postgres error with no CODE: prefix falls back safely", () => {
  const parsed = parsePublishRpcError({ message: "connection terminated unexpectedly" });
  assert.equal(parsed.code, "PUBLISH_RPC_UNEXPECTED_ERROR");
  assert.equal(parsed.outcome, "unexpected_error");
  assert.equal(parsed.retryable, true);
});

Deno.test("parsePublishRpcError: a non-object thrown value never throws itself", () => {
  const parsed = parsePublishRpcError("plain string error");
  assert.equal(parsed.code, "PUBLISH_RPC_UNEXPECTED_ERROR");
  assert.equal(parsed.message, "plain string error");
});
