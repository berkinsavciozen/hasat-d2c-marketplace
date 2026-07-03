import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Stepper } from "@/components/hasat/Stepper";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";
import { useListing, useListingStock } from "@/lib/hasat/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/buyer/offer/$listingId")({
  head: () => ({ meta: [{ title: "Teklif Ver — Hasat" }] }),
  component: MakeOffer,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Ürün bulunamadı.</div>,
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

  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [delivery, setDelivery] = useState(DELIVERY[0].id);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (listing) {
      setQty((q) => (q === 0 ? listing.minOrder : q));
      setPrice((p) => (p === 0 ? listing.pricePerUnit : p));
    }
  }, [listing]);

  if (isLoading) return <div className="p-8"><LoadingDots /></div>;
  if (!listing) throw notFound();


  const total = qty * price;
  const negotiated = price !== listing.pricePerUnit;
  const belowMin = qty < listing.minOrder;

  const submit = () => {
    if (belowMin) {
      import("sonner").then(({ toast }) => toast.error(`Minimum ${listing.minOrder} ${listing.unit} sipariş vermelisiniz`));
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
    });
    navigate({ to: "/buyer/payment" });
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <Link to="/buyer/discover" className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-xl">Teklif Ver</h1>
      </div>

      <div className="p-4 md:p-8 space-y-5 max-w-2xl">
        <div className="rounded-2xl bg-card border p-4">
          <div className="text-xs text-hmuted">{listing.farmerName} {listing.farmerCity ? `· ${listing.farmerCity}` : ""}</div>
          <div className="font-serif text-lg mt-1">{listing.crop}</div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-xs text-hmuted">Mevcut: {listing.quantity} {listing.unit} · Min {listing.minOrder} {listing.unit}</div>
            <div style={{ fontFamily: "Courier New, monospace", color: "var(--saffron)" }} className="text-base">
              {formatTRY(listing.pricePerUnit)}<span className="text-xs text-hmuted">/{listing.unit}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block">Miktar</label>
          <Stepper value={qty} onChange={(n) => setQty(Math.max(listing.minOrder, Math.min(listing.quantity, n)))} step={listing.minOrder} min={listing.minOrder} unit={listing.unit} />
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block flex items-center gap-2">
            Birim Fiyat {negotiated && <span className="rounded-full bg-gold/20 text-gold px-2 py-0.5 text-[10px]">Müzakere fiyatı</span>}
          </label>
          <div className="flex items-center gap-2 rounded-xl bg-input border px-3 py-2.5">
            <span className="text-hmuted">₺</span>
            <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)}
              className="flex-1 bg-transparent outline-none text-base" style={{ fontFamily: "Courier New, monospace" }} />
            <span className="text-xs text-hmuted">/{listing.unit}</span>
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "color-mix(in oklab, var(--sage) 18%, transparent)" }}>
          <div className="text-xs text-hmuted">Toplam</div>
          <div className="font-mono text-2xl mt-1" style={{ color: "var(--sage)" }}>{formatTRY(total)}</div>
          <div className="text-[11px] text-hmuted mt-1">{qty} {listing.unit} × {formatTRY(price)}/{listing.unit}</div>
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block">Teslimat</label>
          <div className="space-y-2">
            {DELIVERY.map((d) => {
              const on = delivery === d.id;
              return (
                <button key={d.id} onClick={() => setDelivery(d.id)}
                  className="w-full text-left rounded-xl p-3 border flex items-center gap-3 transition"
                  style={{ background: on ? "color-mix(in oklab, var(--saffron) 10%, var(--card))" : "var(--card)", borderColor: on ? "var(--saffron)" : "var(--border)" }}>
                  <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: on ? "var(--saffron)" : "var(--hmuted)" }}>
                    {on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--saffron)" }} />}
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
                className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(new Date(date), "dd.MM.yyyy", { locale: tr }) : <span>Tarih seçin</span>}
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
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Üreticiye iletmek istediğiniz bir mesaj..." />
        </div>

        <button onClick={submit} disabled={!date}
          className="w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-40"
          style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
          Teklif Gönder & Öde →
        </button>
      </div>
    </div>
  );
}
