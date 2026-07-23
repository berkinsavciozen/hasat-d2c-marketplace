import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useOfferItems, useListingBatchEntries } from "@/lib/hasat/queries";
import { formatTRY } from "@/lib/hasat/format";

/**
 * Shows the batch breakdown of an offer (from `offer_items`). Each row
 * expands into the harvest entries linked to that batch. Renders nothing
 * for legacy offers that have no `offer_items` rows.
 */
export function OfferBatchBreakdown({ offerId }: { offerId: string }) {
  const { data: items = [], isLoading } = useOfferItems(offerId);
  if (isLoading) return null;
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="font-medium text-sm mb-3">Parti dağılımı ({items.length} parti)</div>
      <div className="space-y-2">
        {items.map((it) => (
          <BatchLine key={it.id} listingId={it.listingId} label={it.batchName ?? "Batch"} qty={it.quantity} unit={it.unit} price={it.pricePerUnit} />
        ))}
      </div>
    </div>
  );
}

function BatchLine({
  listingId, label, qty, unit, price,
}: { listingId: string; label: string; qty: number; unit: string; price: number }) {
  const [open, setOpen] = useState(false);
  const { data: entries = [] } = useListingBatchEntries(open ? listingId : null);
  const subtotal = qty * price;
  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          <div className="text-xs text-hmuted">
            {qty} {unit} × <span className="font-mono">{formatTRY(price)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-sm" style={{ color: "var(--saffron)" }}>{formatTRY(subtotal)}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {open && (
        <div className="border-t px-3 py-2">
          <div className="text-[11px] text-hmuted mb-1">Bu partiye bağlı hasat kayıtları</div>
          {entries.length === 0 ? (
            <div className="text-xs text-hmuted italic">Kayıt yok.</div>
          ) : (
            <ul className="space-y-1">
              {entries.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-hmuted shrink-0">{new Date(e.date).toLocaleDateString("tr-TR")}</span>
                  <span className="flex-1 truncate">{e.quantity} {e.unit} · {e.quality}{e.notes ? ` — ${e.notes}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
