// Deno.test suite for agent-runner.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/infra/agent-runner.test.ts
//
// F2 Step 06 (P1 preflight): now that createAgentRunner() defaults to "sdk" and SdkAgentRunner
// makes a REAL network call to the model provider inside .run(), this suite deliberately never
// calls .run() on an sdk-mode runner — a unit test must not fire live network requests (no
// OPENAI_API_KEY / no network egress in this sandbox, and even where both exist a unit test
// should not depend on a paid external call). Mode-resolution logic is tested directly via
// resolveAgentRuntimeMode() instead, which is pure and has no SDK/network dependency. The
// deno-native path IS still exercised via .run() — it rejects synchronously, no network involved.
import assert from "node:assert/strict";
import { createAgentRunner, resolveAgentRuntimeMode, sanitizeForStructuredOutput } from "./agent-runner.ts";
import { RecipeAutomationError } from "./errors.ts";
import { z } from "npm:zod@3.23.8";

const ENV_VAR = "RECIPE_AGENT_RUNTIME";

Deno.test("resolveAgentRuntimeMode: defaults to sdk when unset (Step 01/P1 live-call gate passed)", () => {
  Deno.env.delete(ENV_VAR);
  assert.equal(resolveAgentRuntimeMode(), "sdk");
});

Deno.test("resolveAgentRuntimeMode: explicit mode overrides env var", () => {
  Deno.env.set(ENV_VAR, "sdk");
  try {
    assert.equal(resolveAgentRuntimeMode("deno-native"), "deno-native");
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});

Deno.test("resolveAgentRuntimeMode: env var selects the runtime when no explicit mode given", () => {
  Deno.env.set(ENV_VAR, "deno-native");
  try {
    assert.equal(resolveAgentRuntimeMode(), "deno-native");
  } finally {
    Deno.env.delete(ENV_VAR);
  }
});

Deno.test("createAgentRunner: invalid mode throws a typed, clear error", () => {
  assert.throws(
    () => createAgentRunner("not-a-real-mode" as never),
    (err: unknown) => err instanceof RecipeAutomationError && err.code === "AGENT_RUNTIME_MODE_INVALID",
  );
});

Deno.test("createAgentRunner: deno-native runner rejects NOT_IMPLEMENTED (no network involved)", async () => {
  const runner = createAgentRunner("deno-native");
  await assert.rejects(
    () => runner.run({ agentName: "planner", systemPrompt: "x", input: {} }),
    (err: unknown) => err instanceof RecipeAutomationError && err.code === "AGENT_RUNNER_NOT_IMPLEMENTED",
  );
});

// sanitizeForStructuredOutput: pure, no network — safe to exercise directly and thoroughly.
// Regression coverage for the two live-verified OpenAI Structured Outputs incompatibilities (see
// agent-runner.ts's own header for the full write-up and probe evidence).

Deno.test("sanitizeForStructuredOutput: unwraps a top-level .refine() (ZodEffects)", () => {
  const refined = z.object({ a: z.string() }).strict().refine((v) => v.a.length > 0);
  const sanitized = sanitizeForStructuredOutput(refined);
  assert.equal((sanitized as unknown as { _def: { typeName: string } })._def.typeName, "ZodObject");
});

Deno.test("sanitizeForStructuredOutput: strips a url() check from a nested string field", () => {
  const schema = z.object({ coverPhotoUrl: z.string().url().nullable() }).strict();
  const sanitized = sanitizeForStructuredOutput(schema) as z.ZodObject<z.ZodRawShape>;
  const field = sanitized.shape.coverPhotoUrl;
  const inner = (field as unknown as { _def: { innerType: { _def: { checks: Array<{ kind: string }> } } } })
    ._def.innerType._def.checks;
  assert.ok(!inner.some((c) => c.kind === "url"), "url check must be stripped");
  // The field still parses ordinary strings — nothing else about it broke.
  assert.equal(sanitized.parse({ coverPhotoUrl: "not a url at all" }).coverPhotoUrl, "not a url at all");
});

Deno.test("sanitizeForStructuredOutput: preserves other string checks (min/max) alongside stripping url", () => {
  const schema = z.string().min(3).max(10).url();
  const sanitized = sanitizeForStructuredOutput(schema);
  assert.throws(() => sanitized.parse("ab")); // still enforces min(3)
  assert.equal(sanitized.parse("hello"), "hello");
});

Deno.test("sanitizeForStructuredOutput: recurses through arrays, preserving min/max", () => {
  const schema = z.array(z.object({ photoUrl: z.string().url().nullable() }).strict()).min(1).max(5);
  const sanitized = sanitizeForStructuredOutput(schema);
  assert.throws(() => sanitized.parse([])); // still enforces min(1)
  assert.equal(sanitized.parse([{ photoUrl: null }]).length, 1);
});

Deno.test("sanitizeForStructuredOutput: a full recipeDraftPayloadSchema-shaped schema round-trips through Structured-Output-safe reconstruction", () => {
  // Mirrors schemas.ts's actual recipeDraftPayloadSchema shape closely enough to prove the whole
  // pipeline (refine unwrap + nested object/array recursion + url stripping) works together.
  const draftLike = z.object({
    jobId: z.string().uuid(),
    title: z.string().min(1).max(200),
    coverPhotoUrl: z.string().url().nullable().default(null),
    ingredients: z.array(z.object({
      crop: z.string().nullable().default(null),
      freeTextName: z.string().nullable().default(null),
    }).strict()).min(1).max(60),
    steps: z.array(z.object({
      stepNo: z.number().int().positive(),
      photoUrl: z.string().url().nullable().default(null),
    }).strict()).min(1).max(60),
  }).strict().refine((d) => d.steps.length > 0, { message: "needs steps" });

  const sanitized = sanitizeForStructuredOutput(draftLike);
  // Sanitized schema is a plain ZodObject now, not still wrapped in ZodEffects.
  assert.equal((sanitized as unknown as { _def: { typeName: string } })._def.typeName, "ZodObject");
  // Behaviorally: a non-URL string in a formerly-.url() field must now parse cleanly everywhere
  // it appears (top-level coverPhotoUrl AND nested steps[].photoUrl) — proves the url check is
  // gone at every depth, without relying on internal _def shape assumptions.
  const parsed = sanitized.parse({
    jobId: "11111111-1111-4111-8111-111111111111",
    title: "Test",
    coverPhotoUrl: "not-a-url",
    ingredients: [{ crop: "kabak", freeTextName: null }],
    steps: [{ stepNo: 1, photoUrl: "also-not-a-url" }],
  });
  assert.equal((parsed as { coverPhotoUrl: string }).coverPhotoUrl, "not-a-url");
});

Deno.test("createAgentRunner: callers only ever depend on the AgentRunner interface shape", () => {
  // Both concrete implementations satisfy the exact same shape — this is the seam future stage
  // agents (Writer/QA/Planner) call through without knowing which one is active. Deliberately does
  // NOT call .run() on the sdk-mode runner (see file header) — this only checks the shape.
  for (const mode of ["sdk", "deno-native"] as const) {
    const runner = createAgentRunner(mode);
    assert.equal(typeof runner.run, "function");
  }
});
