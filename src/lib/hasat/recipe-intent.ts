/**
 * P23-M4-b — preserves "Talep Et" intent across the guest → signup/login round
 * trip. A guest never has an authenticated session to write a `crop_requests`
 * row with (RLS requires `requested_by = auth.uid()`), so the request itself
 * can't be created before login — only the intent can be remembered.
 */
const KEY = "hasat-pending-recipe-request";

export interface PendingRecipeRequest {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  // ingredientId is the robust resume key — off-platform ingredients (tuz, un)
  // have crop=null, so matching on crop alone can't find them back (P23-M7-a).
  ingredientId: string;
  crop: string;
  cropLabel: string;
  ingredientClass: "tarimsal" | "platform_disi";
  quantity?: string;
  unit?: "kg" | "g" | "L";
}

export function savePendingRecipeRequest(intent: PendingRecipeRequest): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // storage unavailable (private mode etc.) — intent is best-effort, never blocks the flow
  }
}

export function loadPendingRecipeRequest(): PendingRecipeRequest | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.recipeId || !parsed.ingredientId) return null;
    return parsed as PendingRecipeRequest;
  } catch {
    return null;
  }
}

export function clearPendingRecipeRequest(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
