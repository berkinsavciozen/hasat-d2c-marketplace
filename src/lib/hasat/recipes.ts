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
  rest_minutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
  diet_tags: string[];
  required_equipment: string[];
  // computed client-side (P16-H fallback pattern, see Build/DB-Schema.md "Fotoğraf stratejisi")
  displayPhotoUrl: string | null;
  isRepresentativePhoto: boolean;
  coveragePct: number | null;
  // P23-M7-a — "X malzemeden Y'si Hasat'ta" sayacı, v_recipe_coverage'dan
  // (coveragePct'in aksine off-platform malzemeleri de içerir).
  ingredientCount: number | null;
  availableCount: number | null;
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
  rest_minutes: number | null;
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
  "id, slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cuisine, diet_tags, required_equipment";

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
      supabase
        .from("v_recipe_coverage" as any)
        .select("recipe_id, coverage_pct, ingredient_count, available_count"),
    ]);
  if (recipeErr) throw recipeErr;
  if (covErr) throw covErr;
  type CoverageRow = {
    recipe_id: string;
    coverage_pct: number | null;
    ingredient_count: number | null;
    available_count: number | null;
  };
  const coverageByRecipe = new Map<string, CoverageRow>(
    ((coverageRows ?? []) as unknown as CoverageRow[]).map((c) => [c.recipe_id, c]),
  );
  const withCover = await attachCoverFallback((recipeRows ?? []) as any[]);
  return withCover.map((r) => {
    const cov = coverageByRecipe.get(r.id);
    return {
      ...r,
      diet_tags: r.diet_tags ?? [],
      required_equipment: r.required_equipment ?? [],
      coveragePct: cov?.coverage_pct ?? null,
      ingredientCount: cov?.ingredient_count ?? null,
      availableCount: cov?.available_count ?? null,
    };
  }) as RecipeListItem[];
}

export interface RelatedRecipeItem {
  slug: string;
  title: string;
  sharedCrop: string;
}

