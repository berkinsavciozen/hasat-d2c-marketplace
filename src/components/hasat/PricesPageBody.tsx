import { useMemo, useState } from "react";
import { usePriceHistorySummary, useCropsWithPriceData, usePriceHistorySeries, usePriceAlerts, useCreatePriceAlert, useTogglePriceAlert } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Sparkline } from "@/components/hasat/Sparkline";
import { Info, Search, Star } from "lucide-react";
import { toast } from "sonner";

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

export function PricesPageBody() {
  const { data: crops = [], isLoading } = useCropsWithPriceData();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return crops;
    return crops.filter((c) => formatCrop(c).toLocaleLowerCase("tr-TR").includes(needle) || c.toLowerCase().includes(needle));
  }, [crops, q]);

  return (
    <div className="px-4 md:px-8 py-5 pb-32 md:pb-5 space-y-3">
      <div className="rounded-xl border bg-muted/40 p-3 text-[11px] text-hmuted flex gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Fiyatlar, platformda tamamlanan siparişlerden anonim olarak üretilir.
          Rekabet hukuku gereği bireysel kayıtlar gösterilmez; yalnızca ortalama
          ve piyasa aralığı yer alır. En az 5 farklı üreticiden veri gelmediği
          ürünler için Hasat değerlendirmesi yapılmaz. Resmi kaynak (Hal Kayıt
          Sistemi) verisi, mevcut olduğunda ayrı bir satırda gösterilir ve
          topluluk verisiyle karıştırılmaz.
        </div>
      </div>

      {crops.length > 0 && (
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
      ) : crops.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center">
          <div className="mb-3 text-5xl">📊</div>
          <div className="mb-1 font-medium">Henüz fiyat verisi yok</div>
          <div className="text-xs text-hmuted">
            Platformda aktif ürün ve tamamlanmış sipariş biriktikçe piyasa aralıkları burada görünecek.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-8 text-center text-xs text-hmuted">
          "{q}" için sonuç yok.
        </div>
      ) : (
        filtered.map((c) => <PriceSummaryCard key={c} crop={c} />)
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

  const onClick = async () => {
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
    } catch (e: any) {
      toast.error(e?.message ?? "İşlem başarısız");
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

function PriceSummaryCard({ crop }: { crop: string }) {
  const { data: summary, isLoading } = usePriceHistorySummary(crop);
  const { data: series } = usePriceHistorySeries(crop);
  const hasat = summary?.hasat;
  const official = summary?.official ?? null;
  const hasatSeries = series?.hasat ?? [];
  const officialSeries = series?.official ?? null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium">{formatCrop(crop)}</div>
        <WatchStar crop={crop} />
      </div>
      {isLoading ? (
        <div className="mt-2 text-xs text-hmuted">Yükleniyor…</div>
      ) : (
        <>
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
                  <span className="font-mono text-lg font-semibold">
                    {formatTRY(hasat.avgPrice)}
                  </span>
                </div>
                {hasat.stddevPrice != null && (
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: "color-mix(in oklab, var(--gold) 15%, transparent)", color: "var(--gold)" }}
                    >
                      Aralık: {formatTRY(Math.max(0, hasat.avgPrice - hasat.stddevPrice))} – {formatTRY(hasat.avgPrice + hasat.stddevPrice)}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <DistinctFarmerDots count={hasat.distinctFarmerCount} />
                  <div className="text-[11px] text-hmuted">{timeAgo(summary?.lastUpdated ?? null)}</div>
                </div>
                {hasatSeries.length >= 2 && (
                  <div className="mt-2">
                    <Sparkline data={hasatSeries.map((p) => p.avgPrice)} width={220} height={40} color="var(--saffron)" />
                    <div className="mt-1 text-[10px] text-hmuted">Son {hasatSeries.length} haftalık ortalama</div>
                  </div>
                )}
              </>
            )}
          </div>

          {official && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-amber-900 dark:text-amber-200">
                🏛️ Resmi Hal Fiyatı — Kaynak: {official.officialSourceName}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xs text-hmuted">Ortalama</span>
                <span className="font-mono text-lg font-semibold">
                  {formatTRY(official.avgPrice)}
                </span>
              </div>
              {officialSeries && officialSeries.length >= 2 && (
                <div className="mt-2">
                  <Sparkline data={officialSeries.map((p) => p.avgPrice)} width={220} height={40} color="var(--gold)" />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
