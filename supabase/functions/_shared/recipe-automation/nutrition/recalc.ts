// F0-24 lifecycle wiring — best-effort nutrition recalculation trigger.
//
// Invokes the F0-24 deterministic nutrition engine
// (`calculate_recipe_nutrition`, ../../../migrations/20260909120000_f024_recipe_nutrition_calc_engine.sql)
// from service_role context. That migration's own header explicitly leaves this wiring for later:
// "None of the above is wired here; that is T4-B's (or a later dispatch's) job." This module IS
// that later dispatch's job — it never touches calculate_recipe_nutrition's own SQL body or grants,
// it only adds new service-role callers of it.
//
// `invokeNutritionRecalc` is designed to be called from every lifecycle point that should keep a
// recipe's nutrition_* columns current. As of this dispatch, exactly one real call site exists —
// ../publish/publish-stage.ts, on a genuine F2 publish transition. See this dispatch's PR
// description for why F7 (post-edit save) and T6/F11 (AI-customization clone) are NOT wired here:
// neither has a real write path inside this repo today.
//
// Contract (all required by dispatch, none optional):
//  1. Idempotent, input-hash based — see predictNutritionInputHash below. A predictable no-op skips
//     the RPC call entirely (no work, no log line), never just silently re-running it.
//  2. Race-safe, bounded — if the ingredient set visibly changed between our own pre-call snapshot
//     and post-call snapshot, we recompute exactly once more so the stored result reflects the
//     newer edit instead of our own now-stale one. Never loops.
//  3. Safe no-op for a deleted/unpublished recipe — checked BEFORE ever calling the RPC.
//  4. Never throws. Every exported function here resolves; a failure is logged via console.error
//     (visible in the Edge Function's own logs) and reported back in the returned outcome, but never
//     propagates to the caller's main publish/edit/clone flow.
//  5. Does not touch anon/authenticated grants — nothing here runs outside a service-role client
//     already gated the same way every other stage-runner in this pipeline is.
// Pinned to 0.216.0 rather than the 0.224.0 already used elsewhere in this pipeline
// (../infra/supabase-admin.ts's http/server.ts import) deliberately: 0.224.0's crypto/mod.ts wasm
// module trips a `deno test` module-graph resolution bug in this sandbox ("Expected a JavaScript
// or TypeScript module, but identified a Unknown module" on its own .d.mts) that `deno check`/
// `deno run` don't hit — 0.216.0 exercises the exact same MD5 digest API without it.
import { crypto as stdCrypto } from "https://deno.land/std@0.216.0/crypto/mod.ts";
import type { SupabaseClient } from "../infra/supabase-admin.ts";

const F024_HASH_VERSION = "f024-v1";

export type NutritionRecalcOutcome =
  | "recalculated"
  | "recalculated_race_selfheal"
  | "skipped_unchanged"
  | "skipped_not_found"
  | "skipped_not_published"
  | "failed";

export interface NutritionRecalcResult {
  outcome: NutritionRecalcOutcome;
  recipeId: string;
  /** Set only on "failed" — the underlying error message, for the caller's own logs if it wants it. */
  errorMessage?: string;
}

interface RecipeNutritionRow {
  id: string;
  status: string | null;
  servings: number | null;
  nutrition_input_hash: string | null;
}

interface IngredientRow {
  id: string;
  sort_order: number;
  crop: string | null;
  free_text_name: string | null;
  quantity: number | string | null;
  unit: string | null;
}

async function loadRecipeRow(client: SupabaseClient, recipeId: string): Promise<RecipeNutritionRow | null> {
  const { data, error } = await client
    .from("recipes")
    .select("id, status, servings, nutrition_input_hash")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) throw error;
  return (data as RecipeNutritionRow | null) ?? null;
}

/** Matches the engine's own `order by ri.sort_order, ri.id` byte-for-byte — sorted here in TS
 * rather than trusted to the query builder's own `.order()` chaining, since supabase-js's real
 * multi-column `.order().order()` behavior isn't something this module should have to assume a
 * caller's client wires up correctly (and the shared FakeSupabaseClient test double, deliberately
 * minimal, only tracks a single order column — see its own header). `id` compared as a plain
 * string, not locale-aware, matching Postgres' own byte-order UUID comparison. */
