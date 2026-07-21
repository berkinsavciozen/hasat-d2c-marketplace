import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  usePriceHistorySummary,
  useCropsWithPriceData,
  usePriceHistorySeries,
  usePriceAlerts,
  useCreatePriceAlert,
  useTogglePriceAlert,
  useFarmerListings,
  useBuyerOrders,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Sparkline } from "@/components/hasat/Sparkline";
import { Info, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type Role = "farmer" | "buyer";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

function useOwnCrops(role: Role): string[] {
  const isFarmer = role === "farmer";
  const isBuyer = role === "buyer";
  const { data: listings = [] } = useFarmerListings();
  const { data: orders = [] } = useBuyerOrders();
  return useMemo(() => {
    const set = new Set<string>();
    if (isFarmer) {
      for (const l of listings) if (l?.crop) set.add(String(l.crop));
    }
    if (isBuyer) {
      for (const o of orders.slice(0, 20)) if (o?.crop) set.add(String(o.crop));
    }
    return Array.from(set);
  }, [isFarmer, isBuyer, listings, orders]);
}

function dedupeByLower(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function subtractLower(all: string[], remove: Set<string>): string[] {
  return all.filter((c) => !remove.has(c.toLowerCase()));
}

export function PricesPageBody({ role }: { role: Role }) {
  const { data: allCrops = [], isLoading } = useCropsWithPriceData();
  const { data: alerts = [] } = usePriceAlerts();
  const ownCrops = useOwnCrops(role);
  const [q, setQ] = useState("");

  const watched = useMemo(() => {
    const active = alerts.filter((a) => a.active).map((a) => a.crop);
    const inactive = alerts.filter((a) => !a.active).map((a) => a.crop);
    return dedupeByLower([...active, ...inactive]);
  }, [alerts]);

  const filterNeedle = (list: string[]) => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return list;
    return list.filter(
      (c) => formatCrop(c).toLocaleLowerCase("tr-TR").includes(needle) || c.toLowerCase().includes(needle),
    );
  };

  const tier1 = filterNeedle(dedupeByLower(ownCrops));
  const usedLower = new Set(tier1.map((c) => c.toLowerCase()));
  const tier2 = filterNeedle(subtractLower(watched, usedLower));
  tier2.forEach((c) => usedLower.add(c.toLowerCase()));
  const tier3 = filterNeedle(subtractLower(allCrops, usedLower));

  const searching = q.trim().length > 0;
  const totalMatches = tier1.length + tier2.length + tier3.length;

  return (
    <div className="px-4 md:px-8 py-5 pb-32 md:pb-5 space-y-4">
      <div className="rounded-xl border bg-muted/40 p-3 text-[11px] text-hmuted flex gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Fiyatlar, platformda tamamlanan siparişlerden anonim olarak üretilir.
          Rekabet hukuku gereği bireysel kayıtlar gösterilmez; yalnızca ortalama
          ve piyasa aralığı yer alır. En az 5 farklı üreticiden veri gelmediği
          ürünler için Hasat değerlendirmesi yapılmaz. Resmi kaynak (Hal Kayıt
          Sistemi) ve toptancı hali verileri, mevcut olduğunda ayrı satırlarda
          gösterilir ve topluluk verisiyle karıştırılmaz.
        </div>
      </div>

      {allCrops.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-hmuted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ürün ara…"
            className="w-full rounded-xl border bg-card pl-9 pr-3 py-3 min-h-[48px] text-sm outline-none focus:border-saffron"
          />
        </div>
      )}

      {isLoading ? (
        <div className="py-12"><LoadingDots /></div>
      ) : allCrops.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center">
          <div className="mb-3 text-5xl">📊</div>
          <div className="mb-1 font-medium">Henüz fiyat verisi yok</div>
          <div className="text-xs text-hmuted">
            Platformda aktif ürün ve tamamlanmış sipariş biriktikçe piyasa aralıkları burada görünecek.
          </div>
        </div>
      ) : searching && totalMatches === 0 ? (
        <div className="rounded-2xl border border-dashed py-8 text-center text-xs text-hmuted">
          "{q}" için sonuç yok.
        </div>
      ) : (
        <>
          {tier1.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-hmuted">
                {role === "farmer" ? "Ürünlerin" : "İlgilendiğin Ürünler"}
              </h3>
              <div className="space-y-2">
                {tier1.map((c) => (
                  <PriceSummaryCard key={c} crop={c} role={role} />
                ))}
              </div>
            </section>
          )}

          {tier2.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-hmuted">
                İzleme Listesi
              </h3>
              <div className="space-y-2">
                {tier2.map((c) => (
                  <PriceSummaryCard key={c} crop={c} role={role} />
                ))}
              </div>
            </section>
          )}

          {tier3.length > 0 && (
            <Accordion type="single" collapsible defaultValue={searching ? "all" : undefined}>
              <AccordionItem value="all" className="rounded-2xl border bg-card px-4">
                <AccordionTrigger className="min-h-[48px] text-sm font-medium hover:no-underline">
                  Tüm Piyasa <span className="ml-2 text-[11px] font-normal text-hmuted">({tier3.length})</span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="space-y-2 pt-1">
                    {tier3.map((c) => (
                      <PriceSummaryCard key={c} crop={c} role={role} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}

function WatchStar({ crop }: { crop: string }) {
  const { data: alerts = [] } = usePriceAlerts();
  const createAlert = useCreatePriceAlert();
  const toggleAlert = useTogglePriceAlert();
  const existing = alerts.find((a) => a.crop.toLowerCase() === crop.toLowerCase());
  const active = !!existing?.active;
  const busy = createAlert.isPending || toggleAlert.isPending;

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!existing) {
        await createAlert.mutateAsync({
          crop,
          target: 0,
          condition: "above",
          channels: { whatsapp: false, push: true, sms: false },
        });
        toast.success("İzleme listesine eklendi");
      } else {
        await toggleAlert.mutateAsync({ id: existing.id, active: !active });
        toast.success(active ? "İzleme durduruldu" : "İzleme yeniden başlatıldı");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "İşlem başarısız");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={active ? "İzlemeyi kaldır" : "İzlemeye ekle"}
      className="grid h-12 w-12 place-items-center rounded-full hover:bg-muted disabled:opacity-50"
    >
      <Star
        className="h-5 w-5"
        style={{
          color: active ? "var(--saffron)" : "var(--hmuted)",
          fill: active ? "var(--saffron)" : "transparent",
        }}
      />
    </button>
  );
}

function DistinctFarmerDots({ count }: { count: number }) {
  const dots = Math.min(5, count);
  return (
    <div className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: i < dots ? "var(--sage)" : "color-mix(in oklab, var(--hmuted) 25%, transparent)" }}
        />
      ))}
      <span className="text-[10px] text-hmuted ml-1">{count} üretici</span>
    </div>
  );
}

