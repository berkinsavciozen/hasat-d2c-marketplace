import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatTRY } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";
import type { Order } from "@/lib/hasat/types";

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
  const orders = useHasat((s) => s.orders);
  const [tab, setTab] = useState("active");
  const active = orders.filter((o) => o.status !== "delivered");
  const done = orders.filter((o) => o.status === "delivered");

  const render = (list: Order[]) =>
    list.length === 0 ? (
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

  return (
    <>
      <BuyerHeader title="Siparişlerim" />
      <div className="p-4 md:p-8 max-w-3xl">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="active">Aktif ({active.length})</TabsTrigger>
            <TabsTrigger value="done">Tamamlanan ({done.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">{render(active)}</TabsContent>
          <TabsContent value="done" className="mt-4">{render(done)}</TabsContent>
        </Tabs>
      </div>
    </>
  );
}
