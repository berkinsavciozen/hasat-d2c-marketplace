import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatTRY } from "@/lib/hasat/format";
import { useBuyerOrders, useBuyerOffers, useUpdateOfferStatus } from "@/lib/hasat/queries";
import { toast } from "sonner";
import type { Order, Offer } from "@/lib/hasat/types";
import { NegotiationThread } from "@/components/hasat/NegotiationThread";
import { statusVisual, statusStyle, canAccept } from "@/lib/hasat/offer-status";
import { WaitingBanner } from "@/components/hasat/WaitingBanner";
import { slugifyFarmer } from "@/lib/hasat/vitrin";

function farmerSlugOf(name: string | null | undefined, id: string | undefined): string | null {
  if (name) {
    const s = slugifyFarmer(name);
    if (s) return s;
  }
  return id ?? null;
}

export const Route = createFileRoute("/buyer/orders")({
  head: () => ({ meta: [{ title: "Siparişlerim — Hasat" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: s.tab === "active" || s.tab === "done" || s.tab === "offers" ? (s.tab as "offers" | "active" | "done") : undefined,
  }),
  component: OrdersList,
});

const ORDER_STATUS_LABEL: Record<Order["status"], { label: string; bg: string; fg: string }> = {
  sent: { label: "Teklif Gönderildi", bg: "color-mix(in oklab, var(--saffron) 18%, transparent)", fg: "var(--saffron)" },
  accepted: { label: "Kabul Edildi", bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  preparing: { label: "Hazırlanıyor", bg: "color-mix(in oklab, var(--gold) 22%, transparent)", fg: "var(--gold)" },
  shipped: { label: "Kargoda", bg: "color-mix(in oklab, var(--lav) 25%, transparent)", fg: "var(--lav)" },
  delivered: { label: "Teslim Edildi", bg: "color-mix(in oklab, var(--hmuted) 18%, transparent)", fg: "var(--hmuted)" },
  completed: { label: "Tamamlandı", bg: "color-mix(in oklab, var(--hmuted) 18%, transparent)", fg: "var(--hmuted)" },
};

function formatTRDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function estimatedDelivery(o: Order): string {
  if (o.deliveryDate) return formatTRDate(o.deliveryDate);
  const base = new Date(o.createdAt);
  base.setDate(base.getDate() + 3);
  return formatTRDate(base.toISOString());
}

function formatPhoneFull(phone?: string): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("90")) {
    return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  }
  return phone;
}

function OrdersList() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data: orders = [], isLoading: ordersLoading } = useBuyerOrders();
  const { data: offers = [], isLoading: offersLoading } = useBuyerOffers();
  const updateStatus = useUpdateOfferStatus();
  const [tab, setTab] = useState<string>(search.tab ?? "offers");

  // Honor ?tab=… on mount and when it changes
  useEffect(() => {
    if (search.tab && search.tab !== tab) setTab(search.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab]);

  const pendingOffers = offers.filter((o) =>
    o.status === "pending" ||
    o.status === "counter" ||
    (o.status === "accepted" && o.paymentStatus !== "paid")
  );
  const active = orders.filter((o) => o.status !== "delivered" && o.status !== "completed");
  const done = orders.filter((o) => o.status === "delivered" || o.status === "completed");

  const accept = async (offer: Offer) => {
    try {
      await updateStatus.mutateAsync({ id: offer.id, status: "accepted" });
      toast.success("Teklif kabul edildi. Ödemeyi tamamlayın.");
      navigate({ to: "/buyer/pay/$offerId", params: { offerId: offer.id } });
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };
  const reject = async (offer: Offer) => {
    try {
      await updateStatus.mutateAsync({ id: offer.id, status: "rejected" });
      toast("Teklif reddedildi");
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };

  const renderActiveOrders = (list: Order[]) =>
    ordersLoading ? (
      <LoadingDots />
    ) : list.length === 0 ? (
      <div className="rounded-2xl border border-dashed p-8 text-center text-hmuted">Henüz aktif sipariş yok.</div>
    ) : (
      <div className="space-y-3">
        {list.map((o) => {
          const s = ORDER_STATUS_LABEL[o.status];
          const phone = formatPhoneFull(o.producerPhone);
          const rawPhone = o.producerPhone?.replace(/\D/g, "");
          return (
            <div key={o.id} className="rounded-2xl bg-card border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-hmuted">{o.code}</div>
                  <div className="font-medium mt-1 truncate">{o.crop}</div>
                  <div className="text-xs text-hmuted">{o.quantity} {o.unit} · {formatTRY(o.total)}</div>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-hmuted">Üretici</div>
                  <div className="font-medium">{o.producerName}</div>
                  {phone && (
                    <a href={`tel:+${rawPhone}`} className="mt-0.5 block font-mono text-saffron underline">{phone}</a>
                  )}
                </div>
                <div>
                  <div className="text-hmuted">Tahmini teslim</div>
                  <div className="font-medium">{estimatedDelivery(o)}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
                <button onClick={() => navigate({ to: "/buyer/orders/$orderId", params: { orderId: o.id } })} className="text-saffron underline">
                  Sipariş detayları →
                </button>
                <span className="font-mono" style={{ color: "var(--gold)" }}>{formatTRY(o.total)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );

  const renderDoneOrders = (list: Order[]) =>
    ordersLoading ? (
      <LoadingDots />
    ) : list.length === 0 ? (
      <div className="rounded-2xl border border-dashed p-8 text-center text-hmuted">Henüz tamamlanmış sipariş yok.</div>
    ) : (
      <div className="space-y-3">
        {list.map((o) => {
          const s = ORDER_STATUS_LABEL[o.status];
          return (
            <button key={o.id} onClick={() => navigate({ to: "/buyer/orders/$orderId", params: { orderId: o.id } })}
              className="w-full text-left rounded-2xl bg-card border p-4 hover:border-saffron transition">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs text-hmuted">{o.code}</div>
                  <div className="font-medium mt-1">{o.crop}</div>
                  <div className="text-xs text-hmuted">{o.producerName}</div>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-hmuted">{o.quantity} {o.unit} · {o.delivery}</span>
                <span className="font-mono" style={{ color: "var(--gold)" }}>{formatTRY(o.total)}</span>
              </div>
            </button>
          );
        })}
      </div>
    );

  const renderOffers = () =>
    offersLoading ? (
      <LoadingDots />
    ) : pendingOffers.length === 0 ? (
      <div className="rounded-2xl border border-dashed p-8 text-center text-hmuted">Henüz teklif yok.</div>
    ) : (
      <div className="space-y-3">
        {pendingOffers.map((o) => (
          <OfferCard
            key={o.id}
            offer={o}
            onAccept={() => accept(o)}
            onReject={() => reject(o)}
            onCounter={() => navigate({ to: "/buyer/negotiation/$offerId", params: { offerId: o.id } })}
            onPay={() => navigate({ to: "/buyer/pay/$offerId", params: { offerId: o.id } })}
            pending={updateStatus.isPending}
          />
        ))}
      </div>
    );

  return (
    <>
      <BuyerHeader title="Siparişlerim" />
      <div className="p-4 md:p-8 max-w-3xl">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="offers">Tekliflerim ({pendingOffers.length})</TabsTrigger>
            <TabsTrigger value="active">Aktif ({active.length})</TabsTrigger>
            <TabsTrigger value="done">Tamamlanan ({done.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="offers" className="mt-4">{renderOffers()}</TabsContent>
          <TabsContent value="active" className="mt-4">{renderActiveOrders(active)}</TabsContent>
          <TabsContent value="done" className="mt-4">{renderDoneOrders(done)}</TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function OfferCard({ offer, onAccept, onReject, onCounter, onPay, pending }: {
  offer: Offer;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
  onPay: () => void;
  pending: boolean;
}) {
  const visual = statusVisual(offer, "buyer");
  const s = statusStyle(visual);
  const myTurn = canAccept(offer, "buyer");
  const isPendingPayment = offer.status === "accepted" && offer.paymentStatus !== "paid";
  const isTransferPending = offer.status === "accepted" && offer.paymentStatus === "pending_transfer";
  const total = offer.quantity * offer.pricePerUnit;

  return (
    <div className="rounded-2xl border p-4 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{offer.crop}</div>
          <div className="text-xs text-hmuted mt-0.5">{offer.quantity} {offer.unit} · {offer.buyerName}</div>
          <div className="mt-1 font-mono text-base font-semibold">{formatTRY(total)}</div>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0" style={{ background: s.bg, color: s.fg }}>
          {visual.label}
        </span>
      </div>

      <div className="mt-3 border-t pt-3">
        <NegotiationThread
          offerId={offer.id}
          viewer="buyer"
          unit={offer.unit}
          initial={{ price: offer.original?.pricePerUnit ?? offer.pricePerUnit, quantity: offer.original?.quantity ?? offer.quantity, createdAt: offer.createdAt }}
        />
      </div>

      {isTransferPending ? (
        <div className="mt-4 rounded-lg p-3 text-center text-xs"
          style={{ background: "color-mix(in oklab, var(--gold) 15%, transparent)", color: "var(--gold)" }}>
          ⏳ Havale bildirildi — üretici onayı bekleniyor
        </div>
      ) : isPendingPayment ? (
        <div className="mt-4">
          <button onClick={onPay} className="w-full rounded-lg py-2.5 text-sm font-medium text-white"
            style={{ background: "var(--saffron)" }}>
            💳 Ödemeyi Tamamla
          </button>
        </div>
      ) : myTurn ? (
        <div className="mt-4 flex flex-col gap-2 sm:grid sm:grid-cols-3">
          <button onClick={onAccept} disabled={pending} className="rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--sage)" }}>
            ✅ Kabul Et
          </button>
          <button onClick={onCounter} disabled={pending} className="rounded-lg border border-saffron py-2.5 text-sm font-medium text-saffron hover:bg-saffron/5 disabled:opacity-50">
            💬 Karşı Teklif
          </button>
          <button onClick={onReject} disabled={pending} className="rounded-lg border border-hred/40 py-2.5 text-sm font-medium text-hred hover:bg-hred/5 disabled:opacity-50">
            ❌ Reddet
          </button>
        </div>
      ) : (
        <WaitingBanner offer={offer} viewer="buyer" />
      )}
    </div>
  );
}
