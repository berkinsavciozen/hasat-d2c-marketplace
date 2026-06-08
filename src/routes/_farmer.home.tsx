import { createFileRoute, Link } from "@tanstack/react-router";
import { useHasat } from "@/lib/hasat/store";
import { FarmerHeader } from "./_farmer";
import { FarmPill } from "@/components/hasat/FarmPill";
import { SeasonBanner } from "@/components/hasat/SeasonBanner";
import { Sparkline } from "@/components/hasat/Sparkline";
import { AIInsightBanner } from "@/components/hasat/AIInsightBanner";
import { formatTRY } from "@/lib/hasat/format";
import { BookOpen, LineChart, Store, Users2, AlertTriangle, CloudSun } from "lucide-react";

export const Route = createFileRoute("/_farmer/home")({
  head: () => ({ meta: [{ title: "Ana Sayfa — Hasat" }] }),
  component: Home,
});

function Home() {
  const user = useHasat((s) => s.user);
  const entries = useHasat((s) => s.entries);
  const listings = useHasat((s) => s.listings);

  const totalRevenue = entries.reduce((sum, e) => sum + e.quantity * (e.pricePerUnit ?? 0), 0);

  const quickActions = [
    { icon: BookOpen, label: "Hasat Kaydet", to: "/farmer/journal/new" as const },
    { icon: LineChart, label: "Bugünkü Fiyat", to: "/farmer/prices" as const },
    { icon: Store, label: "Vitrine Ekle", to: "/farmer/storefront" as const },
    { icon: Users2, label: "Alıcı Bul", to: "/farmer/community" as const },
  ];

  return (
    <>
      <FarmerHeader title={`Merhaba, ${user?.name?.split(" ")[0] ?? "Çiftçi"} 👋`}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FarmPill city="Karabük" area={5} crop="Safran" />
        </div>
        <div className="mt-3 md:hidden">
          <SeasonBanner />
        </div>
      </FarmerHeader>

      <div className="p-4 md:p-8 space-y-4">
        {/* Quick actions */}
        <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto pb-1">
          {quickActions.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="flex shrink-0 items-center gap-2 rounded-full bg-card border px-4 py-2 text-sm shadow-sm hover:border-saffron"
            >
              <a.icon className="h-4 w-4 text-saffron" />
              {a.label}
            </Link>
          ))}
        </div>

        {/* Revenue card */}
        <div className="rounded-2xl p-5" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-hwhite/60 uppercase tracking-wide">Bu Sezon</div>
              <div className="mt-1 font-mono text-3xl md:text-4xl" style={{ color: "var(--gold)" }}>
                {formatTRY(totalRevenue || 340000)}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--sage)" }}>+23% geçen sezona göre</div>
            </div>
            <Sparkline data={[120, 180, 160, 220, 260, 240, 320, 380]} />
          </div>
        </div>

        {/* Active listings */}
        <div className="rounded-2xl bg-card border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg">Aktif Ürünler: {listings.length}</h3>
            <Link to="/farmer/storefront" className="text-sm text-saffron">Vitrin →</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm">
                <span>🌸 {l.crop} · {l.quantity}{l.unit}</span>
                <span className="font-mono">{formatTRY(l.pricePerUnit)}/{l.unit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Weather + AI anomaly side by side on md */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-card border p-4">
            <div className="flex items-center gap-3">
              <CloudSun className="h-8 w-8 text-saffron" />
              <div className="flex-1">
                <div className="font-medium">Karabük</div>
                <div className="text-xs text-hmuted">14°C · Parçalı bulutlu</div>
              </div>
              <div className="font-mono text-2xl">14°</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-sage/15 text-sage px-2 py-1">💧 Sulama gerekmiyor</span>
              <span className="rounded-full bg-saffron/15 text-saffron px-2 py-1">⏳ Hasat: 8 gün kaldı</span>
            </div>
          </div>

          <div className="rounded-2xl border p-4" style={{ background: "color-mix(in oklab, var(--hred) 8%, var(--card))", borderColor: "color-mix(in oklab, var(--hred) 40%, transparent)" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-hred" />
              <div className="flex-1">
                <div className="font-medium">Verim anomalisi tespit edildi</div>
                <div className="text-xs text-hmuted mt-0.5">Bu yılki safran verimi geçen yıla göre %12 düşük. Sebebi nedir?</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["Hava koşulları", "Hastalık", "Erken hasat", "Diğer"].map((r) => (
                    <button key={r} className="rounded-full border border-hred/40 px-2.5 py-1 text-[11px] hover:bg-hred/10">{r}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity feed */}
        <div className="rounded-2xl bg-card border p-4">
          <h3 className="font-serif text-lg mb-2">Son Etkinlikler</h3>
          <ul className="divide-y">
            {[
              { e: "🤝", t: "Yeni teklif: Eataly İstanbul", s: "200g Safran · ₺72.000", time: "2s önce" },
              { e: "💰", t: "Ödeme alındı", s: "Mikla Restoran · ₺28.500", time: "1g önce" },
              { e: "📈", t: "Fiyat alarmı", s: "Safran D2C ₺358/g'a ulaştı", time: "2g önce" },
            ].map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="text-xl">{a.e}</span>
                <div className="flex-1">
                  <div className="font-medium">{a.t}</div>
                  <div className="text-xs text-hmuted">{a.s}</div>
                </div>
                <span className="text-[11px] text-hmuted">{a.time}</span>
              </li>
            ))}
          </ul>
        </div>

        <AIInsightBanner cta={<Link to="/farmer/storefront" className="text-xs font-medium text-saffron whitespace-nowrap">Hemen Listele →</Link>}>
          Safran D2C fiyatı 7 gün içinde %8.4 arttı. Şu an vitrinde listelersen ortalama %24 daha fazla kazanabilirsin.
        </AIInsightBanner>
      </div>
    </>
  );
}
