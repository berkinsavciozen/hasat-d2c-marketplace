import { useOfferMessages } from "@/lib/hasat/queries";
import { formatTRY } from "@/lib/hasat/format";
import type { BallSide } from "@/lib/hasat/types";

interface Props {
  offerId: string;
  viewer: BallSide;
  unit: string;
  /** Initial offer to show as round 0. */
  initial?: { price: number; quantity: number; createdAt: string };
}

export function NegotiationThread({ offerId, viewer, unit, initial }: Props) {
  const { data: msgs = [], isLoading } = useOfferMessages(offerId);

  if (isLoading) return <div className="text-xs text-hmuted">Müzakere geçmişi yükleniyor…</div>;

  const rows: { role: BallSide; price: number | null; quantity: number | null; note?: string | null; at: string }[] = [];
  if (initial) rows.push({ role: "buyer", price: initial.price, quantity: initial.quantity, at: initial.createdAt });
  for (const m of msgs) {
    rows.push({ role: m.senderRole, price: m.price, quantity: m.quantity, note: m.note, at: m.createdAt });
  }

  if (rows.length === 0) return null;

  return (
    <ol className="space-y-2">
      {rows.map((r, i) => {
        const mine = r.role === viewer;
        const label = mine ? "Siz" : r.role === "buyer" ? "Alıcı" : "Çiftçi";
        const isLast = i === rows.length - 1;
        return (
          <li
            key={i}
            className={`rounded-lg border px-3 py-2 text-xs ${isLast ? "border-saffron bg-saffron/5" : "bg-card"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`font-medium ${mine ? "text-saffron" : ""}`}>{label}</span>
              <span className="text-[10px] text-hmuted">{new Date(r.at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="mt-1 font-mono">
              {r.quantity ?? "—"} {unit} · {r.price != null ? `${formatTRY(r.price)}/${unit}` : "—"}
              {r.price != null && r.quantity != null && (
                <span className="ml-2 text-hmuted">→ {formatTRY(r.price * r.quantity)}</span>
              )}
            </div>
            {r.note && <div className="mt-1 italic text-hmuted">"{r.note}"</div>}
          </li>
        );
      })}
    </ol>
  );
}
