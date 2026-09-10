/**
 * T6-UI / F11-UI — kullanıcının kendi tarif taslakları.
 *
 * Backend bu turda DEĞİŞMEDİ: `customize-recipe` edge function (Faz A/B) ve
 * `rpc_clone_recipe` zaten canlıda. Buradaki her şey saf client tarafı —
 * `recipes` / `recipe_ingredients` / `recipe_steps` üzerindeki okuma-yazma
 * mevcut `owner_id = auth.uid()` RLS politikalarıyla çalışır.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUserId } from "@/lib/hasat/queries";

export interface DraftIngredient {
  crop: string | null;
  freeTextName: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  isKeyIngredient: boolean;
  sortOrder: number;
}

export interface DraftStep {
  stepNo: number;
  instruction: string;
  timerSeconds: number | null;
}

export interface RecipeDraft {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  difficulty: string | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
}

export interface MyRecipeListItem {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  source_type: string;
  cloned_from_recipe_id: string | null;
  status: string;
  visibility: string;
}

export const emptyIngredient = (sortOrder: number): DraftIngredient => ({
  crop: null,
  freeTextName: "",
  quantity: null,
  unit: null,
  note: null,
  isKeyIngredient: false,
  sortOrder,
});

export const emptyStep = (stepNo: number): DraftStep => ({
  stepNo,
  instruction: "",
  timerSeconds: null,
});

/** Kaydetmeden önce sıralamayı 1..n olarak yeniden numaralandır (backend bunu bekliyor). */
export function renumberDraft(draft: RecipeDraft): RecipeDraft {
  return {
    ...draft,
    ingredients: draft.ingredients.map((ing, i) => ({ ...ing, sortOrder: i + 1 })),
    steps: draft.steps.map((s, i) => ({ ...s, stepNo: i + 1 })),
  };
}

export function draftValidationErrors(draft: RecipeDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("Başlık boş olamaz.");
  const ingredients = draft.ingredients.filter(
    (i) => (i.crop ?? "").trim() || (i.freeTextName ?? "").trim(),
  );
  if (ingredients.length === 0) errors.push("En az bir malzeme gerekli.");
  if (draft.steps.filter((s) => s.instruction.trim()).length === 0)
    errors.push("En az bir adım gerekli.");
  return errors;
}

/** Boş satırları at, sıraları düzelt — hem Faz B'ye hem doğrudan kayda giden hal. */
export function cleanDraft(draft: RecipeDraft): RecipeDraft {
  return renumberDraft({
    ...draft,
    title: draft.title.trim(),
    description: draft.description?.trim() ? draft.description.trim() : null,
    ingredients: draft.ingredients.filter(
      (i) => (i.crop ?? "").trim() || (i.freeTextName ?? "").trim(),
    ),
    steps: draft.steps.filter((s) => s.instruction.trim()),
  });
}

export function useMyRecipeDrafts() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["myRecipeDrafts", userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyRecipeListItem[]> => {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, title, description, created_at, source_type, cloned_from_recipe_id, status, visibility",
        )
        .eq("owner_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MyRecipeListItem[];
    },
  });
}

export interface MyRecipeDetail extends RecipeDraft {
  id: string;
  clonedFromRecipeId: string | null;
  clonedFromSlug: string | null;
  clonedFromTitle: string | null;
}

