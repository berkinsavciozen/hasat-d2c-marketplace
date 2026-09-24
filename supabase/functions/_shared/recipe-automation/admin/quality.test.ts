// Deno.test suite for quality.ts (T10 + DQ-2). Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/
import assert from "node:assert/strict";
import {
  getDraftQualityIssues,
  getRecipeQualityDetail,
  listRecipeQuality,
  mapQualityIssues,
  mapQualityRow,
  qualityListFilter,
  updateIngredientNutrition,
  updateRecipeMeta,
} from "./quality.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

const TAHIN_ISSUE = {
  code: "ALLERGEN_MISSING",
  severity: "kritik",
  message: "Tahin var, susam alerjeni işaretli değil.",
  ingredientId: "00000000-0000-0000-0000-0000000000a1",
  suggestion: { addAllergen: "susam" },
};

function overviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    slug: "tarif",
    title: "Tarif",
    status: "published",
    visibility: "public",
    created_at: "2026-09-24T00:00:00Z",
    has_equipment: true,
    nutrition_complete: true,
    nutrition_source: "computed",
    nutrition_coverage_pct: "100.00",
    nutrition_reference_version: "v1",
    allergens_reviewed_state: true,
    allergens_reviewed: true,
    allergen_labels: [],
    ingredient_count: 3,
    unresolved_ingredient_count: 0,
    quality_issues: [],
    critical_issue_count: 0,
    warning_issue_count: 0,
    issue_count: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapQualityIssues
// ---------------------------------------------------------------------------

Deno.test("mapQualityIssues: passes a well-formed issue through unchanged", () => {
  assert.deepEqual(mapQualityIssues([TAHIN_ISSUE]), [TAHIN_ISSUE]);
});

Deno.test("mapQualityIssues: omits ingredientId/suggestion when absent", () => {
  const issue = { code: "COVER_NOT_HERO", severity: "uyari", message: "Kapak fotoğrafı yok." };
  assert.deepEqual(mapQualityIssues([issue]), [issue]);
});

Deno.test("mapQualityIssues: strips keys outside the UI contract", () => {
  const [issue] = mapQualityIssues([{
    ...TAHIN_ISSUE,
    extra: "x",
    suggestion: { addAllergen: "susam", addEquipment: "ocak" },
  }]);
  assert.deepEqual(issue, TAHIN_ISSUE);
});

Deno.test("mapQualityIssues: drops malformed entries and unknown severities", () => {
  assert.deepEqual(
    mapQualityIssues([
      null,
      "x",
      { code: "A", severity: "fatal", message: "m" },
      { severity: "uyari", message: "no code" },
      { code: "B", severity: "bilgi", message: "ok", suggestion: {} },
    ]),
    [{ code: "B", severity: "bilgi", message: "ok" }],
  );
});

Deno.test("mapQualityIssues: null / non-array -> []", () => {
  assert.deepEqual(mapQualityIssues(null), []);
  assert.deepEqual(mapQualityIssues({}), []);
});

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

Deno.test("mapQualityRow: maps the DQ-2 view columns", () => {
  const item = mapQualityRow(overviewRow({
    quality_issues: [TAHIN_ISSUE],
    critical_issue_count: 1,
    warning_issue_count: 2,
    issue_count: 3,
  }) as Parameters<typeof mapQualityRow>[0]);
  assert.deepEqual(item.qualityIssues, [TAHIN_ISSUE]);
  assert.equal(item.criticalIssueCount, 1);
  assert.equal(item.warningIssueCount, 2);
  assert.equal(item.issueCount, 3);
  assert.equal(item.nutritionCoveragePct, 100);
});

Deno.test("mapQualityRow: null counts (pre-DQ-2 view) default to 0 and issues to []", () => {
  const item = mapQualityRow(overviewRow({
    quality_issues: null,
    critical_issue_count: null,
    warning_issue_count: null,
    issue_count: null,
  }) as Parameters<typeof mapQualityRow>[0]);
  assert.deepEqual(item.qualityIssues, []);
  assert.equal(item.issueCount, 0);
});

Deno.test("qualityListFilter: incomplete keeps T10's 4 conditions and adds issue_count", () => {
  assert.equal(
    qualityListFilter("incomplete"),
    "has_equipment.eq.false,nutrition_complete.eq.false,allergens_reviewed.eq.false," +
      "unresolved_ingredient_count.gt.0,issue_count.gt.0",
  );
  assert.equal(qualityListFilter("issues"), "issue_count.gt.0");
  assert.equal(qualityListFilter("all"), null);
});

