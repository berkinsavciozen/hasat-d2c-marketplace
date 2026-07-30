import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUserId } from "@/lib/hasat/queries";
import { getOrCreateSessionId } from "@/lib/hasat/session";

export interface RecipeListItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_photo_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
  diet_tags: string[];
  // computed client-side (P16-H fallback pattern, see Build/DB-Schema.md "Fotoğraf stratejisi")
  displayPhotoUrl: string | null;
  isRepresentativePhoto: boolean;
  coveragePct: number | null;
}

export interface RecipeDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_photo_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
  diet_tags: string[];
  displayPhotoUrl: string | null;
  isRepresentativePhoto: boolean;
}

export interface RecipeStepRow {
  id: string;
  step_no: number;
  instruction: string;
  photo_url: string | null;
  timer_seconds: number | null;
}

export interface RecipeIngredientRow {
  id: string;
  sort_order: number;
  crop: string | null;
  free_text_name: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  is_key_ingredient: boolean;
}

const RECIPE_LIST_COLUMNS =
  "id, slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, difficulty, cuisine, diet_tags";

/**
 * Recipe's own cover photo if it has one, else the crop photo of its first
 * key ingredient, else null (caller falls back to a neutral placeholder).
 * Mirrors the listing photo fallback already in use for storefront/discover
 * (`Build/DB-Schema.md` → "Fotoğraf stratejisi"): computed in the app layer,
 * not a DB view, so it stays consistent with that existing convention.
 */
