import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { formatTRY } from "@/lib/hasat/format";
import { OrderChip } from "@/components/hasat/OrderChip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { Offer, BuyerType } from "@/lib/hasat/types";

export const Route = createFileRoute("/farmer/orders")({
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
  const offers = useHasat((s) => s.offers);
  const updateOffer = useHasat((s) => s.updateOffer);
  const addOrder = useHasat((s) => s.addOrder);
  const producers = useHasat((s) => s.producers);
  const navigate = useNavigate();

  const incoming = offers.filter((o) => o.status === "pending" || o.status === "counter");
  const activeList = offers.filter((o) => o.status === "accepted" || o.status === "active");
  const done = offers.filter((o) => o.status === "completed" || o.status === "rejected");

  const accept = (o: Offer) => {
    updateOffer(o.id, { status: "accepted" });
    const code = `HT-2028-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const all: { key: import("@/lib/hasat/types").OrderStatus; label: string }[] = [
      { key: "sent", label: "Teklif Gönderildi" },
      { key: "accepted", label: "Kabul Edildi" },
      { key: "preparing", label: "Hazırlanıyor" },
      { key: "shipped", label: "Kargoya Verildi" },
      { key: "delivered", label: "Teslim Edildi" },
    ];
    const now = new Date();
    const timeline = all.map((s, i) => ({ ...s, doneAt: i <= 2 ? new Date(now.getTime() - (2 - i) * 3600 * 1000).toISOString() : undefined }));
    const producer = producers[0];
    addOrder({
      code, producerId: producer?.id ?? "pr1", producerName: o.buyerName, crop: o.crop,
      quantity: o.quantity, unit: o.unit, pricePerUnit: o.pricePerUnit, total: o.quantity * o.pricePerUnit,
      delivery: o.delivery ?? "Kargo", deliveryDate: o.deliveryDate ?? "", status: "preparing",
      createdAt: now.toISOString(), timeline,
    });
    toast.success(`${o.buyerName} teklifi kabul edildi · Sipariş oluşturuldu`);
  };
  const counter = (o: Offer) => navigate({ to: "/farmer/orders/$offerId/counter", params: { offerId: o.id } });

  return (
    <>
      <FarmerHeader title="Siparişler" subtitle="Teklifler ve aktif siparişler" />
      <div className="px-4 md:px-8 py-5">
        <Tabs defaultValue="incoming">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="incoming">Gelen ({incoming.length})</TabsTrigger>
            <TabsTrigger value="active">Aktif ({activeList.length})</TabsTrigger>
            <TabsTrigger value="done">Tamamlanan</TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="mt-4 space-y-3">
            {incoming.length === 0 ? <Empty msg="Bekleyen teklif yok." /> : incoming.map((o) => (
              <OfferCard key={o.id} offer={o} onAccept={() => accept(o)} onCounter={() => counter(o)} actions />
            ))}
          </TabsContent>
          <TabsContent value="active" className="mt-4 space-y-3">
            {activeList.length === 0 ? <Empty msg="Aktif sipariş yok." /> : activeList.map((o) => <OfferCard key={o.id} offer={o} />)}
          </TabsContent>
          <TabsContent value="done" className="mt-4 space-y-3">
            {done.length === 0 ? <Empty msg="Tamamlanmış sipariş yok." /> : done.map((o) => <OfferCard key={o.id} offer={o} muted />)}
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
