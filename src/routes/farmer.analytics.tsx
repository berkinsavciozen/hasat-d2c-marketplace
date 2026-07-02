import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { AIBox } from "@/components/hasat/AIBox";
import { useFarmerListings, useFarmerOrders } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";

export const Route = createFileRoute("/farmer/analytics")({
  head: () => ({ meta: [{ title: "Analitik | Hasat" }] }),
  component: Analytics,
});

function Analytics() {
  const { data: listings = [], isLoading: lLoading } = useFarmerListings();
  const { data: orders = [], isLoading: oLoading } = useFarmerOrders();
  const loading = lLoading || oLoading;

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);

  // top product by revenue
  const revenueByCrop = new Map<string, number>();
  for (const o of orders) {
    revenueByCrop.set(o.crop, (revenueByCrop.get(o.crop) ?? 0) + (o.total ?? 0));
  }
  const top = [...revenueByCrop.entries()].sort((a, b) => b[1] - a[1])[0];

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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Toplam Sipariş" value={String(totalOrders)} />
              <StatCard label="Toplam Ciro" value={formatTRY(totalRevenue)} />
              <StatCard label="Aktif İlan" value={String(listings.filter((l) => l.status === "active").length)} />
            </div>

            {top ? (
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs text-hmuted mb-1">En Çok Ciro Getiren Ürün</div>
                <div className="flex items-baseline justify-between">
                  <div className="font-serif text-lg">{formatCrop(top[0])}</div>
                  <div className="font-mono text-saffron">{formatTRY(top[1])}</div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-hmuted">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  );
}
