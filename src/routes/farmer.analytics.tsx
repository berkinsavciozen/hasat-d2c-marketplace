import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { FarmerHeader } from "./farmer";
import { AIBox } from "@/components/hasat/AIBox";
import { useFarmerListings, useFarmerOrders } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";

export const Route = createFileRoute("/farmer/analytics")({
  head: () => ({ meta: [{ title: "Analitik | Hasat" }] }),
  component: Analytics,
});

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function Analytics() {
  const { data: listings = [], isLoading: lLoading } = useFarmerListings();
  const { data: orders = [], isLoading: oLoading } = useFarmerOrders();
  const loading = lLoading || oLoading;

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const uniqueBuyers = new Set(orders.map((o) => o.producerName)).size;

  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: TR_MONTHS[d.getMonth()], total: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const o of orders) {
      const k = (o.createdAt ?? "").slice(0, 7);
      const i = idx.get(k);
      if (i != null) buckets[i].total += o.total ?? 0;
    }
    const max = Math.max(1, ...buckets.map((b) => b.total));
    return { buckets, max };
  }, [orders]);

  const cropBreakdown = useMemo(() => {
    const rev = new Map<string, number>();
    for (const o of orders) rev.set(o.crop, (rev.get(o.crop) ?? 0) + (o.total ?? 0));
    const arr = [...rev.entries()].map(([crop, total]) => ({ crop, total }))
      .sort((a, b) => b.total - a.total).slice(0, 6);
    const max = Math.max(1, ...arr.map((r) => r.total));
    return { arr, max };
  }, [orders]);

  const empty = !loading && listings.length === 0 && orders.length === 0;

  return (
    <>
      <FarmerHeader title="Analitik" subtitle="Performansını takip et" />
      <div className="p-4 md:p-8 space-y-4">
        <AIBox page="analytics" />

        {loading ? (
          <div className="py-10"><LoadingDots /></div>
        ) : empty ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <div className="text-sm text-muted-foreground">
              Henüz analiz için yeterli veri yok. Hasat kayıtları ve siparişler eklendikçe burada görünecek.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Toplam Sipariş" value={String(totalOrders)} />
              <StatCard label="Toplam Ciro" value={formatTRY(totalRevenue)} accent="saffron" />
              <StatCard label="Aktif Alıcı" value={String(uniqueBuyers)} />
              <StatCard label="Aktif İlan" value={String(listings.filter((l) => l.status === "active").length)} />
            </div>

            <SectionCard title="Son 6 Ay Ciro">
              <div className="flex items-end gap-2 h-32">
                {monthly.buckets.map((b) => {
                  const pct = (b.total / monthly.max) * 100;
                  return (
                    <div key={b.key} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="flex-1 w-full flex items-end">
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: `${Math.max(pct, 2)}%`,
                            background: b.total > 0 ? "var(--saffron)" : "color-mix(in oklab, var(--saffron) 20%, transparent)",
                          }}
                          title={formatTRY(b.total)}
                        />
                      </div>
                      <div className="text-[10px] text-hmuted">{b.label}</div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {cropBreakdown.arr.length > 0 && (
              <SectionCard title="Ürüne Göre Ciro">
                <div className="space-y-2.5">
                  {cropBreakdown.arr.map((r) => {
                    const pct = (r.total / cropBreakdown.max) * 100;
                    return (
                      <div key={r.crop}>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-dark">{formatCrop(r.crop)}</span>
                          <span className="font-mono" style={{ color: "var(--saffron)" }}>{formatTRY(r.total)}</span>
                        </div>
                        <div className="h-2 mt-1 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--hmuted) 12%, transparent)" }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--gold)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}
          </>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "saffron" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[10px] uppercase tracking-widest text-hmuted">{label}</div>
      <div className="mt-1 font-mono text-lg" style={{ color: accent === "saffron" ? "var(--saffron)" : "var(--dark)" }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs uppercase tracking-widest text-hmuted mb-3">{title}</div>
      {children}
    </div>
  );
}
