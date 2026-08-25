import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MapPin,
  PackageCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { DeliveryFields, DELIVERY_OPTIONS } from "@/components/hasat/DeliveryFields";
import { CropRequestModal } from "@/components/hasat/CropRequestModal";
import { formatTRY, formatCrop, formatQuantity } from "@/lib/hasat/format";
import { convertQuantity } from "@/lib/core";
import {
  cropEmoji,
  findCropConfig,
  resolveListingPhoto,
  useCropConfigMap,
} from "@/lib/hasat/crop-config";
import { RepresentativePhoto, RepresentativeBadge } from "@/components/hasat/RepresentativePhoto";
import { useHasat } from "@/lib/hasat/store";
import {
  dbToActiveListing,
  useListingStock,
  useListingBatchEntries,
  type ActiveListing,
} from "@/lib/hasat/queries";

export const Route = createFileRoute("/buyer/product/$farmerId/$crop")({
  head: ({ params }) => ({
    meta: [
      { title: `${formatCrop(params.crop)} — Hasat` },
      {
        name: "description",
        content: `${formatCrop(params.crop)} partileri: stok, fiyat ve hasat geçmişini karşılaştır, çoklu partiden tek teklif gönder.`,
      },
      { property: "og:title", content: `${formatCrop(params.crop)} — Hasat` },
      {
        property: "og:description",
        content: `${formatCrop(params.crop)} partilerinden çoklu-teklif oluşturun.`,
      },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuyerProduct,
  errorComponent: ({ error, reset }) => (
    <div className="p-8 text-center">
      <div className="text-hred text-sm mb-4">Bir hata oluştu: {error.message}</div>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Yeniden dene
      </button>
    </div>
  ),
  notFoundComponent: ProductNotFound,
});

// P23-M8-c2 (T3) — bu ekran daha önce `notFoundComponent` olarak ölü bir
// mesaj gösteriyordu: hiçbir CTA/geri linki yok, kullanıcı burada tıkanıp
// kalıyordu. 9/70 crop'ta aktif ilan olduğu gerçeğiyle (bkz. `_Context.md`
// → "Arz gerçeği") bu ekranın gerçek bir çıkmaz olma ihtimali düşük değil —
// eşleşen bir malzemenin partisi teklif oluşturulurken tükenirse de aynı
// yola düşülür. Diğer boş-durum yüzeyleriyle (`buyer.discover.tsx`, tarif
// malzeme kartı) aynı desen: "Talep Et" CTA'sı, aynı paylaşılan
// `CropRequestModal`.
function ProductNotFound() {
  const { crop } = Route.useParams();
  const [requestOpen, setRequestOpen] = useState(false);
  return (
    <div className="p-8 text-center">
      <Link
        to="/buyer/discover"
        className="inline-flex items-center gap-1.5 text-xs text-hmuted hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Keşfet'e dön
      </Link>
      <div className="mt-6 text-6xl">🌾</div>
      <div className="mt-3 font-serif text-lg">Bu üreticinin bu üründe aktif partisi yok</div>
      <div className="mt-1 text-sm text-hmuted">
        {formatCrop(crop)} için şu an satılık parti bulunmuyor — üretici tükenmiş veya ilanı
        kapatmış olabilir.
      </div>
      <button
        onClick={() => setRequestOpen(true)}
        className="mt-4 inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
      >
        Bu ürünü talep et
      </button>
      {requestOpen && (
        <CropRequestModal initialCrop={crop} lockCropName onClose={() => setRequestOpen(false)} />
      )}
    </div>
  );
}

function useFarmerCropListings(farmerId: string, crop: string) {
  return useQuery({
    queryKey: ["farmerCropListings", farmerId, crop.toLowerCase()],
    enabled: !!farmerId && !!crop,
    queryFn: async (): Promise<ActiveListing[]> => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("farmer_id", farmerId)
        .eq("status", "active")
        .ilike("crop", crop)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const [profileRes] = await Promise.all([
        (supabase as any)
          .from("public_farmer_profiles")
          .select("id, name, city")
          .eq("id", farmerId)
          .maybeSingle(),
      ]);
      const profile = profileRes?.data ?? null;
      return (data ?? []).map((r) => dbToActiveListing({ ...r, profiles: profile }));
    },
  });
}

function BuyerProduct() {
  const { farmerId, crop } = Route.useParams();
  const navigate = useNavigate();
  const setPendingOffer = useHasat((s) => s.setPendingOffer);
  const { data: listings = [], isLoading } = useFarmerCropListings(farmerId, crop);
  const { map: cropMap } = useCropConfigMap();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [delivery, setDelivery] = useState(DELIVERY_OPTIONS[0].id);
  const [deliveryDate, setDeliveryDate] = useState("");

  if (isLoading)
    return (
      <div className="p-8">
        <LoadingDots />
      </div>
    );
  if (listings.length === 0) throw notFound();

  const first = listings[0];
  const cfg = findCropConfig(cropMap, crop);
  const canonicalUnit = cfg?.default_unit ?? first.unit;
  const realPhoto = listings.find((l) => l.photos && l.photos.length > 0)?.photos?.[0] ?? null;
  const { photoUrl, isRepresentative } = resolveListingPhoto(realPhoto ? [realPhoto] : [], cfg);
  const items = Object.entries(selected)
    .filter(([, q]) => q > 0)
    .map(([listingId, quantity]) => {
      const l = listings.find((x) => x.id === listingId)!;
      return { listingId, quantity, pricePerUnit: l.pricePerUnit, unit: l.unit };
    });
  const totalQty = items.reduce(
    (s, i) => s + convertQuantity(i.quantity, i.unit, canonicalUnit),
    0,
  );
  const totalPrice = items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);

  const submit = () => {
    if (items.length === 0) return;
    if (!deliveryDate) {
      toast.error("Teslim tarihi seçin");
      return;
    }
    const weightedPrice = totalQty > 0 ? totalPrice / totalQty : 0;
    setPendingOffer({
      listingId: first.id,
      producerId: farmerId,
      producerName: first.farmerName,
      crop: first.crop,
      quantity: Number(totalQty.toFixed(3)),
      unit: canonicalUnit,
      pricePerUnit: weightedPrice,
      delivery,
      deliveryDate,
      notes: note.trim() || undefined,
      total: totalPrice,
      subscriptionId: null,
      items,
    });
    navigate({ to: "/buyer/payment" });
  };

  return (
    <div className="pb-64 sm:pb-44 md:pb-32">
      <div className="flex items-center gap-3 bg-primary px-4 pb-4 pt-5 text-primary-foreground md:px-8">
        <Link
          to="/buyer/discover"
          aria-label="Geri"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 transition hover:bg-white/15"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-serif text-xl md:text-2xl">{formatCrop(first.crop)}</h1>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs opacity-85">
            <Link
              to="/buyer/producer/$id"
              params={{ id: farmerId }}
              className="truncate font-medium underline-offset-4 hover:underline"
            >
              {first.farmerName}
            </Link>
            {first.farmerCity && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex min-w-0 items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {first.farmerCity}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <RepresentativePhoto
        src={photoUrl}
        isRepresentative={isRepresentative}
        alt={formatCrop(first.crop)}
        placeholderEmoji={cropEmoji(first.crop, cfg)}
        className="aspect-[4/3] max-h-[30rem] w-full bg-muted"
      >
        {isRepresentative && <RepresentativeBadge className="absolute top-3 right-3" />}
      </RepresentativePhoto>

      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-hmuted">
              <PackageCheck className="h-4 w-4 text-teal" aria-hidden="true" />
              Parti özeti
            </div>
            <div className="mt-1 font-semibold">{listings.length} aktif parti</div>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-hmuted">
              <ImageIcon className="h-4 w-4 text-teal" aria-hidden="true" />
              Görsel kaynağı
            </div>
            <div className="mt-1 font-semibold">
              {isRepresentative ? "Temsili ürün görseli" : "Üretici görseli"}
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-xs text-hmuted">Teklif yöntemi</div>
            <div className="mt-1 font-semibold">Çoklu parti, tek teklif</div>
          </div>
        </div>

        <p className="text-sm text-hmuted">
          İstediğin partilerden miktar seç. Varsa ilgili hasat kayıtlarını inceleyip tek teklif
          gönder.
        </p>

        <div className="space-y-3">
          {listings.map((l, idx) => (
            <BatchRow
              key={l.id}
              listing={l}
              index={idx}
              qty={selected[l.id] ?? 0}
              onQtyChange={(n) => setSelected((s) => ({ ...s, [l.id]: n }))}
              expanded={!!expanded[l.id]}
              onToggle={() => setExpanded((e) => ({ ...e, [l.id]: !e[l.id] }))}
            />
          ))}
        </div>

        <DeliveryFields
          delivery={delivery}
          onDeliveryChange={setDelivery}
          date={deliveryDate}
          onDateChange={setDeliveryDate}
        />

        <div className="rounded-2xl border bg-card p-4">
          <label className="mb-1 block text-xs font-medium text-hmuted">
            Üreticiye not (opsiyonel)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border bg-input px-3 py-2 text-sm"
            placeholder="Üreticiye iletmek istediğiniz mesaj..."
          />
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-[calc(56px+max(env(safe-area-inset-bottom),0.5rem))] z-40 border-t bg-card/95 px-4 py-4 backdrop-blur md:bottom-0 md:px-8 md:pb-safe"
        style={{ boxShadow: "0 -6px 20px rgba(0,0,0,0.08)" }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-hmuted">Toplam</div>
            <div className="font-mono text-lg font-semibold text-foreground">
              {formatTRY(totalPrice)}
              <span className="ml-2 text-xs font-normal text-hmuted">
                {formatQuantity(totalQty, canonicalUnit)} {canonicalUnit} · {items.length} parti
              </span>
            </div>
          </div>
          <button
            onClick={submit}
            disabled={items.length === 0 || !deliveryDate}
            className="min-h-[48px] w-full rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40 sm:w-auto"
          >
            Teklif Gönder &amp; Öde →
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchRow({
  listing: l,
  index,
  qty,
  onQtyChange,
  expanded,
  onToggle,
}: {
  listing: ActiveListing;
  index: number;
  qty: number;
  onQtyChange: (n: number) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: stock } = useListingStock(l.id);
  const { data: entries = [] } = useListingBatchEntries(expanded ? l.id : null);
  const available = stock?.available ?? l.quantity;
  const soldOut = available <= 0;
  const label = l.batchName || `Batch #${index + 1}`;

  const clampAndSet = (raw: number) => {
    if (!Number.isFinite(raw) || raw < 0) raw = 0;
    if (raw > available) raw = available;
    onQtyChange(raw);
  };

  return (
    <div
      className={`rounded-2xl border bg-card transition-colors ${qty > 0 ? "border-teal bg-accent/35" : ""} ${soldOut ? "opacity-60" : ""}`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                Kalite {l.quality}
              </span>
            </div>
            <div className="text-xs text-hmuted mt-1">
              Mevcut {formatQuantity(available, l.unit)} {l.unit} ·{" "}
              <span className="font-mono font-medium text-foreground">
                {formatTRY(l.pricePerUnit)}/{l.unit}
              </span>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-primary hover:bg-accent"
          >
            {expanded ? "Kayıtları gizle" : "Hasat kayıtlarını gör"}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs text-hmuted">Miktar:</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={available}
            step={l.unit === "g" ? 5 : 1}
            value={qty || ""}
            onChange={(e) => clampAndSet(Number(e.target.value))}
            disabled={soldOut}
            placeholder="0"
            className="min-h-[44px] w-24 rounded-md border bg-input px-3 py-2 text-sm"
          />
          <span className="text-xs text-hmuted">{l.unit}</span>
          <div className="flex-1 text-right text-xs text-hmuted">
            {qty > 0 && (
              <span className="font-mono font-medium">{formatTRY(qty * l.pricePerUnit)}</span>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-teal">
            Bu partiye bağlı hasat kanıtları
          </div>
          {entries.length === 0 ? (
            <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-hmuted">
              Bu parti için henüz bağlı hasat kaydı bulunmuyor.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {entries.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-hmuted shrink-0">
                    {new Date(e.date).toLocaleDateString("tr-TR")}
                  </span>
                  <span className="flex-1 truncate">
                    {formatQuantity(e.quantity, e.unit)} {e.unit} · {e.quality}
                    {e.notes ? ` — ${e.notes}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
