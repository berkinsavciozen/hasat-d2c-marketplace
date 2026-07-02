import { usePriceFeed } from "@/lib/hasat/queries";

interface Props {
  crop: string;
  pricePerUnit: number;
  unit: string;
}

function normalize(s: string) {
  return s.toLowerCase().trim();
}

/**
 * Shows an amber alert under a listing if its unit price deviates >20% from
 * the latest community price feed entry for the same crop. Silent when no
 * feed data exists for the crop.
 *
 * Note: compares raw price values; the price_feed `price_per_kg` column is
 * generic (actual unit stored in `unit`), so we only compare when units match.
 */
export function MarketDeviationAlert({ crop, pricePerUnit, unit }: Props) {
  const { data: feed = [] } = usePriceFeed();
  const target = normalize(crop);
  const latest = feed.find((e) => normalize(e.cropName) === target);
  if (!latest) return null;
  if (latest.unit !== unit) return null;
  if (!latest.price || !pricePerUnit) return null;

  const deviation = ((pricePerUnit - latest.price) / latest.price) * 100;
  if (Math.abs(deviation) < 20) return null;

  const direction = deviation > 0 ? "üzerinde" : "altında";
  const pct = Math.round(Math.abs(deviation));

  return (
    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
      ⚠️ Piyasa fiyatının %{pct} {direction}sınız
    </div>
  );
}