export function useMyRecipeDraft(recipeId: string | undefined) {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["myRecipeDraft", recipeId, userId],
    enabled: !!recipeId && !!userId,
    queryFn: async (): Promise<MyRecipeDetail | null> => {
      const { data: recipe, error } = await supabase
        .from("recipes")
        .select(
          "id, title, description, servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cloned_from_recipe_id, owner_id",
        )
        .eq("id", recipeId!)
        .maybeSingle();
      if (error) throw error;
      if (!recipe || recipe.owner_id !== userId) return null;

      const [{ data: ings, error: ingErr }, { data: steps, error: stepErr }] = await Promise.all([
        supabase
          .from("recipe_ingredients")
          .select("crop, free_text_name, quantity, unit, note, is_key_ingredient, sort_order")
          .eq("recipe_id", recipeId!)
          .order("sort_order", { ascending: true }),
        supabase
          .from("recipe_steps")
          .select("step_no, instruction, timer_seconds")
          .eq("recipe_id", recipeId!)
          .order("step_no", { ascending: true }),
      ]);
      if (ingErr) throw ingErr;
      if (stepErr) throw stepErr;

      let clonedFromSlug: string | null = null;
      let clonedFromTitle: string | null = null;
      if (recipe.cloned_from_recipe_id) {
        const { data: src } = await supabase
          .from("recipes")
          .select("slug, title")
          .eq("id", recipe.cloned_from_recipe_id)
          .maybeSingle();
        clonedFromSlug = src?.slug ?? null;
        clonedFromTitle = src?.title ?? null;
      }

      return {
        id: recipe.id,
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        prepMinutes: recipe.prep_minutes,
        cookMinutes: recipe.cook_minutes,
        restMinutes: recipe.rest_minutes,
        difficulty: recipe.difficulty,
        clonedFromRecipeId: recipe.cloned_from_recipe_id,
        clonedFromSlug,
        clonedFromTitle,
        ingredients: (ings ?? []).map((r, i) => ({
          crop: r.crop,
          freeTextName: r.free_text_name,
          quantity: r.quantity,
          unit: r.unit,
          note: r.note,
          isKeyIngredient: r.is_key_ingredient === true,
          sortOrder: r.sort_order ?? i + 1,
        })),
        steps: (steps ?? []).map((r, i) => ({
          stepNo: r.step_no ?? i + 1,
          instruction: r.instruction ?? "",
          timerSeconds: r.timer_seconds,
        })),
      };
    },
  });
}

/**
 * Taslağı kaydet: başlık/süre alanları update, malzeme+adımlar "sil ve yeniden yaz".
 * Satır bazlı diff yerine tam yeniden yazım — taslaklar küçük (≤60 malzeme) ve
 * sıralama/silme senaryolarında diff'ten çok daha az hata yüzeyi var.
 */
export function useUpdateMyRecipeDraft(recipeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RecipeDraft) => {
      const clean = cleanDraft(draft);
      const { error: upErr } = await supabase
        .from("recipes")
        .update({
          title: clean.title,
          description: clean.description,
          servings: clean.servings,
          prep_minutes: clean.prepMinutes,
          cook_minutes: clean.cookMinutes,
          rest_minutes: clean.restMinutes,
          difficulty: clean.difficulty,
        })
        .eq("id", recipeId);
      if (upErr) throw upErr;

      const { error: delIngErr } = await supabase
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", recipeId);
      if (delIngErr) throw delIngErr;
      const { error: delStepErr } = await supabase
        .from("recipe_steps")
        .delete()
        .eq("recipe_id", recipeId);
      if (delStepErr) throw delStepErr;

      if (clean.ingredients.length > 0) {
        const { error } = await supabase.from("recipe_ingredients").insert(
          clean.ingredients.map((i) => ({
            recipe_id: recipeId,
            crop: i.crop?.trim() ? i.crop.trim() : null,
            free_text_name: i.freeTextName?.trim() ? i.freeTextName.trim() : null,
            quantity: i.quantity,
            unit: i.unit?.trim() ? i.unit.trim() : null,
            note: i.note?.trim() ? i.note.trim() : null,
            is_key_ingredient: i.isKeyIngredient,
            sort_order: i.sortOrder,
          })),
        );
        if (error) throw error;
      }
      if (clean.steps.length > 0) {
        const { error } = await supabase.from("recipe_steps").insert(
          clean.steps.map((s) => ({
            recipe_id: recipeId,
            step_no: s.stepNo,
            instruction: s.instruction.trim(),
            timer_seconds: s.timerSeconds,
          })),
        );
        if (error) throw error;
      }
      return recipeId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["myRecipeDraft"] });
      qc.invalidateQueries({ queryKey: ["myRecipeDrafts"] });
    },
  });
}

