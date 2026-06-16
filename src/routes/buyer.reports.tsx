import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { formatTRY } from "@/lib/hasat/format";

export const Route = createFileRoute("/buyer/reports")({
  head: () => ({ meta: [{ title: "Raporlar — Hasat" }] }),
  component: Reports,
});

const RANGES = ["Bu Ay", "Q3 2028", "2028 Tümü"];

const KPI = [
  { l: "Toplam Harcama", v: "₺4.2M", c: "var(--saffron)" },
  { l: "Hal'a göre tasarruf", v: "%31", c: "var(--sage)" },
  { l: "Aktif Üretici", v: "7", c: "var(--lav)" },
  { l: "Bekleyen Sipariş", v: "2", c: "var(--gold)" },
];

const PIE = [
  { name: "Safran", value: 68, color: "var(--saffron)" },
  { name: "Lavanta", value: 18, color: "var(--lav)" },
  { name: "Tıbbi Bitkiler", value: 14, color: "var(--sage)" },
];

const TOP = [
  { rank: 1, name: "Ahmet Yılmaz Safran Çiftliği", spend: 2850000, orders: 12, rating: 4.9 },
  { rank: 2, name: "Zeynep Aydın Fındık Kooperatifi", spend: 720000, orders: 4, rating: 4.8 },
  { rank: 3, name: "Fatma Kaya Lavanta Bahçesi", spend: 480000, orders: 7, rating: 4.7 },
  { rank: 4, name: "Mehmet Sarı Şifa Bitkileri", spend: 150000, orders: 3, rating: 4.6 },
];

const PRICE_COMP = [
  { m: "Oca", hasat: 320, hal: 460 },
  { m: "Şub", hasat: 325, hal: 470 },
  { m: "Mar", hasat: 330, hal: 480 },
  { m: "Nis", hasat: 335, hal: 485 },
  { m: "May", hasat: 340, hal: 490 },
  { m: "Haz", hasat: 345, hal: 500 },
  { m: "Tem", hasat: 350, hal: 510 },
  { m: "Ağu", hasat: 352, hal: 515 },
  { m: "Eyl", hasat: 355, hal: 520 },
  { m: "Eki", hasat: 358, hal: 525 },
  { m: "Kas", hasat: 360, hal: 530 },
];

function Reports() {
  const [range, setRange] = useState("Bu Ay");
  return (
    <>
      <BuyerHeader title="Raporlar" subtitle="Satın alma analitiği">
        <div className="mt-4 flex gap-1.5 overflow-x-auto">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className="shrink-0 rounded-full px-3 py-1 text-xs transition"
              style={{ background: range === r ? "var(--gold)" : "rgba(255,255,255,0.1)", color: range === r ? "var(--dark)" : "var(--hwhite)" }}>{r}</button>
          ))}
        </div>
      </BuyerHeader>

      <div className="p-4 md:p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {KPI.map((k) => (
            <div key={k.l} className="rounded-2xl bg-card border p-4">
              <div className="text-xs text-hmuted">{k.l}</div>
              <div className="font-mono text-2xl mt-1" style={{ color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl bg-card border p-4">
            <h3 className="font-serif text-lg mb-3">Harcama Dağılımı</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={PIE} dataKey="value" innerRadius={48} outerRadius={84} paddingAngle={2}>
                  {PIE.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 text-xs mt-2">
              {PIE.map((s) => (
                <span key={s.name} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name} %{s.value}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border p-4">
            <h3 className="font-serif text-lg mb-3">En İyi Üreticiler</h3>
            <div className="space-y-2">
              {TOP.map((t) => (
                <div key={t.rank} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted">
                  <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ background: t.rank === 1 ? "var(--gold)" : "var(--hmuted)" }}>{t.rank}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-xs text-hmuted">{t.orders} sipariş · ⭐ {t.rating}</div>
                  </div>
                  <div className="font-mono text-sm text-saffron">{formatTRY(t.spend)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-card border p-4">
          <h3 className="font-serif text-lg mb-3">Fiyat Karşılaştırması</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={PRICE_COMP}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="m" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="hasat" stroke="var(--saffron)" strokeWidth={2.5} name="Hasat fiyatı" />
              <Line type="monotone" dataKey="hal" stroke="var(--hmuted)" strokeWidth={2} strokeDasharray="6 6" name="Hal piyasası" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl p-5" style={{ background: "color-mix(in oklab, var(--sage) 22%, transparent)", color: "var(--sage)" }}>
          <div className="font-serif text-xl">🎉 Bu yıl ₺1.200.000 tasarruf ettiniz</div>
          <div className="text-xs text-hmuted mt-1" style={{ color: "var(--foreground)" }}>Hal piyasası fiyatlarıyla kıyaslandığında.</div>
        </div>
      </div>
    </>
  );
}