/** Anon-safe fetch for `/tarifler/$slug` — used in the route loader (SSR + client). Null = not found/not public. */
export async function fetchRecipeBySlug(slug: string): Promise<{
  recipe: RecipeDetail;
  steps: RecipeStepRow[];
  ingredients: RecipeIngredientRow[];
  relatedRecipes: RelatedRecipeItem[];
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

  // SEO — internal link web (P23-M4-c): 2-3 other published recipes sharing a
  // key ingredient crop. Fetched server-side in the loader (not client-side
  // after mount) so the links are present in the crawled HTML itself — a
  // link a bot only sees after JS runs doesn't count for discoverability.
  const keyCrops = Array.from(
    new Set(
      ((ingredientRows ?? []) as RecipeIngredientRow[])
        .filter((i) => i.is_key_ingredient && i.crop)
        .map((i) => i.crop as string),
    ),
  );
  const relatedRecipes: RelatedRecipeItem[] = [];
  if (keyCrops.length > 0) {
    const { data: relatedIngredientRows, error: relErr } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, crop, recipes!inner(slug, title, visibility, status)")
      .in("crop", keyCrops)
      .eq("is_key_ingredient", true)
      .neq("recipe_id", recipeRow.id)
      .eq("recipes.visibility", "public")
      .eq("recipes.status", "published");
    if (relErr) throw relErr;
    const seen = new Set<string>();
    for (const row of (relatedIngredientRows ?? []) as unknown as Array<{
      crop: string;
      recipes: { slug: string; title: string };
    }>) {
      if (seen.has(row.recipes.slug)) continue;
      seen.add(row.recipes.slug);
      relatedRecipes.push({
        slug: row.recipes.slug,
        title: row.recipes.title,
        sharedCrop: row.crop,
      });
      if (relatedRecipes.length >= 3) break;
    }
  }

  const [withCover] = await attachCoverFallback([recipeRow as any]);
  return {
    recipe: { ...(withCover as any), diet_tags: recipeRow.diet_tags ?? [] },
    steps: (stepRows ?? []) as RecipeStepRow[],
    ingredients: (ingredientRows ?? []) as RecipeIngredientRow[],
    relatedRecipes,
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

/** dk/sa/gün — shared by the total-time badge and the breakdown below.
 * Mirrors the step-timer formatter (`formatTimer` in tarifler.$slug.tsx) at
 * the day scale, since some recipes now carry multi-day rest (fermentation/
 * drying), where a raw "N dk" reads as broken. */
function formatMinutesPart(minutes: number): string {
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

/** Human-readable total time (prep+cook+rest) for the compact list-card badge. */
export function formatTotalMinutes(minutes: number): string {
  return formatMinutesPart(minutes);
}

export function totalRecipeMinutes(r: {
  prep_minutes: number | null;
  cook_minutes: number | null;
  rest_minutes: number | null;
}): number {
  return (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) + (r.rest_minutes ?? 0);
}

/**
 * "Aktif" süre — hazırlık + pişirme, dinlenme/bekleme HARİÇ. Süre filtresinin
 * (tarifler.index.tsx) süzdüğü değer budur, `totalRecipeMinutes` değil:
 * `rest_minutes` bir planlama kısıtıdır ("gece boyu ıslat", "3 gün kurut"),
 * kullanıcının o sırada mutfakta harcadığı emek değil. Toplam süreye göre
 * filtrelemek 18 saatlik ekşi mayalı ekmeği ve 73 saatlik Köme'yi "1 saatten
 * uzun" tek bucket'ına, 65 dakikalık bir tarifle ayırt edilemez şekilde
 * gömerdi — filtre pratikte anlamsızlaşırdı (bkz. P23-M5-a QA notu).
 */
export function activeRecipeMinutes(r: {
  prep_minutes: number | null;
  cook_minutes: number | null;
}): number {
  return (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);
}

/**
 * Bir tarif önceden (aynı gün içinde bile olsa, en az birkaç saat önce)
 * başlatılmalı mı? Eşik 120 dakika (2 saat): bu, çoğu tarifte tek seferlik
 * bir "dinlendirme" adımının (örn. hamur mayalama, marine etme) üst sınırına
 * yakın — 2 saatin altındaki bir bekleme "bugün akşam yemeğine yetişir",
 * üstündeki (gece ıslatma, ekşi maya, kurutma) yetişmez ve kullanıcının
 * günün başında planlaması gerekir. Süre filtresinden çıkarılan bilginin
 * (bkz. `activeRecipeMinutes`) yerine geçen, filtreden daha faydalı bir
 * sinyal — dördüncü bir süre bucket'ı eklemek kavramsal hatayı çözmezdi
 * (aktif süre ile bekleme süresi hâlâ karışık kalırdı), bir etiket çözüyor.
 */
export const ADVANCE_START_THRESHOLD_MINUTES = 120;

export function needsAdvanceStart(r: { rest_minutes: number | null }): boolean {
  return (r.rest_minutes ?? 0) > ADVANCE_START_THRESHOLD_MINUTES;
}

/**
 * P23-M4-c — the three times are never collapsed into one number on the
 * detail page: "pişirme süresi" means active stove/oven time, and folding a
 * 3-day drying step into it (as P23-M4-b's cook_minutes fix mistakenly did,
 * for lack of this column) is exactly the kind of visible dishonesty the
 * güven tezi can't afford. Zero-value parts are omitted.
 */
export function formatTimeBreakdown(
  prepMinutes: number | null,
  cookMinutes: number | null,
  restMinutes: number | null,
): string {
  const parts: string[] = [];
  if (prepMinutes) parts.push(`${formatMinutesPart(prepMinutes)} hazırlık`);
  if (cookMinutes) parts.push(`${formatMinutesPart(cookMinutes)} pişirme`);
  if (restMinutes) parts.push(`${formatMinutesPart(restMinutes)} dinlenme`);
  return parts.join(" · ");
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

/**
 * F13-geniş — kontrollü ekipman listesi (Berkin onayı, değiştirme).
 * `recipes.required_equipment` bu slug'ları içerir.
 */
export const EQUIPMENT_LABELS: Record<string, string> = {
  firin: "Fırın",
  ocak: "Ocak/Tencere",
  mikrodalga: "Mikrodalga",
  airfryer: "Air Fryer",
  blender: "Blender",
  "mutfak-robotu": "Mutfak Robotu",
  "duduklu-tencere": "Düdüklü Tencere",
  izgara: "Izgara/Barbekü",
  "ozel-ekipman-gerekmiyor": "Özel Ekipman Gerekmiyor",
};
