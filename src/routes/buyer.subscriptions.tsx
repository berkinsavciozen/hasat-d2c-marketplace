import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { useMySubscriptions, useCancelSubscription, useFarmerActiveListings } from "@/lib/hasat/queries";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Sprout, Lock, ShieldCheck, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/buyer/subscriptions")({
  head: () => ({ meta: [{ title: "Sürekli Tedarik | Hasat" }] }),
  component: Subscriptions,
});

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  active: { label: "Aktif", bg: "var(--saffron)", fg: "#fff" },
  paused: { label: "Duraklatıldı", bg: "color-mix(in oklab, var(--gold) 22%, transparent)", fg: "var(--gold)" },
  completed: { label: "Tamamlandı", bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  cancelled: { label: "İptal", bg: "color-mix(in oklab, var(--hmuted) 18%, transparent)", fg: "var(--hmuted)" },
};

function daysUntil(iso: string | null): string | null {
  if (!iso) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  const d = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (d < 0) return `${Math.abs(d)} gün geçti`;
  if (d === 0) return "Bugün bekleniyor";
  if (d === 1) return "Yarın bekleniyor";
  if (d < 30) return `${d} gün sonra`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

function Subscriptions() {
  const { data: subs = [], isLoading } = useMySubscriptions();
  const cancel = useCancelSubscription();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [orderSub, setOrderSub] = useState<null | { subscriptionId: string; farmerId: string; farmerName: string | null; priceLock: boolean; lockedPrice: number | null; crop: string | null }>(null);
  const { data: farmerListings = [], isLoading: listingsLoading } = useFarmerActiveListings(orderSub?.farmerId ?? null);

  const onConfirmCancel = async () => {
    if (!pendingId) return;
    try {
      await cancel.mutateAsync(pendingId);
      toast.success("Abonelik iptal edildi");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <BuyerHeader title="Sürekli Tedarik" subtitle="Rezerve edilmiş hasat — üretici bu miktarı size ayırır." />
      <div className="p-4 md:p-8 max-w-3xl space-y-3">
        {isLoading ? (
          <LoadingDots />
        ) : subs.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            <Sprout className="mx-auto h-8 w-8 mb-3 opacity-40" />
            <div className="mb-1 font-medium text-dark">Henüz düzenli tedariğiniz yok</div>
            <div className="mb-4 text-sm">
              Restoranınız, oteliniz, marketiniz veya eviniz için üreticiden düzenli teslimat rezervasyonu oluşturun.
            </div>
            <Link to="/buyer/discover" className="inline-block rounded-full bg-saffron px-4 py-2 text-sm font-medium text-white">
              Üretici Bul
            </Link>
          </div>
        ) : (
          subs.map((s) => {
            const meta = STATUS_META[s.status] ?? STATUS_META.cancelled;
            const nextLabel = daysUntil(s.nextHarvestDate);
            const sinceDays = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000);
            return (
              <div
                key={s.id}
                className="rounded-2xl border p-4"
                style={{ background: "var(--cream)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-dark truncate">{s.farmerName ?? "Üretici"}</div>
                    <div className="text-xs text-hmuted">
                      {s.farmerCity ?? ""}
                      {s.farmerCity ? " · " : ""}
                      {sinceDays < 30 ? `${sinceDays} gündür` : `${Math.floor(sinceDays / 30)} aydır`} tedarikçiniz
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap"
                    style={{ background: meta.bg, color: meta.fg }}
                  >
                    {meta.label}
                  </span>
                </div>

                {nextLabel && s.status === "active" && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border p-2.5 text-xs"
                    style={{ borderColor: "color-mix(in oklab, var(--saffron) 30%, transparent)", background: "color-mix(in oklab, var(--saffron) 6%, transparent)" }}>
                    <CalendarDays className="h-3.5 w-3.5" style={{ color: "var(--saffron)" }} />
                    <span className="text-dark">
                      Sonraki hasat: <span className="font-medium">{nextLabel}</span>
                      {s.estimatedQty != null ? ` · ~${s.estimatedQty} kg` : ""}
                    </span>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {s.volumeCommitment != null && (
                    <div className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-1 text-hmuted text-[10px] uppercase tracking-wider">
                        <ShieldCheck className="h-3 w-3" /> Taahhüt
                      </div>
                      <div className="font-mono text-dark mt-0.5">{s.volumeCommitment} kg/ay</div>
                    </div>
                  )}
                  {s.priceLock && s.lockedPrice != null && (
                    <div className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-1 text-hmuted text-[10px] uppercase tracking-wider">
                        <Lock className="h-3 w-3" /> Sabit Fiyat
                      </div>
                      <div className="font-mono mt-0.5" style={{ color: "var(--gold)" }}>
                        {formatTRY(s.lockedPrice)}
                      </div>
                      {s.lockedAt && (
                        <div className="text-[10px] text-hmuted mt-0.5">
                          {new Date(s.lockedAt).toLocaleDateString("tr-TR")} tarihinden itibaren
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {s.status === "active" && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setOrderSub({ subscriptionId: s.id, farmerId: s.farmerId, farmerName: s.farmerName, priceLock: s.priceLock, lockedPrice: s.lockedPrice, crop: null })}
                      className="inline-flex items-center gap-1.5 rounded-lg min-h-[40px] px-3 py-2 text-xs font-medium"
                      style={{ background: "var(--saffron)", color: "#fff" }}
                    >
                      <ShoppingBag className="h-3.5 w-3.5" /> Şimdi Sipariş Ver
                    </button>
                    <button
                      onClick={() => setPendingId(s.id)}
                      className="text-xs font-medium text-hred hover:underline min-h-[40px] px-2"
                    >
                      İptal Et
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={!!orderSub} onOpenChange={(o) => !o && setOrderSub(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{orderSub?.farmerName ?? "Üretici"} — Aktif İlanlar</DialogTitle>
          </DialogHeader>
          {listingsLoading ? (
            <LoadingDots />
          ) : farmerListings.length === 0 ? (
            <div className="py-6 text-center text-sm text-hmuted">
              Şu an aktif ilan yok. Yeni hasat için üreticiyle iletişime geçebilirsiniz.
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {farmerListings.map((l) => {
                const useLock = !!(orderSub?.priceLock && orderSub?.lockedPrice);
                const searchArgs: { qty?: number; suggestedPrice?: number; subscriptionId?: string } = { qty: l.minOrder, subscriptionId: orderSub!.subscriptionId };
                if (useLock) searchArgs.suggestedPrice = orderSub!.lockedPrice!;
                return (
                  <Link
                    key={l.id}
                    to="/buyer/offer/$listingId"
                    params={{ listingId: l.id }}
                    search={searchArgs}
                    onClick={() => setOrderSub(null)}
                    className="block rounded-xl border p-3 hover:bg-muted/40"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-dark truncate">{formatCrop(l.crop)}</div>
                        <div className="text-[11px] text-hmuted">
                          Min. {l.minOrder} {l.unit} · Stok {l.quantity} {l.unit}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm" style={{ color: "var(--gold)" }}>
                          {formatTRY(l.pricePerUnit)}/{l.unit}
                        </div>
                        {useLock && (
                          <div className="text-[10px]" style={{ color: "var(--saffron)" }}>
                            🔒 Sabit {formatTRY(orderSub!.lockedPrice!)} önerilecek
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingId} onOpenChange={(o) => !o && setPendingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aboneliği iptal et</AlertDialogTitle>
            <AlertDialogDescription>
              Aboneliği iptal etmek istediğinizden emin misiniz? Üreticiye ayrılmış rezerv miktarı serbest kalır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmCancel} disabled={cancel.isPending}>
              {cancel.isPending ? "İptal ediliyor…" : "Evet, iptal et"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
