// Deno.test suite for recalc.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/nutrition/
import assert from "node:assert/strict";
import { invokeNutritionRecalc, predictNutritionInputHash } from "./recalc.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

// A real published recipe's real data, read live from the project during this dispatch
// (recipe f6ebe1b0-b1fc-4f67-b850-bb133766221e) — its actual, engine-written
// nutrition_input_hash is 937a989018f2aa25244b0903cfdd0546. Used as a golden fixture so
// predictNutritionInputHash's formula parity with the SQL engine's own md5() is a real regression
// test, not just internal self-consistency.
const GOLDEN_RECIPE_ID = "f6ebe1b0-b1fc-4f67-b850-bb133766221e";
const GOLDEN_SERVINGS = 10;
const GOLDEN_REFERENCE_VERSION = "v1-orchestrator-compiled-2026-09-09";
const GOLDEN_HASH = "937a989018f2aa25244b0903cfdd0546";
const GOLDEN_INGREDIENTS = [
  { id: "2efdeff5-f4e7-46d9-af48-e1b0603f8630", sort_order: 1, crop: "ceviz", free_text_name: null, quantity: "1", unit: "bardak" },
  { id: "a7600cc6-1533-4329-a528-93071b6de60a", sort_order: 2, crop: "buğday", free_text_name: null, quantity: "2", unit: "bardak" },
  { id: "699d0453-bff6-482c-a8be-031bdd31bc76", sort_order: 3, crop: null, free_text_name: "tereyağı", quantity: "125", unit: "g" },
  { id: "ec884a2f-135b-4340-8ea6-d689ff806896", sort_order: 4, crop: null, free_text_name: "toz şeker", quantity: "0.5", unit: "bardak" },
  { id: "3bab33ce-b8bc-432d-84f3-06db12d81910", sort_order: 5, crop: null, free_text_name: "kabartma tozu", quantity: "1", unit: "çay kaşığı" },
  { id: "01ae1354-8d39-4c39-8250-bc7b880ca13a", sort_order: 6, crop: null, free_text_name: "vanilya", quantity: "1", unit: "adet" },
  { id: "633075a0-be95-417c-a4ae-35763233921e", sort_order: 7, crop: null, free_text_name: "pudra şekeri", quantity: "3", unit: "yemek kaşığı" },
];

function seedGoldenRecipe(client: FakeSupabaseClient, overrides: Record<string, unknown> = {}) {
  client.seed("recipes", [
    {
      id: GOLDEN_RECIPE_ID,
      status: "published",
      servings: GOLDEN_SERVINGS,
      nutrition_input_hash: GOLDEN_HASH,
      ...overrides,
    },
  ]);
  client.seed(
    "recipe_ingredients",
    GOLDEN_INGREDIENTS.map((i) => ({ ...i, recipe_id: GOLDEN_RECIPE_ID })),
  );
  client.seed("crop_nutrition", [
    { id: "ceviz", crop: "ceviz", reference_version: GOLDEN_REFERENCE_VERSION },
    { id: "buğday", crop: "buğday", reference_version: GOLDEN_REFERENCE_VERSION },
  ]);
}

Deno.test("predictNutritionInputHash: matches the SQL engine's own md5() formula for real recorded data", async () => {
  const client = new FakeSupabaseClient();
  seedGoldenRecipe(client);

  const hash = await predictNutritionInputHash(
    asClient(client),
    GOLDEN_RECIPE_ID,
    GOLDEN_SERVINGS,
    GOLDEN_INGREDIENTS,
  );
  assert.equal(hash, GOLDEN_HASH);
});

Deno.test("predictNutritionInputHash: null when servings is missing/<=0", async () => {
  const client = new FakeSupabaseClient();
  seedGoldenRecipe(client);
  assert.equal(await predictNutritionInputHash(asClient(client), GOLDEN_RECIPE_ID, null, GOLDEN_INGREDIENTS), null);
  assert.equal(await predictNutritionInputHash(asClient(client), GOLDEN_RECIPE_ID, 0, GOLDEN_INGREDIENTS), null);
});

Deno.test("predictNutritionInputHash: null when no ingredient row has a crop", async () => {
  const client = new FakeSupabaseClient();
  const noCrop = GOLDEN_INGREDIENTS.map((i) => ({ ...i, crop: null }));
  const hash = await predictNutritionInputHash(asClient(client), GOLDEN_RECIPE_ID, GOLDEN_SERVINGS, noCrop);
  assert.equal(hash, null);
});

Deno.test("predictNutritionInputHash: null when matched crops span 2+ distinct reference_versions", async () => {
  const client = new FakeSupabaseClient();
  client.seed("crop_nutrition", [
    { id: "ceviz", crop: "ceviz", reference_version: "v1" },
    { id: "buğday", crop: "buğday", reference_version: "v2" },
  ]);
  const hash = await predictNutritionInputHash(asClient(client), GOLDEN_RECIPE_ID, GOLDEN_SERVINGS, GOLDEN_INGREDIENTS);
  assert.equal(hash, null);
});

