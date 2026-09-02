// Deno.test suite for allowed-changes.ts — the Step 08A constrained-revision-boundary mechanism.
// Deliberately standalone: only imports ../types.ts (-> ../schemas.ts -> npm:zod) and the fixtures
// file (same import), never revise-stage.ts/infra/agent-runner.ts — no Supabase client, no OpenAI
// SDK, no network dependency at all. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/revise/allowed-changes.test.ts
import assert from "node:assert/strict";
import {
  computeAllowedChangeSurface,
  findOutOfScopeChanges,
  parseIssueFieldPath,
  reconcileOutOfScopeChanges,
} from "./allowed-changes.ts";
import type { RecipeDraftPayload, RecipeQAIssue } from "../types.ts";
import { validKabakRecipeDraft } from "../fixtures/valid-kabak-recipe.ts";

function issue(field: string, overrides: Partial<RecipeQAIssue> = {}): RecipeQAIssue {
  return {
    code: "TEST_ISSUE",
    field,
    severity: "blocking",
    message: "test issue",
    requiredChange: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------
// parseIssueFieldPath
// ---------------------------------------------------------------------------------------------

Deno.test("parseIssueFieldPath: a mutable top-level field name resolves to 'top'", () => {
  assert.deepEqual(parseIssueFieldPath("title"), { kind: "top", field: "title" });
  assert.deepEqual(parseIssueFieldPath("servings"), { kind: "top", field: "servings" });
});

Deno.test("parseIssueFieldPath: an identity/pipeline-owned field name is unresolvable, never grantable", () => {
  for (const field of ["sourceType", "authorType", "visibility", "ownerId", "coverPhotoUrl", "extractionConfidence", "jobId", "briefId"]) {
    assert.deepEqual(parseIssueFieldPath(field), { kind: "unresolvable" }, `expected "${field}" to be unresolvable`);
  }
});

Deno.test("parseIssueFieldPath: bare 'ingredients'/'steps' resolve to whole-array targets", () => {
  assert.deepEqual(parseIssueFieldPath("ingredients"), { kind: "ingredientsWhole" });
  assert.deepEqual(parseIssueFieldPath("steps"), { kind: "stepsWhole" });
});

Deno.test("parseIssueFieldPath: an indexed ingredient/step item resolves to a whole-item target", () => {
  assert.deepEqual(parseIssueFieldPath("ingredients[1]"), { kind: "ingredientItem", index: 1 });
  assert.deepEqual(parseIssueFieldPath("steps[2]"), { kind: "stepItem", stepNo: 2 });
});

Deno.test("parseIssueFieldPath: an indexed ingredient/step sub-field resolves to a field-level target", () => {
  assert.deepEqual(parseIssueFieldPath("ingredients[0].crop"), { kind: "ingredientItemField", index: 0, field: "crop" });
  assert.deepEqual(parseIssueFieldPath("steps[3].instruction"), { kind: "stepItemField", stepNo: 3, field: "instruction" });
});

Deno.test("parseIssueFieldPath: steps[N].photoUrl is unresolvable — never a grantable field, even when named directly", () => {
  assert.deepEqual(parseIssueFieldPath("steps[1].photoUrl"), { kind: "unresolvable" });
});

Deno.test("parseIssueFieldPath: an index-less bracket (STEP_NO_NOT_NUMBER's own shape) is unresolvable", () => {
  assert.deepEqual(parseIssueFieldPath("steps[].stepNo"), { kind: "unresolvable" });
  assert.deepEqual(parseIssueFieldPath("ingredients[]"), { kind: "unresolvable" });
});

Deno.test("parseIssueFieldPath: free text / an unrecognized field name is unresolvable", () => {
  assert.deepEqual(parseIssueFieldPath("the sauce needs more salt"), { kind: "unresolvable" });
  assert.deepEqual(parseIssueFieldPath("notAField"), { kind: "unresolvable" });
});

// ---------------------------------------------------------------------------------------------
// computeAllowedChangeSurface
// ---------------------------------------------------------------------------------------------

Deno.test("computeAllowedChangeSurface: aggregates multiple resolvable blocking issues into one surface", () => {
  const result = computeAllowedChangeSurface([
    issue("ingredients[1]"),
    issue("title"),
    issue("steps[2].instruction"),
  ]);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.ok(result.surface.ingredientIndices.has(1));
  assert.ok(result.surface.topLevelFields.has("title"));
  assert.equal(result.surface.stepItemFields.get(2)?.has("instruction"), true);
});

Deno.test("computeAllowedChangeSurface: one unresolvable issue among several fails the whole computation", () => {
  const unresolvable = issue("the sauce needs more salt", { code: "VAGUE" });
  const result = computeAllowedChangeSurface([issue("title"), unresolvable]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.unresolvedIssue.code, "VAGUE");
});

Deno.test("computeAllowedChangeSurface: empty blockingIssues grants nothing", () => {
  const result = computeAllowedChangeSurface([]);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.surface.topLevelFields.size, 0);
  assert.equal(result.surface.ingredientsWhole, false);
  assert.equal(result.surface.stepsWhole, false);
});

// ---------------------------------------------------------------------------------------------
// findOutOfScopeChanges
// ---------------------------------------------------------------------------------------------

function surfaceFor(issues: RecipeQAIssue[]) {
  const result = computeAllowedChangeSurface(issues);
  assert.ok(result.ok, "expected test fixture issues to all resolve");
  if (!result.ok) throw new Error("unreachable");
  return result.surface;
}

Deno.test("findOutOfScopeChanges: a permitted ingredient removal tied to a blocking issue has no violations", () => {
  const surface = surfaceFor([issue("ingredients[1]")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [validKabakRecipeDraft.ingredients[0]],
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.deepEqual(violations, []);
});

Deno.test("findOutOfScopeChanges: an unrelated title change is rejected", () => {
  const surface = surfaceFor([issue("ingredients[1]")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [validKabakRecipeDraft.ingredients[0]],
    title: "Baska Bir Baslik",
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.includes("title"));
});

Deno.test("findOutOfScopeChanges: an unrelated servings change is rejected", () => {
  const surface = surfaceFor([issue("ingredients[1]")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [validKabakRecipeDraft.ingredients[0]],
    servings: 8,
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.includes("servings"));
});

Deno.test("findOutOfScopeChanges: a step change with no corresponding blocking issue is rejected (proves non-blocking suggestions never grant permission)", () => {
  // Simulates the real pipeline: computeAllowedChangeSurface is only ever called with
  // blockingIssues (see revise-stage.ts) — a nonBlockingSuggestion targeting steps[2].instruction
  // never reaches this function at all, so the surface below has no grant for it.
  const surface = surfaceFor([issue("ingredients[1]")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [validKabakRecipeDraft.ingredients[0]],
    steps: validKabakRecipeDraft.steps.map((s, i) => i === 1 ? { ...s, instruction: "Degistirilmis talimat." } : s),
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.some((v) => v.startsWith("steps[2]")));
});

Deno.test("findOutOfScopeChanges: identity/server-owned fields are always immutable, even alongside an otherwise-valid fix", () => {
  const surface = surfaceFor([issue("ingredients[1]")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [validKabakRecipeDraft.ingredients[0]],
    authorType: "kullanici",
    visibility: "public",
    ownerId: "99999999-9999-4999-8999-999999999999",
    coverPhotoUrl: "https://example.com/fake.jpg",
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.includes("authorType"));
  assert.ok(violations.includes("visibility"));
  assert.ok(violations.includes("ownerId"));
  assert.ok(violations.includes("coverPhotoUrl"));
});

Deno.test("findOutOfScopeChanges: a granted ingredient field-level change is allowed, but only that field", () => {
  const surface = surfaceFor([issue("ingredients[0].quantity")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: validKabakRecipeDraft.ingredients.map((ing, i) => i === 0 ? { ...ing, quantity: 4 } : ing),
  };
  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface), []);

  const candidateTooMuch: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: validKabakRecipeDraft.ingredients.map((ing, i) => i === 0 ? { ...ing, quantity: 4, unit: "kg" } : ing),
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidateTooMuch, surface);
  assert.ok(violations.includes("ingredients[0].unit"));
});

Deno.test("findOutOfScopeChanges: bare 'ingredients' grants the whole array, including adding a new item", () => {
  const surface = surfaceFor([issue("ingredients")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [
      ...validKabakRecipeDraft.ingredients,
      { crop: null, freeTextName: "tuz", quantity: 1, unit: "tatli kasigi", note: null, isKeyIngredient: false, ingredientClass: "platform_disi", sortOrder: 2 },
    ],
  };
  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface), []);
});

Deno.test("findOutOfScopeChanges: steps[N].photoUrl is rejected even when 'steps' is wholly granted", () => {
  const surface = surfaceFor([issue("steps")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    steps: validKabakRecipeDraft.steps.map((s, i) => i === 0 ? { ...s, photoUrl: "https://example.com/step1.jpg" } : s),
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.some((v) => v.endsWith(".photoUrl")));
});

Deno.test("findOutOfScopeChanges: a steps length change without a 'steps' blocking issue is rejected", () => {
  const surface = surfaceFor([issue("ingredients[1]")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [validKabakRecipeDraft.ingredients[0]],
    steps: validKabakRecipeDraft.steps.slice(0, 2),
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.some((v) => v.startsWith("steps:")));
});

Deno.test("findOutOfScopeChanges: an unresolvable-in-practice scenario (ingredient add at a new index, no whole-array grant) is rejected", () => {
  const surface = surfaceFor([issue("ingredients[0].quantity")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [
      ...validKabakRecipeDraft.ingredients,
      { crop: null, freeTextName: "tuz", quantity: 1, unit: "tatli kasigi", note: null, isKeyIngredient: false, ingredientClass: "platform_disi", sortOrder: 2 },
    ],
  };
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.some((v) => v.startsWith("ingredients:")));
});

Deno.test("findOutOfScopeChanges: no changes at all is always in scope, even with an empty surface", () => {
  const surface = surfaceFor([]);
  const candidate: RecipeDraftPayload = { ...validKabakRecipeDraft };
  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface), []);
});

// ---------------------------------------------------------------------------------------------
// reconcileOutOfScopeChanges
// ---------------------------------------------------------------------------------------------
//
// Regression coverage for job 67567ad5-5ee7-4dd9-a60d-6546687d811e (Ayvalı Fırın Tavuk,
// INGREDIENT_CROP_UNKNOWN x5): the Reviser correctly restated the flagged fix, but the SAME agent
// call also "corrected" one or more ingredient `crop` fields QA never flagged at all — under the
// old reject-the-whole-candidate behavior, the job died with REVISER_OUT_OF_SCOPE_CHANGE even
// though it contained a good fix. These tests prove the candidate is no longer discarded wholesale.

Deno.test("reconcileOutOfScopeChanges: a QA-unflagged ingredient's crop change is force-reverted, and the job can proceed", () => {
  const surface = surfaceFor([issue("title")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    title: "Firinda Kabak Musakka (Guncellendi)",
    // ingredients[1] ("kasar peyniri", crop: null) was never named by any blocking issue — the
    // Reviser tried to assign it a crop value anyway, the exact shape of the real bug.
    ingredients: validKabakRecipeDraft.ingredients.map((ing, i) =>
      i === 1 ? { ...ing, crop: "tavuk", freeTextName: null } : ing
    ),
  };

  // The un-reconciled candidate is correctly flagged as out of scope — confirms the test actually
  // exercises the reject path this reconciliation replaces.
  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.some((v) => v.startsWith("ingredients[1]")));

  const reconciled = reconcileOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);

  // The flagged, in-scope fix survives.
  assert.equal(reconciled.title, "Firinda Kabak Musakka (Guncellendi)");
  // The unflagged crop "correction" is forced back to the previous draft's own value — never the
  // Reviser's — rather than the whole candidate being discarded.
  assert.equal(reconciled.ingredients[1].crop, null);
  assert.equal(reconciled.ingredients[1].freeTextName, "kasar peyniri");

  // The job can now proceed: nothing outside the surface survives in the reconciled draft.
  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, reconciled, surface), []);
});

Deno.test("reconcileOutOfScopeChanges: a mixed candidate keeps its granted field fix and reverts its ungranted one on the SAME item", () => {
  const surface = surfaceFor([issue("ingredients[0].quantity")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: validKabakRecipeDraft.ingredients.map((ing, i) =>
      i === 0 ? { ...ing, quantity: 2, unit: "kg" } : ing
    ),
  };

  const violations = findOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.ok(violations.includes("ingredients[0].unit"));
  assert.ok(!violations.includes("ingredients[0].quantity"));

  const reconciled = reconcileOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);

  // Granted field: the Reviser's new value is kept.
  assert.equal(reconciled.ingredients[0].quantity, 2);
  // Ungranted field on the very same item: forced back to the previous draft's value.
  assert.equal(reconciled.ingredients[0].unit, "adet");
  // Every other ingredient, and every other field on this one, is untouched.
  assert.deepEqual(reconciled.ingredients[1], validKabakRecipeDraft.ingredients[1]);

  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, reconciled, surface), []);
});

