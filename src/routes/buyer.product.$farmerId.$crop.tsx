import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { DeliveryFields, DELIVERY_OPTIONS } from "@/components/hasat/DeliveryFields";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { convertQuantity } from "@/lib/core";
import { cropEmoji, findCropConfig, resolveListingPhoto, useCropConfigMap } from "@/lib/hasat/crop-config";
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
      { name: "description", content: `${formatCrop(params.crop)} partileri: stok, fiyat ve hasat geçmişini karşılaştır, çoklu partiden tek teklif gönder.` },
      { property: "og:title", content: `${formatCrop(params.crop)} — Hasat` },
      { property: "og:description", content: `${formatCrop(params.crop)} partilerinden çoklu-teklif oluşturun.` },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuyerProduct,
  errorComponent: ({ error, reset }) => (
    <div className="p-8 text-center">
      <div className="text-hred text-sm mb-4">Bir hata oluştu: {error.message}</div>
      <button onClick={reset} className="rounded-full bg-saffron text-white px-4 py-2 text-sm">Yeniden dene</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Bu üreticinin bu üründe aktif partisi yok.</div>,
});

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
        (supabase as any).from("public_farmer_profiles").select("id, name, city").eq("id", farmerId).maybeSingle(),
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

  if (isLoading) return <div className="p-8"><LoadingDots /></div>;
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
  const totalQty = items.reduce((s, i) => s + convertQuantity(i.quantity, i.unit, canonicalUnit), 0);
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
    <div className="pb-40">
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <Link to="/buyer/discover" aria-label="Geri" className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-serif text-xl truncate">{formatCrop(first.crop)}</h1>
          <div className="text-xs opacity-80 truncate">{first.farmerName}{first.farmerCity ? ` · ${first.farmerCity}` : ""}</div>
        </div>
      </div>

      <RepresentativePhoto
        src={photoUrl}
        isRepresentative={isRepresentative}
        alt={formatCrop(first.crop)}
        placeholderEmoji={cropEmoji(first.crop, cfg)}
        className="h-40 md:h-52 w-full"
      >
        {isRepresentative && <RepresentativeBadge className="absolute top-3 right-3" />}
      </RepresentativePhoto>

      <div className="p-4 md:p-8 max-w-3xl space-y-4">
        <div className="text-sm text-hmuted">
          {listings.length} parti mevcut — istediğin partilerden miktar seç, tek teklif gönder.
        </div>

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

        <div>
          <label className="text-xs text-hmuted block mb-1">Not (opsiyonel)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm resize-none" placeholder="Üreticiye iletmek istediğiniz mesaj..." />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-card p-4 md:px-8" style={{ boxShadow: "0 -6px 20px rgba(0,0,0,0.08)" }}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-hmuted">Toplam</div>
            <div className="font-mono text-lg" style={{ color: "var(--saffron)" }}>
              {formatTRY(totalPrice)}
              <span className="text-xs text-hmuted ml-2">{Number(totalQty.toFixed(2))} {canonicalUnit} · {items.length} parti</span>
            </div>
          </div>
          <button
            onClick={submit}
            disabled={items.length === 0 || !deliveryDate}
            className="rounded-full px-6 py-3 text-sm font-medium text-white disabled:opacity-40 min-h-[48px]"
            style={{ background: "var(--saffron)" }}
          >
            Teklif Gönder &amp; Öde →
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchRow({
  listing: l, index, qty, onQtyChange, expanded, onToggle,
}: {
  listing: ActiveListing; index: number; qty: number;
  onQtyChange: (n: number) => void; expanded: boolean; onToggle: () => void;
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
    <div className={`rounded-2xl border bg-card ${soldOut ? "opacity-60" : ""}`}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{label}</span>
              <span className="text-[10px] rounded-full bg-saffron/20 text-saffron px-2 py-0.5">Kalite {l.quality}</span>
            </div>
            <div className="text-xs text-hmuted mt-1">
              Mevcut {available} {l.unit} · <span className="font-mono" style={{ color: "var(--saffron)" }}>{formatTRY(l.pricePerUnit)}/{l.unit}</span>
            </div>
          </div>
          <button onClick={onToggle} aria-label="Detay" className="shrink-0 grid h-9 w-9 place-items-center rounded-lg hover:bg-muted">
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
            className="w-24 rounded-lg border px-3 py-2 text-sm min-h-[44px]"
          />
          <span className="text-xs text-hmuted">{l.unit}</span>
          <div className="flex-1 text-right text-xs text-hmuted">
            {qty > 0 && <span className="font-mono">{formatTRY(qty * l.pricePerUnit)}</span>}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3">
          <div className="text-[11px] text-hmuted mb-2">Bu partiye bağlı hasat kayıtları</div>
          {entries.length === 0 ? (
            <div className="text-xs text-hmuted italic">Henüz kayıt yok.</div>
          ) : (
            <ul className="space-y-1.5">
              {entries.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-hmuted shrink-0">{new Date(e.date).toLocaleDateString("tr-TR")}</span>
                  <span className="flex-1 truncate">{e.quantity} {e.unit} · {e.quality}{e.notes ? ` — ${e.notes}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