Deno.test("invokeNutritionRecalc: skips the RPC entirely when the predicted hash matches the stored one (idempotency)", async () => {
  const client = new FakeSupabaseClient();
  seedGoldenRecipe(client);

  let rpcCalls = 0;
  client.onRpc("calculate_recipe_nutrition", () => {
    rpcCalls++;
    return { data: null, error: null };
  });

  const result = await invokeNutritionRecalc(asClient(client), GOLDEN_RECIPE_ID);
  assert.equal(result.outcome, "skipped_unchanged");
  assert.equal(rpcCalls, 0);

  // Calling it again is still a no-op — repeated triggers for an unchanged recipe never do work.
  const second = await invokeNutritionRecalc(asClient(client), GOLDEN_RECIPE_ID);
  assert.equal(second.outcome, "skipped_unchanged");
  assert.equal(rpcCalls, 0);
});

Deno.test("invokeNutritionRecalc: calls the RPC once when the ingredient set changed since the stored hash", async () => {
  const client = new FakeSupabaseClient();
  seedGoldenRecipe(client, { nutrition_input_hash: "stale-hash-from-before-the-edit" });

  let rpcCalls = 0;
  client.onRpc("calculate_recipe_nutrition", () => {
    rpcCalls++;
    return { data: null, error: null };
  });

  const result = await invokeNutritionRecalc(asClient(client), GOLDEN_RECIPE_ID);
  assert.equal(result.outcome, "recalculated");
  assert.equal(rpcCalls, 1);
});

Deno.test("invokeNutritionRecalc: safe no-op when the recipe no longer exists (deleted)", async () => {
  const client = new FakeSupabaseClient();
  let rpcCalls = 0;
  client.onRpc("calculate_recipe_nutrition", () => {
    rpcCalls++;
    return { data: null, error: null };
  });

  const result = await invokeNutritionRecalc(asClient(client), crypto.randomUUID());
  assert.equal(result.outcome, "skipped_not_found");
  assert.equal(rpcCalls, 0);
});

Deno.test("invokeNutritionRecalc: safe no-op when the recipe is not (or no longer) published", async () => {
  const client = new FakeSupabaseClient();
  seedGoldenRecipe(client, { status: "draft" });

  let rpcCalls = 0;
  client.onRpc("calculate_recipe_nutrition", () => {
    rpcCalls++;
    return { data: null, error: null };
  });

  const result = await invokeNutritionRecalc(asClient(client), GOLDEN_RECIPE_ID);
  assert.equal(result.outcome, "skipped_not_published");
  assert.equal(rpcCalls, 0);
});

Deno.test("invokeNutritionRecalc: an RPC failure is logged and swallowed, never thrown", async () => {
  const client = new FakeSupabaseClient();
  seedGoldenRecipe(client, { nutrition_input_hash: "stale" });

  client.onRpc("calculate_recipe_nutrition", () => ({
    data: null,
    error: { message: "crop_nutrition lookup failed", code: "XX000" },
  }));

  const result = await invokeNutritionRecalc(asClient(client), GOLDEN_RECIPE_ID);
  assert.equal(result.outcome, "failed");
  assert.equal(result.errorMessage, "crop_nutrition lookup failed");
});

Deno.test("invokeNutritionRecalc: race self-heal — a concurrent ingredient insert during the RPC call triggers exactly one bounded retry", async () => {
  const client = new FakeSupabaseClient();
  seedGoldenRecipe(client, { nutrition_input_hash: "stale" });

  let rpcCalls = 0;
  client.onRpc("calculate_recipe_nutrition", () => {
    rpcCalls++;
    if (rpcCalls === 1) {
      // Simulate a concurrent edit (e.g. a fast second save) landing while this call is "in
      // flight" — a new ingredient row appears between invokeNutritionRecalc's before/after reads.
      client.seed("recipe_ingredients", [
        {
          id: crypto.randomUUID(),
          recipe_id: GOLDEN_RECIPE_ID,
          sort_order: 8,
          crop: null,
          free_text_name: "tarçın",
          quantity: "1",
          unit: "çay kaşığı",
        },
      ]);
    }
    return { data: null, error: null };
  });

  const result = await invokeNutritionRecalc(asClient(client), GOLDEN_RECIPE_ID);
  assert.equal(result.outcome, "recalculated_race_selfheal");
  assert.equal(rpcCalls, 2); // bounded — exactly one extra recompute, never a loop

  // A second race is not detected again after the bounded retry — no infinite recursion even if
  // the ingredient set keeps changing on every single call.
  client.onRpc("calculate_recipe_nutrition", () => {
    rpcCalls++;
    client.seed("recipe_ingredients", [
      { id: crypto.randomUUID(), recipe_id: GOLDEN_RECIPE_ID, sort_order: 9, crop: null, free_text_name: "her seferinde degisen", quantity: "1", unit: "adet" },
    ]);
    return { data: null, error: null };
  });
  const secondResult = await invokeNutritionRecalc(asClient(client), GOLDEN_RECIPE_ID);
  assert.equal(secondResult.outcome, "recalculated_race_selfheal");
  assert.equal(rpcCalls, 4); // 2 more calls (one primary + one bounded retry), not unbounded
});