async function attachCoverFallback<T extends { id: string; cover_photo_url: string | null }>(
  recipes: T[],
): Promise<Array<T & { displayPhotoUrl: string | null; isRepresentativePhoto: boolean }>> {
  const needFallback = recipes.filter((r) => !r.cover_photo_url);
  const firstCropByRecipe = new Map<string, string>();
  if (needFallback.length > 0) {
    const { data: keyIngredients, error } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, crop, sort_order")
      .in(
        "recipe_id",
        needFallback.map((r) => r.id),
      )
      .eq("is_key_ingredient", true)
      .not("crop", "is", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    for (const row of keyIngredients ?? []) {
      if (row.crop && !firstCropByRecipe.has(row.recipe_id))
        firstCropByRecipe.set(row.recipe_id, row.crop);
    }
  }
  const photoByCrop = new Map<string, string>();
  const crops = Array.from(new Set(firstCropByRecipe.values()));
  if (crops.length > 0) {
    const { data: cropRows, error } = await supabase
      .from("crop_config" as any)
      .select("crop, default_photo_url")
      .in("crop", crops);
    if (error) throw error;
    for (const c of (cropRows ?? []) as unknown as Array<{
      crop: string;
      default_photo_url: string | null;
    }>) {
      if (c.default_photo_url) photoByCrop.set(c.crop, c.default_photo_url);
    }
  }
  return recipes.map((r) => {
    if (r.cover_photo_url)
      return { ...r, displayPhotoUrl: r.cover_photo_url, isRepresentativePhoto: false };
    const crop = firstCropByRecipe.get(r.id);
    const fallback = crop ? photoByCrop.get(crop) : undefined;
    return { ...r, displayPhotoUrl: fallback ?? null, isRepresentativePhoto: !!fallback };
  });
}

/** Anon-safe fetch for `/tarifler` — used in the route loader (SSR + client). */
export async function fetchRecipeList(): Promise<RecipeListItem[]> {
  const [{ data: recipeRows, error: recipeErr }, { data: coverageRows, error: covErr }] =
    await Promise.all([
      supabase
        .from("recipes")
        .select(RECIPE_LIST_COLUMNS)
        .eq("visibility", "public")
        .eq("status", "published")
        .order("title", { ascending: true }),
      supabase.from("v_recipe_coverage" as any).select("recipe_id, coverage_pct"),
    ]);
  if (recipeErr) throw recipeErr;
  if (covErr) throw covErr;
  const coverageByRecipe = new Map<string, number | null>(
    (
      (coverageRows ?? []) as unknown as Array<{ recipe_id: string; coverage_pct: number | null }>
    ).map((c) => [c.recipe_id, c.coverage_pct]),
  );
  const withCover = await attachCoverFallback((recipeRows ?? []) as any[]);
  return withCover.map((r) => ({
    ...r,
    diet_tags: r.diet_tags ?? [],
    coveragePct: coverageByRecipe.get(r.id) ?? null,
  })) as RecipeListItem[];
}

/** Anon-safe fetch for `/tarifler/$slug` — used in the route loader (SSR + client). Null = not found/not public. */
export async function fetchRecipeBySlug(slug: string): Promise<{
  recipe: RecipeDetail;
  steps: RecipeStepRow[];
  ingredients: RecipeIngredientRow[];
} | null> {
  const { data: recipeRow, error: recipeErr } = await supabase
    .from("recipes")
    .select(RECIPE_LIST_COLUMNS)
    .eq("slug", slug)
    .eq("visibility", "public")
    .eq("status", "published")
    .maybeSingle();
  if (recipeErr) throw recipeErr;
  if (!recipeRow) return null;

  const [{ data: stepRows, error: stepErr }, { data: ingredientRows, error: ingErr }] =
    await Promise.all([
      supabase
        .from("recipe_steps")
        .select("id, step_no, instruction, photo_url, timer_seconds")
        .eq("recipe_id", recipeRow.id)
        .order("step_no", { ascending: true }),
      supabase
        .from("recipe_ingredients")
        .select("id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient")
        .eq("recipe_id", recipeRow.id)
        .order("sort_order", { ascending: true }),
    ]);
  if (stepErr) throw stepErr;
  if (ingErr) throw ingErr;

  const [withCover] = await attachCoverFallback([recipeRow as any]);
  return {
    recipe: { ...(withCover as any), diet_tags: recipeRow.diet_tags ?? [] },
    steps: (stepRows ?? []) as RecipeStepRow[],
    ingredients: (ingredientRows ?? []) as RecipeIngredientRow[],
  };
}

export interface AvailabilityRow {
  ingredient_id: string;
  sort_order: number;
  crop: string | null;
  crop_display_name: string | null;
  crop_photo_url: string | null;
  free_text_name: string | null;
  quantity: number | null;
  unit: string | null;
  is_key_ingredient: boolean;
  is_platform_crop: boolean;
  is_matched: boolean;
  active_listing_count: number;
  canonical_unit: string | null;
  best_price_per_canonical: number | null;
}

export function useRecipeAvailability(recipeId: string | undefined) {
  return useQuery({
    queryKey: ["recipeAvailability", recipeId],
    enabled: !!recipeId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AvailabilityRow[]> => {
      const { data, error } = await supabase.rpc("rpc_recipe_availability", {
        p_recipe_id: recipeId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AvailabilityRow[];
    },
  });
}

export interface ShoppingListRow {
  ingredient_id: string;
  sort_order: number;
  crop: string | null;
  crop_display_name: string | null;
  free_text_name: string | null;
  is_platform_crop: boolean;
  is_matched: boolean;
  recipe_servings: number;
  requested_servings: number;
  scale_factor: number;
  recipe_quantity: number | null;
  recipe_unit: string | null;
  scaled_quantity: number | null;
  canonical_unit: string | null;
  needed_canonical: number | null;
  conversion_available: boolean;
  min_order_canonical: number | null;
  purchase_canonical: number | null;
  rounded_up_to_min_order: boolean | null;
  recipes_covered: number | null;
  best_price_per_canonical: number | null;
  estimated_cost: number | null;
}

export function useRecipeShoppingList(recipeId: string | undefined, servings: number | undefined) {
  return useQuery({
    queryKey: ["recipeShoppingList", recipeId, servings],
    enabled: !!recipeId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ShoppingListRow[]> => {
      const { data, error } = await supabase.rpc("rpc_recipe_shopping_list", {
        p_recipe_id: recipeId!,
        p_servings: servings ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ShoppingListRow[];
    },
  });
}

/**
 * Writes one `recipe_views` row per recipe per mount. Anon gets `session_id`
 * only, logged-in gets `user_id` — both always get `session_id` so the same
 * visitor stays attributable across a later login (Build/DB-Schema.md → M4
 * açık maddesi #3). IP/user-agent deliberately not collected (KVKK).
 */
export function useLogRecipeView(recipeId: string | undefined) {
  const userId = useAuthUserId();
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!recipeId || logged.current === recipeId) return;
    logged.current = recipeId;
    const sessionId = getOrCreateSessionId();
    supabase
      .from("recipe_views")
      .insert({ recipe_id: recipeId, user_id: userId ?? null, session_id: sessionId })
      .then(({ error }) => {
        if (error) console.error("[recipe_views] insert failed", error);
      });
  }, [recipeId, userId]);
}

export function toIsoDuration(minutes: number | null | undefined): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h > 0 ? `${h}H` : ""}${m > 0 ? `${m}M` : ""}`;
}

/** Human-readable total time — some recipes now carry multi-day totals
 * (fermentation/drying), where "N dk" alone reads as broken. Mirrors the
 * step-timer formatter (`formatTimer` in tarifler.$slug.tsx) at the day scale. */
export function formatTotalMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
  }
  const d = Math.floor(minutes / 1440);
  const remH = Math.floor((minutes % 1440) / 60);
  return remH > 0 ? `${d} gün ${remH} sa` : `${d} gün`;
}

/**
 * Gap #9 ("parselden tabağa") — for a matched ingredient, the cheapest active
 * listing id doubles as the entry point into the existing traceability page
 * (`/batch/$listingId` — already built for P16-H, reused as-is here, no new
 * traceability system). Anon-safe: `listings` already grants public SELECT on
 * active rows (same RLS the availability RPC itself relies on).
 */
export function useMatchedListingIds(crops: string[]) {
  const key = Array.from(new Set(crops.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["recipeMatchedListingIds", key],
    enabled: key.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, crop, price_per_unit")
        .in("crop", key)
        .eq("status", "active")
        .order("price_per_unit", { ascending: true });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ id: string; crop: string }>) {
        if (!map.has(row.crop)) map.set(row.crop, row.id);
      }
      return map;
    },
  });
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  kolay: "Kolay",
  orta: "Orta",
  zor: "Zor",
};
