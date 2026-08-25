import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { ArrowLeft, Calendar as CalendarIcon, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Stepper } from "@/components/hasat/Stepper";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop, formatQuantity } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";
import { useListing, useListingStock, useListingProvenanceEntries } from "@/lib/hasat/queries";
import { ProvenanceTimeline } from "@/components/hasat/ProvenanceTimeline";
import {
  cropEmoji,
  findCropConfig,
  resolveListingPhoto,
  useCropConfigMap,
} from "@/lib/hasat/crop-config";
import { RepresentativePhoto, RepresentativeBadge } from "@/components/hasat/RepresentativePhoto";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/buyer/offer/$listingId")({
  head: () => ({ meta: [{ title: "Teklif Ver — Hasat" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { qty?: number; suggestedPrice?: number; subscriptionId?: string } => {
    const out: { qty?: number; suggestedPrice?: number; subscriptionId?: string } = {};
    const q = Number(s.qty);
    if (Number.isFinite(q) && q > 0) out.qty = q;
    const p = Number(s.suggestedPrice);
    if (Number.isFinite(p) && p > 0) out.suggestedPrice = p;
    if (typeof s.subscriptionId === "string" && s.subscriptionId.length > 0)
      out.subscriptionId = s.subscriptionId;
    return out;
  },
  component: MakeOffer,
  // P23-M8-c2 (T3) — önceden yönlendirme yoktu (kullanıcı tıkanıp kalıyordu,
  // bkz. `buyer.product.$farmerId.$crop.tsx`'teki aynı sınıf düzeltme). Bu
  // ekranda `crop` URL'de yok (yalnızca `listingId`) — ilan zaten bulunamadığı
  // için hangi ürün olduğu bilinmiyor, bu yüzden "Talep Et" CTA'sı yerine
  // Keşfet'e geri dönüş sunuluyor.
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <Link
        to="/buyer/discover"
        className="inline-flex items-center gap-1.5 text-xs text-hmuted hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Keşfet'e dön
      </Link>
      <div className="mt-4 text-sm text-hmuted">
        Bu ilan bulunamadı — kaldırılmış veya tükenmiş olabilir.
      </div>
    </div>
  ),
});

const DELIVERY = [
  { id: "Kargo", label: "Kargo", desc: "3-5 iş günü" },
  { id: "Kargo (Alıcı Öder)", label: "Aynı Gün Kurye", desc: "Sadece İstanbul" },
  { id: "Üreticiden Teslim", label: "Üreticiden Teslim", desc: "Çiftlikten alın" },
];

function MakeOffer() {
  const { listingId } = Route.useParams();
  const navigate = useNavigate();
  const setPendingOffer = useHasat((s) => s.setPendingOffer);
  const { data: listing, isLoading } = useListing(listingId);
  const { data: stock } = useListingStock(listingId);
  const { data: provenance = [] } = useListingProvenanceEntries(listingId);
  const { map: cropMap } = useCropConfigMap();

  const search = Route.useSearch();

  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [delivery, setDelivery] = useState(DELIVERY[0].id);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (listing) {
      const targetQty = search.qty
        ? Math.max(listing.minOrder, Math.min(listing.quantity, search.qty))
        : listing.minOrder;
      const targetPrice = search.suggestedPrice ?? listing.pricePerUnit;
      setQty((q) => (q === 0 ? targetQty : q));
      setPrice((p) => (p === 0 ? targetPrice : p));
    }
  }, [listing, search.qty, search.suggestedPrice]);

  if (isLoading)
    return (
      <div className="p-8">
        <LoadingDots />
      </div>
    );
  if (!listing) throw notFound();

  const cfg = findCropConfig(cropMap, listing.crop);
  const { photoUrl, isRepresentative } = resolveListingPhoto(listing.photos, cfg);

  const total = qty * price;
  const negotiated = price !== listing.pricePerUnit;
  const suggestedFromLock = search.suggestedPrice != null && price === search.suggestedPrice;
  const belowMin = qty < listing.minOrder;

  const submit = () => {
    if (belowMin) {
      import("sonner").then(({ toast }) =>
        toast.error(
          `Minimum ${formatQuantity(listing.minOrder, listing.unit)} ${listing.unit} sipariş vermelisiniz`,
        ),
      );
      return;
    }
    setPendingOffer({
      listingId,
      producerId: listing.producerId ?? "",
      producerName: listing.farmerName,
      crop: listing.crop,
      quantity: qty,
      unit: listing.unit,
      pricePerUnit: price,
      delivery,
      deliveryDate: date,
      notes,
      total,
      subscriptionId: search.subscriptionId ?? null,
    });
    navigate({ to: "/buyer/payment" });
  };

  return (
    <div>
      <div
        className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3"
        style={{ background: "var(--dark)", color: "var(--hwhite)" }}
      >
        <Link
          to="/buyer/discover"
          aria-label="Geri"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="text-xs text-white/70">1 / 3 · Teklif oluşturma</div>
          <h1 className="font-serif text-xl">Teklifini Yapılandır</h1>
        </div>
      </div>

      <RepresentativePhoto
        src={photoUrl}
        isRepresentative={isRepresentative}
        alt={formatCrop(listing.crop)}
        placeholderEmoji={cropEmoji(listing.crop, cfg)}
        className="h-40 md:h-52 w-full"
      >
        {isRepresentative && <RepresentativeBadge className="absolute top-3 right-3" />}
      </RepresentativePhoto>

      <div className="mx-auto max-w-2xl space-y-5 p-4 pb-24 md:p-8">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          Miktar, fiyat ve teslimatı belirleyin. Bu adımda teklifiniz gönderilmez ve ödeme alınmaz.
        </div>
        <div className="rounded-2xl bg-card border p-4">
          <div className="text-xs text-hmuted">
            {listing.farmerName} {listing.farmerCity ? `· ${listing.farmerCity}` : ""}
          </div>
          <div className="font-serif text-lg mt-1">{formatCrop(listing.crop)}</div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-xs text-hmuted">
              Mevcut: {formatQuantity(stock ? stock.available : listing.quantity, listing.unit)}{" "}
              {listing.unit} · Min {formatQuantity(listing.minOrder, listing.unit)} {listing.unit}
            </div>
            <div className="text-base font-semibold tabular-nums text-primary">
              {formatTRY(listing.pricePerUnit)}
              <span className="text-xs text-hmuted">/{listing.unit}</span>
            </div>
          </div>
          {stock && stock.available <= 0 && (
            <div
              className="mt-3 rounded-lg px-3 py-2 text-xs"
              style={{
                background: "color-mix(in oklab, var(--hred) 15%, transparent)",
                color: "var(--hred)",
              }}
            >
              Bu ilan tükendi — şu anda teklif alınamıyor.
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-foreground">Miktar</label>
          <Stepper
            value={qty}
            onChange={(n) => setQty(Math.max(listing.minOrder, Math.min(listing.quantity, n)))}
            step={listing.minOrder}
            min={listing.minOrder}
            unit={listing.unit}
          />
          <div className={`mt-1 text-[11px] ${belowMin ? "text-hred" : "text-hmuted"}`}>
            Minimum {formatQuantity(listing.minOrder, listing.unit)} {listing.unit}
          </div>
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block flex items-center gap-2">
            Teklif ettiğiniz birim fiyat{" "}
            {negotiated && (
              <span className="rounded-full bg-gold/20 text-gold px-2 py-0.5 text-[10px]">
                Liste fiyatından farklı
              </span>
            )}
          </label>
          <div className="flex items-center gap-2 rounded-xl bg-input border px-3 py-2.5">
            <span className="text-hmuted">₺</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              aria-label={`Teklif birim fiyatı (${listing.unit})`}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs text-hmuted">/{listing.unit}</span>
          </div>
          {suggestedFromLock && (
            <div className="mt-1 text-[11px]" style={{ color: "var(--gold)" }}>
              🔒 Abonelik sabit fiyatı öneriliyor — teyit edin.
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block">Teslimat</label>
          <div className="space-y-2">
            {DELIVERY.map((d) => {
              const on = delivery === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDelivery(d.id)}
                  className="w-full text-left rounded-xl p-3 border flex items-center gap-3 transition"
                  style={{
                    background: on
                      ? "color-mix(in oklab, var(--teal) 10%, var(--card))"
                      : "var(--card)",
                    borderColor: on ? "var(--teal)" : "var(--border)",
                  }}
                >
                  <span
                    className="grid h-5 w-5 place-items-center rounded-full border-2"
                    style={{ borderColor: on ? "var(--teal)" : "var(--hmuted)" }}
                  >
                    {on && <Check className="h-3 w-3 text-teal" />}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{d.label}</div>
                    <div className="text-xs text-hmuted">{d.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block">Teslim Tarihi</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-12 w-full rounded-xl justify-start text-left font-normal focus-visible:ring-2 focus-visible:ring-ring",
                  !date && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? (
                  format(new Date(date), "dd.MM.yyyy", { locale: tr })
                ) : (
                  <span>Tarih seçin</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date ? new Date(date) : undefined}
                onSelect={(d) => setDate(d ? format(d, "yyyy-MM-dd") : "")}
                locale={tr}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block">Not (opsiyonel)</label>
          <Textarea
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Üreticiye iletmek istediğiniz bir mesaj..."
          />
        </div>

        <div className="rounded-xl border bg-primary/5 p-4">
          <div className="text-xs font-medium text-hmuted">Tahmini teklif toplamı</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-primary">
            {formatTRY(total)}
          </div>
          <div className="mt-1 text-[11px] tabular-nums text-hmuted">
            {formatQuantity(qty, listing.unit)} {listing.unit} × {formatTRY(price)}/{listing.unit}
          </div>
        </div>

        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Ürün geçmişi ve güven bilgileri
          </summary>
          <div className="mt-4">
            <ProvenanceTimeline crop={listing.crop} entries={provenance} />
          </div>
        </details>

        <button
          onClick={submit}
          disabled={!date || (stock ? stock.available <= 0 : false)}
          className="w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-40"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          {stock && stock.available <= 0 ? "Tükendi" : "Teklifi İncele →"}
        </button>
      </div>
    </div>
  );
}
