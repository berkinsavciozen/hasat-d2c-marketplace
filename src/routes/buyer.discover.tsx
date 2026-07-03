import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { useActiveListings, useListingStock } from "@/lib/hasat/queries";
import { slugifyFarmer } from "@/lib/hasat/vitrin";
import { StockBadge } from "@/components/hasat/StockBadge";


export const Route = createFileRoute("/buyer/discover")({
  head: () => ({ meta: [{ title: "Keşfet — Hasat" }] }),
  component: Discover,
});

const CATS = [
  { e: "🌸", l: "Safran" },
  { e: "💜", l: "Lavanta" },
  { e: "🍃", l: "Tıbbi Bitkiler" },
  { e: "🫒", l: "Zeytinyağı" },
];

const SORTS = ["Puan", "Fiyat", "Yakınlık", "En Yeni"];

const CROP_EMOJI: Record<string, string> = { Safran: "🌸", Lavanta: "💜", "Tıbbi Bitkiler": "🌿", Fındık: "🌰", Zeytinyağı: "🫒" };

function Discover() {
  const navigate = useNavigate();
  const { data: listings = [], isLoading } = useActiveListings();
  const [sort, setSort] = useState("Puan");
  const [filters, setFilters] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const dropFilter = (f: string) => setFilters((x) => x.filter((y) => y !== f));
  const filtered = listings.filter((l) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      l.crop.toLowerCase().includes(q) ||
      l.farmerName.toLowerCase().includes(q) ||
      l.farmerCity.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <BuyerHeader title="Keşfet">
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-hmuted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün, üretici veya bölge ara..."
            className="w-full rounded-full bg-white/10 pl-10 pr-3 py-2.5 text-sm placeholder:text-hwhite/40 outline-none focus:bg-white/15" />
        </div>
        {filters.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto">
            {filters.map((f) => (
              <button key={f} onClick={() => dropFilter(f)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
                {f} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
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
            {CATS.map((c) => {
              const n = listings.filter((l) => l.crop.toLowerCase() === c.l.toLowerCase()).length;
              return (
                <button key={c.l} onClick={() => setQuery(c.l)} className="rounded-2xl bg-card border p-4 text-left hover:border-saffron transition">
                  <div className="text-3xl mb-1">{c.e}</div>
                  <div className="font-medium">{c.l}</div>
                  <div className="text-xs text-hmuted">{n} ilan</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Aktif İlanlar</h2>
          {isLoading ? (
            <LoadingDots />
          ) : filtered.length === 0 ? (
            query ? (
              <div className="rounded-2xl border border-dashed p-10 text-center">
                <div className="text-6xl mb-3">🌾</div>
                <div className="font-serif text-lg">Sonuç bulunamadı</div>
                <div className="text-sm text-hmuted mt-1">Farklı bir ürün veya üretici adı deneyin.</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center text-hmuted">Henüz aktif ilan yok.</div>
            )
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((l) => (
                <ListingCard key={l.id} listing={l} onOpen={() => navigate({ to: "/buyer/offer/$listingId", params: { listingId: l.id } })} />
              ))}
            </div>

          )}
        </div>
      </div>
    </>
  );
}
