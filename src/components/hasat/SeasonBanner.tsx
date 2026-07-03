import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUserId } from "@/lib/hasat/queries";
import { findCropConfig, isInHarvestWindow, useCropConfigMap } from "@/lib/hasat/crop-config";

const MONTHS_TR = [
  "OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN",
  "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK",
];

export function SeasonBanner() {
  const userId = useAuthUserId();
  const { map } = useCropConfigMap();

  const { data: crops = [] } = useQuery({
    queryKey: ["seasonBanner", "farmerCrops", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const [listingsRes, entriesRes] = await Promise.all([
        supabase.from("listings").select("crop").eq("farmer_id", userId!).eq("status", "active"),
        supabase.from("harvest_entries").select("crop").eq("farmer_id", userId!).limit(50),
      ]);
      const set = new Set<string>();
      for (const r of (listingsRes.data ?? []) as any[]) if (r.crop) set.add(r.crop);
      for (const r of (entriesRes.data ?? []) as any[]) if (r.crop) set.add(r.crop);
      return Array.from(set);
    },
  });

  const now = new Date();
  const month = now.getMonth() + 1;
  const monthLabel = MONTHS_TR[month - 1];

  const inSeason = crops
    .map((c) => findCropConfig(map, c))
    .filter((cfg) => cfg && isInHarvestWindow(cfg, month)) as NonNullable<ReturnType<typeof findCropConfig>>[];

  if (inSeason.length === 0) {
    // No crop currently in harvest window — show a soft off-season badge.
    return (
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-wide"
        style={{ background: "color-mix(in oklab, var(--muted) 40%, var(--dark))", color: "var(--hwhite)" }}
      >
        <span>SEZON DIŞI — {monthLabel}</span>
        <span>🌱</span>
      </div>
    );
  }

  const names = inSeason.map((c) => c.display_name).join(" · ");
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-wide"
      style={{ background: "color-mix(in oklab, var(--saffron) 25%, var(--dark))", color: "var(--hwhite)" }}
    >
      <span>HASAT DÖNEMİ — {names} · {monthLabel}</span>
      <span>🌸</span>
    </div>
  );
}
