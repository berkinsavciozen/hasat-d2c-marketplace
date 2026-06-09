import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { TrustBadge } from "@/components/hasat/TrustBadge";
import { formatTRY } from "@/lib/hasat/format";

export const Route = createFileRoute("/buyer/discover")({
  head: () => ({ meta: [{ title: "Keşfet — Hasat" }] }),
  component: Discover,
});

const producers = [
  { id: 1, name: "Yılmaz Safran Çiftliği", city: "Karabük, Safranbolu", rating: 4.9, orders: 142, qty: "200g Premium Safran mevcut", price: 360, badges: ["premium", "organik", "iso"] as const },
  { id: 2, name: "Anadolu Lavanta Bahçesi", city: "Isparta, Kuyucak", rating: 4.7, orders: 89, qty: "80kg Kuru Lavanta mevcut", price: 200, badges: ["organik", "cografi"] as const },
  { id: 3, name: "Ege Şifa Bitkileri", city: "İzmir, Bayındır", rating: 4.6, orders: 56, qty: "Çeşitli tıbbi bitkiler", price: 110, badges: ["organik"] as const },
  { id: 4, name: "Karadeniz Fındık Kooperatifi", city: "Giresun", rating: 4.8, orders: 230, qty: "5 ton Tombul Fındık", price: 275, badges: ["cografi", "hasat"] as const },
];

function Discover() {
  return (
    <>
      <div className="px-4 pt-5 pb-4 md:px-8" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <h1 className="font-serif text-2xl md:text-3xl mb-4">Keşfet</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-hmuted" />
          <input placeholder="Ürün, üretici veya bölge ara..."
            className="w-full rounded-full bg-white/10 pl-10 pr-3 py-2.5 text-sm placeholder:text-hwhite/40 outline-none focus:bg-white/15" />
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {["Safran ×", "Organik ×", "Kuzey Türkiye ×", "+ Filtre"].map((c) => (
            <span key={c} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs">{c}</span>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-5">
        <div>
          <h2 className="font-serif text-lg mb-3">Kategoriler</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { e: "🌸", l: "Safran", n: 23 },
              { e: "💜", l: "Lavanta", n: 67 },
              { e: "🍃", l: "Tıbbi Bitkiler", n: 142 },
              { e: "🫒", l: "Zeytinyağı", n: 89 },
            ].map((c) => (
              <button key={c.l} className="rounded-2xl bg-card border p-4 text-left hover:border-saffron">
                <div className="text-3xl mb-1">{c.e}</div>
                <div className="font-medium">{c.l}</div>
                <div className="text-xs text-hmuted">{c.n} üretici</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Öne Çıkan Üreticiler</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {producers.map((p) => (
              <div key={p.id} className="rounded-2xl bg-card border overflow-hidden">
                <div className="h-24 relative" style={{ background: `linear-gradient(135deg, var(--saffron), var(--gold))` }}>
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.3))" }} />
                  <div className="absolute top-2 left-2 flex gap-1">
                    {p.badges.includes("premium" as never) && <span className="rounded-full bg-gold/95 text-dark text-[10px] font-bold px-2 py-0.5">★ PREMIUM</span>}
                  </div>
                </div>
                <div className="p-4">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-hmuted">{p.city}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.badges.slice(0, 2).map((b) => <TrustBadge key={b} type={b} />)}
                  </div>
                  <div className="mt-2 text-xs text-hmuted">⭐ {p.rating} · {p.orders} sipariş</div>
                  <div className="mt-2 text-xs">{p.qty}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-mono text-sm">{formatTRY(p.price)}<span className="text-xs text-hmuted">/g</span></div>
                    <button className="rounded-full bg-saffron px-3 py-1.5 text-xs text-white">Profili Gör →</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
