import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { useFarmerOffers, useUpdateOfferStatus, useFarmerOrders } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { OrderChip } from "@/components/hasat/OrderChip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { Offer, BuyerType, Order } from "@/lib/hasat/types";
import { NegotiationTimeline } from "@/components/hasat/NegotiationTimeline";

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
  const updateStatus = useUpdateOfferStatus();
  const navigate = useNavigate();

  const incoming = offers.filter((o) => o.status === "pending" || o.status === "counter");
  const activeOrders = orders.filter((o) => o.status !== "delivered");
  const completedOffers = offers.filter((o) => o.status === "completed" || o.status === "rejected");
  const completedOrders = orders.filter((o) => o.status === "delivered");

  const accept = async (o: Offer) => {
    try {
      await updateStatus.mutateAsync({ id: o.id, status: "accepted" });
      toast.success(`${o.buyerName} teklifi kabul edildi · Sipariş oluşturuldu`);
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };
  const counter = (o: Offer) => navigate({ to: "/farmer/orders/$offerId/counter", params: { offerId: o.id } });

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
              <OfferCard key={o.id} offer={o} onAccept={() => accept(o)} onCounter={() => counter(o)} actions />
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
                {completedOffers.map((o) => <OfferCard key={o.id} offer={o} muted />)}
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

function OfferCard({ offer, actions, muted, onAccept, onCounter }: { offer: Offer; actions?: boolean; muted?: boolean; onAccept?: () => void; onCounter?: () => void }) {
  const total = offer.quantity * offer.pricePerUnit;
  return (
    <div className={`rounded-2xl border bg-card p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{offer.buyerName}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-hmuted">
              {BUYER_TYPE_EMOJI[offer.buyerType]} {BUYER_TYPE_LABEL[offer.buyerType]}
            </span>
          </div>
          <div className="mt-1 text-sm text-hmuted">{offer.crop} · {offer.quantity} {offer.unit}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-lg font-semibold">{formatTRY(total)}</span>
            <span className="text-xs text-hmuted">({formatTRY(offer.pricePerUnit)}/{offer.unit})</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <OrderChip status={offer.status} />
          <span className="text-[10px] text-hmuted">{timeAgo(offer.createdAt)}</span>
        </div>
      </div>
      {actions && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onAccept} className="rounded-lg py-2.5 text-sm font-medium text-white" style={{ background: "var(--sage)" }}>Kabul Et</button>
          <button onClick={onCounter} className="rounded-lg border border-saffron py-2.5 text-sm font-medium text-saffron hover:bg-saffron/5">Müzakere Et</button>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, muted }: { order: Order; muted?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-card p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-mono text-xs text-hmuted">{order.code}</div>
          <div className="mt-1 font-medium">{order.producerName}</div>
          <div className="text-xs text-hmuted">{order.crop} · {order.quantity} {order.unit}</div>
          <div className="mt-1.5 font-mono text-lg font-semibold">{formatTRY(order.total)}</div>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-muted">{order.status}</span>
      </div>
    </div>
  );
}
