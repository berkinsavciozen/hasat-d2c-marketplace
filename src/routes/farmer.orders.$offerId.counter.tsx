import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { useFarmerOffers, useCounterOffer } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { Stepper } from "@/components/hasat/Stepper";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { NegotiationTimeline } from "@/components/hasat/NegotiationTimeline";

export const Route = createFileRoute("/farmer/orders/$offerId/counter")({
  head: () => ({ meta: [{ title: "Karşı Teklif — Hasat" }] }),
  component: Counter,
  notFoundComponent: () => (
    <div className="p-8 text-center text-hmuted">Teklif bulunamadı.</div>
  ),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-hmuted">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-3 rounded bg-saffron px-3 py-1.5 text-sm text-white">Tekrar dene</button>
      </div>
    );
  },
});

const DELIVERY_OPTS = [
  { v: "Üreticiden Teslim", l: "🚪 Kapıda Teslim" },
  { v: "Kargo", l: "📦 Kargo" },
  { v: "Kargo (Alıcı Öder)", l: "🚚 Alıcı Alır" },
] as const;

function Counter() {
  const { offerId } = Route.useParams();
  const navigate = useNavigate();
  const { data: offers, isLoading } = useFarmerOffers();
  const counterMut = useCounterOffer();

  // Wait for both auth + query to settle. While userId is null the query is
  // disabled (isLoading=false, data=undefined); only treat as "not found"
  // once we actually have the offers list.
  if (isLoading || offers === undefined) return <div className="p-8"><LoadingDots /></div>;
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) throw notFound();


  return <CounterForm offer={offer} navigate={navigate} submit={async (patch) => {
    try {
      await counterMut.mutateAsync({
        id: offer.id,
        patch,
        by: "farmer",
        original: { quantity: offer.quantity, pricePerUnit: offer.pricePerUnit, delivery: offer.delivery, deliveryDate: offer.deliveryDate, note: offer.note },
      });
      toast.success("Karşı teklif gönderildi");
      navigate({ to: "/farmer/orders" });
    } catch (e: any) {
      toast.error(e.message ?? "Gönderilemedi");
    }
  }} pending={counterMut.isPending} />;
}

function CounterForm({ offer, navigate, submit, pending }: { offer: any; navigate: any; submit: (p: any) => void; pending: boolean }) {
  const [qty, setQty] = useState(offer.quantity);
  const [price, setPrice] = useState(offer.pricePerUnit);
  const [delivery, setDelivery] = useState<string>(DELIVERY_OPTS[1].v);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  const total = qty * price;
  const originalTotal = offer.quantity * offer.pricePerUnit;

  return (
    <>
      <FarmerHeader title="Karşı Teklif" subtitle={offer.buyerName}>
        <button onClick={() => navigate({ to: "/farmer/orders" })} className="mt-3 flex items-center gap-1 text-xs text-hwhite/70">
          <ArrowLeft className="h-3.5 w-3.5" /> Siparişlere dön
        </button>
      </FarmerHeader>

      <div className="px-4 md:px-8 py-5 space-y-4 max-w-2xl">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-hmuted">
            {offer.crop} · Müzakere geçmişi
          </div>
          <NegotiationTimeline offer={offer} viewer="farmer" />
        </div>


        <div>
          <div className="mb-1.5 text-xs font-medium text-hmuted">Önerilen miktar ({offer.unit})</div>
          <Stepper value={qty} onChange={setQty} step={offer.unit === "g" ? 5 : 1} unit={offer.unit} />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-hmuted">Önerilen fiyat (₺/{offer.unit})</div>
          <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="font-mono text-lg" />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-hmuted">Teslim şekli</div>
          <div className="grid grid-cols-3 gap-2">
            {DELIVERY_OPTS.map(({ v, l }) => (
              <button key={v} type="button" onClick={() => setDelivery(v)}
                className={`rounded-xl border py-2.5 text-xs font-medium ${delivery === v ? "bg-saffron text-white border-saffron" : "border-input text-hmuted"}`}>
                {l}
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
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Alıcıya iletmek istediğiniz not..." />
        </div>

        <div className="rounded-2xl bg-saffron/10 border border-saffron/30 p-4">
          <div className="text-xs font-medium text-hmuted">Yeni toplam</div>
          <div className="font-mono text-2xl font-bold text-saffron">{formatTRY(total)}</div>
          <div className="text-[11px] text-hmuted">{qty} {offer.unit} × {formatTRY(price)}/{offer.unit}</div>
        </div>

        <button onClick={() => submit({ quantity: qty, pricePerUnit: price, delivery, deliveryDate: date, note })} disabled={pending} className="w-full rounded-xl bg-saffron py-3 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Gönderiliyor…" : "Karşı Teklif Gönder"}
        </button>
      </div>
    </>
  );
}
