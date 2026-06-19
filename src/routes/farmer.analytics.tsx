import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { formatTRY } from "@/lib/hasat/format";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/farmer/analytics")({
  head: () => ({ meta: [{ title: "Analitik | Hasat" }] }),
  component: Analytics,
});

const RANGES = ["Bu Ay", "Q3 2028", "2028 Tümü"] as const;
type Range = typeof RANGES[number];

const REV: Record<Range, { m: string; v: number }[]> = {
  "Bu Ay": [
    { m: "Hf1", v: 18000 }, { m: "Hf2", v: 24000 }, { m: "Hf3", v: 22000 }, { m: "Hf4", v: 31000 },
    { m: "Hf5", v: 28000 }, { m: "Hf6", v: 36000 }, { m: "Hf7", v: 42000 }, { m: "Hf8", v: 48000 },
  ],
  "Q3 2028": [
    { m: "Tem", v: 65000 }, { m: "Tem-2", v: 78000 }, { m: "Ağu", v: 92000 }, { m: "Ağu-2", v: 88000 },
    { m: "Eyl", v: 105000 }, { m: "Eyl-2", v: 115000 }, { m: "Eki", v: 142000 }, { m: "Eki-2", v: 168000 },
  ],
  "2028 Tümü": [
    { m: "Oca", v: 22000 }, { m: "Şub", v: 28000 }, { m: "Mar", v: 35000 }, { m: "May", v: 48000 },
    { m: "Tem", v: 65000 }, { m: "Eyl", v: 105000 }, { m: "Eki", v: 142000 }, { m: "Kas", v: 195000 },
  ],
};

const TOTALS: Record<Range, number> = { "Bu Ay": 249000, "Q3 2028": 853000, "2028 Tümü": 1340000 };

const QUALITY = [
  { parcel: "Parsel A", A: 380, B: 80, C: 20 },
  { parcel: "Parsel B", A: 60, B: 120, C: 30 },
];

const BUYERS = [
  { name: "Mikla Restaurant", spend: 285000, orders: 8, rating: 5 },
  { name: "Çırağan Palace", spend: 240000, orders: 6, rating: 5 },
  { name: "Anatolian Exports", spend: 198000, orders: 4, rating: 4 },
  { name: "Macro Center", spend: 142000, orders: 12, rating: 4 },
  { name: "Neolokal", spend: 98000, orders: 5, rating: 5 },
];

const SEASONAL = [
  { season: "İlkbahar", "2027": 45000, "2028": 62000, "2029": 71000 },
  { season: "Yaz", "2027": 88000, "2028": 105000, "2029": 122000 },
  { season: "Sonbahar", "2027": 240000, "2028": 380000, "2029": 445000 },
  { season: "Kış", "2027": 32000, "2028": 48000, "2029": 56000 },
];

function Analytics() {
  const parcels = useHasat((s) => s.parcels);
  const [range, setRange] = useState<Range>("Q3 2028");

  return (
    <>
      <FarmerHeader title="Analitik" subtitle="Performansını takip et" />
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex gap-2 overflow-x-auto">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className="rounded-full px-4 py-1.5 text-xs whitespace-nowrap border transition"
              style={{
                background: range === r ? "var(--saffron)" : "transparent",
                color: range === r ? "var(--hwhite)" : "var(--foreground)",
                borderColor: range === r ? "var(--saffron)" : "var(--border)",
              }}>{r}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Toplam Gelir" value={formatTRY(TOTALS[range])} accent="gold" />
          <Kpi label="Verim/Dönüm" value="184 g" />
          <Kpi label="Aktif Parsel" value={String(parcels.length)} />
          <Kpi label="En İyi Alıcı" value="Mikla" />
        </div>

        <Card title="Gelir">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={REV[range]}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--saffron)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--saffron)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatTRY(Number(v))} />
              <Area type="monotone" dataKey="v" stroke="var(--saffron)" strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Kalite Dağılımı (parsel başına)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={QUALITY}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="parcel" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="A" fill="var(--saffron)" />
              <Bar dataKey="B" fill="var(--gold)" />
              <Bar dataKey="C" fill="var(--hmuted)" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="En İyi Alıcılar">
          <div className="space-y-2">
            {BUYERS.map((b, i) => (
              <div key={b.name} className="flex items-center gap-3 py-2 border-b last:border-b-0 border-border">
                <div className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
                  style={{ background: i < 3 ? "var(--saffron)" : "var(--muted)", color: i < 3 ? "var(--hwhite)" : "inherit" }}>{i + 1}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.orders} sipariş · {"★".repeat(b.rating)}</div>
                </div>
                <div className="text-sm font-mono">{formatTRY(b.spend)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Mevsimsel Trend">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={SEASONAL}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="season" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatTRY(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="2027" fill="var(--hmuted)" />
              <Bar dataKey="2028" fill="var(--sage)" />
              <Bar dataKey="2029" fill="var(--saffron)" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "gold" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-serif text-lg md:text-xl mt-1" style={{ color: accent === "gold" ? "var(--gold)" : "inherit" }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}
