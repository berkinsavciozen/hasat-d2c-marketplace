import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { useBuyerAnalytics, type BuyerAnalyticsRow } from "@/lib/hasat/queries";

export const Route = createFileRoute("/buyer/reports")({
  head: () => ({ meta: [{ title: "Raporlar — Hasat" }] }),
  component: Reports,
});

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function rowTotal(r: BuyerAnalyticsRow): number {
  const q = Number(r.offer?.quantity ?? 0);
  const p = Number(r.offer?.price_per_unit ?? 0);
  return q * p;
}

function Reports() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useBuyerAnalytics();

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + rowTotal(r), 0);
    const cropTotals = new Map<string, number>();
    for (const r of rows) {
      const crop = r.offer?.listing?.crop ?? "—";
      cropTotals.set(crop, (cropTotals.get(crop) ?? 0) + rowTotal(r));
    }
    let topCrop = "—";
    let topVal = 0;
    for (const [c, v] of cropTotals) {
      if (v > topVal) {
        topVal = v;
        topCrop = c;
      }
    }
    return { total, count: rows.length, topCrop };
  }, [rows]);

  const monthly = useMemo(() => {
    // last 6 months including current, oldest -> newest
    const now = new Date();
    const buckets: { key: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: TR_MONTHS[d.getMonth()], total: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const r of rows) {
      const k = (r.created_at ?? "").slice(0, 7);
      const i = idx.get(k);
      if (i != null) buckets[i].total += rowTotal(r);
    }
    const max = Math.max(1, ...buckets.map((b) => b.total));
    return { buckets, max };
  }, [rows]);

  return (
    <>
      <BuyerHeader title="Raporlar" />
      <div className="p-4 md:p-8 max-w-3xl space-y-5">
        {isLoading ? (
          <LoadingDots />
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            Henüz tamamlanmış siparişiniz yok.
          </div>
        ) : (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-3 gap-2">
              <div
                className="rounded-2xl border p-4"
                style={{ background: "var(--cream)", borderColor: "var(--border)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-hmuted">Toplam Harcama</div>
                <div className="mt-1 font-mono text-lg" style={{ color: "var(--gold)" }}>
                  {formatTRY(stats.total)}
                </div>
              </div>
              <div
                className="rounded-2xl border p-4"
                style={{ background: "var(--cream)", borderColor: "var(--border)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-hmuted">Sipariş</div>
                <div className="mt-1 font-mono text-lg text-dark">{stats.count}</div>
              </div>
              <div
                className="rounded-2xl border p-4"
                style={{ background: "var(--cream)", borderColor: "var(--border)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-hmuted">En Çok</div>
                <span
                  className="mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ background: "var(--saffron)", color: "#fff" }}
                >
                  {stats.topCrop}
                </span>
              </div>
            </div>

            {/* Monthly bar chart */}
            <div
              className="rounded-2xl border p-4"
              style={{ background: "var(--cream)", borderColor: "var(--border)" }}
            >
              <div className="text-xs text-hmuted mb-3">Son 6 Ay</div>
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
            </div>

            {/* Order list */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-widest text-hmuted">Siparişler</div>
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate({ to: "/buyer/orders/$orderId", params: { orderId: r.id } })}
                  className="w-full text-left rounded-2xl border p-4 hover:border-saffron transition"
                  style={{ background: "var(--cream)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-xs text-hmuted">{r.order_ref}</div>
                      <div className="font-medium mt-1 text-dark">{r.offer?.listing?.crop ?? "—"}</div>
                    </div>
                    <span className="font-mono text-sm" style={{ color: "var(--gold)" }}>
                      {formatTRY(rowTotal(r))}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-hmuted">
                    {r.offer?.quantity ?? 0} {r.offer?.listing?.unit ?? ""} · {new Date(r.created_at).toLocaleDateString("tr-TR")}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
