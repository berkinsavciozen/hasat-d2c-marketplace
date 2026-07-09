import { usePriceFeedSummary } from "@/lib/hasat/queries";

interface Props {
  crop: string;
  pricePerUnit: number;
  /** Kept in signature for backwards-compat with callers. */
  unit: string;
}

/**
 * Band-based market signal (competition-law safe).
 * Never displays a suggested price. Renders nothing when data is insufficient
 * (fewer than 5 distinct farmers in the 30-day window).
 *
 * - price > avg + stddev → "YÜKSEK" (red)
 * - avg - stddev ≤ price ≤ avg + stddev → "UYGUN" (neutral)
 * - price < avg - stddev → "DÜŞÜK" (amber)
 */
export function MarketDeviationAlert({ crop, pricePerUnit }: Props) {
  const { data: summary } = usePriceFeedSummary(crop);
  if (!summary || summary.insufficientData) return null;
  if (summary.avgPrice == null || summary.stddevPrice == null) return null;
  if (!pricePerUnit) return null;

  const lo = summary.avgPrice - summary.stddevPrice;
  const hi = summary.avgPrice + summary.stddevPrice;

  let label: "YÜKSEK" | "UYGUN" | "DÜŞÜK";
  let text: string;
  let cls: string;

  if (pricePerUnit > hi) {
    label = "YÜKSEK";
    text = "Fiyatın piyasa aralığının üzerinde. Gözden geçirmek isteyebilirsin.";
    cls = "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200";
  } else if (pricePerUnit < lo) {
    label = "DÜŞÜK";
    text = "Fiyatın piyasa aralığının altında. Gözden geçirmek isteyebilirsin.";
    cls = "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  } else {
    label = "UYGUN";
    text = "Fiyatın piyasa aralığında.";
    cls = "border-border bg-muted text-foreground/80";
  }

  return (
    <div className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${cls}`}>
      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">{label}</span>
      <span>{text}</span>
    </div>
  );
}
