import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useState } from "react";
import { OrderTimeline } from "@/components/hasat/OrderTimeline";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatTRY } from "@/lib/hasat/format";
import { useBuyerOrders, useOrderTimeline } from "@/lib/hasat/queries";

export const Route = createFileRoute("/buyer/orders/$orderId")({
  head: () => ({ meta: [{ title: "Sipariş — Hasat" }] }),
  component: OrderTracker,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Sipariş bulunamadı.</div>,
});

function OrderTracker() {
  const { orderId } = Route.useParams();
  const { data: orders = [], isLoading } = useBuyerOrders();
  const { data: timeline = [] } = useOrderTimeline(orderId);
  const [chatOpen, setChatOpen] = useState(false);

  if (isLoading) return <div className="p-8"><LoadingDots /></div>;
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw notFound();

  const orderWithTimeline = { ...order, timeline };

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <Link to="/buyer/orders" className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-serif text-xl">Sipariş Takibi</h1>
          <div className="font-mono text-xs opacity-60">{order.code}</div>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-5 max-w-2xl">
        <div className="rounded-2xl bg-card border p-4">
          <div className="font-medium">{order.crop} — {order.producerName}</div>
          <div className="text-xs text-hmuted mt-1">{order.quantity} {order.unit} · {order.delivery}</div>
          <div className="mt-3 flex items-baseline justify-between border-t pt-3">
            <span className="text-xs text-hmuted">Toplam</span>
            <span className="font-mono text-lg" style={{ color: "var(--gold)" }}>{formatTRY(order.total)}</span>
          </div>
        </div>

        <div className="rounded-2xl bg-card border p-5">
          <h2 className="font-serif text-lg mb-4">Durum</h2>
          <OrderTimeline order={orderWithTimeline} />
        </div>

        <button onClick={() => setChatOpen(true)}
          className="w-full rounded-xl py-3 text-sm font-medium border-2 flex items-center justify-center gap-2"
          style={{ borderColor: "var(--saffron)", color: "var(--saffron)" }}>
          <MessageCircle className="h-4 w-4" /> Satıcıyla Konuş
        </button>
      </div>

      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{order.producerName}</SheetTitle></SheetHeader>
          <div className="py-12 text-center text-hmuted">
            <MessageCircle className="h-10 w-10 mx-auto opacity-40 mb-3" />
            Mesajlaşma yakında...
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
