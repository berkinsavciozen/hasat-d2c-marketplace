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
  has_official_price_source?: boolean;
  official_source_name?: string | null;
  price_window_type?: "rolling_30d" | "rolling_365d";
  is_seasonal_harvest?: boolean;
}

export function normalizeCropKey(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

export const CATEGORY_GROUP_META: Record<string, { label: string; emoji: string }> = {
  tahil: { label: "Tahıllar", emoji: "🌾" },
  baklagil: { label: "Baklagiller", emoji: "🫘" },
  yaglik: { label: "Yağlı Tohumlar", emoji: "🌻" },
  endustri_bitkisi: { label: "Endüstri Bitkileri", emoji: "🏭" },
  yumru: { label: "Yumru Bitkiler", emoji: "🥔" },
  sebze: { label: "Sebzeler", emoji: "🥬" },
  meyve: { label: "Meyveler", emoji: "🍎" },
  sert_kabuklu: { label: "Sert Kabuklular", emoji: "🌰" },
  tibbi_bitki: { label: "Tıbbi Bitkiler", emoji: "🌿" },
  baharat: { label: "Baharatlar", emoji: "🌶️" },
};

/**
 * Crop-specific emoji overrides for marquee crops.
 * Keys match normalized display names (lowercased tr-TR).
 */
const CROP_EMOJI_OVERRIDES: Record<string, string> = {
  "safran": "🌸",
  "lavanta": "💜",
  "zeytin": "🫒",
  "zeytinyağı": "🫒",
  "üzüm": "🍇",
  "çilek": "🍓",
  "gül": "🌹",
  "fındık": "🌰",
  "ceviz": "🌰",
  "badem": "🌰",
  "buğday": "🌾",
  "arpa": "🌾",
  "mısır": "🌽",
  "pirinç": "🍚",
  "domates": "🍅",
  "biber": "🌶️",
  "patates": "🥔",
  "soğan": "🧅",
  "sarımsak": "🧄",
  "havuç": "🥕",
  "elma": "🍎",
  "portakal": "🍊",
  "limon": "🍋",
  "kiraz": "🍒",
  "karpuz": "🍉",
  "muz": "🍌",
  "nane": "🌿",
  "kekik": "🌿",
  "papatya": "🌼",
  "ayçiçeği": "🌻",
  "pamuk": "🌱",
  "çay": "🍵",
  "fıstık": "🥜",
};

export function cropEmoji(crop: string | null | undefined, cfg?: CropConfig | null): string {
  const key = normalizeCropKey(crop);
  if (key && CROP_EMOJI_OVERRIDES[key]) return CROP_EMOJI_OVERRIDES[key];
  const group = cfg?.category_group;
  if (group && CATEGORY_GROUP_META[group]) return CATEGORY_GROUP_META[group].emoji;
  return "🌾";
}

export interface CropOption {
  value: string; // display_name — what we store & show
  label: string;
  emoji: string;
  category_group: string | null;
  hasOfficialPriceSource: boolean;
  officialSourceName: string | null;
}

/**
 * Hook that returns a sorted, ready-to-render list of crop options
 * backed by the crop_config catalog. Use everywhere a crop picker is needed.
 */
export function useCropOptions() {
  const q = useCropConfigs();
  const options: CropOption[] = (q.data ?? [])
    .map((c) => ({
      value: c.crop, // kanonik slug (örn. "safran") — DB'de listings.crop, price_history vs. hep slug
      label: c.display_name,
      emoji: cropEmoji(c.display_name, c),
      category_group: c.category_group,
      hasOfficialPriceSource: !!c.has_official_price_source,
      officialSourceName: c.official_source_name ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr-TR"));
  return { ...q, options };
}

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
