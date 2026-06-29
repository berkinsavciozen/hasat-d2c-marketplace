import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useBuyerOffers, useSimulatePayment } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/pay/$offerId")({
  head: () => ({ meta: [{ title: "Ödeme — Hasat" }] }),
  component: PayPage,
});

function PayPage() {
  const { offerId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const { data: offers, isPending, isFetching } = useBuyerOffers();
  const pay = useSimulatePayment();

  if (isPending || isFetching || !offers) return <div className="p-8"><LoadingDots /></div>;
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) {
    return (
      <div className="p-8 text-center text-hmuted">
        Teklif bulunamadı.
        <button onClick={() => navigate({ to: "/buyer/orders", search: { tab: "offers" } })} className="block mt-4 mx-auto text-saffron underline">Siparişlerime dön</button>
      </div>
    );
  }
  if (offer.status !== "accepted" || offer.paymentStatus === "paid") {
    return (
      <div className="p-8 text-center text-hmuted">
        Bu teklif şu anda ödemeye uygun değil.
        <button onClick={() => navigate({ to: "/buyer/orders", search: { tab: "offers" } })} className="block mt-4 mx-auto text-saffron underline">Siparişlerime dön</button>
      </div>
    );
  }

  const total = offer.quantity * offer.pricePerUnit;
  const fee = Math.round(total * 0.025);
  const grand = total + fee;

  const complete = async () => {
    try {
      await pay.mutateAsync(offer.id);
      toast.success("Ödeme alındı. Sipariş aktif.");
      navigate({ to: "/buyer/orders", search: { tab: "active" } });
    } catch (e: any) {
      toast.error(e.message ?? "Ödeme başarısız");
    }
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <button onClick={() => router.history.back()} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-serif text-2xl">Ödeme</h1>
      </div>

      <div className="p-4 md:p-8 max-w-2xl space-y-5">
        <div className="rounded-2xl bg-card border p-4">
          <div className="text-xs text-hmuted">Sipariş Özeti</div>
          <div className="mt-2 font-medium">{offer.crop} — {offer.buyerName}</div>
          <div className="text-xs text-hmuted mt-1">{offer.quantity} {offer.unit} × {formatTRY(offer.pricePerUnit)}</div>
          <div className="mt-3 border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Ara Toplam</span><span className="font-mono">{formatTRY(total)}</span></div>
            <div className="flex justify-between text-hmuted"><span>Hasat komisyonu (%2.5)</span><span className="font-mono">{formatTRY(fee)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2"><span className="font-medium">Genel Toplam</span><span className="font-mono text-lg" style={{ color: "var(--gold)" }}>{formatTRY(grand)}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed p-4 text-center text-xs text-hmuted">
          💳 Demo ödeme — gerçek tahsilat yapılmaz. Onayladığınızda sipariş otomatik aktif olur.
        </div>

        <button onClick={complete} disabled={pay.isPending} className="w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>
          {pay.isPending ? "İşleniyor…" : `Ödemeyi Tamamla — ${formatTRY(grand)}`}
        </button>
      </div>
    </div>
  );
}
