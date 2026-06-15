import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, X, Star } from "lucide-react";
import { useState } from "react";
import { TrustBadge } from "@/components/hasat/TrustBadge";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { formatTRY } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";

export const Route = createFileRoute("/buyer/discover")({
  head: () => ({ meta: [{ title: "Keşfet — Hasat" }] }),
  component: Discover,
});

const CATS = [
  { e: "🌸", l: "Safran", n: 23 },
  { e: "💜", l: "Lavanta", n: 67 },
  { e: "🍃", l: "Tıbbi Bitkiler", n: 142 },
  { e: "🫒", l: "Zeytinyağı", n: 89 },
];

const SORTS = ["Puan", "Fiyat", "Yakınlık", "En Yeni"];

function Discover() {
  const navigate = useNavigate();
  const producers = useHasat((s) => s.producers);
  const [sort, setSort] = useState("Puan");
  const [filters, setFilters] = useState<string[]>(["Safran", "Organik", "Kuzey Türkiye"]);
  const [query, setQuery] = useState("");

  const dropFilter = (f: string) => setFilters((x) => x.filter((y) => y !== f));
  const filtered = producers.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.city.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <BuyerHeader title="Keşfet">
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-hmuted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün, üretici veya bölge ara..."
            className="w-full rounded-full bg-white/10 pl-10 pr-3 py-2.5 text-sm placeholder:text-hwhite/40 outline-none focus:bg-white/15" />
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {filters.map((f) => (
            <button key={f} onClick={() => dropFilter(f)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
              {f} <X className="h-3 w-3" />
            </button>
          ))}
          <button className="shrink-0 rounded-full border border-white/20 px-3 py-1 text-xs">+ Filtre</button>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {SORTS.map((s) => (
            <button key={s} onClick={() => setSort(s)}
              className="shrink-0 rounded-full px-3 py-1 text-xs transition"
              style={{ background: sort === s ? "var(--gold)" : "rgba(255,255,255,0.1)", color: sort === s ? "var(--dark)" : "var(--hwhite)" }}>
              {s}
            </button>
          ))}
        </div>
      </BuyerHeader>

      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h2 className="font-serif text-lg mb-3">Kategoriler</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CATS.map((c) => (
              <button key={c.l} className="rounded-2xl bg-card border p-4 text-left hover:border-saffron transition">
                <div className="text-3xl mb-1">{c.e}</div>
                <div className="font-medium">{c.l}</div>
                <div className="text-xs text-hmuted">{c.n} üretici</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Öne Çıkan Üreticiler</h2>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-hmuted">Sonuç bulunamadı.</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => {
                const minPrice = Math.min(...p.listings.filter((l) => l.status === "active").map((l) => l.pricePerUnit));
                const minUnit = p.listings.find((l) => l.pricePerUnit === minPrice)?.unit ?? "g";
                return (
                  <button key={p.id} onClick={() => navigate({ to: "/buyer/producer/$id", params: { id: p.id } })}
                    className="text-left rounded-2xl bg-card border overflow-hidden hover:border-saffron transition">
                    <div className="h-28 relative" style={{
                      background: `repeating-linear-gradient(45deg, color-mix(in oklab, var(--saffron) 30%, var(--dark)) 0 12px, color-mix(in oklab, var(--saffron) 20%, var(--dark)) 12px 24px)`,
                    }}>
                      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55))" }} />
                      <div className="absolute top-2 left-2 flex gap-1">
                        {p.badges.includes("premium") && <span className="rounded-full bg-gold text-dark text-[10px] font-bold px-2 py-0.5">★ PREMIUM</span>}
                        {p.badges.includes("organik") && <span className="rounded-full bg-sage text-white text-[10px] font-bold px-2 py-0.5">ORGANİK</span>}
                      </div>
                      <div className="absolute bottom-2 left-3 right-3 text-white">
                        <div className="font-serif text-base leading-tight">{p.name}</div>
                        <div className="text-[11px] opacity-80">📍 {p.city}</div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-1 mb-2">
                        {p.crops.map((c) => <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{c}</span>)}
                      </div>
                      <div className="text-xs text-hmuted flex items-center gap-1 mb-2">
                        <Star className="h-3 w-3 fill-gold text-gold" /> {p.rating} · {p.ordersCount} sipariş
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {p.badges.slice(0, 2).map((b) => <TrustBadge key={b} type={b} />)}
                      </div>
                      <div className="text-xs text-hmuted">{p.listings.filter((l) => l.status === "active").length} aktif ürün</div>
                      <div className="mt-3 flex items-center justify-between">
                        <div style={{ fontFamily: "Courier New, monospace", color: "var(--saffron)" }} className="text-sm">
                          Başlangıç {formatTRY(minPrice)}<span className="text-xs text-hmuted">/{minUnit}</span>
                        </div>
                        <span className="rounded-full bg-saffron px-3 py-1.5 text-xs text-white">Profili Gör →</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}


