import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { ArrowLeft, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TrustBadge } from "@/components/hasat/TrustBadge";
import { formatTRY } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";

export const Route = createFileRoute("/buyer/producer/$id")({
  head: () => ({ meta: [{ title: "Üretici — Hasat" }] }),
  component: ProducerProfile,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Üretici bulunamadı.</div>,
});

function ProducerProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const producer = useHasat((s) => s.producers.find((p) => p.id === id));
  if (!producer) throw notFound();

  const allBadges = ["organik", "iso", "cografi", "hasat", "premium"] as const;
  return (
    <div>
      <div className="relative h-52" style={{
        background: `repeating-linear-gradient(45deg, color-mix(in oklab, var(--saffron) 35%, var(--dark)) 0 14px, color-mix(in oklab, var(--saffron) 22%, var(--dark)) 14px 28px)`,
      }}>
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.65))" }} />
        <Link to="/buyer/discover" className="absolute top-4 left-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="absolute bottom-5 left-5 right-5 text-white">
          <h1 className="font-serif text-2xl md:text-3xl">{producer.name}</h1>
          <div className="text-sm opacity-90">📍 {producer.city} · GPS doğrulandı ✓</div>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-wrap gap-1.5">
          {allBadges.map((b) => <TrustBadge key={b} type={b} />)}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Toplam Arazi", v: producer.totalLand },
            { l: "Tecrübe", v: producer.experience },
            { l: "Ort. Kalite", v: producer.avgQuality },
            { l: "Yanıt Süresi", v: producer.responseTime },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl bg-card border p-4">
              <div className="text-xs text-hmuted">{s.l}</div>
              <div className="font-serif text-lg mt-1">{s.v}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-gold text-gold" /> <b>{producer.rating}</b> · {producer.ordersCount} sipariş</div>
          <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: "color-mix(in oklab, var(--sage) 22%, transparent)", color: "var(--sage)" }}>0 Anlaşmazlık</span>
          <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: "color-mix(in oklab, var(--lav) 25%, transparent)", color: "var(--lav)" }}>{producer.responseTime} Yanıt</span>
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Verim Geçmişi</h2>
          <div className="rounded-2xl bg-card border p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={producer.yieldHistory}>
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="var(--saffron)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-hmuted mt-2">Birim: g</div>
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Aktif Ürünler</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {producer.listings.filter((l) => l.status === "active").map((l) => (
              <div key={l.id} className="rounded-2xl bg-card border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{l.crop.includes("Safran") ? "🌸" : l.crop.includes("Lavanta") ? "💜" : "🌿"} {l.crop}</div>
                    <div className="text-xs text-hmuted mt-1">{l.quantity} {l.unit} · Min {l.minOrder} {l.unit} · Kalite {l.quality}</div>
                  </div>
                  <div style={{ fontFamily: "Courier New, monospace", color: "var(--saffron)" }} className="text-sm">
                    {formatTRY(l.pricePerUnit)}<span className="text-xs text-hmuted">/{l.unit}</span>
                  </div>
                </div>
                <button onClick={() => navigate({ to: "/buyer/offer/$listingId", params: { listingId: l.id } })}
                  className="mt-3 w-full rounded-xl bg-saffron py-2 text-sm text-white">Teklif Ver →</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Alıcı Yorumları</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {producer.reviews.map((r) => (
              <div key={r.id} className="rounded-2xl bg-card border p-4">
                <div className="text-sm italic">"{r.quote}"</div>
                <div className="mt-2 flex items-center gap-2 text-xs text-hmuted">
                  <span className="text-gold">{"★".repeat(r.rating)}</span>
                  <span>{r.buyer}</span><span>·</span><span>{r.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5 border" style={{ background: "color-mix(in oklab, var(--gold) 12%, transparent)", borderColor: "var(--gold)" }}>
          <h3 className="font-serif text-lg">Hasat Aboneliği</h3>
          <p className="text-sm text-hmuted mt-1">Bu üreticinin gelecek hasatından önceden pay alın.</p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl bg-card p-3"><div className="text-xs text-hmuted">Sonraki Hasat</div><div className="font-medium mt-0.5">{producer.nextHarvest.date}</div></div>
            <div className="rounded-xl bg-card p-3"><div className="text-xs text-hmuted">Tahmini Miktar</div><div className="font-medium mt-0.5">{producer.nextHarvest.estimatedQty}</div></div>
          </div>
          <button onClick={() => navigate({ to: "/buyer/subscription/$producerId", params: { producerId: producer.id } })}
            className="mt-4 w-full rounded-xl py-3 text-sm font-medium" style={{ background: "var(--gold)", color: "var(--dark)" }}>Hasat Aboneliği Oluştur →</button>
        </div>
      </div>
    </div>
  );
}
