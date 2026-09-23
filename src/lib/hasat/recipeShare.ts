import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRetryOperationKeyStore } from "./retryOperationKey";
import { PRIVATE_RECIPE_SHARE_ENABLED } from "./privateRecipeShareFlag";

export interface RecipeShareGrant {
  grant_id: string;
  source_recipe_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  status: "active" | "expired" | "rotated" | "revoked";
}

export interface SharedRecipePreview {
  expires_at: string;
  recipe: {
    title: string;
    description: string | null;
    servings: number | null;
    prep_minutes: number | null;
    cook_minutes: number | null;
    rest_minutes: number | null;
    difficulty: string | null;
    cuisine: string | null;
    diet_tags: string[];
    required_equipment: string[];
  };
  ingredients: Array<{
    sort_order: number;
    crop: string | null;
    free_text_name: string | null;
    quantity: number | null;
    unit: string | null;
    note: string | null;
    is_key_ingredient: boolean;
  }>;
  steps: Array<{ step_no: number; instruction: string; timer_seconds: number | null }>;
}

type TokenResult = { grant_id: string; token: string; expires_at: string };
type CloneResult = { recipe_id: string; replayed: boolean };

function requireEnabled(): void {
  if (!PRIVATE_RECIPE_SHARE_ENABLED) throw new Error("recipe_share_feature_disabled");
}

export function recipeShareErrorCode(error: unknown): string {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  return (
    [
      "recipe_share_invalid_or_inactive",
      "recipe_share_cannot_clone_own",
      "recipe_share_idempotency_conflict",
      "recipe_share_operation_in_progress",
      "recipe_share_invalid_expiry",
      "recipe_share_source_not_eligible",
      "recipe_share_grant_not_active",
    ].find((code) => message.includes(code)) ?? "recipe_share_unknown"
  );
}

export function expiryFromNow(milliseconds: number): string {
  return new Date(Date.now() + milliseconds).toISOString();
}

export function useRecipeShareGrants(recipeId: string) {
  return useQuery({
    queryKey: ["recipeShareGrants", recipeId],
    enabled: PRIVATE_RECIPE_SHARE_ENABLED && !!recipeId,
    queryFn: async (): Promise<RecipeShareGrant[]> => {
      requireEnabled();
      const { data, error } = await supabase.rpc("rpc_list_recipe_share_grants", {
        p_recipe_id: recipeId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as RecipeShareGrant[];
    },
  });
}

export function useCreateRecipeShareGrant(recipeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (expiresAt: string): Promise<TokenResult> => {
      requireEnabled();
      const { data, error } = await supabase.rpc("rpc_create_recipe_share_grant", {
        p_recipe_id: recipeId,
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      return data as unknown as TokenResult;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["recipeShareGrants", recipeId] }),
  });
}

export function useRotateRecipeShareGrant(recipeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, expiresAt }: { grantId: string; expiresAt: string }) => {
      requireEnabled();
      const { data, error } = await supabase.rpc("rpc_rotate_recipe_share_grant", {
        p_grant_id: grantId,
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      return data as unknown as TokenResult;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["recipeShareGrants", recipeId] }),
  });
}

export function useRevokeRecipeShareGrant(recipeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (grantId: string) => {
      requireEnabled();
      const { error } = await supabase.rpc("rpc_revoke_recipe_share_grant", {
        p_grant_id: grantId,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["recipeShareGrants", recipeId] }),
  });
}

export function useResolveRecipeShare() {
  return useMutation({
    mutationFn: async (token: string): Promise<SharedRecipePreview> => {
      requireEnabled();
      const { data, error } = await supabase.rpc("rpc_resolve_recipe_share", { p_token: token });
      if (error) throw error;
      return data as unknown as SharedRecipePreview;
    },
  });
}

export function useCloneSharedRecipe() {
  const keys = useRef(createRetryOperationKeyStore());
  return useMutation({
    mutationFn: async ({
      token,
      actionId,
    }: {
      token: string;
      actionId: string;
    }): Promise<CloneResult> => {
      requireEnabled();
      const operationKey = keys.current.acquire(actionId);
      const { data, error } = await supabase.rpc("rpc_clone_shared_recipe", {
        p_token: token,
        p_operation_key: operationKey,
      });
      if (error) throw error;
      keys.current.succeed(actionId, operationKey);
      return data as unknown as CloneResult;
    },
  });
}
