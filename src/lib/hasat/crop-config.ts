import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LifecycleStep {
  key: string;
  label: string;
  required?: boolean;
}

export interface CropConfig {
  crop: string;
  display_name: string;
  default_unit: string;
  harvest_window_start_month: number | null;
  harvest_window_end_month: number | null;
  lifecycle_steps: LifecycleStep[] | null;
  price_benchmark_source: string | null;
  category_group: string | null;
}

export function normalizeCropKey(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

export const CATEGORY_GROUP_META: Record<string, { label: string; emoji: string }> = {
  baharat: { label: "Baharat", emoji: "🌸" },
  tibbi_bitki: { label: "Tıbbi Bitkiler", emoji: "🌿" },
  sert_kabuklu: { label: "Sert Kabuklular", emoji: "🌰" },
  yaglik: { label: "Yağlıklar", emoji: "🫒" },
};

export function useCropConfigs() {
  return useQuery({
    queryKey: ["crop_config"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CropConfig[]> => {
      const { data, error } = await supabase.from("crop_config" as any).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CropConfig[];
    },
  });
}

export function useCropConfigMap() {
  const q = useCropConfigs();
  const map = new Map<string, CropConfig>();
  for (const c of q.data ?? []) {
    map.set(normalizeCropKey(c.crop), c);
    map.set(normalizeCropKey(c.display_name), c);
  }
  return { ...q, map };
}

export function findCropConfig(map: Map<string, CropConfig>, crop: string | null | undefined): CropConfig | null {
  const key = normalizeCropKey(crop);
  if (!key) return null;
  return map.get(key) ?? null;
}

/**
 * Returns true if the given month (1-12) falls within the harvest window,
 * including wrap-around windows (e.g. 11→2).
 */
export function isInHarvestWindow(cfg: CropConfig | null | undefined, month: number): boolean {
  if (!cfg?.harvest_window_start_month || !cfg?.harvest_window_end_month) return false;
  const s = cfg.harvest_window_start_month;
  const e = cfg.harvest_window_end_month;
  if (s <= e) return month >= s && month <= e;
  return month >= s || month <= e;
}