export function useDeleteMyRecipeDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: string) => {
      const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
      if (error) throw error;
      return recipeId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myRecipeDrafts"] }),
  });
}

/** F11 — AI'sız birebir kopya. Backend'de idempotency YOK, çift tık UI'de engellenir. */
export function useCloneRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceRecipeId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("rpc_clone_recipe", {
        p_source_recipe_id: sourceRecipeId,
      });
      if (error) throw error;
      if (!data) throw new Error("clone_failed");
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myRecipeDrafts"] }),
  });
}

// ---- T6: customize-recipe edge function (Faz A / Faz B) ----

export interface ProposeResponse {
  idempotency_key: string;
  source_recipe_id: string;
  draft: RecipeDraft;
  changedFields: string[];
  validation: { valid: boolean; issues: Array<{ message?: string; field?: string }> };
}

const ERROR_MESSAGES: Record<string, string> = {
  quota_exceeded: "Aylık AI kullanım limitine ulaştın.",
  credits_exhausted: "AI şu anda yoğun, biraz sonra tekrar dene.",
  rate_limited: "AI şu anda yoğun, biraz sonra tekrar dene.",
  ai_unreachable: "AI'ya ulaşılamadı, biraz sonra tekrar dene.",
  ai_error: "Öneri üretilemedi, tekrar dene.",
  ai_bad_output: "Öneri üretilemedi, isteğini biraz daha açık yazıp tekrar dene.",
  source_not_eligible: "Bu tarif özelleştirilemiyor.",
  source_not_found: "Kaynak tarif bulunamadı.",
  idempotency_key_conflict: "Bu istek başka bir oturuma ait, sayfayı yenile.",
  instruction_required: "Ne değiştirmek istediğini biraz daha ayrıntılı yaz.",
  unauthorized: "Bunun için giriş yapman gerekiyor.",
};

export function customizeErrorMessage(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || "Bir şeyler ters gitti, tekrar dene.";
}

async function invokeCustomize(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("customize-recipe", { body });
  // Edge function 4xx/5xx'te de gövde döndürüyor (ör. 422 = geçersiz öneri) —
  // hata gövdesini okuyup kodu yukarı taşı.
  if (error) {
    let payload: any = null;
    const res = (error as any)?.context;
    if (res && typeof res.json === "function") {
      payload = await res.json().catch(() => null);
    }
    if (payload?.draft) return payload;
    const err = new Error(customizeErrorMessage(payload?.error));
    (err as any).code = payload?.error;
    throw err;
  }
  if (data?.error) {
    const err = new Error(customizeErrorMessage(data.error));
    (err as any).code = data.error;
    throw err;
  }
  return data;
}

/** Faz A — öneri üret (hiçbir tarif satırı yazılmaz). */
export function useProposeCustomization() {
  return useMutation({
    mutationFn: async (input: {
      sourceRecipeId: string;
      instruction: string;
      idempotencyKey: string;
    }): Promise<ProposeResponse> =>
      invokeCustomize({
        phase: "propose",
        source_recipe_id: input.sourceRecipeId,
        instruction: input.instruction,
        idempotency_key: input.idempotencyKey,
      }),
  });
}

/** Faz B — kullanıcının onayladığı hali kaydet. Aynı idempotency_key ile retry güvenli. */
export function useSaveCustomization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceRecipeId: string;
      idempotencyKey: string;
      draft: RecipeDraft;
    }): Promise<string> => {
      const d = cleanDraft(input.draft);
      const data = await invokeCustomize({
        phase: "save",
        source_recipe_id: input.sourceRecipeId,
        idempotency_key: input.idempotencyKey,
        title: d.title,
        description: d.description,
        servings: d.servings,
        prep_minutes: d.prepMinutes,
        cook_minutes: d.cookMinutes,
        rest_minutes: d.restMinutes,
        difficulty: d.difficulty,
        ingredients: d.ingredients,
        steps: d.steps,
      });
      if (!data?.recipe_id) throw new Error("Taslak kaydedilemedi.");
      return data.recipe_id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myRecipeDrafts"] }),
  });
}