function seedOverview(client: FakeSupabaseClient) {
  const clean = overviewRow({ slug: "temiz", created_at: "2026-09-01T00:00:00Z" });
  const missingEquipment = overviewRow({ slug: "ekipmansiz", has_equipment: false, created_at: "2026-09-02T00:00:00Z" });
  const withIssue = overviewRow({
    slug: "tahinli",
    quality_issues: [TAHIN_ISSUE],
    critical_issue_count: 1,
    issue_count: 1,
    created_at: "2026-09-03T00:00:00Z",
  });
  const onlyInfo = overviewRow({
    slug: "bilgi",
    quality_issues: [{ code: "CLASS_NULL", severity: "bilgi", message: "m" }],
    created_at: "2026-09-04T00:00:00Z",
  });
  client.seed("admin_recipe_quality_overview", [clean, missingEquipment, withIssue, onlyInfo]);
}

Deno.test("listRecipeQuality: no mode -> all (T10's unfiltered default)", async () => {
  const client = new FakeSupabaseClient();
  seedOverview(client);
  const result = await listRecipeQuality(asClient(client));
  assert.equal(result.total, 4);
});

Deno.test("listRecipeQuality: mode=incomplete -> T10 gaps OR DQ-2 issues", async () => {
  const client = new FakeSupabaseClient();
  seedOverview(client);
  const result = await listRecipeQuality(asClient(client), { mode: "incomplete" });
  assert.deepEqual(result.recipes.map((r) => r.slug), ["tahinli", "ekipmansiz"]);
  assert.equal(result.total, 2);
});

Deno.test("listRecipeQuality: mode=issues only returns rows with kritik/uyari issues", async () => {
  const client = new FakeSupabaseClient();
  seedOverview(client);
  const result = await listRecipeQuality(asClient(client), { mode: "issues" });
  assert.deepEqual(result.recipes.map((r) => r.slug), ["tahinli"]);
  assert.deepEqual(result.recipes[0].qualityIssues, [TAHIN_ISSUE]);
});

Deno.test("listRecipeQuality: mode=all is unfiltered, newest first, bilgi-only rows included", async () => {
  const client = new FakeSupabaseClient();
  seedOverview(client);
  const result = await listRecipeQuality(asClient(client), { mode: "all" });
  assert.deepEqual(result.recipes.map((r) => r.slug), ["bilgi", "tahinli", "ekipmansiz", "temiz"]);
  assert.equal(result.total, 4);
});