function sortLikeEngine(rows: IngredientRow[]): IngredientRow[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

async function loadIngredientRows(client: SupabaseClient, recipeId: string): Promise<IngredientRow[]> {
  const { data, error } = await client
    .from("recipe_ingredients")
    .select("id, sort_order, crop, free_text_name, quantity, unit")
    .eq("recipe_id", recipeId);
  if (error) throw error;
  return sortLikeEngine((data ?? []) as IngredientRow[]);
}

/** `crop:free_text_name:quantity:unit` fragments joined the same way the engine's own string_agg
 * does. Used two ways below: as the tail of the predicted input hash, and — unhashed — as a cheap
 * "did the ingredient set actually change" fingerprint for the race self-heal check. */
function ingredientFingerprint(rows: IngredientRow[]): string {
  return rows
    .map((r) => `${r.crop ?? ""}:${r.free_text_name ?? ""}:${r.quantity ?? ""}:${r.unit ?? ""}`)
    .join(",");
}

async function md5Hex(input: string): Promise<string> {
  const digest = await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Predicts the exact `nutrition_input_hash` calculate_recipe_nutrition would (re)write for the
 * CURRENT recipe_ingredients/servings state, so invokeNutritionRecalc can skip calling it entirely
 * when nothing that would change its output has changed (dispatch requirement #1).
 *
 * Deliberately mirrors that migration's own one-line md5() formula byte-for-byte — verified against
 * a live published recipe's real, engine-written nutrition_input_hash during this dispatch. This is
 * NOT a reimplementation of the engine's nutrition math (grams/macros/coverage) — only of the
 * fingerprint string that decides whether to re-run it, the same "resolve the one input the RPC
 * cannot derive itself" precedent ../publish/publish-stage.ts already sets for slugifyTitle.
 *
 * Returns null — "cannot safely predict, always call the RPC" — whenever reproducing the engine's
 * exact output isn't possible from here alone:
 *  - servings missing/<=0: the engine's own "unavailable" branch, which also depends on
 *    matched_grams<=0 — replicating THAT condition would mean reimplementing
 *    fn_recipe_ingredient_grams' gram resolution too, out of scope for a skip-optimization.
 *  - no ingredient row has a crop at all: nothing to look reference_version up against.
 *  - the matched crops resolve to zero, or 2+, distinct crop_nutrition.reference_version values: the
 *    engine's own per-ingredient loop has no ORDER BY over its recipe_ingredients×crop_nutrition
 *    join, so with 2+ distinct values this module cannot reproduce its exact iteration order (with
 *    exactly one distinct value, as is true of every crop_nutrition row at the time of this
 *    dispatch, order is moot).
 * A null return only ever costs one extra, always-correct RPC call — see invokeNutritionRecalc.
 */
export async function predictNutritionInputHash(
  client: SupabaseClient,
  recipeId: string,
  servings: number | null,
  ingredients: IngredientRow[],
): Promise<string | null> {
  if (servings == null || servings <= 0) return null;

  const crops = Array.from(new Set(ingredients.map((r) => r.crop).filter((c): c is string => !!c)));
  if (crops.length === 0) return null;

  const { data, error } = await client.from("crop_nutrition").select("reference_version").in("crop", crops);
  if (error) throw error;

  const referenceVersions = Array.from(
    new Set(
      (data ?? [])
        .map((r) => (r as { reference_version: string | null }).reference_version)
        .filter((v): v is string => !!v),
    ),
  );
  if (referenceVersions.length !== 1) return null;

  const raw = `${recipeId}|${F024_HASH_VERSION}|${servings}|${referenceVersions[0]}|${ingredientFingerprint(ingredients)}`;
  return await md5Hex(raw);
}

/**
 * Best-effort: recalculates one recipe's nutrition_* columns via the F0-24 engine if (and only if)
 * doing so could plausibly change anything, from a service-role client. Never throws — every
 * caller (F2 publish today, F7/T6 once they exist) can call this without a try/catch of its own and
 * without it ever being able to fail the operation that triggered it.
 */
export async function invokeNutritionRecalc(
  client: SupabaseClient,
  recipeId: string,
): Promise<NutritionRecalcResult> {
  try {
    const recipe = await loadRecipeRow(client, recipeId);
    if (!recipe) {
      // Deleted (or never existed) by the time this fired — safe no-op, dispatch requirement #3.
      return { outcome: "skipped_not_found", recipeId };
    }
    if (recipe.status !== "published") {
      // Unpublished/back to draft by the time this fired — safe no-op, dispatch requirement #3.
      return { outcome: "skipped_not_published", recipeId };
    }

    const before = await loadIngredientRows(client, recipeId);
    const predictedHash = await predictNutritionInputHash(client, recipeId, recipe.servings, before);
    if (predictedHash !== null && predictedHash === recipe.nutrition_input_hash) {
      return { outcome: "skipped_unchanged", recipeId };
    }

    const { error } = await client.rpc("calculate_recipe_nutrition", { p_recipe_id: recipeId });
    if (error) {
      console.error("[f024-nutrition-recalc] calculate_recipe_nutrition failed", {
        recipeId,
        message: (error as { message?: string }).message,
        code: (error as { code?: string }).code,
      });
      return { outcome: "failed", recipeId, errorMessage: (error as { message?: string }).message };
    }

    // Race self-heal (dispatch requirement #2): the RPC call above reads recipe_ingredients fresh
    // at ITS OWN execution time, but a concurrent edit landing between our `before` snapshot and
    // the RPC's own read is invisible to us. Detecting the ingredient set changed during our call
    // window is the one shape of race this layer (no lock, no schema change) can actually observe;
    // when it does, one bounded extra recompute — never a loop — resolves to the newer state
    // instead of leaving our own now-stale result in place.
    const after = await loadIngredientRows(client, recipeId);
    if (ingredientFingerprint(before) !== ingredientFingerprint(after)) {
      const retry = await client.rpc("calculate_recipe_nutrition", { p_recipe_id: recipeId });
      if (retry.error) {
        console.error("[f024-nutrition-recalc] race self-heal recompute failed", {
          recipeId,
          message: (retry.error as { message?: string }).message,
        });
        return { outcome: "failed", recipeId, errorMessage: (retry.error as { message?: string }).message };
      }
      return { outcome: "recalculated_race_selfheal", recipeId };
    }

    return { outcome: "recalculated", recipeId };
  } catch (e) {
    console.error("[f024-nutrition-recalc] unexpected error", {
      recipeId,
      message: e instanceof Error ? e.message : String(e),
    });
    return { outcome: "failed", recipeId, errorMessage: e instanceof Error ? e.message : String(e) };
  }
}
