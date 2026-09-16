import { useEffect, useMemo, useState } from "react";
import {
  usePriceBoard,
  usePriceAlerts,
  useFarmerListings,
  useBuyerOrders,
  type PriceBoardRow,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { PriceBoard, type BoardRole } from "@/components/hasat/PriceBoard";
import { Info, Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const RANGES = [
  { key: "7", label: "7 Gün" },
  { key: "30", label: "30 Gün" },
  { key: "90", label: "90 Gün" },
] as const;

const RANGE_STORAGE_KEY = "hasat.prices.range";

function useOwnCrops(role: BoardRole): Set<string> {
  const isFarmer = role === "farmer";
  const isBuyer = role === "buyer";
  const { data: listings = [] } = useFarmerListings();
  const { data: orders = [] } = useBuyerOrders();
  return useMemo(() => {
    const set = new Set<string>();
    if (isFarmer) {
      for (const l of listings) if (l?.crop) set.add(String(l.crop).toLowerCase());
    }
    if (isBuyer) {
      for (const o of orders.slice(0, 20)) if (o?.crop) set.add(String(o.crop).toLowerCase());
    }
    return set;
  }, [isFarmer, isBuyer, listings, orders]);
}

export function PricesPageBody({ role }: { role: BoardRole }) {
  const [range, setRange] = useState<string>("30");
  const [q, setQ] = useState("");
  const [allOpen, setAllOpen] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RANGE_STORAGE_KEY);
      if (saved && RANGES.some((r) => r.key === saved)) setRange(saved);
    } catch {
      /* storage yoksa varsayılan 30 gün */
    }
  }, []);

  const onRangeChange = (v: string) => {
    if (!v) return;
    setRange(v);
    try {
      window.localStorage.setItem(RANGE_STORAGE_KEY, v);
    } catch {
      /* yoksay */
    }
  };

  const { data: board = [], isLoading } = usePriceBoard(Number(range));
  const { data: alerts = [] } = usePriceAlerts();
  const ownCrops = useOwnCrops(role);

  const watched = useMemo(
    () => new Set(alerts.map((a) => a.crop.toLowerCase())),
    [alerts],
  );

  const matches = (r: PriceBoardRow) => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return (
      r.displayName.toLocaleLowerCase("tr-TR").includes(needle) ||
      r.crop.toLocaleLowerCase("tr-TR").includes(needle)
    );
  };

  const searching = q.trim().length > 0;

  const { tier1, tier2, tier3 } = useMemo(() => {
    const t1: PriceBoardRow[] = [];
    const t2: PriceBoardRow[] = [];
    const t3: PriceBoardRow[] = [];
    for (const r of board) {
      const key = r.crop.toLowerCase();
      if (ownCrops.has(key)) t1.push(r);
      else if (watched.has(key)) t2.push(r);
      else if (r.hasAnyData) t3.push(r);
    }
    return { tier1: t1, tier2: t2, tier3: t3 };
  }, [board, ownCrops, watched]);

  const f1 = tier1.filter(matches);
  const f2 = tier2.filter(matches);
  const f3 = tier3.filter(matches);
  const totalMatches = f1.length + f2.length + f3.length;

  useEffect(() => {
    if (searching) setAllOpen("all");
  }, [searching]);

  const empty = board.every((r) => !r.hasAnyData) && tier1.length === 0;

  return (
    <div className="space-y-4 px-4 py-4 pb-32 md:px-8 md:pb-5">
      <Accordion type="single" collapsible>
        <AccordionItem value="info" className="rounded-2xl border border-teal/20 bg-teal/10 px-4">
          <AccordionTrigger className="min-h-[44px] py-2 text-left text-[11px] text-muted-foreground hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Fiyatlar nasıl hesaplanıyor?
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-3 text-xs text-muted-foreground">
            Hasat sütunu, platformda tamamlanan siparişlerden anonim olarak üretilir. Rekabet
            hukuku gereği bireysel kayıtlar gösterilmez; en az 5 farklı üreticiden veri gelmeyen
            ürünlerde sayı yerine "yetersiz veri" yazar. Toptancı hali ve resmi kaynak fiyatları
            ayrı sütunlarda gösterilir, topluluk verisiyle birleştirilmez. Yüzde değişim, seçilen
            aralığın bir önceki eş dönemine göre hesaplanır.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={range} onValueChange={onRangeChange} className="sm:w-auto">
          <TabsList className="w-full sm:w-auto">
            {RANGES.map((r) => (
              <TabsTrigger key={r.key} value={r.key} className="min-h-[40px] flex-1 text-xs">
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hmuted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ürün ara…"
            className="min-h-[44px] w-full rounded-xl border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12">
          <LoadingDots />
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed bg-card py-12 text-center">
          <Info className="mx-auto mb-3 h-9 w-9 text-primary" />
          <div className="mb-1 font-medium">Henüz fiyat verisi yok</div>
          <div className="text-xs text-hmuted">
            Platformda tamamlanan sipariş ve hal verisi biriktikçe fiyatlar burada görünecek.
          </div>
        </div>
      ) : searching && totalMatches === 0 ? (
        <div className="rounded-2xl border border-dashed py-8 text-center text-xs text-hmuted">
          "{q}" için sonuç yok.
        </div>
      ) : (
        <div className="space-y-4">
          {f1.length > 0 && (
            <section className="space-y-1">
              <h3 className="sticky top-0 z-20 bg-background/95 py-1 text-[11px] font-semibold uppercase tracking-wide text-hmuted backdrop-blur">
                {role === "farmer" ? "Ürünlerin" : "İlgilendiğin Ürünler"}
              </h3>
              <PriceBoard rows={f1} role={role} />
            </section>
          )}

          {f2.length > 0 && (
            <section className="space-y-1">
              <h3 className="sticky top-0 z-20 bg-background/95 py-1 text-[11px] font-semibold uppercase tracking-wide text-hmuted backdrop-blur">
                Favoriler
              </h3>
              <PriceBoard rows={f2} role={role} />
            </section>
          )}

          {f3.length > 0 && (
            <Accordion
              type="single"
              collapsible
              value={allOpen}
              onValueChange={(v) => setAllOpen(v || undefined)}
            >
              <AccordionItem value="all" className="border-t border-border/70">
                <AccordionTrigger className="min-h-[48px] text-sm font-medium hover:no-underline">
                  Tüm Piyasa{" "}
                  <span className="ml-2 text-[11px] font-normal text-hmuted">({f3.length})</span>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-3">
                  <PriceBoard rows={f3} role={role} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <p className="text-[10px] text-hmuted">
            Yüzde değişim, seçilen dönemin bir önceki eş dönemine göre hesaplanır.
          </p>
        </div>

      )}
    </div>
  );
}