Deno.test("reconcileOutOfScopeChanges: identity/server-owned fields are force-reverted even when nothing else is out of scope", () => {
  const surface = surfaceFor([issue("title")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    title: "Yeni Baslik",
    visibility: "public",
    ownerId: "99999999-9999-4999-8999-999999999999",
  };

  const reconciled = reconcileOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);

  assert.equal(reconciled.title, "Yeni Baslik");
  assert.equal(reconciled.visibility, validKabakRecipeDraft.visibility);
  assert.equal(reconciled.ownerId, validKabakRecipeDraft.ownerId);
  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, reconciled, surface), []);
});

Deno.test("reconcileOutOfScopeChanges: an unrecognized structural change reverts the whole affected array", () => {
  const surface = surfaceFor([issue("ingredients[0].quantity")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    ingredients: [
      ...validKabakRecipeDraft.ingredients,
      { crop: null, freeTextName: "tuz", quantity: 1, unit: "tatli kasigi", note: null, isKeyIngredient: false, ingredientClass: "platform_disi", sortOrder: 2 },
    ],
  };

  const reconciled = reconcileOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);

  assert.deepEqual(reconciled.ingredients, validKabakRecipeDraft.ingredients);
  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, reconciled, surface), []);
});

Deno.test("reconcileOutOfScopeChanges: steps[N].photoUrl is force-reverted even when 'steps' is wholly granted", () => {
  const surface = surfaceFor([issue("steps")]);
  const candidate: RecipeDraftPayload = {
    ...validKabakRecipeDraft,
    steps: validKabakRecipeDraft.steps.map((s, i) =>
      i === 0 ? { ...s, instruction: "Guncellenmis talimat.", photoUrl: "https://example.com/step1.jpg" } : s
    ),
  };

  const reconciled = reconcileOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);

  assert.equal(reconciled.steps[0].instruction, "Guncellenmis talimat.");
  assert.equal(reconciled.steps[0].photoUrl, null);
  assert.deepEqual(findOutOfScopeChanges(validKabakRecipeDraft, reconciled, surface), []);
});

Deno.test("reconcileOutOfScopeChanges: no out-of-scope changes leaves the candidate untouched", () => {
  const surface = surfaceFor([issue("title")]);
  const candidate: RecipeDraftPayload = { ...validKabakRecipeDraft, title: "Yeni Baslik" };
  const reconciled = reconcileOutOfScopeChanges(validKabakRecipeDraft, candidate, surface);
  assert.deepEqual(reconciled, candidate);
});
