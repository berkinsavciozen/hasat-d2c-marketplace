import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { useBuyerAnalytics, isPaidOrder, orderRowTotal, type BuyerAnalyticsRow } from "@/lib/hasat/queries";
import { Download } from "lucide-react";

export const Route = createFileRoute("/buyer/reports")({
  head: () => ({ meta: [{ title: "Raporlar | Hasat" }] }),
  component: Reports,
});

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

interface SupplierAgg {
  farmerId: string;
  name: string;
  city: string | null;
  orderCount: number;
  spend: number;
  deliveredCount: number;
  lastOrderAt: string;
}

function toCSV(rows: BuyerAnalyticsRow[]): string {
  const header = ["Sipariş No", "Tarih", "Üretici", "Ürün", "Miktar", "Birim", "Fiyat", "Toplam", "Durum"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const total = orderRowTotal(r);
    const q = Number(r.offer?.current_quantity ?? r.offer?.quantity ?? 0);
    const p = Number(r.offer?.current_price ?? r.offer?.price_per_unit ?? 0);
    const cells = [
      r.order_ref,
      new Date(r.created_at).toLocaleDateString("tr-TR"),
      r.farmer?.name ?? "",
      r.offer?.listing?.crop ?? "",
      String(q),
      r.offer?.listing?.unit ?? "",
      p.toFixed(2),
      total.toFixed(2),
      r.status,
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

function Reports() {
  const navigate = useNavigate();
  const { data: allRows = [], isLoading } = useBuyerAnalytics();

  const paidRows = useMemo(() => allRows.filter(isPaidOrder), [allRows]);

  const stats = useMemo(() => {
    const total = paidRows.reduce((s, r) => s + orderRowTotal(r), 0);
    const suppliers = new Set(paidRows.map((r) => r.farmer_id).filter(Boolean));
    const cropTotals = new Map<string, number>();
    for (const r of paidRows) {
      const crop = r.offer?.listing?.crop ?? "—";
      cropTotals.set(crop, (cropTotals.get(crop) ?? 0) + orderRowTotal(r));
    }
    return { total, count: paidRows.length, supplierCount: suppliers.size, cropTotals };
  }, [paidRows]);

  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: TR_MONTHS[d.getMonth()], total: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const r of paidRows) {
      const k = (r.created_at ?? "").slice(0, 7);
      const i = idx.get(k);
      if (i != null) buckets[i].total += orderRowTotal(r);
    }
    const max = Math.max(1, ...buckets.map((b) => b.total));
    return { buckets, max };
  }, [paidRows]);

  const cropBreakdown = useMemo(() => {
    const arr = Array.from(stats.cropTotals.entries())
      .map(([crop, total]) => ({ crop, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
    const max = Math.max(1, ...arr.map((r) => r.total));
    return { arr, max };
  }, [stats.cropTotals]);

  const suppliers = useMemo<SupplierAgg[]>(() => {
    const byFarmer = new Map<string, SupplierAgg>();
    for (const r of paidRows) {
      if (!r.farmer_id) continue;
      const existing = byFarmer.get(r.farmer_id) ?? {
        farmerId: r.farmer_id,
        name: r.farmer?.name ?? "Üretici",
        city: r.farmer?.city ?? null,
        orderCount: 0,
        spend: 0,
        deliveredCount: 0,
        lastOrderAt: r.created_at,
      };
      existing.orderCount += 1;
      existing.spend += orderRowTotal(r);
      if (r.status === "delivered" || r.status === "completed") existing.deliveredCount += 1;
      if (r.created_at > existing.lastOrderAt) existing.lastOrderAt = r.created_at;
      byFarmer.set(r.farmer_id, existing);
    }
    return Array.from(byFarmer.values()).sort((a, b) => b.spend - a.spend);
  }, [paidRows]);

  const exportCSV = () => {
    const csv = toCSV(paidRows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hasat-raporlar-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <BuyerHeader title="Raporlar" subtitle="Ödenmiş siparişler üzerinden tedarik günlüğü">
        {paidRows.length > 0 && (
          <button
            onClick={exportCSV}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs text-hwhite"
          >
            <Download className="h-3.5 w-3.5" /> CSV indir
          </button>
        )}
      </BuyerHeader>
      <div className="p-4 md:p-8 max-w-4xl space-y-5">
        {isLoading ? (
          <LoadingDots />
        ) : paidRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            <div className="text-4xl mb-2">📊</div>
            Henüz ödenmiş siparişiniz yok. İlk siparişiniz onaylandığında rapor burada oluşur.
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard label="Toplam Harcama" value={formatTRY(stats.total)} accent="gold" />
              <StatCard label="Sipariş" value={String(stats.count)} />
              <StatCard label="Aktif Üretici" value={String(stats.supplierCount)} />
              <StatCard label="Ürün Çeşidi" value={String(stats.cropTotals.size)} />
            </div>

            {/* Monthly bar chart */}
            <SectionCard title="Son 6 Ay Harcama">
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

            {/* Crop breakdown */}
            <SectionCard title="Ürün Kırılımı">
              <div className="space-y-2">
                {cropBreakdown.arr.map((r) => {
                  const pct = (r.total / cropBreakdown.max) * 100;
                  return (
                    <div key={r.crop}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-dark">{formatCrop(r.crop)}</span>
                        <span className="font-mono" style={{ color: "var(--gold)" }}>{formatTRY(r.total)}</span>
                      </div>
                      <div className="h-2 mt-1 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--hmuted) 12%, transparent)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--saffron)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* Suppliers */}
            <SectionCard title="Tedarikçi Güveni">
              <div className="grid gap-2 sm:grid-cols-2">
                {suppliers.map((s) => {
                  const onTime = s.orderCount > 0 ? Math.round((s.deliveredCount / s.orderCount) * 100) : 0;
                  const barColor = onTime >= 90 ? "var(--sage)" : onTime >= 60 ? "var(--gold)" : "var(--hred)";
                  return (
                    <div key={s.farmerId} className="rounded-xl border bg-card p-3 min-h-[96px]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-dark truncate">{s.name}</div>
                          <div className="text-[11px] text-hmuted truncate">
                            {s.city ? `${s.city} · ` : ""}{s.orderCount} sipariş
                          </div>
                        </div>
                        <div className="font-mono text-sm shrink-0" style={{ color: "var(--gold)" }}>{formatTRY(s.spend)}</div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--hmuted) 15%, transparent)" }}>
                          <div className="h-full rounded-full" style={{ width: `${onTime}%`, background: barColor }} />
                        </div>
                        <span className="text-[10px] font-mono text-hmuted whitespace-nowrap">Teslim %{onTime}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-hmuted">
                        Son: {new Date(s.lastOrderAt).toLocaleDateString("tr-TR")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* Recent orders */}
            <SectionCard title="Son Siparişler">
              <div className="grid gap-2 sm:grid-cols-2">
                {paidRows.slice(0, 10).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate({ to: "/buyer/orders/$orderId", params: { orderId: r.id } })}
                    className="w-full text-left rounded-xl border bg-card p-3 min-h-[92px] hover:border-saffron transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] text-hmuted">{r.order_ref}</div>
                        <div className="font-medium mt-0.5 text-dark text-sm truncate">{formatCrop(r.offer?.listing?.crop) ?? "—"}</div>
                        <div className="text-[11px] text-hmuted truncate">{r.farmer?.name ?? "Üretici"}</div>
                      </div>
                      <span className="font-mono text-sm shrink-0" style={{ color: "var(--gold)" }}>{formatTRY(orderRowTotal(r))}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-hmuted">
                      <span>{r.offer?.current_quantity ?? r.offer?.quantity ?? 0} {r.offer?.listing?.unit ?? ""}</span>
                      <span>{new Date(r.created_at).toLocaleDateString("tr-TR")}</span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "gold" }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
      <div className="text-[10px] uppercase tracking-widest text-hmuted">{label}</div>
      <div className="mt-1 font-mono text-lg" style={{ color: accent === "gold" ? "var(--gold)" : "var(--dark)" }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
      <div className="text-xs uppercase tracking-widest text-hmuted mb-3">{title}</div>
      {children}
    </div>
  );
}
