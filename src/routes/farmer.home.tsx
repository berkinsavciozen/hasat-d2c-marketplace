import { createFileRoute, Link } from "@tanstack/react-router";
import { useHasat } from "@/lib/hasat/store";
import { useFarmerListings } from "@/lib/hasat/queries";
import { FarmerHeader } from "./farmer";
import { formatTRY } from "@/lib/hasat/format";
import { BookOpen, LineChart, Store, Users2 } from "lucide-react";

export const Route = createFileRoute("/farmer/home")({
  head: () => ({ meta: [{ title: "Ana Sayfa — Hasat" }] }),
  component: Home,
});

function Home() {
  const user = useHasat((s) => s.user);
  const entries = useHasat((s) => s.entries);
  const { data: listings = [] } = useFarmerListings();

  const totalRevenue = entries.reduce((sum, e) => sum + e.quantity * (e.pricePerUnit ?? 0), 0);
  const isEmpty = entries.length === 0 && listings.length === 0;

  const quickActions = [
    { icon: BookOpen, label: "Hasat Kaydet", to: "/farmer/journal/new" as const },
    { icon: LineChart, label: "Bugünkü Fiyat", to: "/farmer/prices" as const },
    { icon: Store, label: "Vitrine Ekle", to: "/farmer/storefront" as const },
    { icon: Users2, label: "Alıcı Bul", to: "/farmer/community" as const },
  ];

  return (
    <>
      <FarmerHeader title={`Merhaba, ${user?.name?.split(" ")[0] ?? "Çiftçi"} 👋`} />

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

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <div className="text-4xl mb-2">🌾</div>
            <div className="font-serif text-lg">Hasat'a hoş geldiniz</div>
            <div className="text-sm text-hmuted mt-1">
              Başlamak için ilk hasat kaydınızı oluşturun veya vitrininize bir ürün ekleyin.
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to="/farmer/journal/new" className="rounded-full bg-saffron px-4 py-2 text-sm font-medium text-white">
                Hasat Kaydet
              </Link>
              <Link to="/farmer/storefront" className="rounded-full border border-saffron px-4 py-2 text-sm font-medium text-saffron">
                Vitrine Ekle
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Revenue card */}
            <div className="rounded-2xl p-5" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-hwhite/60 uppercase tracking-wide">Bu Sezon</div>
                  <div className="mt-1 font-mono text-3xl md:text-4xl" style={{ color: "var(--gold)" }}>
                    {formatTRY(totalRevenue)}
                  </div>
                </div>
              </div>
            </div>

            {/* Active listings */}
            <div className="rounded-2xl bg-card border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg">Aktif Ürünler: {listings.length}</h3>
                <Link to="/farmer/storefront" className="text-sm text-saffron">Vitrin →</Link>
              </div>
              {listings.length === 0 ? (
                <div className="mt-3 text-sm text-hmuted">Henüz aktif ürün yok.</div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {listings.map((l) => (
                    <li key={l.id} className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm">
                      <span>🌾 {l.crop} · {l.quantity}{l.unit}</span>
                      <span className="font-mono">{formatTRY(l.pricePerUnit)}/{l.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