Deno.test("listRecipeQuality: limit/offset page the result, total counts every match", async () => {
  const client = new FakeSupabaseClient();
  seedOverview(client);
  const result = await listRecipeQuality(asClient(client), { mode: "all", limit: 2, offset: 1 });
  assert.deepEqual(result.recipes.map((r) => r.slug), ["tahinli", "ekipmansiz"]);
  assert.equal(result.total, 4);
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

Deno.test("getRecipeQualityDetail: adds meta/cover fields, ingredient note/class and DQ-2 issues", async () => {
  const client = new FakeSupabaseClient();
  const recipeId = crypto.randomUUID();
  client.seed("recipes", [{
    id: recipeId,
    slug: "tahinli-meze",
    title: "Tahinli Meze",
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 0,
    rest_minutes: 15,
    cover_photo_url: "https://x/storage/v1/object/public/crop-photos/tahinli-meze-16x9.webp",
    allergen_labels: [],
    allergens_reviewed: true,
    allergens_reviewed_at: "2026-09-24T00:00:00Z",
    required_equipment: ["ozel-ekipman-gerekmiyor"],
    diet_tags: ["vegan", "vejetaryen"],
    nutrition_source: "computed",
    nutrition_coverage_pct: "100.00",
    nutrition_reference_version: "v1",
    nutrition_calculated_at: "2026-09-24T00:00:00Z",
    nutrition_warnings: [],
    calories: "250.00",
    protein_g: "5",
    carbs_g: "10",
    fat_g: "20",
    fiber_g: "3",
  }]);
  client.seed("recipe_ingredients", [{
    id: TAHIN_ISSUE.ingredientId,
    recipe_id: recipeId,
    sort_order: 0,
    crop: null,
    free_text_name: "tahin",
    quantity: "3",
    unit: "yemek kaşığı",
    nutrition_food_key: "tahini",
    nutrition_exclusion_reason: null,
    note: "iyice karıştırılmış",
    ingredient_class: "platform_disi",
  }]);
  client.onRpc("admin_recipe_quality_issues", (args) => {
    assert.equal(args.p_recipe_id, recipeId);
    return { data: [TAHIN_ISSUE], error: null };
  });

  const detail = await getRecipeQualityDetail(asClient(client), recipeId);
  assert.ok(detail);
  assert.equal(detail.recipe.prepMinutes, 10);
  assert.equal(detail.recipe.cookMinutes, 0);
  assert.equal(detail.recipe.restMinutes, 15);
  assert.equal(detail.recipe.coverPhotoUrl, "https://x/storage/v1/object/public/crop-photos/tahinli-meze-16x9.webp");
  assert.equal(detail.ingredients[0].note, "iyice karıştırılmış");
  assert.equal(detail.ingredients[0].ingredientClass, "platform_disi");
  assert.equal(detail.ingredients[0].quantity, 3);
  assert.deepEqual(detail.issues, [TAHIN_ISSUE]);
});

Deno.test("getRecipeQualityDetail: unknown recipe -> null (no issues RPC needed)", async () => {
  const client = new FakeSupabaseClient();
  assert.equal(await getRecipeQualityDetail(asClient(client), crypto.randomUUID()), null);
});

Deno.test("getDraftQualityIssues: maps the RPC result, null when the job has no draft", async () => {
  const client = new FakeSupabaseClient();
  const jobId = crypto.randomUUID();
  client.onRpc("admin_recipe_draft_quality_issues", (args) =>
    args.p_job_id === jobId ? { data: [TAHIN_ISSUE], error: null } : { data: null, error: null });
  assert.deepEqual(await getDraftQualityIssues(asClient(client), jobId), [TAHIN_ISSUE]);
  assert.equal(await getDraftQualityIssues(asClient(client), crypto.randomUUID()), null);
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function captureIngredientRpc(client: FakeSupabaseClient) {
  const calls: Record<string, unknown>[] = [];
  client.onRpc("admin_update_ingredient_nutrition", (args) => {
    calls.push(args);
    return { data: null, error: null };
  });
  return calls;
}

const INGREDIENT_BASE = {
  ingredientId: "00000000-0000-0000-0000-0000000000a1",
  crop: "salatalık",
  freeTextName: "salatalık",
  quantity: 1,
  unit: "adet",
  nutritionFoodKey: null,
  nutritionExclusionReason: null,
};

Deno.test("updateIngredientNutrition: note omitted -> p_note null (RPC leaves the note unchanged)", async () => {
  const client = new FakeSupabaseClient();
  const calls = captureIngredientRpc(client);
  const result = await updateIngredientNutrition(asClient(client), INGREDIENT_BASE);
  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].p_note, null);
  assert.equal(calls[0].p_crop, "salatalık");
});

Deno.test("updateIngredientNutrition: note null -> '' (clear), string -> as-is", async () => {
  const client = new FakeSupabaseClient();
  const calls = captureIngredientRpc(client);
  await updateIngredientNutrition(asClient(client), { ...INGREDIENT_BASE, note: null });
  await updateIngredientNutrition(asClient(client), { ...INGREDIENT_BASE, note: "rendelenmiş" });
  assert.equal(calls[0].p_note, "");
  assert.equal(calls[1].p_note, "rendelenmiş");
});

Deno.test("updateRecipeMeta: passes all four fields to admin_update_recipe_meta", async () => {
  const client = new FakeSupabaseClient();
  let captured: Record<string, unknown> | null = null;
  client.onRpc("admin_update_recipe_meta", (args) => {
    captured = args;
    return { data: null, error: null };
  });
  const recipeId = crypto.randomUUID();
  const result = await updateRecipeMeta(asClient(client), {
    recipeId,
    servings: 6,
    prepMinutes: 15,
    cookMinutes: null,
    restMinutes: 0,
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(captured, { p_recipe_id: recipeId, p_servings: 6, p_prep: 15, p_cook: null, p_rest: 0 });
});

Deno.test("updateRecipeMeta: NOT_FOUND -> 404, INVALID/CHECK -> 400", async () => {
  const client = new FakeSupabaseClient();
  const responses = [
    { message: "ADMIN_UPDATE_META_NOT_FOUND: recipe x not found", code: "P0001" },
    { message: "ADMIN_UPDATE_META_INVALID_REST: rest_minutes must be >= 0", code: "P0001" },
    { message: 'new row for relation "recipes" violates check constraint "recipes_servings_check"', code: "23514" },
  ];
  client.onRpc("admin_update_recipe_meta", () => ({ data: null, error: responses.shift()! }));
  const params = { recipeId: crypto.randomUUID(), servings: 1, prepMinutes: 0, cookMinutes: 0, restMinutes: 0 };

  const notFound = await updateRecipeMeta(asClient(client), params);
  assert.equal(notFound.ok, false);
  if (!notFound.ok) assert.equal(notFound.status, 404);

  const invalid = await updateRecipeMeta(asClient(client), params);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.deepEqual([invalid.status, invalid.code], [400, "ADMIN_UPDATE_META_INVALID_REST"]);

  const check = await updateRecipeMeta(asClient(client), params);
  assert.equal(check.ok, false);
  if (!check.ok) assert.deepEqual([check.status, check.code], [400, "23514"]);
});
