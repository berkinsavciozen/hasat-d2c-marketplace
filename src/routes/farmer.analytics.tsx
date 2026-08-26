import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { FarmerHeader } from "./farmer";
import { AIBox } from "@/components/hasat/AIBox";
import { useFarmerListings, useFarmerOrders } from "@/lib/hasat/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, BarChart3, PackageCheck } from "lucide-react";
import { formatTRY, formatCrop } from "@/lib/hasat/format";

export const Route = createFileRoute("/farmer/analytics")({
  head: () => ({ meta: [{ title: "Analitik | Hasat" }] }),
  component: Analytics,
});

const TR_MONTHS = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

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
    const arr = [...rev.entries()]
      .map(([crop, total]) => ({ crop, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
    const max = Math.max(1, ...arr.map((r) => r.total));
    return { arr, max };
  }, [orders]);

  const empty = !loading && listings.length === 0 && orders.length === 0;

  return (
    <>
      <FarmerHeader title="Analitik" subtitle="Performansını takip et" />
      <div className="space-y-6 p-4 pb-32 md:p-8">
        {loading ? (
          <div className="space-y-4" aria-label="Analitik yükleniyor">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-24 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        ) : empty ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <BarChart3 className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-3 text-base font-semibold">Henüz analiz verisi yok</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Hasat kayıtları ve siparişler eklendikçe yönetim özetin burada oluşacak.
            </p>
          </div>
        ) : (
          <>
            <section aria-labelledby="summary-heading" className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Güncel özet
                </p>
                <h2 id="summary-heading" className="mt-1 text-xl font-semibold">
                  İşletmenin bugünkü görünümü
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Toplam Sipariş" value={String(totalOrders)} />
                <StatCard label="Toplam Ciro" value={formatTRY(totalRevenue)} primary />
                <StatCard label="Aktif Alıcı" value={String(uniqueBuyers)} />
                <StatCard
                  label="Aktif İlan"
                  value={String(listings.filter((l) => l.status === "active").length)}
                />
              </div>
            </section>

            <SectionCard title="Gelir" description="Son 6 ayın tamamlanan sipariş cirosu">
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowUpRight className="h-4 w-4 text-teal" />
                <span>Toplam gelir</span>
                <strong className="font-mono text-foreground">{formatTRY(totalRevenue)}</strong>
              </div>
              <div className="flex h-36 items-end gap-2" aria-label="Son 6 ay ciro grafiği">
                {monthly.buckets.map((b) => {
                  const pct = (b.total / monthly.max) * 100;
                  return (
                    <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t-md bg-teal/20 motion-safe:transition-[height]"
                          style={{
                            height: `${Math.max(pct, 3)}%`,
                            backgroundColor: b.total > 0 ? "var(--teal)" : undefined,
                          }}
                          title={`${b.label}: ${formatTRY(b.total)}`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{b.label}</span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {cropBreakdown.arr.length > 0 && (
              <SectionCard title="Üretim" description="Ürüne göre ciro katkısı">
                <div className="space-y-4">
                  {cropBreakdown.arr.map((r) => {
                    const pct = (r.total / cropBreakdown.max) * 100;
                    return (
                      <div key={r.crop}>
                        <div className="flex items-baseline justify-between gap-4 text-sm">
                          <span className="min-w-0 truncate">{formatCrop(r.crop)}</span>
                          <span className="shrink-0 font-mono font-semibold text-primary">
                            {formatTRY(r.total)}
                          </span>
                        </div>
                        <div
                          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label={`${formatCrop(r.crop)} ciro payı`}
                          aria-valuenow={Math.round(pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full rounded-full bg-teal"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            <SectionCard
              title="Güven göstergeleri"
              description="Mevcut satış hareketlerinden oluşur"
            >
              <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
                <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{totalOrders} sipariş</strong> ve{" "}
                  <strong className="text-foreground">{uniqueBuyers} alıcı</strong> mevcut
                  performans özetine dahil edildi.
                </p>
              </div>
            </SectionCard>

            <section aria-label="Analitik içgörüleri">
              <AIBox page="analytics" />
            </section>
          </>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-2 font-mono text-xl font-semibold sm:text-2xl ${primary ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
