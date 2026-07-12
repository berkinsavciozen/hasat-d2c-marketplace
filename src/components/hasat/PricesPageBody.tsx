import { usePriceHistorySummary, useCropsWithPriceData } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Info } from "lucide-react";

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
      ) : (
        crops.map((c) => <PriceSummaryCard key={c} crop={c} />)
      )}
    </div>
  );
}

function PriceSummaryCard({ crop }: { crop: string }) {
  const { data: summary, isLoading } = usePriceHistorySummary(crop);
  const hasat = summary?.hasat;
  const official = summary?.official ?? null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="font-medium">{formatCrop(crop)}</div>
      {isLoading ? (
        <div className="mt-2 text-xs text-hmuted">Yükleniyor…</div>
      ) : (
        <>
          <div className="mt-2">
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
                  <div className="mt-0.5 text-xs text-hmuted">
                    Piyasa aralığı:{" "}
                    <span className="font-mono">
                      {formatTRY(Math.max(0, hasat.avgPrice - hasat.stddevPrice))}
                    </span>
                    {" – "}
                    <span className="font-mono">
                      {formatTRY(hasat.avgPrice + hasat.stddevPrice)}
                    </span>
                  </div>
                )}
                <div className="mt-1 text-[11px] text-hmuted">
                  {hasat.distinctFarmerCount} üretici · {timeAgo(summary?.lastUpdated ?? null)}
                </div>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
