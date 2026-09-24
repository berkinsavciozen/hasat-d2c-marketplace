// Deno.test suite for quality-router.ts (admin-recipe-quality routes, T10 + DQ-2). Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/
import assert from "node:assert/strict";
import { handleQualityRequest, parseListMode } from "./quality-router.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

const BASE = "https://x.supabase.co/functions/v1/admin-recipe-quality";
const RECIPE_ID = "00000000-0000-0000-0000-00000000d201";
const INGREDIENT_ID = "00000000-0000-0000-0000-00000000d211";
const JOB_ID = "00000000-0000-0000-0000-00000000d301";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

async function call(client: FakeSupabaseClient, method: string, path: string, body?: unknown) {
  const res = await handleQualityRequest(
    new Request(BASE + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    asClient(client),
  );
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// parseListMode
// ---------------------------------------------------------------------------

Deno.test("parseListMode: default and legacy ?incomplete", () => {
  assert.equal(parseListMode(new URLSearchParams("")), "incomplete");
  assert.equal(parseListMode(new URLSearchParams("incomplete=true")), "incomplete");
  assert.equal(parseListMode(new URLSearchParams("incomplete=false")), "all");
});

Deno.test("parseListMode: ?mode wins over ?incomplete; unknown mode -> null", () => {
  assert.equal(parseListMode(new URLSearchParams("mode=issues&incomplete=true")), "issues");
  assert.equal(parseListMode(new URLSearchParams("mode=all")), "all");
  assert.equal(parseListMode(new URLSearchParams("mode=incomplete")), "incomplete");
  assert.equal(parseListMode(new URLSearchParams("mode=bogus")), null);
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

function seedList(client: FakeSupabaseClient) {
  const row = (slug: string, extra: Record<string, unknown>) => ({
    id: crypto.randomUUID(),
    slug,
    title: slug,
    status: "published",
    visibility: "public",
    created_at: `2026-09-2${slug.length % 10}T00:00:00Z`,
    has_equipment: true,
    nutrition_complete: true,
    nutrition_source: "computed",
    nutrition_coverage_pct: 100,
    nutrition_reference_version: "v1",
    allergens_reviewed_state: true,
    allergens_reviewed: true,
    allergen_labels: [],
    ingredient_count: 1,
    unresolved_ingredient_count: 0,
    quality_issues: [],
    critical_issue_count: 0,
    warning_issue_count: 0,
    issue_count: 0,
    ...extra,
  });
  client.seed("admin_recipe_quality_overview", [
    row("temiz", {}),
    row("besin-eksik", { nutrition_complete: false }),
    row("kapak", {
      quality_issues: [{ code: "COVER_NOT_HERO", severity: "uyari", message: "m" }],
      warning_issue_count: 1,
      issue_count: 1,
    }),
  ]);
}

Deno.test("GET /: no params -> incomplete (T10 gap + DQ-2 issue rows)", async () => {
  const client = new FakeSupabaseClient();
  seedList(client);
  const { status, body } = await call(client, "GET", "");
  assert.equal(status, 200);
  assert.deepEqual(body.recipes.map((r: { slug: string }) => r.slug).sort(), ["besin-eksik", "kapak"]);
});

Deno.test("GET /?incomplete=true keeps working (legacy)", async () => {
  const client = new FakeSupabaseClient();
  seedList(client);
  const { body } = await call(client, "GET", "?incomplete=true");
  assert.equal(body.total, 2);
});

Deno.test("GET /?mode=issues -> only DQ-2 issue rows, with the list contract fields", async () => {
  const client = new FakeSupabaseClient();
  seedList(client);
  const { status, body } = await call(client, "GET", "?mode=issues");
  assert.equal(status, 200);
  assert.equal(body.recipes.length, 1);
  const item = body.recipes[0];
  assert.equal(item.slug, "kapak");
  assert.deepEqual(item.qualityIssues, [{ code: "COVER_NOT_HERO", severity: "uyari", message: "m" }]);
  assert.equal(item.criticalIssueCount, 0);
  assert.equal(item.warningIssueCount, 1);
  assert.equal(item.issueCount, 1);
});

Deno.test("GET /?mode=all -> every row", async () => {
  const client = new FakeSupabaseClient();
  seedList(client);
  const { body } = await call(client, "GET", "?mode=all");
  assert.equal(body.total, 3);
});

Deno.test("GET /?mode=bogus -> 400", async () => {
  const client = new FakeSupabaseClient();
  const { status, body } = await call(client, "GET", "?mode=bogus");
  assert.equal(status, 400);
  assert.equal(body.error, "invalid_mode");
});

// ---------------------------------------------------------------------------
// GET /draft-issues/:jobId
// ---------------------------------------------------------------------------

Deno.test("GET /draft-issues/:jobId -> issues for the job's latest draft", async () => {
  const client = new FakeSupabaseClient();
  const issue = { code: "KCAL_OUTLIER", severity: "uyari", message: "m" };
  client.onRpc("admin_recipe_draft_quality_issues", (args) =>
    args.p_job_id === JOB_ID ? { data: [issue], error: null } : { data: null, error: null });
  const ok = await call(client, "GET", `/draft-issues/${JOB_ID}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { jobId: JOB_ID, issues: [issue] });

  const missing = await call(client, "GET", `/draft-issues/${crypto.randomUUID()}`);
  assert.equal(missing.status, 404);
});

Deno.test("GET /draft-issues/:jobId: invalid id -> 400, wrong method -> 405", async () => {
  const client = new FakeSupabaseClient();
  assert.equal((await call(client, "GET", "/draft-issues/nope")).status, 400);
  assert.equal((await call(client, "POST", `/draft-issues/${JOB_ID}`, {})).status, 405);
  assert.equal((await call(client, "GET", "/draft-issues")).status, 404);
});

// ---------------------------------------------------------------------------
// PATCH /:recipeId/meta
// ---------------------------------------------------------------------------

Deno.test("PATCH /:recipeId/meta -> admin_update_recipe_meta", async () => {
  const client = new FakeSupabaseClient();
  let captured: Record<string, unknown> | null = null;
  client.onRpc("admin_update_recipe_meta", (args) => {
    captured = args;
    return { data: null, error: null };
  });
  const { status, body } = await call(client, "PATCH", `/${RECIPE_ID}/meta`, {
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 15,
    restMinutes: null,
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.deepEqual(captured, { p_recipe_id: RECIPE_ID, p_servings: 4, p_prep: 20, p_cook: 15, p_rest: null });
});

Deno.test("PATCH /:recipeId/meta: body validation", async () => {
  const client = new FakeSupabaseClient();
  const bad = [
    { prepMinutes: 1, cookMinutes: 1, restMinutes: 1 },
    { servings: 0, prepMinutes: 1, cookMinutes: 1, restMinutes: 1 },
    { servings: 1.5, prepMinutes: 1, cookMinutes: 1, restMinutes: 1 },
    { servings: 2, prepMinutes: -1, cookMinutes: 1, restMinutes: 1 },
    { servings: 2, prepMinutes: 1, cookMinutes: "10", restMinutes: 1 },
    { servings: 2, prepMinutes: 1, cookMinutes: 1 },
  ];
  for (const body of bad) {
    assert.equal((await call(client, "PATCH", `/${RECIPE_ID}/meta`, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await call(client, "PATCH", `/${RECIPE_ID}/meta`, "{not json")).status, 400);
  assert.equal((await call(client, "GET", `/${RECIPE_ID}/meta`)).status, 405);
});

Deno.test("PATCH /:recipeId/meta: RPC NOT_FOUND -> 404", async () => {
  const client = new FakeSupabaseClient();
  client.onRpc("admin_update_recipe_meta", () => ({
    data: null,
    error: { message: "ADMIN_UPDATE_META_NOT_FOUND: recipe x not found", code: "P0001" },
  }));
  const { status, body } = await call(client, "PATCH", `/${RECIPE_ID}/meta`, {
    servings: 4,
    prepMinutes: 0,
    cookMinutes: 0,
    restMinutes: 0,
  });
  assert.equal(status, 404);
  assert.equal(body.error, "ADMIN_UPDATE_META_NOT_FOUND");
});

// ---------------------------------------------------------------------------
// PATCH /:recipeId/ingredients/:ingredientId (note)
// ---------------------------------------------------------------------------

const INGREDIENT_BODY = {
  crop: "salatalık",
  freeTextName: "salatalık",
  quantity: 1,
  unit: "adet",
  nutritionFoodKey: null,
  nutritionExclusionReason: null,
};

Deno.test("PATCH ingredients: note absent / null / string map to unchanged / clear / set", async () => {
  const client = new FakeSupabaseClient();
  const calls: Record<string, unknown>[] = [];
  client.onRpc("admin_update_ingredient_nutrition", (args) => {
    calls.push(args);
    return { data: null, error: null };
  });
  const path = `/${RECIPE_ID}/ingredients/${INGREDIENT_ID}`;
  assert.equal((await call(client, "PATCH", path, INGREDIENT_BODY)).status, 200);
  assert.equal((await call(client, "PATCH", path, { ...INGREDIENT_BODY, note: null })).status, 200);
  assert.equal((await call(client, "PATCH", path, { ...INGREDIENT_BODY, note: "rendelenmiş" })).status, 200);
  assert.deepEqual(calls.map((c) => c.p_note), [null, "", "rendelenmiş"]);
  assert.equal(calls[0].p_ingredient_id, INGREDIENT_ID);
});

Deno.test("PATCH ingredients: non-string note -> 400", async () => {
  const client = new FakeSupabaseClient();
  const { status } = await call(client, "PATCH", `/${RECIPE_ID}/ingredients/${INGREDIENT_ID}`, {
    ...INGREDIENT_BODY,
    note: 5,
  });
  assert.equal(status, 400);
});

// ---------------------------------------------------------------------------
// GET /:recipeId (detail) still routes, now with issues
// ---------------------------------------------------------------------------

Deno.test("GET /:recipeId -> detail with issues; unknown -> 404; bad id -> 400", async () => {
  const client = new FakeSupabaseClient();
  client.seed("recipes", [{
    id: RECIPE_ID,
    slug: "s",
    title: "t",
    servings: 2,
    prep_minutes: 5,
    cook_minutes: 5,
    rest_minutes: 0,
    cover_photo_url: null,
    allergen_labels: [],
    allergens_reviewed: false,
    allergens_reviewed_at: null,
    required_equipment: [],
    diet_tags: [],
    nutrition_source: null,
    nutrition_coverage_pct: null,
    nutrition_reference_version: null,
    nutrition_calculated_at: null,
    nutrition_warnings: [],
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
  }]);
  const issue = { code: "COVER_NOT_HERO", severity: "uyari", message: "Kapak fotoğrafı yok." };
  client.onRpc("admin_recipe_quality_issues", () => ({ data: [issue], error: null }));

  const ok = await call(client, "GET", `/${RECIPE_ID}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.issues, [issue]);
  assert.equal(ok.body.recipe.coverPhotoUrl, null);
  assert.equal(ok.body.recipe.prepMinutes, 5);

  assert.equal((await call(client, "GET", `/${crypto.randomUUID()}`)).status, 404);
  assert.equal((await call(client, "GET", "/not-a-uuid")).status, 400);
});
