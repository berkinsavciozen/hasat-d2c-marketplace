/**
 * Private tarif paylaşım linki: sahip kendi taslağını (`tariflerim`) bir link ile paylaşabilir;
 * linke erişen, giriş yapmış ve sahibi olmayan bir kullanıcı tarifi kendi defterine kaydedebilir.
 * Backend: rpc_generate_recipe_share_token / rpc_revoke_recipe_share_token / rpc_get_shared_recipe /
 * rpc_clone_shared_recipe — canlıda mevcut ama paylaşılan core tip dosyasında yok, CloneRecipeButton /
 * useCloneRecipe'deki `as any` cast desenine uygun.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SharedRecipeIngredient {
  id: string;
  sort_order: number;
  crop: string | null;
  free_text_name: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  is_key_ingredient: boolean;
}

export interface SharedRecipeStep {
  id: string;
  step_no: number;
  instruction: string;
  photo_url: string | null;
  timer_seconds: number | null;
}

export interface SharedRecipe {
  recipe: {
    id: string;
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
  };
  ingredients: SharedRecipeIngredient[];
  steps: SharedRecipeStep[];
}

/** Sahip — "Paylaş": token yoksa üretir, varsa aynısını döndürür (idempotent). */
export function useGenerateRecipeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: string): Promise<string> => {
      const { data, error } = await (supabase.rpc as any)("rpc_generate_recipe_share_token", {
        p_recipe_id: recipeId,
      });
      if (error) throw error;
      if (!data) throw new Error("share_link_failed");
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myRecipeDraft"] }),
  });
}

/** Sahip — "Paylaşımı durdur": mevcut linki geçersiz kılar. */
export function useRevokeRecipeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: string): Promise<void> => {
      const { error } = await (supabase.rpc as any)("rpc_revoke_recipe_share_token", {
        p_recipe_id: recipeId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myRecipeDraft"] }),
  });
}

/** Ziyaretçi — link önizlemesi. anon dahil çağrılabilir; token geçersizse null döner. */
export function useSharedRecipe(token: string | undefined) {
  return useQuery({
    queryKey: ["sharedRecipe", token],
    enabled: !!token,
    queryFn: async (): Promise<SharedRecipe | null> => {
      const { data, error } = await (supabase.rpc as any)("rpc_get_shared_recipe", {
        p_share_token: token,
      });
      if (error) throw error;
      return (data as SharedRecipe | null) ?? null;
    },
  });
}

/** Ziyaretçi — "Defterime kaydet": backend kendi tarifini klonlamayı reddeder. */
export function useCloneSharedRecipe() {
  return useMutation({
    mutationFn: async (token: string): Promise<string> => {
      const { data, error } = await (supabase.rpc as any)("rpc_clone_shared_recipe", {
        p_share_token: token,
      });
      if (error) throw error;
      if (!data) throw new Error("clone_failed");
      return data as string;
    },
  });
}
