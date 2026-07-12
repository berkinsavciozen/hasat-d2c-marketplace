import type { CropConfig, LifecycleStep } from "./crop-config";
import type { HarvestEntry } from "./types";

export type CoverageTier = "belgeleniyor" | "temel" | "iyi" | "tam";

export interface CoverageResult {
  tier: CoverageTier;
  label: string;
  pct: number | null;         // 0..100 or null when tier === "belgeleniyor"
  requiredSteps: LifecycleStep[];
  matchedKeys: string[];
  missingSteps: LifecycleStep[];
  seasonStart: string | null;
  hasReplant: boolean;
  seasonEntryCount: number;
}

export const COVERAGE_META: Record<CoverageTier, { label: string; description: string; color: string }> = {
  belgeleniyor: { label: "Belgeleniyor", description: "Ürün geçmişi henüz yok", color: "var(--hmuted)" },
  temel:        { label: "Temel",             description: "Az sayıda kayıt",       color: "var(--hmuted)" },
  iyi:          { label: "İyi Belgelenmiş", description: "Sezonun büyük kısmı belgeli", color: "var(--gold)" },
  tam:          { label: "Tam İzlenebilir", description: "Sezon adımları tam",      color: "var(--sage)" },
};

function tierFromPct(pct: number): CoverageTier {
  if (pct >= 80) return "tam";
  if (pct >= 40) return "iyi";
  return "temel";
}

const REPLANT_KEYS = new Set(["replant", "dikim", "ekim", "plant", "planting"]);

/**
 * Compute a coverage score for one listing / parcel / crop.
 *
 * Season window = from most recent replant/dikim entry onward. If no replant
 * entry exists, the earliest entry starts the season and the caller can flag
 * an "İlk Sezon" badge separately via `hasReplant === false`.
 *
 * Coverage = required lifecycle steps that have ≥1 matching entry (by
 * step_key) / total required lifecycle steps.
 */
export function computeCoverage(
  cfg: CropConfig | null | undefined,
  entries: HarvestEntry[],
): CoverageResult {
  if (!cfg || !Array.isArray(cfg.lifecycle_steps) || cfg.lifecycle_steps.length === 0) {
    return {
      tier: "belgeleniyor",
      label: COVERAGE_META.belgeleniyor.label,
      pct: null,
      requiredSteps: [],
      matchedKeys: [],
      missingSteps: [],
      seasonStart: null,
      hasReplant: false,
      seasonEntryCount: entries.length,
    };
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const replantEntry = [...sorted].reverse().find((e) =>
    e.step_key ? REPLANT_KEYS.has(e.step_key) : false,
  );
  const seasonStart = replantEntry?.date ?? sorted[0]?.date ?? null;
  const seasonEntries = seasonStart
    ? sorted.filter((e) => e.date >= seasonStart)
    : sorted;

  const requiredSteps = cfg.lifecycle_steps.filter((s) => s.required);
  const denom = requiredSteps.length || cfg.lifecycle_steps.length;
  const stepKeys = new Set(seasonEntries.map((e) => e.step_key).filter(Boolean) as string[]);

  const matched = requiredSteps.filter((s) => stepKeys.has(s.key)).map((s) => s.key);
  const missing = requiredSteps.filter((s) => !stepKeys.has(s.key));
  const pct = denom > 0 ? Math.round((matched.length / denom) * 100) : 0;
  const tier: CoverageTier = tierFromPct(pct);

  return {
    tier,
    label: COVERAGE_META[tier].label,
    pct,
    requiredSteps,
    matchedKeys: matched,
    missingSteps: missing,
    seasonStart,
    hasReplant: !!replantEntry,
    seasonEntryCount: seasonEntries.length,
  };
}

/**
 * Given a step_key and a lifecycle spec, return the human-readable label.
 * Falls back to the key itself, or "Hasat kaydı" when no key.
 */
export function labelForStepKey(
  cfg: CropConfig | null | undefined,
  stepKey: string | null | undefined,
): string {
  if (!stepKey) return "Hasat kaydı";
  const step = cfg?.lifecycle_steps?.find((s) => s.key === stepKey);
  return step?.label ?? stepKey;
}
