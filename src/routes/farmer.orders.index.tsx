import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { useFarmerOffers, useUpdateOfferStatus, useFarmerOrders, useCounterOffer } from "@/lib/hasat/queries";
import { WaitingBanner } from "@/components/hasat/WaitingBanner";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Offer, BuyerType, Order } from "@/lib/hasat/types";
import { NegotiationThread } from "@/components/hasat/NegotiationThread";
import { statusVisual, statusStyle, canAccept } from "@/lib/hasat/offer-status";

export const Route = createFileRoute("/farmer/orders/")({
  head: () => ({ meta: [{ title: "Siparişler — Hasat" }] }),
  component: Orders,
});

const BUYER_TYPE_LABEL: Record<BuyerType, string> = { restoran: "Restoran", otel: "Otel", market: "Market", ihracatci: "İhracatçı" };
const BUYER_TYPE_EMOJI: Record<BuyerType, string> = { restoran: "🍽️", otel: "🏨", market: "🛒", ihracatci: "✈️" };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "az önce";
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

function Orders() {
  const { data: offers = [], isLoading: oLoading } = useFarmerOffers();
  const { data: orders = [], isLoading: rLoading } = useFarmerOrders();

  // Gelen = pending or counter (negotiation) + accepted/pending_payment (waiting for buyer)
  const incoming = offers.filter((o) => o.status === "pending" || o.status === "counter" || (o.status === "accepted" && o.paymentStatus !== "paid"));
  // Aktif: order rows that aren't yet delivered
  const activeOrders = orders.filter((o) => o.status !== "delivered");
  const completedOrders = orders.filter((o) => o.status === "delivered");
  const completedOffers = offers.filter((o) => o.status === "rejected" || o.status === "completed");

  return (
    <>
      <FarmerHeader title="Siparişler" subtitle="Teklifler ve aktif siparişler" />
      <div className="px-4 md:px-8 py-5">
        <Tabs defaultValue="incoming">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="incoming">Gelen ({incoming.length})</TabsTrigger>
            <TabsTrigger value="active">Aktif ({activeOrders.length})</TabsTrigger>
            <TabsTrigger value="done">Tamamlanan</TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="mt-4 space-y-3">
            {oLoading ? <LoadingDots /> : incoming.length === 0 ? <Empty msg="Bekleyen teklif yok." /> : incoming.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </TabsContent>
          <TabsContent value="active" className="mt-4 space-y-3">
            {rLoading ? <LoadingDots /> : activeOrders.length === 0 ? <Empty msg="Aktif sipariş yok." /> : activeOrders.map((o) => <OrderCard key={o.id} order={o} />)}
          </TabsContent>
          <TabsContent value="done" className="mt-4 space-y-3">
            {(oLoading || rLoading) ? <LoadingDots /> : (completedOffers.length === 0 && completedOrders.length === 0) ? (
              <Empty msg="Tamamlanmış sipariş yok." />
            ) : (
              <>
                {completedOrders.map((o) => <OrderCard key={o.id} order={o} muted />)}
                {completedOffers.map((o) => <OfferCard key={o.id} offer={o} />)}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="py-12 text-center text-sm text-hmuted">{msg}</div>;
}

function OfferCard({ offer }: { offer: Offer }) {
  const updateStatus = useUpdateOfferStatus();
  const counterMut = useCounterOffer();
  const navigate = useNavigate();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);

  const total = offer.quantity * offer.pricePerUnit;
  const visual = statusVisual(offer, "farmer");
  const s = statusStyle(visual);
  const myTurn = canAccept(offer, "farmer");
  const isPendingPayment = offer.status === "accepted" && offer.paymentStatus !== "paid";
  const isTerminal = offer.status === "rejected" || offer.status === "completed";

  const onAccept = async () => {
    try {
      await updateStatus.mutateAsync({ id: offer.id, status: "accepted" });
      toast.success("Teklif kabul edildi. Alıcı ödeme bekleniyor.");
      setAcceptOpen(false);
    } catch (e: any) { toast.error(e.message ?? "İşlem başarısız"); }
  };
  const onReject = async (reason?: string) => {
    try {
      await updateStatus.mutateAsync({ id: offer.id, status: "rejected", reason });
      toast("Teklif reddedildi");
      setRejectOpen(false);
    } catch (e: any) { toast.error(e.message ?? "İşlem başarısız"); }
  };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate">{offer.buyerName}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-hmuted">
              {BUYER_TYPE_EMOJI[offer.buyerType]} {BUYER_TYPE_LABEL[offer.buyerType]}
            </span>
          </div>
          <div className="mt-1 text-sm text-hmuted">{formatCrop(offer.crop)} · {offer.quantity} {offer.unit}</div>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-lg font-semibold">{formatTRY(total)}</span>
            <span className="text-xs text-hmuted">({formatTRY(offer.pricePerUnit)}/{offer.unit})</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: s.bg, color: s.fg }}>{visual.label}</span>
          <span className="text-[10px] text-hmuted">{timeAgo(offer.createdAt)}</span>
        </div>
      </div>

      <div className="mt-3 border-t pt-3">
        <NegotiationThread
          offerId={offer.id}
          viewer="farmer"
          unit={offer.unit}
          initial={{ price: offer.original?.pricePerUnit ?? offer.pricePerUnit, quantity: offer.original?.quantity ?? offer.quantity, createdAt: offer.createdAt }}
        />
      </div>

      {isPendingPayment ? (
        <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-hmuted">
          Alıcı ödemeyi henüz tamamlamadı.
        </div>
      ) : isTerminal ? null : myTurn ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button onClick={() => setAcceptOpen(true)} className="rounded-lg py-2.5 text-sm font-medium text-white" style={{ background: "var(--sage)" }}>
            ✅ Kabul Et
          </button>
          <button onClick={() => setCounterOpen(true)} className="rounded-lg border border-saffron py-2.5 text-sm font-medium text-saffron hover:bg-saffron/5">
            💬 Karşı Teklif
          </button>
          <button onClick={() => setRejectOpen(true)} className="rounded-lg border border-hred/40 py-2.5 text-sm font-medium text-hred hover:bg-hred/5">
            ❌ Reddet
          </button>
        </div>
      ) : (
        <WaitingBanner offer={offer} viewer="farmer" />
      )}

      {/* Accept modal */}
      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Teklifi Kabul Et</DialogTitle></DialogHeader>
          <p className="text-sm text-hmuted">
            <b>{offer.buyerName}</b> teklifini kabul ediyorsunuz: {offer.quantity} {offer.unit} {formatCrop(offer.crop)} @ {formatTRY(offer.pricePerUnit)}/{offer.unit}.
            <br />Toplam: <b className="font-mono">{formatTRY(total)}</b>. Onaylar mısınız?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)}>Vazgeç</Button>
            <Button onClick={onAccept} disabled={updateStatus.isPending} style={{ background: "var(--sage)", color: "var(--hwhite)" }}>
              {updateStatus.isPending ? "..." : "Onayla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject modal */}
      <RejectModal open={rejectOpen} onOpenChange={setRejectOpen} onConfirm={onReject} pending={updateStatus.isPending} />

      {/* Counter modal */}
      <CounterModal
        open={counterOpen}
        onOpenChange={setCounterOpen}
        offer={offer}
        pending={counterMut.isPending}
        onSubmit={async (patch) => {
          try {
            await counterMut.mutateAsync({
              id: offer.id,
              patch,
              by: "farmer",
              original: { quantity: offer.quantity, pricePerUnit: offer.pricePerUnit, delivery: offer.delivery, deliveryDate: offer.deliveryDate, note: offer.note },
            });
            toast.success("Karşı teklif gönderildi");
            setCounterOpen(false);
          } catch (e: any) { toast.error(e.message ?? "Gönderilemedi"); }
        }}
      />
    </div>
  );
}

