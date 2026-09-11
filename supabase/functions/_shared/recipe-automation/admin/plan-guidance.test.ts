// Deno.test suite for plan-guidance.ts. Run with:
//   deno test --allow-net --allow-env supabase/functions/_shared/recipe-automation/admin/plan-guidance.test.ts
import assert from "node:assert/strict";
import { checkTitleDuplicates, getCatalogGuidance } from "./plan-guidance.ts";
import { FakeSupabaseClient } from "../infra/testing/fake-supabase-client.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

function asClient(client: FakeSupabaseClient): SupabaseClient {
  return client as unknown as SupabaseClient;
}

Deno.test("getCatalogGuidance: empty focusCrops returns no per-crop recipes but still loads recentMix", async () => {
  const client = new FakeSupabaseClient();
  client.onRpc("get_recent_recipe_mix", () => ({
    data: [{ crop: "kabak", display_name: "Kabak", recipe_count: 4, last_created_at: "2026-01-01T00:00:00Z" }],
    error: null,
  }));

  const result = await getCatalogGuidance(asClient(client), { focusCrops: [] });

  assert.deepEqual(result.existingByCrop, []);
  assert.equal(result.recentMix.length, 1);
  assert.equal(result.recentMix[0].crop, "kabak");
});

Deno.test("getCatalogGuidance: calls search_existing_recipes crop-scoped and published-scoped for each focusCrop", async () => {
  const client = new FakeSupabaseClient();
  const seenArgs: Record<string, unknown>[] = [];
  client.onRpc("search_existing_recipes", (args) => {
    seenArgs.push(args);
    return {
      data: [{
        id: "11111111-1111-4111-8111-111111111111",
        slug: `${args.p_crop}-tarifi`,
        title: `${args.p_crop} Tarifi`,
        status: "published",
        created_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    };
  });
  client.onRpc("get_recent_recipe_mix", () => ({ data: [], error: null }));

  const result = await getCatalogGuidance(asClient(client), { focusCrops: ["kabak", "biber"] });

  assert.equal(result.existingByCrop.length, 2);
  assert.equal(result.existingByCrop[0].crop, "kabak");
  assert.equal(result.existingByCrop[0].recipes[0].title, "kabak Tarifi");
  assert.equal(result.existingByCrop[1].crop, "biber");
  for (const args of seenArgs) {
    assert.equal(args.p_status, "published");
    assert.equal(args.p_query, null);
  }
});

Deno.test("getCatalogGuidance: de-dupes and caps focusCrops at 5", async () => {
  const client = new FakeSupabaseClient();
  let callCount = 0;
  client.onRpc("search_existing_recipes", () => {
    callCount++;
    return { data: [], error: null };
  });
  client.onRpc("get_recent_recipe_mix", () => ({ data: [], error: null }));

  await getCatalogGuidance(asClient(client), {
    focusCrops: ["kabak", "kabak", "a", "b", "c", "d", "e", "f"],
  });

  assert.equal(callCount, 5);
});

Deno.test("checkTitleDuplicates: returns [] for a blank workingTitle without calling the RPC", async () => {
  const client = new FakeSupabaseClient();
  let called = false;
  client.onRpc("find_recipe_duplicates", () => {
    called = true;
    return { data: [], error: null };
  });

  const result = await checkTitleDuplicates(asClient(client), { workingTitle: "   " });

  assert.deepEqual(result, []);
  assert.equal(called, false);
});

Deno.test("checkTitleDuplicates: passes a null slug (no slug exists yet for an unpromoted brief)", async () => {
  const client = new FakeSupabaseClient();
  let seenArgs: Record<string, unknown> | null = null;
  client.onRpc("find_recipe_duplicates", (args) => {
    seenArgs = args;
    return { data: [], error: null };
  });

  await checkTitleDuplicates(asClient(client), { workingTitle: "Firinda Kabak Musakka", focusCrop: "kabak" });

  assert.equal(seenArgs!.p_slug, null);
  assert.equal(seenArgs!.p_title, "Firinda Kabak Musakka");
  assert.equal(seenArgs!.p_crop, "kabak");
  assert.equal(seenArgs!.p_limit, 5);
});

Deno.test("checkTitleDuplicates: returns the RPC's real match reasons, unmodified", async () => {
  const client = new FakeSupabaseClient();
  client.onRpc("find_recipe_duplicates", () => ({
    data: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        slug: "firinda-kabak-musakka",
        title: "Firinda Kabak Musakka",
        match_reason: "exact_title",
        status: "published",
        visibility: "public",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        slug: "kabakli-firin-yemegi",
        title: "Kabakli Firin Yemegi",
        match_reason: "same_crop_and_title_word",
        status: "published",
        visibility: "public",
      },
    ],
    error: null,
  }));

  const result = await checkTitleDuplicates(asClient(client), {
    workingTitle: "Firinda Kabak Musakka",
    focusCrop: "kabak",
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].matchReason, "exact_title");
  assert.equal(result[1].matchReason, "same_crop_and_title_word");
});

Deno.test("checkTitleDuplicates: an RPC error surfaces as a retryable RecipeAutomationError", async () => {
  const client = new FakeSupabaseClient();
  client.onRpc("find_recipe_duplicates", () => ({ data: null, error: { message: "boom", code: "XX000" } }));

  await assert.rejects(
    () => checkTitleDuplicates(asClient(client), { workingTitle: "Test Tarif" }),
    /find_recipe_duplicates RPC failed/,
  );
});
