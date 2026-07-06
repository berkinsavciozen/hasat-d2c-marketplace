import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { findCropConfig, useCropConfigMap } from "@/lib/hasat/crop-config";
import { computeCoverage, COVERAGE_META, type CoverageResult } from "@/lib/hasat/coverage";
import { dbToEntry } from "@/lib/hasat/queries";

function useProvenanceForBadge(listingId: string | undefined | null) {
  return useQuery({
    queryKey: ["listingProvenance", listingId],
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_harvest_entries")
        .select("harvest_entries(id, parcel_id, harvest_date, crop, quantity, unit, quality, notes, photo_urls, costs, step_key, created_at)")
        .eq("listing_id", listingId!);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.harvest_entries)
        .filter(Boolean)
        .map(dbToEntry)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

export function useCoverageFor(listingId: string, crop: string): CoverageResult {
  const { map } = useCropConfigMap();
  const { data: entries = [] } = useProvenanceForBadge(listingId);
  return useMemo(() => computeCoverage(findCropConfig(map, crop), entries), [map, entries, crop]);
}

export function CoverageBadge({
  listingId,
  crop,
  compact = false,
  className,
}: {
  listingId: string;
  crop: string;
  compact?: boolean;
  className?: string;
}) {
  const cov = useCoverageFor(listingId, crop);
  const meta = COVERAGE_META[cov.tier];
  const text = cov.pct != null && cov.tier !== "belgeleniyor"
    ? `${meta.label} · %${cov.pct}`
    : meta.label;
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center rounded-full text-[10px] font-medium px-2 py-0.5 ${className ?? ""}`}
      style={{
        background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
        color: meta.color,
      }}
    >
      {compact ? meta.label : text}
    </span>
  );
}

export function FirstSeasonBadge() {
  return (
    <span
      title="Bu ürün için ilk sezon kaydı"
      className="inline-flex items-center rounded-full text-[10px] font-medium px-2 py-0.5"
      style={{ background: "color-mix(in oklab, var(--lav) 25%, transparent)", color: "var(--lav)" }}
    >
      İlk Sezon
    </span>
  );
}
