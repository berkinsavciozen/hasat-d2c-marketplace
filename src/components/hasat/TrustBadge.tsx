import type { CertificationType } from "@/lib/hasat/types";

const MAP: Record<CertificationType, { label: string; bg: string; fg: string }> = {
  organik: { label: "Organik Sertifikalı", bg: "var(--sage)", fg: "#fff" },
  iso: { label: "ISO 3632 A+", bg: "var(--gold)", fg: "#1A1A14" },
  cografi: { label: "Coğrafi İşaret 🇹🇷", bg: "var(--lav)", fg: "#1A1A14" },
  hasat: { label: "Hasat Doğrulandı ✓", bg: "var(--saffron)", fg: "#fff" },
  premium: { label: "★ Premium Üretici", bg: "var(--gold)", fg: "#1A1A14" },
  yeni: { label: "● Yeni Üretici", bg: "var(--lav)", fg: "#1A1A14" },
};

export function TrustBadge({ type }: { type: CertificationType }) {
  const m = MAP[type];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
