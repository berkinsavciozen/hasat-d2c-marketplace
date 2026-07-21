import { createFileRoute, useNavigate, useRouter, notFound, Link } from "@tanstack/react-router";
import { slugifyFarmer } from "@/lib/hasat/vitrin";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useBuyerOffers, useUpdateOfferStatus, useCounterOffer } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Stepper } from "@/components/hasat/Stepper";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Offer } from "@/lib/hasat/types";
import { NegotiationTimeline } from "@/components/hasat/NegotiationTimeline";

export const Route = createFileRoute("/buyer/negotiation/$offerId")({
  head: () => ({ meta: [{ title: "Müzakere — Hasat" }] }),
  component: Negotiation,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Teklif bulunamadı.</div>,
});

const DELIVERY_OPTS = ["Üreticiden Teslim", "Kargo", "Kargo (Alıcı Öder)"] as const;

function Negotiation() {
  const { offerId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const { data: offers, isPending, isFetching } = useBuyerOffers();
  const updateStatus = useUpdateOfferStatus();
  const counterMut = useCounterOffer();

  const [sheetOpen, setSheetOpen] = useState(false);

  if (isPending || isFetching || !offers) return <div className="p-8"><LoadingDots /></div>;
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) throw notFound();
  const original = offer.original ?? {
    quantity: offer.quantity,
    pricePerUnit: offer.pricePerUnit,
    delivery: offer.delivery,
    deliveryDate: offer.deliveryDate,
    note: offer.note,
  };

  const yourTotal = original.quantity * original.pricePerUnit;
  const counterTotal = offer.quantity * offer.pricePerUnit;
  const diff = counterTotal - yourTotal;

  const accept = async () => {
    try {
      await updateStatus.mutateAsync({ id: offer.id, status: "accepted" });
      toast.success("Teklif kabul edildi. Ödemeyi tamamlayın.");
      navigate({ to: "/buyer/pay/$offerId", params: { offerId: offer.id } });
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };

  const reject = async () => {
    try {
      await updateStatus.mutateAsync({ id: offer.id, status: "rejected" });
      toast("Teklif reddedildi");
      router.history.back();
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <button onClick={() => router.history.back()} aria-label="Geri" className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-serif text-xl">Müzakere</h1>
          <div className="text-xs opacity-70">
            {formatCrop(offer.crop)} · {(() => {
              const slug = offer.buyerName ? (slugifyFarmer(offer.buyerName) || offer.producerId) : offer.producerId;
              return slug
                ? <Link to="/s/$slug" params={{ slug }} className="underline hover:text-saffron">{offer.buyerName}</Link>
                : offer.buyerName;
            })()}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8 max-w-3xl mx-auto md:mx-0 space-y-5 pb-32">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-hmuted">Müzakere geçmişi</div>
          <NegotiationTimeline offer={offer} viewer="buyer" />
        </div>

        <div className="rounded-2xl border p-4 bg-card">
          <div className="text-xs text-hmuted">İlk teklifinize göre fark</div>
          <div className={`font-mono text-xl mt-1 ${diff > 0 ? "text-hred" : diff < 0 ? "text-sage" : ""}`}>
            {diff > 0 ? "+" : ""}{formatTRY(diff)}
          </div>
        </div>


        <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 gap-1.5 border-t bg-background p-3 pb-safe md:static md:border-0 md:bg-transparent md:p-0 md:gap-2">
          <Button variant="outline" onClick={reject} className="border-hred/40 text-hred hover:bg-hred/5 px-2 text-xs sm:text-sm">Reddet</Button>
          <Button variant="outline" onClick={() => setSheetOpen(true)} className="px-2 text-xs sm:text-sm"><span className="sm:hidden">Karşı Teklif</span><span className="hidden sm:inline">Karşı Teklif Yap</span></Button>
          <Button onClick={accept} className="px-2 text-xs sm:text-sm" style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>Kabul Et</Button>
        </div>
      </div>

      <CounterSheet open={sheetOpen} onOpenChange={setSheetOpen} offer={offer} pending={counterMut.isPending} onSubmit={async (patch) => {
        try {
          await counterMut.mutateAsync({
            id: offer.id,
            patch,
            by: "buyer",
            original: { quantity: offer.quantity, pricePerUnit: offer.pricePerUnit, delivery: offer.delivery, deliveryDate: offer.deliveryDate, note: offer.note },
          });
          toast.success("Karşı teklif gönderildi");
          setSheetOpen(false);
          navigate({ to: "/buyer/orders" });
        } catch (e: any) {
          toast.error(e.message ?? "Gönderilemedi");
        }
      }} />
    </div>
  );
}

function SideCard({ title, snap, unit, total, highlight, original }: { title: string; snap: { quantity: number; pricePerUnit: number; delivery?: string; deliveryDate?: string; note?: string }; unit: string; total: number; highlight?: boolean; original?: { quantity: number; pricePerUnit: number; delivery?: string; deliveryDate?: string; note?: string } }) {
  const diffCls = (changed: boolean) => highlight && changed ? "text-saffron font-semibold" : "";
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-saffron bg-saffron/5" : "bg-card"}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-hmuted">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        <Row label="Miktar" value={`${snap.quantity} ${unit}`} cls={diffCls(!!original && snap.quantity !== original.quantity)} />
        <Row label="Birim Fiyat" value={`${formatTRY(snap.pricePerUnit)}/${unit}`} cls={diffCls(!!original && snap.pricePerUnit !== original.pricePerUnit)} />
        <Row label="Teslimat" value={snap.delivery ?? "—"} cls={diffCls(!!original && snap.delivery !== original.delivery)} />
        <Row label="Teslim Tarihi" value={snap.deliveryDate || "—"} cls={diffCls(!!original && snap.deliveryDate !== original.deliveryDate)} />
        {snap.note && (
          <div className={`mt-2 rounded-lg bg-muted/60 p-2 text-xs italic ${diffCls(!!original && snap.note !== original.note)}`}>"{snap.note}"</div>
        )}
      </div>
      <div className="mt-4 border-t pt-3">
        <div className="text-[11px] text-hmuted">Toplam</div>
        <div className={`font-mono text-2xl font-semibold ${highlight ? "text-saffron" : ""}`}>{formatTRY(total)}</div>
      </div>
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-hmuted">{label}</span>
      <span className={`font-mono ${cls ?? ""}`}>{value}</span>
    </div>
  );
}

function CounterSheet({ open, onOpenChange, offer, onSubmit, pending }: { open: boolean; onOpenChange: (b: boolean) => void; offer: Offer; onSubmit: (patch: { quantity: number; pricePerUnit: number; delivery: string; deliveryDate: string; note: string }) => void; pending: boolean }) {
  const [qty, setQty] = useState(offer.quantity);
  const [price, setPrice] = useState(offer.pricePerUnit);
  const [delivery, setDelivery] = useState(offer.delivery ?? DELIVERY_OPTS[1]);
  const [date, setDate] = useState(offer.deliveryDate ?? "");
  const [note, setNote] = useState("");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto pb-safe">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">Karşı Teklif Yap</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Miktar ({offer.unit})</div>
            <Stepper value={qty} onChange={setQty} step={offer.unit === "g" ? 5 : 1} unit={offer.unit} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Birim fiyat (₺/{offer.unit})</div>
            <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="font-mono text-lg" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Teslimat</div>
            <div className="grid grid-cols-3 gap-2">
              {DELIVERY_OPTS.map((d) => (
                <button key={d} type="button" onClick={() => setDelivery(d)}
                  className={`rounded-xl border py-2.5 text-xs font-medium ${delivery === d ? "bg-saffron text-white border-saffron" : "border-input text-hmuted"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Teslim tarihi</div>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Not (opsiyonel)</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <div className="rounded-2xl bg-saffron/10 border border-saffron/30 p-3">
            <div className="text-xs text-hmuted">Yeni toplam</div>
            <div className="font-mono text-2xl font-bold text-saffron">{formatTRY(qty * price)}</div>
          </div>
          <button onClick={() => onSubmit({ quantity: qty, pricePerUnit: price, delivery, deliveryDate: date, note: note || offer.note || "" })}
            disabled={pending}
            className="w-full rounded-xl bg-saffron py-3 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Gönderiliyor…" : "Karşı Teklif Gönder"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
