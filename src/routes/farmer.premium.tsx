import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/farmer/premium")({ component: Premium });

const TIERS = [
  { id: "free", name: "Ücretsiz", price: "₺0", sub: "Sonsuza dek", border: "rgba(255,255,255,0.15)", bg: "var(--dark)", text: "var(--hwhite)", isCurrent: true },
  { id: "premium", name: "Premium", price: "₺299", sub: "/ay", border: "var(--saffron)", bg: "color-mix(in oklab, var(--saffron) 18%, var(--dark))", text: "var(--hwhite)", badge: "En Popüler" },
  { id: "elite", name: "Elite", price: "₺799", sub: "/ay", border: "var(--gold)", bg: "color-mix(in oklab, var(--gold) 14%, var(--dark))", text: "var(--hwhite)" },
];

const FEATURES: { label: string; values: [string | boolean, string | boolean, string | boolean] }[] = [
  { label: "Listeleme limiti", values: ["3 ürün", "Sınırsız", "Sınırsız"] },
  { label: "Fiyat alarmı", values: [false, true, true] },
  { label: "Gelişmiş analitik", values: [false, true, true] },
  { label: "Hasat aboneliği", values: [false, true, true] },
  { label: "Öncelikli eşleşme", values: [false, false, true] },
  { label: "Hesap yöneticisi", values: [false, false, true] },
];

function Premium() {
  const navigate = useNavigate();
  const user = useHasat((s) => s.user);

  return (
    <>
      <FarmerHeader title="Premium" subtitle="Daha fazla teklif, daha fazla gelir" />
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex gap-3 overflow-x-auto md:grid md:grid-cols-3 md:overflow-visible snap-x">
          {TIERS.map((t) => (
            <div key={t.id}
              className="min-w-[80%] md:min-w-0 snap-center rounded-2xl p-5 relative"
              style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
              {t.badge && (
                <span className="absolute -top-2 left-4 px-2 py-0.5 text-[10px] rounded-full"
                  style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>{t.badge}</span>
              )}
              {t.isCurrent && !user?.premium && (
                <span className="absolute -top-2 right-4 px-2 py-0.5 text-[10px] rounded-full bg-white/10">Mevcut</span>
              )}
              <div className="text-sm opacity-70">{t.name}</div>
              <div className="font-serif text-3xl mt-1">
                {t.price}<span className="text-sm opacity-60">{t.sub}</span>
              </div>
              {t.id !== "free" && (
                <button onClick={() => navigate({ to: "/farmer/billing", search: { plan: t.id } as never })}
                  className="mt-4 w-full rounded-xl py-2.5 text-sm font-medium"
                  style={{ background: t.id === "premium" ? "var(--saffron)" : "var(--gold)", color: "var(--hwhite)" }}>
                  {t.name}'a Geç
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-4 text-xs font-medium border-b border-border bg-muted">
            <div className="p-3">Özellik</div>
            <div className="p-3 text-center">Ücretsiz</div>
            <div className="p-3 text-center" style={{ color: "var(--saffron)" }}>Premium</div>
            <div className="p-3 text-center" style={{ color: "var(--gold)" }}>Elite</div>
          </div>
          {FEATURES.map((f) => (
            <div key={f.label} className="grid grid-cols-4 text-xs border-b last:border-b-0 border-border">
              <div className="p-3">{f.label}</div>
              {f.values.map((v, i) => (
                <div key={i} className="p-3 grid place-items-center">
                  {typeof v === "boolean" ? (v ? <Check className="h-4 w-4 text-sage" /> : <X className="h-4 w-4 opacity-30" />) : <span>{v}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
