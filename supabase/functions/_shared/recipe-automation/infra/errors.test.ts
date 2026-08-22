// Deno.test suite for errors.ts. Run with:
//   deno test --allow-net supabase/functions/_shared/recipe-automation/infra/errors.test.ts
import assert from "node:assert/strict";
import { RecipeAutomationError, redactUnsafeDetails, toSafeErrorPayload } from "./errors.ts";
import { recipeErrorPayloadSchema } from "../schemas.ts";

Deno.test("RecipeAutomationError.toPayload() parses against recipeErrorPayloadSchema", () => {
  const err = new RecipeAutomationError({
    code: "PROVIDER_TIMEOUT",
    message: "provider took too long",
    stage: "write",
    retryable: true,
  });
  const payload = err.toPayload();
  const result = recipeErrorPayloadSchema.safeParse(payload);
  assert.equal(result.success, true);
});

Deno.test("redactUnsafeDetails: strips secret-shaped keys at any depth", () => {
  const input = {
    jobId: "abc-123",
    apiKey: "sk-super-secret",
    nested: { authorization: "Bearer xyz", safeField: "ok" },
  };
  const out = redactUnsafeDetails(input) as Record<string, unknown>;
  assert.equal(out.jobId, "abc-123");
  assert.equal(out.apiKey, "[redacted]");
  assert.equal((out.nested as Record<string, unknown>).authorization, "[redacted]");
  assert.equal((out.nested as Record<string, unknown>).safeField, "ok");
});

Deno.test("redactUnsafeDetails: caps depth on pathological nesting", () => {
  let deep: Record<string, unknown> = { leaf: true };
  for (let i = 0; i < 20; i++) deep = { child: deep };
  const out = redactUnsafeDetails(deep);
  assert.equal(typeof out, "object");
});

Deno.test("toSafeErrorPayload: wraps a plain Error safely", () => {
  const payload = toSafeErrorPayload(new Error("boom"), { code: "UNEXPECTED_ERROR" });
  assert.equal(payload.code, "UNEXPECTED_ERROR");
  assert.equal(payload.message, "boom");
  const result = recipeErrorPayloadSchema.safeParse(payload);
  assert.equal(result.success, true);
});

Deno.test("toSafeErrorPayload: never throws on a weird thrown value", () => {
  const payload = toSafeErrorPayload({ circular: "will not JSON.stringify cleanly" }, {});
  assert.equal(typeof payload.message, "string");
});

Deno.test("toSafeErrorPayload: passes through an existing RecipeAutomationError unchanged", () => {
  const err = new RecipeAutomationError({ code: "JOB_NOT_FOUND", message: "no such job", retryable: false });
  const payload = toSafeErrorPayload(err);
  assert.equal(payload.code, "JOB_NOT_FOUND");
  assert.equal(payload.retryable, false);
});
