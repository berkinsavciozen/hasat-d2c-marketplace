import { formatTRY } from "@/lib/hasat/format";
import type { NegotiationSnapshot, Offer, OfferSnapshot } from "@/lib/hasat/types";

type Props = {
  offer: Offer;
  /** Whose perspective. Affects "Sen" vs party-name labels. */
  viewer: "buyer" | "farmer";
  /** Compact (orders list cards) collapses to last 3 rounds. */
  compact?: boolean;
};

/**
 * Shows every negotiation round oldest -> newest, including the current "live" offer
 * as the final entry. Diff vs previous round highlighted on changed fields.
 */
export function NegotiationTimeline({ offer, viewer, compact = false }: Props) {
  const history = offer.history ?? [];
  // Build the full chain: every history entry, then the current live offer as the latest entry.
  // The first entry (round 1) is the original buyer offer if no history exists yet (status === "pending").
  const chain: NegotiationSnapshot[] = [
    ...history,
    {
      by: inferCurrentBy(offer, history),
      at: offer.createdAt,
      quantity: offer.quantity,
      pricePerUnit: offer.pricePerUnit,
      delivery: offer.delivery,
      deliveryDate: offer.deliveryDate,
      note: offer.note,
    },
  ];

  const visible = compact && chain.length > 3 ? chain.slice(-3) : chain;
  const hiddenCount = chain.length - visible.length;

  return (
    <div className="space-y-2">
      {compact && chain.length > 1 && (
        <div className="flex items-center justify-between text-xs text-hmuted">
          <span>{chain.length} tur müzakere</span>
          {hiddenCount > 0 && <span>+{hiddenCount} önceki tur gizli</span>}
        </div>
      )}
      <ol className="space-y-2">
        {visible.map((snap, i) => {
          const absoluteIdx = compact && chain.length > 3 ? chain.length - visible.length + i : i;
          const prev = absoluteIdx > 0 ? chain[absoluteIdx - 1] : undefined;
          const isLatest = absoluteIdx === chain.length - 1;
          return (
            <Round
              key={`${snap.at}-${absoluteIdx}`}
              round={absoluteIdx + 1}
              snap={snap}
              prev={prev}
              unit={offer.unit}
              viewer={viewer}
              partyName={offer.buyerName}
              isLatest={isLatest}
            />
          );
        })}
      </ol>
    </div>
  );
}

function inferCurrentBy(offer: Offer, history: NegotiationSnapshot[]): "buyer" | "farmer" {
  // The live row: if status is "counter", whoever sent the most recent move flipped the field.
  // History's last `by` is the previous mover, so the current mover is the opposite.
  if (history.length === 0) return "buyer"; // pending: original buyer offer
  const last = history[history.length - 1].by;
  return last === "buyer" ? "farmer" : "buyer";
}

function Round({
  round,
  snap,
  prev,
  unit,
  viewer,
  partyName,
  isLatest,
}: {
  round: number;
  snap: NegotiationSnapshot;
  prev?: NegotiationSnapshot;
  unit: string;
  viewer: "buyer" | "farmer";
  partyName: string;
  isLatest: boolean;
}) {
  const total = snap.quantity * snap.pricePerUnit;
  const prevTotal = prev ? prev.quantity * prev.pricePerUnit : null;
  const totalDiff = prevTotal !== null ? total - prevTotal : 0;
  const author =
    snap.by === viewer ? "Sen" : viewer === "buyer" ? "Üretici" : partyName;

  return (
    <li
      className={`rounded-xl border p-3 text-sm ${
        isLatest ? "border-saffron/60 bg-saffron/5" : "border-input bg-muted/30"
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
        <span className="min-w-0 font-medium text-hmuted">
          Tur {round} · <span className="text-foreground">{author}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="shrink-0 text-hmuted">{formatDate(snap.at)}</span>
          {isLatest && (
            <span className="shrink-0 rounded-full bg-saffron px-2 py-0.5 text-[10px] font-medium text-white">
              Güncel
            </span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Field
          label="Miktar"
          value={`${snap.quantity} ${unit}`}
          changed={!!prev && prev.quantity !== snap.quantity}
        />
        <Field
          label="Fiyat"
          value={`${formatTRY(snap.pricePerUnit)}/${unit}`}
          changed={!!prev && prev.pricePerUnit !== snap.pricePerUnit}
          mono
        />
        <Field
          label="Teslim"
          value={snap.delivery ?? "—"}
          changed={!!prev && (prev.delivery ?? "—") !== (snap.delivery ?? "—")}
        />
        <Field
          label="Tarih"
          value={snap.deliveryDate || "—"}
          changed={!!prev && (prev.deliveryDate ?? "") !== (snap.deliveryDate ?? "")}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 min-w-0">
        <span className="shrink-0 text-[11px] text-hmuted">Toplam</span>
        <span className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
          <span className="font-mono text-base font-semibold">{formatTRY(total)}</span>
          {prevTotal !== null && totalDiff !== 0 && (
            <span
              className={`text-[11px] font-medium ${
                totalDiff > 0 ? "text-saffron" : "text-emerald-600"
              }`}
            >
              {totalDiff > 0 ? "+" : ""}
              {formatTRY(totalDiff)}
            </span>
          )}
        </span>
      </div>
      {snap.note && (
        <div className="mt-2 rounded-lg bg-background/60 p-2 text-[11px] italic text-hmuted">
          "{snap.note}"
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  value,
  changed,
  mono,
}: {
  label: string;
  value: string;
  changed: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-hmuted">{label}:</span>
      <span
        className={`min-w-0 truncate ${mono ? "font-mono" : ""} ${
          changed ? "font-semibold text-saffron" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// Re-export for convenience.
export type { OfferSnapshot };
