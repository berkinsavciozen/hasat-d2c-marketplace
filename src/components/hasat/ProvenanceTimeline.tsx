import { Sprout, Camera, Calendar } from "lucide-react";
import type { HarvestEntry } from "@/lib/hasat/types";
import { findCropConfig, useCropConfigMap } from "@/lib/hasat/crop-config";
import { labelForStepKey, computeCoverage, COVERAGE_META } from "@/lib/hasat/coverage";
import { formatQuantity } from "@/lib/hasat/format";
import { FirstSeasonBadge } from "@/components/hasat/CoverageBadge";

/**
 * Buyer-facing timeline. Redacts free-text notes and cost breakdown; only
 * shows the event label, date, quantity, quality, and photos. Also shows both
 * "kayıt tarihi" (created_at) and "olay tarihi" (harvest_date) so buyers can
 * spot backdated entries.
 */
export function ProvenanceTimeline({
  crop,
  entries,
}: {
  crop: string;
  entries: HarvestEntry[];
}) {
  const { map } = useCropConfigMap();
  const cfg = findCropConfig(map, crop);
  const cov = computeCoverage(cfg, entries);
  const meta = COVERAGE_META[cov.tier];

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center">
        <Sprout className="mx-auto h-6 w-6 text-hmuted" />
        <div className="mt-2 text-sm text-hmuted">Bu ürün henüz belgelenmemiş.</div>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center rounded-full text-xs font-medium px-2.5 py-1"
          style={{
            background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
            color: meta.color,
          }}
        >
          {meta.label}{cov.pct != null && cov.tier !== "belgeleniyor" ? ` · %${cov.pct}` : ""}
        </span>
        {!cov.hasReplant && cov.tier !== "belgeleniyor" && <FirstSeasonBadge />}
      </div>

      <ol className="relative border-l pl-4 space-y-4">
        {sorted.map((e) => {
          const backdated = e.createdAt && e.date
            ? new Date(e.createdAt).toISOString().slice(0, 10) !== e.date
            : false;
          return (
            <li key={e.id} className="relative">
              <span className="absolute -left-[19px] top-1.5 grid h-3 w-3 place-items-center rounded-full bg-saffron" />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{labelForStepKey(cfg, e.step_key)}</span>
                <span className="text-xs text-hmuted inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(e.date).toLocaleDateString("tr-TR")}
                </span>
              </div>
              <div className="text-xs text-hmuted mt-0.5">
                {e.quantity ? `${formatQuantity(e.quantity, e.unit)} ${e.unit} · ` : ""}Kalite {e.quality}
              </div>
              {backdated && e.createdAt && (
                <div className="text-[11px] text-hmuted mt-0.5 italic">
                  Kayıt tarihi: {new Date(e.createdAt).toLocaleDateString("tr-TR")}
                </div>
              )}
              {e.photos.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {e.photos.slice(0, 3).map((u, i) => (
                    <img key={i} src={u} alt="" className="h-14 w-14 rounded-lg object-cover border" />
                  ))}
                  {e.photos.length > 3 && (
                    <span className="grid h-14 w-14 place-items-center rounded-lg border text-[10px] text-hmuted">
                      <Camera className="h-3 w-3 mb-0.5" />+{e.photos.length - 3}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
