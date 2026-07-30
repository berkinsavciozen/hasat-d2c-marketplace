import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Search, X, MessageSquare, CalendarClock, Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { CoverageBadge } from "@/components/hasat/CoverageBadge";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import {
  useActiveListings,
  
  useBuyerOffers,
  useMySubscriptions,
  usePriceAlerts,
  useCreateCropRequest,
} from "@/lib/hasat/queries";
import { CATEGORY_GROUP_META, cropEmoji, findCropConfig, useCropConfigMap } from "@/lib/hasat/crop-config";
import { slugifyFarmer } from "@/lib/hasat/vitrin";
import { TR_PROVINCES } from "@/lib/hasat/cities";
import { convertQuantity } from "@/lib/core";




export const Route = createFileRoute("/buyer/discover")({
  head: () => ({ meta: [{ title: "Keşfet — Hasat" }] }),
  component: Discover,
});

const SORTS = ["Puan", "Fiyat", "Yakınlık", "En Yeni"];



function Discover() {
  const navigate = useNavigate();
  const { data: listings = [], isLoading } = useActiveListings();
  const { map: cropMap } = useCropConfigMap();
  const [sort, setSort] = useState("Puan");
  const [filters, setFilters] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);

  // "Senin İçin" — retention strip (client-side derived)
  const { data: buyerOffers = [] } = useBuyerOffers();
  const { data: subs = [] } = useMySubscriptions();
  const { data: alerts = [] } = usePriceAlerts();

  const pendingOfferCount = buyerOffers.filter(
    (o) => (o.status === "pending" || o.status === "counter") && o.ballSide === "buyer",
  ).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingSubs = subs
    .filter((s) => s.status === "active" && !!s.nextHarvestDate && new Date(s.nextHarvestDate) >= today)
    .sort((a, b) => new Date(a.nextHarvestDate!).getTime() - new Date(b.nextHarvestDate!).getTime());
  const nextSub = upcomingSubs[0] ?? null;
  const nextSubDate = nextSub?.nextHarvestDate
    ? new Date(nextSub.nextHarvestDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })
    : null;
  const nextSubFarmerName = (nextSub as unknown as { farmer?: { name?: string | null } } | null)?.farmer?.name ?? null;

  const activeAlertCount = alerts.filter((a) => a.active).length;

  const forYouCards: Array<{ key: string; icon: typeof MessageSquare; accent: string; label: string; value: string; to: string; params?: Record<string, string> }> = [];
  if (pendingOfferCount > 0) {
    forYouCards.push({
      key: "offers",
      icon: MessageSquare,
      accent: "var(--saffron)",
      label: "Bekleyen teklif",
      value: `${pendingOfferCount} teklif`,
      to: "/buyer/messages",
    });
  }
  if (nextSub && nextSubDate) {
    forYouCards.push({
      key: "sub",
      icon: CalendarClock,
      accent: "var(--gold)",
      label: "Bir sonraki teslimat",
      value: nextSubFarmerName ? `${nextSubDate} · ${nextSubFarmerName}` : nextSubDate,
      to: "/buyer/subscriptions",
    });
  }
  if (activeAlertCount > 0) {
    forYouCards.push({
      key: "alerts",
      icon: Bell,
      accent: "var(--saffron)",
      label: "Aktif fiyat alarmı",
      value: `${activeAlertCount} alarm`,
      to: "/buyer/reports",
    });
  }


  const dropFilter = (f: string) => setFilters((x) => x.filter((y) => y !== f));
  const filtered = listings.filter((l) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      l.crop.toLowerCase().includes(q) ||
      l.farmerName.toLowerCase().includes(q) ||
      l.farmerCity.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <BuyerHeader title="Keşfet">
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-hmuted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün, üretici veya bölge ara..."
            className="w-full rounded-full bg-white/10 pl-10 pr-3 py-2.5 text-sm placeholder:text-hwhite/40 outline-none focus:bg-white/15 min-h-[48px]" />
        </div>
        {filters.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto">
            {filters.map((f) => (
              <button key={f} onClick={() => dropFilter(f)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs min-h-[48px]">
                {f} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {SORTS.map((s) => (
            <button key={s} onClick={() => setSort(s)}
              className="shrink-0 rounded-full px-4 py-1 text-xs transition min-h-[48px]"
              style={{ background: sort === s ? "var(--gold)" : "rgba(255,255,255,0.1)", color: sort === s ? "var(--dark)" : "var(--hwhite)" }}>
              {s}
            </button>
          ))}
        </div>
      </BuyerHeader>

      <div className="p-4 md:p-8 space-y-6">
        {forYouCards.length > 0 && (
          <div>
            <h2 className="font-serif text-lg mb-3">Senin İçin</h2>
            <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto pb-1">
              {forYouCards.map((c) => (
                <Link
                  key={c.key}
                  to={c.to}
                  className="shrink-0 w-[200px] min-h-[48px] rounded-2xl border bg-card p-4 hover:border-saffron transition"
                  style={{ borderLeft: `3px solid ${c.accent}` }}
                >
                  <div className="flex items-center gap-2">
                    <c.icon className="h-4 w-4 shrink-0" style={{ color: c.accent }} />
                    <div className="text-xs text-hmuted truncate">{c.label}</div>
                  </div>
                  <div className="mt-1 font-mono text-base truncate" style={{ color: c.accent }}>
                    {c.value}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Link
          to="/tarifler"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:border-saffron transition"
        >
          <span className="text-2xl">🍽️</span>
          <div className="min-w-0">
            <div className="font-medium">Tarif fikri mi arıyorsun?</div>
            <div className="text-xs text-hmuted">Hasat'ın tariflerine göz at — her malzemenin Hasat'ta bulunup bulunmadığını gösterir.</div>
          </div>
        </Link>

        <div>

          <h2 className="font-serif text-lg mb-3">Kategoriler</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(() => {
              const buckets = new Map<string, { count: number; sampleCrop: string }>();
              for (const l of listings) {
                const cfg = findCropConfig(cropMap, l.crop);
                const group = cfg?.category_group ?? "diger";
                const cur = buckets.get(group) ?? { count: 0, sampleCrop: l.crop };
                cur.count += 1;
                buckets.set(group, cur);
              }
              const rows = Array.from(buckets.entries()).map(([group, v]) => {
                const meta = CATEGORY_GROUP_META[group];
                return {
                  key: group,
                  label: meta?.label ?? (group === "diger" ? "Diğer" : group),
                  emoji: meta?.emoji ?? "🌾",
                  count: v.count,
                  sampleCrop: v.sampleCrop,
                };
              });
              return rows.map((c) => (
                <button key={c.key} onClick={() => setQuery(c.sampleCrop)} className="rounded-2xl bg-card border p-4 text-left hover:border-saffron transition">
                  <div className="text-3xl mb-1">{c.emoji}</div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-hmuted">{c.count} ilan</div>
                </button>
              ));
            })()}
          </div>
        </div>

        <div>
          <h2 className="font-serif text-lg mb-1">Aktif İlanlar</h2>
          <div className="text-[11px] text-hmuted mb-3">İlanlar en yeni tarihe göre sıralanır. Ücretli öne çıkarma yoktur.</div>
          {isLoading ? (
            <LoadingDots />
          ) : filtered.length === 0 ? (
            query ? (
              <div className="rounded-2xl border border-dashed p-10 text-center">
                <div className="text-6xl mb-3">🌾</div>
                <div className="font-serif text-lg">Sonuç bulunamadı</div>
                <div className="text-sm text-hmuted mt-1">Farklı bir ürün veya üretici adı deneyin.</div>
                <button
                  onClick={() => setRequestOpen(true)}
                  className="mt-4 inline-flex items-center rounded-full px-4 py-2 text-xs font-medium min-h-[44px]"
                  style={{ background: "var(--saffron)", color: "#fff" }}
                >
                  Bu ürünü talep et
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center text-hmuted">Henüz aktif ilan yok.</div>
            )
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {(() => {
                type Row = typeof filtered[number];
                const groups = new Map<string, { key: string; farmerId: string; crop: string; items: Row[] }>();
                for (const l of filtered) {
                  const farmerId = l.producerId ?? "";
                  const cropKey = (l.crop ?? "").toLocaleLowerCase("tr-TR");
                  const key = `${farmerId}::${cropKey}`;
                  const cur = groups.get(key) ?? { key, farmerId, crop: cropKey, items: [] };
                  cur.items.push(l);
                  groups.set(key, cur);
                }
                return Array.from(groups.values()).map((g) => {
                  const cfg = findCropConfig(cropMap, g.crop);
                  const canonicalUnit = cfg?.default_unit ?? g.items[0].unit;
                  return (
                    <ListingGroupCard
                      key={g.key}
                      items={g.items}
                      canonicalUnit={canonicalUnit}
                      onOpen={() =>
                        g.items.length === 1
                          ? navigate({ to: "/buyer/offer/$listingId", params: { listingId: g.items[0].id } })
                          : navigate({ to: "/buyer/product/$farmerId/$crop", params: { farmerId: g.farmerId, crop: g.crop } })
                      }
                    />
                  );
                });
              })()}
            </div>



          )}
        </div>
      </div>
      {requestOpen && (
        <CropRequestModal
          initialCrop={query}
          onClose={() => setRequestOpen(false)}
        />
      )}
    </>
  );
}

function CropRequestModal({ initialCrop, onClose }: { initialCrop: string; onClose: () => void }) {
  const create = useCreateCropRequest();
  const [cropName, setCropName] = useState(initialCrop);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"kg" | "g" | "L">("kg");
  const [region, setRegion] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!cropName.trim()) { toast.error("Ürün adı gerekli"); return; }
    try {
      await create.mutateAsync({
        cropName: cropName.trim(),
        note: note.trim() || undefined,
        quantity: quantity ? Number(quantity) : null,
        unit: quantity ? unit : null,
        region: region || null,
        targetDateStart: startDate || null,
        targetDateEnd: endDate || null,
        targetPrice: targetPrice ? Number(targetPrice) : null,
      });
      toast.success("Talebiniz alındı — eşleşen üreticilere bildirim gönderildi");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={onClose}>
      <div
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl bg-card p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-serif text-lg">Ürün Talep Et</div>
          <button onClick={onClose} aria-label="Kapat" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-hmuted">Ürün *</label>
            <input value={cropName} onChange={(e) => setCropName(e.target.value)} placeholder="Ör. safran, zeytinyağı"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-hmuted">Miktar</label>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" placeholder="Opsiyonel"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs text-hmuted">Birim</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value as "kg" | "g" | "L")}
                className="mt-1 w-full rounded-lg border px-2 py-2 text-sm min-h-[44px] bg-card">
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-hmuted">Bölge</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm min-h-[44px] bg-card">
              <option value="">Farketmez</option>
              {TR_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-hmuted">Hedef tarih (başlangıç)</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs text-hmuted">Bitiş</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
            </div>
          </div>

          <div>
            <label className="text-xs text-hmuted">Hedef fiyat (₺{quantity && unit ? `/${unit}` : ""})</label>
            <input value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} type="number" min="0" placeholder="Opsiyonel"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px]" />
          </div>

          <div>
            <label className="text-xs text-hmuted">Not</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Kalite, teslim koşulu vb."
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm resize-none" />
          </div>

          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full rounded-full py-3 text-sm font-medium min-h-[48px]"
            style={{ background: "var(--saffron)", color: "#fff" }}
          >
            {create.isPending ? "Gönderiliyor…" : "Talep Oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ListingRow = ReturnType<typeof useActiveListings>["data"] extends (infer U)[] | undefined ? U : never;

function ListingGroupCard({ items, canonicalUnit, onOpen }: { items: ListingRow[]; canonicalUnit: string; onOpen: () => void }) {
  // Kanonik birime çevirerek topla (g↔kg). Diğer birimler tek preset olduğu için değişmez.
  const totalAvail = items.reduce(
    (s, l) => s + convertQuantity(Number(l.quantity ?? 0), l.unit, canonicalUnit),
    0,
  );
  const soldOut = totalAvail <= 0;
  const first = items[0];

  const farmerSlug = first.farmerName ? (slugifyFarmer(first.farmerName) || (first.producerId ?? "")) : (first.producerId ?? "");
  const prices = items.map((l) => l.pricePerUnit);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceLabel = minP === maxP
    ? `${formatTRY(minP)}/${first.unit}`
    : `${formatTRY(minP)}–${formatTRY(maxP)}/${first.unit}`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!soldOut) onOpen(); }}
      onKeyDown={(e) => { if (e.key === "Enter" && !soldOut) onOpen(); }}
      className={`text-left rounded-2xl bg-card border overflow-hidden hover:border-saffron transition ${soldOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="h-28 relative overflow-hidden" style={
        first.photos && first.photos[0]
          ? undefined
          : { background: `repeating-linear-gradient(45deg, color-mix(in oklab, var(--saffron) 30%, var(--dark)) 0 12px, color-mix(in oklab, var(--saffron) 20%, var(--dark)) 12px 24px)` }
      }>
        {first.photos && first.photos[0] && (
          <img src={first.photos[0]} alt={formatCrop(first.crop)} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55))" }} />
        {items.length > 1 && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-saffron text-white text-[10px] font-bold px-2 py-0.5">
            {items.length} parti
          </div>
        )}
        {soldOut && (
          <div className="absolute top-2 right-2 inline-flex items-center rounded-full bg-hred text-white text-[10px] font-bold px-2 py-0.5">
            Tükendi
          </div>
        )}
        <div className="absolute bottom-2 left-3 right-3 text-white">
          <div className="font-serif text-base leading-tight line-clamp-2">{cropEmoji(first.crop)} {formatCrop(first.crop)}</div>
          <div className="text-[11px] opacity-80 truncate">
            {farmerSlug ? (
              <Link to="/s/$slug" params={{ slug: farmerSlug }} onClick={(e) => e.stopPropagation()} className="underline hover:text-saffron">
                {first.farmerName}
              </Link>
            ) : first.farmerName}
            {first.farmerCity ? ` · ${first.farmerCity}` : ""}
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-hmuted">
            Toplam mevcut {Number(totalAvail.toFixed(2))} {canonicalUnit}
          </div>
          <CoverageBadge listingId={first.id} crop={first.crop} compact />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div style={{ fontFamily: "Courier New, monospace", color: "var(--saffron)" }} className="text-base truncate min-w-0">
            {priceLabel}
          </div>
          <span
            className="shrink-0 inline-flex items-center rounded-full px-4 py-1.5 text-xs text-white min-h-[48px]"
            style={{ background: soldOut ? "var(--hmuted)" : "var(--saffron)" }}
          >
            {soldOut ? "Tükendi" : (items.length > 1 ? "Partileri Gör →" : "Teklif Ver →")}
          </span>
        </div>
      </div>
    </div>
  );
}


