import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { formatTRY } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";
import type { OrderStatus } from "@/lib/hasat/types";

export const Route = createFileRoute("/buyer/payment")({
  head: () => ({ meta: [{ title: "Ödeme — Hasat" }] }),
  component: Payment,
});

function Payment() {
  const navigate = useNavigate();
  const pending = useHasat((s) => s.pendingOffer);
  const addOrder = useHasat((s) => s.addOrder);
  const setPendingOffer = useHasat((s) => s.setPendingOffer);

  const [success, setSuccess] = useState<{ code: string; id: string } | null>(null);
  const [card, setCard] = useState({ num: "", exp: "", cvv: "", name: "" });

  if (!pending && !success) {
    return (
      <div className="p-8 text-center text-hmuted">
        Aktif sipariş bulunamadı.
        <button onClick={() => navigate({ to: "/buyer/discover" })} className="block mt-4 mx-auto text-saffron underline">Keşfet'e dön</button>
      </div>
    );
  }

  const fee = pending ? Math.round(pending.total * 0.025) : 0;
  const grand = pending ? pending.total + fee : 0;

  const complete = () => {
    if (!pending) return;
    const code = `HT-2028-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const status: OrderStatus = "accepted";
    const all: { key: OrderStatus; label: string }[] = [
      { key: "sent", label: "Teklif Gönderildi" },
      { key: "accepted", label: "Kabul Edildi" },
      { key: "preparing", label: "Hazırlanıyor" },
      { key: "shipped", label: "Kargoya Verildi" },
      { key: "delivered", label: "Teslim Edildi" },
    ];
    const now = new Date();
    const timeline = all.map((s, i) => ({ ...s, doneAt: i <= 1 ? new Date(now.getTime() - (1 - i) * 3600 * 1000).toISOString() : undefined }));
    const order = addOrder({
      code, producerId: pending.producerId, producerName: pending.producerName, crop: pending.crop,
      quantity: pending.quantity, unit: pending.unit, pricePerUnit: pending.pricePerUnit, total: grand,
      delivery: pending.delivery, deliveryDate: pending.deliveryDate, status, createdAt: now.toISOString(), timeline,
    });
    setPendingOffer(null);
    setSuccess({ code, id: order.id });
  };

  if (success) {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: "var(--sage)", color: "var(--hwhite)" }}>
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="font-serif text-3xl">Sipariş Oluşturuldu!</h1>
          <div className="mt-4 inline-block rounded-full bg-white/20 px-4 py-1.5 font-mono text-sm">{success.code}</div>
          <p className="mt-6 text-sm opacity-90">Üretici teklifinizi inceleyecek ve onaylar onaylamaz size bilgi vereceğiz.</p>
          <button onClick={() => navigate({ to: "/buyer/orders/$orderId", params: { orderId: success.id } })}
            className="mt-8 w-full rounded-xl bg-white py-3 text-sm font-medium" style={{ color: "var(--sage)" }}>
            Siparişi Takip Et →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:px-8" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <h1 className="font-serif text-2xl">Ödeme</h1>
      </div>

      <div className="p-4 md:p-8 max-w-2xl space-y-5">
        <div className="rounded-2xl bg-card border p-4">
          <div className="text-xs text-hmuted">Sipariş Özeti</div>
          <div className="mt-2 font-medium">{pending!.crop} — {pending!.producerName}</div>
          <div className="text-xs text-hmuted mt-1">{pending!.quantity} {pending!.unit} × {formatTRY(pending!.pricePerUnit)}</div>
          <div className="mt-3 border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Ara Toplam</span><span className="font-mono">{formatTRY(pending!.total)}</span></div>
            <div className="flex justify-between text-hmuted"><span>Hasat komisyonu (%2.5)</span><span className="font-mono">{formatTRY(fee)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2"><span className="font-medium">Genel Toplam</span><span className="font-mono text-lg" style={{ color: "var(--gold)" }}>{formatTRY(grand)}</span></div>
          </div>
        </div>

        <Tabs defaultValue="card">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="card">Kredi Kartı</TabsTrigger>
            <TabsTrigger value="bank">Banka Havalesi</TabsTrigger>
          </TabsList>
          <TabsContent value="card" className="space-y-3 mt-4">
            <div>
              <label className="text-xs text-hmuted">Kart Numarası</label>
              <Input value={card.num} onChange={(e) => setCard({ ...card, num: e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})/g, "$1 ").trim() })}
                placeholder="4242 4242 4242 4242" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-hmuted">Son Kullanma</label>
                <Input value={card.exp} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setCard({ ...card, exp: v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v }); }} placeholder="AA/YY" />
              </div>
              <div>
                <label className="text-xs text-hmuted">CVV</label>
                <Input value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="123" />
              </div>
            </div>
            <div>
              <label className="text-xs text-hmuted">Kart Sahibi</label>
              <Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="AYŞE DEMİR" />
            </div>
          </TabsContent>
          <TabsContent value="bank" className="mt-4 rounded-xl bg-card border p-4 text-sm">
            <div className="text-hmuted text-xs">Banka</div><div>Garanti BBVA</div>
            <div className="text-hmuted text-xs mt-2">IBAN</div><div className="font-mono">TR12 0006 2000 0000 0006 6666 66</div>
            <div className="text-hmuted text-xs mt-2">Referans Kodu</div><div className="font-mono">HASAT-{Math.floor(Math.random() * 9000 + 1000)}</div>
            <div className="text-xs text-hmuted mt-3">Havaleniz onaylanınca siparişiniz başlatılacak.</div>
          </TabsContent>
        </Tabs>

        <button onClick={complete} className="w-full rounded-xl py-3.5 text-sm font-medium"
          style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
          Ödemeyi Tamamla — {formatTRY(grand)}
        </button>
      </div>
    </div>
  );
}