function PriceSummaryCard({ crop, role }: { crop: string; role: Role }) {
  const { data: summary, isLoading } = usePriceHistorySummary(crop);
  const { data: series } = usePriceHistorySeries(crop);
  const hasat = summary?.hasat;
  const hasatSeries = series?.hasat ?? [];
  const extraSourceCount = (summary?.marketSources?.length ?? 0) + (summary?.official ? 1 : 0);

  const to = role === "farmer" ? "/farmer/prices/$crop" : "/buyer/prices/$crop";
  const params = { crop: encodeURIComponent(crop) };

  return (
    <Link
      to={to}
      params={params}
      className="block rounded-2xl border bg-card p-4 min-h-[48px] transition hover:border-saffron/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{formatCrop(crop)}</div>
          {extraSourceCount > 0 && (
            <div className="mt-0.5 text-[10px] text-hmuted">+{extraSourceCount} kaynak</div>
          )}
        </div>
        <WatchStar crop={crop} />
      </div>
      {isLoading ? (
        <div className="mt-2 text-xs text-hmuted">Yükleniyor…</div>
      ) : (
        <div className="mt-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-hmuted">
            Hasat topluluk verisi
          </div>
          {!hasat || hasat.insufficientData || hasat.avgPrice == null ? (
            <div className="mt-1 text-xs text-hmuted">
              Yeterli veri yok (en az 5 farklı üreticiden veri gerekli).
            </div>
          ) : (
            <>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xs text-hmuted">Ortalama</span>
                <span className="font-mono text-lg font-semibold">{formatTRY(hasat.avgPrice)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <DistinctFarmerDots count={hasat.distinctFarmerCount} />
                <div className="text-[11px] text-hmuted">{timeAgo(summary?.lastUpdated ?? null)}</div>
              </div>
              {hasatSeries.length >= 2 && (
                <div className="mt-2">
                  <Sparkline data={hasatSeries.map((p) => p.avgPrice)} width={220} height={40} color="var(--saffron)" />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Link>
  );
}
