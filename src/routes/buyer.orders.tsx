import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatTRY } from "@/lib/hasat/format";
import { useBuyerOrders, useBuyerOffers, useUpdateOfferStatus } from "@/lib/hasat/queries";
import { toast } from "sonner";
import type { Order, Offer } from "@/lib/hasat/types";
import { NegotiationTimeline } from "@/components/hasat/NegotiationTimeline";

export const Route = createFileRoute("/buyer/orders")({
  head: () => ({ meta: [{ title: "Siparişlerim — Hasat" }] }),
  component: OrdersList,
});

const STATUS_LABEL: Record<Order["status"], { label: string; bg: string; fg: string }> = {
  sent: { label: "Teklif Gönderildi", bg: "color-mix(in oklab, var(--saffron) 18%, transparent)", fg: "var(--saffron)" },
  accepted: { label: "Kabul Edildi", bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  preparing: { label: "Hazırlanıyor", bg: "color-mix(in oklab, var(--gold) 22%, transparent)", fg: "var(--gold)" },
  shipped: { label: "Kargoda", bg: "color-mix(in oklab, var(--lav) 25%, transparent)", fg: "var(--lav)" },
  delivered: { label: "Teslim Edildi", bg: "color-mix(in oklab, var(--hmuted) 18%, transparent)", fg: "var(--hmuted)" },
};

function OrdersList() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading: ordersLoading } = useBuyerOrders();
  const { data: offers = [], isLoading: offersLoading } = useBuyerOffers();
  const updateStatus = useUpdateOfferStatus();
  const [tab, setTab] = useState("offers");

  const pendingOffers = offers.filter((o) => o.status === "pending" || o.status === "counter");
  const active = orders.filter((o) => o.status !== "delivered");
  const done = orders.filter((o) => o.status === "delivered");

  const accept = async (offer: Offer) => {
    try {
      await updateStatus.mutateAsync({ id: offer.id, status: "accepted" });
      toast.success("Teklif kabul edildi");
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };

  const renderOrders = (list: Order[]) =>
    ordersLoading ? (
      <LoadingDots />
    ) : list.length === 0 ? (
      <div className="rounded-2xl border border-dashed p-8 text-center text-hmuted">Henüz sipariş yok.</div>
    ) : (
      <div className="space-y-3">
        {list.map((o) => {
          const s = STATUS_LABEL[o.status];
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
            onCounter={() => navigate({ to: "/buyer/negotiation/$offerId", params: { offerId: o.id } })}
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
          <TabsContent value="active" className="mt-4">{renderOrders(active)}</TabsContent>
          <TabsContent value="done" className="mt-4">{renderOrders(done)}</TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function OfferCard({ offer, onAccept, onCounter, pending }: { offer: Offer; onAccept: () => void; onCounter: () => void; pending: boolean }) {
  const isCounter = offer.status === "counter";
  const total = offer.quantity * offer.pricePerUnit;
  return (
    <div className={`rounded-2xl border p-4 bg-card ${isCounter ? "border-saffron" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium">{offer.crop}</div>
          <div className="text-xs text-hmuted mt-0.5">{offer.quantity} {offer.unit} · {offer.buyerName}</div>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={
            isCounter
              ? { background: "color-mix(in oklab, var(--saffron) 18%, transparent)", color: "var(--saffron)" }
              : { background: "var(--muted)", color: "var(--hmuted)" }
          }
        >
          {isCounter ? "Karşı Teklif Geldi" : "Beklemede"}
        </span>
      </div>

      <div className="mt-3">
        <NegotiationTimeline offer={offer} viewer="buyer" compact />
      </div>


      {isCounter && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onAccept}
            disabled={pending}
            className="rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--sage)" }}
          >
            {pending ? "..." : "Kabul Et"}
          </button>
          <button
            onClick={onCounter}
            disabled={pending}
            className="rounded-lg border border-saffron py-2.5 text-sm font-medium text-saffron hover:bg-saffron/5 disabled:opacity-50"
          >
            Yeni Teklif Gönder
          </button>
        </div>
      )}
    </div>
  );
}