function RejectModal({ open, onOpenChange, onConfirm, pending }: { open: boolean; onOpenChange: (b: boolean) => void; onConfirm: (reason?: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Teklifi Reddet</DialogTitle></DialogHeader>
        <p className="text-sm text-hmuted">Bu teklifi reddetmek istiyor musunuz?</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reddedilme nedeni (opsiyonel)" rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button onClick={() => onConfirm(reason || undefined)} disabled={pending} variant="destructive">
            {pending ? "..." : "Reddet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CounterModal({ open, onOpenChange, offer, onSubmit, pending }: {
  open: boolean; onOpenChange: (b: boolean) => void; offer: Offer; pending: boolean;
  onSubmit: (patch: { quantity: number; pricePerUnit: number; note?: string }) => void;
}) {
  const [qty, setQty] = useState(offer.quantity);
  const [price, setPrice] = useState(offer.pricePerUnit);
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Karşı Teklif</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-hmuted">Miktar ({offer.unit})</label>
            <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className="font-mono" />
          </div>
          <div>
            <label className="text-xs text-hmuted">Birim fiyat (₺/{offer.unit})</label>
            <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="font-mono" />
          </div>
          <div>
            <label className="text-xs text-hmuted">Not (opsiyonel)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Alıcıya iletmek istediğiniz not..." />
          </div>
          <div className="rounded-lg bg-saffron/10 border border-saffron/30 p-3">
            <div className="text-xs text-hmuted">Yeni toplam</div>
            <div className="font-mono text-xl font-bold text-saffron">{formatTRY(qty * price)}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button onClick={() => onSubmit({ quantity: qty, pricePerUnit: price, note: note || undefined })} disabled={pending}
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
            {pending ? "Gönderiliyor…" : "Gönder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderCard({ order, muted }: { order: Order; muted?: boolean }) {
  const STATUS_TR: Record<string, string> = { preparing: "Hazırlanıyor", shipped: "Kargoda", delivered: "Teslim Edildi" };
  return (
    <div className={`rounded-2xl border bg-card p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-hmuted">{order.code}</div>
          <div className="mt-1 font-medium truncate">{order.producerName}</div>
          <div className="text-xs text-hmuted">{formatCrop(order.crop)} · {order.quantity} {order.unit}</div>
          <div className="mt-1.5 font-mono text-lg font-semibold">{formatTRY(order.total)}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: "color-mix(in oklab, var(--sage) 22%, transparent)", color: "var(--sage)" }}>
            ✅ Ödeme Alındı
          </span>
          <span className="text-[10px] text-hmuted">{STATUS_TR[order.status] ?? order.status}</span>
        </div>
      </div>
    </div>
  );
}
