import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/hasat/common/SectionCard";
import { PriceChart } from "@/components/hasat/PriceChart";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import {
  usePriceHistorySummary,
  usePriceHistorySeries,
  usePriceAlerts,
  useCreatePriceAlert,
  useTogglePriceAlert,
} from "@/lib/hasat/queries";
import { formatCrop, formatTRY } from "@/lib/hasat/format";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const RANGES = [
  { key: "3m", label: "Son 3 Ay", weeks: 13 },
  { key: "6m", label: "Son 6 Ay", weeks: 26 },
  { key: "1y", label: "Son 1 Yıl", weeks: 52 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function BigWatchStar({ crop }: { crop: string }) {
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
      className="grid h-12 w-12 place-items-center rounded-full border hover:bg-muted disabled:opacity-50"
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

export function CropDetailBody({ crop }: { crop: string }) {
  const [range, setRange] = useState<RangeKey>("3m");
  const weeks = useMemo(() => RANGES.find((r) => r.key === range)?.weeks ?? 13, [range]);

  const { data: summary, isLoading: sumLoading } = usePriceHistorySummary(crop);
  const { data: series, isLoading: seriesLoading } = usePriceHistorySeries(crop, weeks);

  const hasat = summary?.hasat;
  const hasatSeries = series?.hasat ?? [];
  const official = summary?.official ?? null;
  const officialSeries = series?.official ?? null;
  const marketSummaries = summary?.marketSources ?? [];
  const marketSeries = series?.marketSources ?? [];

  const hasatHasSomething = hasat && !hasat.insufficientData && hasat.avgPrice != null;
  const officialHasSomething = !!official;
  const marketsToShow = marketSummaries.filter((s) => {
    const ser = marketSeries.find((x) => x.sourceCode === s.sourceCode)?.series ?? [];
    return s.avgPrice != null || ser.length >= 2;
  });

  const anything = hasatHasSomething || officialHasSomething || marketsToShow.length > 0;
  const anyLoading = sumLoading || seriesLoading;

  return (
    <div className="px-4 md:px-8 py-5 pb-32 md:pb-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl md:text-3xl truncate">{formatCrop(crop)}</h1>
          <p className="mt-0.5 text-xs text-hmuted">Haftalık ortalama fiyat serileri</p>
        </div>
        <BigWatchStar crop={crop} />
      </div>

      <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
        <TabsList className="w-full">
          {RANGES.map((r) => (
            <TabsTrigger key={r.key} value={r.key} className="flex-1 min-h-[48px]">
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {anyLoading ? (
        <div className="py-12"><LoadingDots /></div>
      ) : !anything ? (
        <div className="rounded-2xl border border-dashed py-12 text-center">
          <div className="mb-3 text-5xl">📊</div>
          <div className="mb-1 font-medium">Bu ürün için henüz yeterli fiyat verisi yok</div>
          <div className="text-xs text-hmuted">
            Platformda sipariş ve resmi kaynak verisi biriktikçe grafikler burada görünecek.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {hasatHasSomething && (
            <SectionCard title="Hasat Topluluk Fiyatı">
              <div className="flex flex-wrap items-baseline gap-3">
                <div>
                  <div className="text-[10px] text-hmuted">Ortalama</div>
                  <div className="font-mono text-xl font-semibold">{formatTRY(hasat!.avgPrice!)}</div>
                </div>
                {hasat!.stddevPrice != null && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: "color-mix(in oklab, var(--gold) 15%, transparent)", color: "var(--gold)" }}
                  >
                    Aralık: {formatTRY(Math.max(0, hasat!.avgPrice! - hasat!.stddevPrice))} – {formatTRY(hasat!.avgPrice! + hasat!.stddevPrice)}
                  </span>
                )}
                <span className="text-[11px] text-hmuted">{hasat!.distinctFarmerCount} üretici</span>
              </div>
              {hasatSeries.length >= 2 && (
                <div className="mt-3">
                  <PriceChart data={hasatSeries} color="var(--saffron)" />
                </div>
              )}
            </SectionCard>
          )}

          {official && (
            <SectionCard title={`Resmi Hal Fiyatı — ${official.officialSourceName}`}>
              <div className="flex flex-wrap items-baseline gap-3">
                <div>
                  <div className="text-[10px] text-hmuted">Ortalama</div>
                  <div className="font-mono text-xl font-semibold">{formatTRY(official.avgPrice)}</div>
                </div>
              </div>
              {officialSeries && officialSeries.length >= 2 && (
                <div className="mt-3">
                  <PriceChart data={officialSeries} color="var(--gold)" />
                </div>
              )}
            </SectionCard>
          )}

          {marketsToShow.map((src) => {
            const ser = marketSeries.find((x) => x.sourceCode === src.sourceCode)?.series ?? [];
            const title = src.region ? `${src.displayName} — ${src.region}` : src.displayName;
            return (
              <SectionCard key={src.sourceCode} title={title}>
                {src.avgPrice != null && (
                  <div className="flex flex-wrap items-baseline gap-3">
                    <div>
                      <div className="text-[10px] text-hmuted">Ortalama</div>
                      <div className="font-mono text-xl font-semibold">{formatTRY(src.avgPrice)}</div>
                    </div>
                  </div>
                )}
                {ser.length >= 2 && (
                  <div className="mt-3">
                    <PriceChart data={ser} color="var(--sage)" />
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
