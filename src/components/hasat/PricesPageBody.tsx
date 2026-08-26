import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  usePriceHistorySummary,
  useCropsWithPriceData,
  usePriceAlerts,
  useCreatePriceAlert,
  useTogglePriceAlert,
  useFarmerListings,
  useBuyerOrders,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatCrop, priceWithUnit } from "@/lib/hasat/format";
import { Info, Search, Star } from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Role = "farmer" | "buyer";

const TIER1_LIMIT = 4;

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
  const [allOpen, setAllOpen] = useState<string | undefined>(undefined);

  const watched = useMemo(() => {
    const active = alerts.filter((a) => a.active).map((a) => a.crop);
    const inactive = alerts.filter((a) => !a.active).map((a) => a.crop);
    return dedupeByLower([...active, ...inactive]);
  }, [alerts]);

  const filterNeedle = (list: string[]) => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return list;
    return list.filter(
      (c) =>
        formatCrop(c).toLocaleLowerCase("tr-TR").includes(needle) ||
        c.toLowerCase().includes(needle),
    );
  };

  const tier1All = filterNeedle(dedupeByLower(ownCrops));
  const searching = q.trim().length > 0;
  const tier1 = searching ? tier1All : tier1All.slice(0, TIER1_LIMIT);
  const tier1Hidden = searching ? 0 : Math.max(0, tier1All.length - TIER1_LIMIT);
  const usedLower = new Set(tier1All.map((c) => c.toLowerCase()));
  const tier2 = filterNeedle(subtractLower(watched, usedLower));
  tier2.forEach((c) => usedLower.add(c.toLowerCase()));
  const tier3 = filterNeedle(subtractLower(allCrops, usedLower));

  useEffect(() => {
    if (searching) setAllOpen("all");
  }, [searching]);

  const totalMatches = tier1.length + tier2.length + tier3.length;

  return (
    <div className="space-y-5 px-4 py-5 pb-32 md:px-8 md:pb-5">
      <div className="flex gap-3 rounded-2xl border border-teal/20 bg-teal/10 p-4 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Fiyatlar, platformda tamamlanan siparişlerden anonim olarak üretilir. Rekabet hukuku
          gereği bireysel kayıtlar gösterilmez; yalnızca ortalama ve piyasa aralığı yer alır. En az
          5 farklı üreticiden veri gelmediği ürünler için Hasat değerlendirmesi yapılmaz. Resmi
          kaynak (Hal Kayıt Sistemi) ve toptancı hali verileri, mevcut olduğunda ayrı satırlarda
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
            className="min-h-[48px] w-full rounded-xl border bg-card py-3 pl-9 pr-3 text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      )}

      {isLoading ? (
        <div className="py-12">
          <LoadingDots />
        </div>
      ) : allCrops.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card py-12 text-center">
          <Info className="mx-auto mb-3 h-9 w-9 text-primary" />
          <div className="mb-1 font-medium">Henüz fiyat verisi yok</div>
          <div className="text-xs text-hmuted">
            Platformda aktif ürün ve tamamlanmış sipariş biriktikçe piyasa aralıkları burada
            görünecek.
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
              {tier1Hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setAllOpen("all")}
                  className="min-h-[44px] text-[11px] text-primary underline underline-offset-2"
                >
                  +{tier1Hidden} tane daha — Tüm Piyasa'da gör
                </button>
              )}
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
            <Accordion
              type="single"
              collapsible
              value={allOpen}
              onValueChange={(v) => setAllOpen(v || undefined)}
            >
              <AccordionItem value="all" className="rounded-2xl border bg-card px-4">
                <AccordionTrigger className="min-h-[48px] text-sm font-medium hover:no-underline">
                  Tüm Piyasa{" "}
                  <span className="ml-2 text-[11px] font-normal text-hmuted">({tier3.length})</span>
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
          color: active ? "var(--primary)" : "var(--hmuted)",
          fill: active ? "var(--primary)" : "transparent",
        }}
      />
    </button>
  );
}

type SourceChip = { label: string; price: string | null; muted?: boolean };

function PriceSummaryCard({ crop, role }: { crop: string; role: Role }) {
  const { data: summary, isLoading } = usePriceHistorySummary(crop);

  const to = role === "farmer" ? "/farmer/prices/$crop" : "/buyer/prices/$crop";
  const params = { crop: encodeURIComponent(crop) };

  const chips: SourceChip[] = [];
  if (summary) {
    const unit = summary.unit;
    const h = summary.hasat;
    if (h && !h.insufficientData && h.avgPrice != null) {
      chips.push({ label: "Hasat", price: priceWithUnit(h.avgPrice, unit) });
    } else {
      chips.push({ label: "Hasat", price: "yetersiz veri", muted: true });
    }
    if (summary.official && summary.official.avgPrice != null) {
      chips.push({
        label: summary.official.officialSourceName || "Resmi",
        price: priceWithUnit(summary.official.avgPrice, unit),
      });
    }
    for (const s of summary.marketSources ?? []) {
      if (s.avgPrice != null) {
        chips.push({ label: s.displayName, price: priceWithUnit(s.avgPrice, unit) });
      }
    }
  }

  const hasAnyPrice = chips.some((c) => !c.muted);

  return (
    <Link
      to={to}
      params={params}
      className="block min-h-[48px] rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="break-words font-medium">{formatCrop(crop)}</div>
          {isLoading ? (
            <div className="mt-1.5 text-[11px] text-hmuted">Yükleniyor…</div>
          ) : chips.length === 0 || !summary ? (
            <div className="mt-1.5 text-[11px] text-hmuted">Fiyat verisi yok</div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {!hasAnyPrice && chips.length === 1 && chips[0].muted ? (
                <span className="rounded-full border border-dashed px-2 py-1 text-[11px] text-hmuted">
                  {chips[0].label}: {chips[0].price}
                </span>
              ) : (
                chips.map((c, i) => (
                  <span
                    key={`${c.label}-${i}`}
                    className={
                      c.muted
                        ? "inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-1 text-[11px] text-hmuted"
                        : "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]"
                    }
                  >
                    <span className="text-hmuted">{c.label}</span>
                    <span className={c.muted ? "" : "font-mono font-medium"}>{c.price}</span>
                  </span>
                ))
              )}
            </div>
          )}
        </div>
        <WatchStar crop={crop} />
      </div>
    </Link>
  );
}
