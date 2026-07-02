import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useBuyerOffers, useSimulatePayment, useMarkTransferSent } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/pay/$offerId")({
  head: () => ({ meta: [{ title: "Ödeme — Hasat" }] }),
  component: PayPage,
});

function formatIbanDisplay(iban: string): string {
  try {
    const c = iban.replace(/\s+/g, "").toUpperCase();
    return c.replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return iban ?? "";
  }
}

function PayPage() {
  const { offerId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const { data: offers, isPending, isError, error, refetch } = useBuyerOffers();
  const pay = useSimulatePayment();
  const markTransfer = useMarkTransferSent();
  const [copied, setCopied] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isPending) return;
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [isPending]);

  if (isError || timedOut) {
    return (
      <div className="p-8 text-center text-hmuted space-y-3">
        <div>Sayfa yüklenemedi.</div>
        {error instanceof Error && (
          <div className="text-xs opacity-70">{error.message}</div>
        )}
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => router.history.back()}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Geri
          </button>
          <button
            onClick={() => { setTimedOut(false); refetch(); }}
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ background: "var(--saffron)" }}
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (isPending || !offers) return <div className="p-8"><LoadingDots /></div>;
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

  const qty = offer.currentQuantity ?? offer.quantity;
  const price = offer.currentPrice ?? offer.pricePerUnit;
  const total = qty * price;
  const fee = Math.round(total * 0.025);
  const grand = total + fee;
  const hasIban = !!offer.farmerIban;
  const isTransferPending = offer.paymentStatus === "pending_transfer";

  const copyIban = async () => {
    if (!offer.farmerIban) return;
    try {
      await navigator.clipboard.writeText(offer.farmerIban.replace(/\s+/g, "").toUpperCase());
      setCopied(true);
      toast.success("IBAN kopyalandı");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  const markSent = async () => {
    try {
      await markTransfer.mutateAsync(offer.id);
      toast.success("Havale bildirildi. Üretici onayı bekleniyor.");
      setTimeout(() => {
        navigate({ to: "/buyer/orders", search: { tab: "offers" } });
      }, 1500);
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };

  const completeTest = async () => {
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
          <div className="text-xs text-hmuted mt-1">{qty} {offer.unit} × {formatTRY(price)}</div>
          <div className="mt-3 border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Ara Toplam</span><span className="font-mono">{formatTRY(total)}</span></div>
            <div className="flex justify-between text-hmuted"><span>Hasat komisyonu (%2.5)</span><span className="font-mono">{formatTRY(fee)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2"><span className="font-medium">Genel Toplam</span><span className="font-mono text-lg" style={{ color: "var(--gold)" }}>{formatTRY(grand)}</span></div>
          </div>
        </div>

        {/* Primary: Havale */}
        <div className="rounded-2xl bg-card border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">Havale ile Ödeme</div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "color-mix(in oklab, var(--gold) 22%, transparent)", color: "var(--gold)" }}>
              Manuel Onay
            </span>
          </div>

          {!hasIban ? (
            <div className="mt-3 rounded-lg border border-hred/40 bg-hred/5 p-3 text-xs text-hred">
              Üretici henüz IBAN bilgisi eklememiş. Lütfen üretici ile iletişime geçin.
            </div>
          ) : (
            <>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <div className="text-xs text-hmuted">Hesap Sahibi</div>
                  <div className="font-medium">{offer.farmerBankAccountName ?? offer.buyerName}</div>
                </div>
                <div>
                  <div className="text-xs text-hmuted">IBAN</div>
                  <div className="mt-1 flex items-center gap-2 rounded-lg bg-muted/50 p-2.5">
                    <span className="flex-1 truncate font-mono text-xs sm:text-sm">{formatIbanDisplay(offer.farmerIban!)}</span>
                    <button onClick={copyIban} className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-background" aria-label="IBAN kopyala">
                      {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-hmuted">Havale Tutarı</div>
                  <div className="font-mono text-lg font-semibold" style={{ color: "var(--gold)" }}>{formatTRY(grand)}</div>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-muted/40 p-3 text-[11px] text-hmuted">
                Havaleyi tamamladıktan sonra aşağıdaki butona basın. Üretici ödemeyi onayladığında siparişiniz aktif olur.
              </div>

              <button
                onClick={markSent}
                disabled={markTransfer.isPending || isTransferPending}
                className="mt-3 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
              >
                {isTransferPending
                  ? "✓ Havale bildirildi — üretici onayı bekleniyor"
                  : markTransfer.isPending
                    ? "Bildiriliyor…"
                    : "Ödemeyi Havale Ettim"}
              </button>
            </>
          )}
        </div>

        {/* Secondary: Test simulate */}
        <div className="rounded-2xl border border-dashed p-4">
          <div className="text-[11px] text-hmuted mb-2">QA / test amaçlı — anında ödeme simüle eder.</div>
          <button
            onClick={completeTest}
            disabled={pay.isPending}
            className="w-full rounded-lg border py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {pay.isPending ? "İşleniyor…" : `Ödemeyi Tamamla (Test) — ${formatTRY(grand)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
