import { useListingStock } from "@/lib/hasat/queries";
import { formatQuantity } from "@/lib/hasat/format";

export function StockBadge({ listingId, unit, className }: { listingId: string; unit: string; className?: string }) {
  const { data: stock } = useListingStock(listingId);
  if (!stock) return null;
  const soldOut = stock.available <= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${className ?? ""}`}
      style={{
        background: soldOut ? "color-mix(in oklab, var(--hred) 20%, transparent)" : "color-mix(in oklab, var(--sage) 20%, transparent)",
        color: soldOut ? "var(--hred)" : "var(--sage)",
      }}
    >
      {soldOut ? "Tükendi" : `Mevcut: ${formatQuantity(stock.available, unit)} ${unit}`}
    </span>
  );
}
