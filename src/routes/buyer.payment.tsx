import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";
import { useCreateMultiBatchOffer, useCreateOffer } from "@/lib/hasat/queries";

export const Route = createFileRoute("/buyer/payment")({
  head: () => ({ meta: [{ title: "Teklifi İncele — Hasat" }] }),
  component: Payment,
});

function Payment() {
  const navigate = useNavigate();
  const pending = useHasat((s) => s.pendingOffer);
  const setPendingOffer = useHasat((s) => s.setPendingOffer);
  const createOffer = useCreateOffer();
  const createMultiOffer = useCreateMultiBatchOffer();
  const [success, setSuccess] = useState<{ ref: string } | null>(null);
  const [card, setCard] = useState({ num: "", exp: "", cvv: "", name: "" });

  if (!pending && !success) {
    return (
      <div className="p-8 text-center text-hmuted">
        İncelenecek aktif teklif bulunamadı.
        <button
          onClick={() => navigate({ to: "/buyer/discover" })}
          className="mx-auto mt-4 block text-primary underline"
        >
          Keşfet'e dön
        </button>
      </div>
    );
  }

  const fee = pending ? Math.round(pending.total * 0.025) : 0;
  const grand = pending ? pending.total + fee : 0;
  const isPending = createOffer.isPending || createMultiOffer.isPending;
  const batchItems = pending?.items?.length ? pending.items : null;

  const complete = async () => {
    if (!pending) return;
    try {
      if (pending.items && pending.items.length > 0) {
        await createMultiOffer.mutateAsync({
          farmerId: pending.producerId,
          items: pending.items.map((i) => ({
            listingId: i.listingId,
            quantity: i.quantity,
            pricePerUnit: i.pricePerUnit,
          })),
          delivery: pending.delivery,
          deliveryDate: pending.deliveryDate,
          note: pending.notes,
          subscriptionId: pending.subscriptionId ?? null,
        });
      } else {
        await createOffer.mutateAsync({
          farmerId: pending.producerId,
          listingId: pending.listingId,
          quantity: pending.quantity,
          pricePerUnit: pending.pricePerUnit,
          delivery: pending.delivery,
          deliveryDate: pending.deliveryDate,
          note: pending.notes,
          subscriptionId: pending.subscriptionId ?? null,
        });
      }
      const ref = `HT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      setPendingOffer(null);
      setSuccess({ ref });
      toast.success("Teklifiniz gönderildi");
    } catch (e: any) {
      toast.error(e.message ?? "Teklif gönderilemedi");
    }
  };

  if (success) {
    return (
      <div className="grid min-h-[70vh] place-items-center p-6">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-sage" />
          <h1 className="font-serif text-3xl">Teklif Gönderildi!</h1>
          <div className="mt-4 inline-block rounded-full bg-muted px-4 py-1.5 text-sm font-semibold tabular-nums">
            {success.ref}
          </div>
          <p className="mt-6 text-sm text-hmuted">
            Henüz ödeme alınmadı. Üretici teklifinizi inceleyecek; kabul ederse gerçek ödeme adımı
            Siparişlerim'de açılacak.
          </p>
          <button
            onClick={() => navigate({ to: "/buyer/orders" })}
            className="mt-8 min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
          >
            Tekliflerimi Gör →
          </button>
        </div>
      </div>
    );
  }

  const fieldClass = "h-12 rounded-xl focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div>
      <div
        className="px-4 pt-5 pb-4 md:px-8"
        style={{ background: "var(--dark)", color: "var(--hwhite)" }}
      >
        <div className="text-xs text-white/70">2 / 3 · İnceleme ve gönderim</div>
        <h1 className="font-serif text-2xl">Teklifi İncele ve Gönder</h1>
      </div>
      <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
        <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Bu aşamada ödeme alınmaz.</strong> Aşağıda seçtiğiniz yöntem ve girdiğiniz kart
            bilgileri teklifinizle gönderilmez ve kaydedilmez. Gerçek ödeme adımı yalnızca üretici
            teklifinizi kabul ettikten sonra açılır.
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="text-xs text-hmuted">Teklif Özeti</div>
          <div className="mt-2 font-medium">
            {formatCrop(pending!.crop)} — {pending!.producerName}
          </div>
          {batchItems ? (
            <div className="mt-1 text-xs text-hmuted">{batchItems.length} parti</div>
          ) : (
            <div className="mt-1 text-xs tabular-nums text-hmuted">
              {pending!.quantity} {pending!.unit} × {formatTRY(pending!.pricePerUnit)}
            </div>
          )}
          {batchItems && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <div className="text-xs font-medium text-foreground">Parti dökümü</div>
              {batchItems.map((item, index) => (
                <div
                  key={`${item.listingId}-${index}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-xl bg-muted/40 p-3 text-xs"
                >
                  <span className="min-w-0 font-medium">Parti {index + 1}</span>
                  <span className="text-right font-semibold tabular-nums">
                    {formatTRY(item.quantity * item.pricePerUnit)}
                  </span>
                  <span className="min-w-0 break-words tabular-nums text-hmuted">
                    {item.quantity} {item.unit} × {formatTRY(item.pricePerUnit)}/{item.unit}
                  </span>
                  <span className="self-end text-right text-[11px] text-hmuted">Ara toplam</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <span>Ara Toplam</span>
              <span className="font-medium tabular-nums">{formatTRY(pending!.total)}</span>
            </div>
            <div className="flex justify-between gap-3 text-hmuted">
              <span>Hasat komisyonu (%2.5)</span>
              <span className="tabular-nums">{formatTRY(fee)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t pt-2">
              <span className="font-medium">Kabul edilirse toplam</span>
              <span className="text-lg font-bold tabular-nums text-primary">
                {formatTRY(grand)}
              </span>
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Ödeme yöntemi önizlemesi</div>
          <p className="mb-2 text-xs text-hmuted">
            Bu seçim ve girdiğiniz bilgiler yalnızca bu ekranda kalır; gönderilmez veya kaydedilmez.
          </p>
          <Tabs defaultValue="card">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="card">Kredi Kartı</TabsTrigger>
              <TabsTrigger value="bank">Banka Havalesi</TabsTrigger>
            </TabsList>
            <TabsContent value="card" className="mt-4 space-y-3">
              <div className="rounded-xl bg-muted/40 p-3 text-xs text-hmuted">
                Kart bilgileri bu aşamada işlenmez, kaydedilmez ve üreticiyle paylaşılmaz.
              </div>
              <div>
                <label className="text-xs text-hmuted">Kart Numarası</label>
                <Input
                  className={fieldClass}
                  value={card.num}
                  onChange={(e) =>
                    setCard({
                      ...card,
                      num: e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 16)
                        .replace(/(\d{4})/g, "$1 ")
                        .trim(),
                    })
                  }
                  placeholder="4242 4242 4242 4242"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-hmuted">Son Kullanma</label>
                  <Input
                    className={fieldClass}
                    value={card.exp}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setCard({
                        ...card,
                        exp: v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v,
                      });
                    }}
                    placeholder="AA/YY"
                  />
                </div>
                <div>
                  <label className="text-xs text-hmuted">CVV</label>
                  <Input
                    className={fieldClass}
                    value={card.cvv}
                    onChange={(e) =>
                      setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) })
                    }
                    placeholder="123"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-hmuted">Kart Sahibi</label>
                <Input
                  className={fieldClass}
                  value={card.name}
                  onChange={(e) => setCard({ ...card, name: e.target.value })}
                  placeholder="AYŞE DEMİR"
                />
              </div>
            </TabsContent>
            <TabsContent value="bank" className="mt-4 rounded-xl border bg-card p-4 text-sm">
              <div className="text-xs text-hmuted">Ödeme yöntemi</div>
              <div>Banka havalesi</div>
              <div className="mt-3 text-xs text-hmuted">
                Bu tercih teklifinizle gönderilmez veya kaydedilmez. IBAN ve transfer bilgileri,
                teklif üretici tarafından kabul edildikten sonra gerçek ödeme ekranında gösterilir.
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <button
          onClick={complete}
          disabled={isPending}
          className="min-h-12 w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Teklif gönderiliyor…" : "Teklifi Gönder"}
        </button>
        <p className="text-center text-xs text-hmuted">
          Gönderimden sonra üretici onayı beklenecek. Şimdi tahsilat yapılmaz.
        </p>
      </div>
    </div>
  );
}
