import type { OfferStatus } from "@/lib/hasat/types";

const MAP: Record<OfferStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: "Beklemede", bg: "color-mix(in oklab, var(--saffron) 18%, transparent)", fg: "var(--saffron)" },
  counter: { label: "Karşı Teklif", bg: "color-mix(in oklab, var(--gold) 22%, transparent)", fg: "var(--gold)" },
  accepted: { label: "Kabul Edildi", bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  active: { label: "Aktif Sipariş", bg: "color-mix(in oklab, var(--teal) 20%, transparent)", fg: "var(--teal)" },
  completed: { label: "Tamamlandı", bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  rejected: { label: "Reddedildi", bg: "color-mix(in oklab, var(--hred) 18%, transparent)", fg: "var(--hred)" },
};

export function OrderChip({ status }: { status: OfferStatus }) {
  const m = MAP[status];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: m.bg, color: m.fg }}>
      {m.label}
    </span>
  );
}
