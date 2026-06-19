import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { useMySubscriptions, useCancelSubscription } from "@/lib/hasat/queries";
import { formatTRY } from "@/lib/hasat/format";
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
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/subscriptions")({
  head: () => ({ meta: [{ title: "Aboneliklerim | Hasat" }] }),
  component: Subscriptions,
});

function Subscriptions() {
  const { data: subs = [], isLoading } = useMySubscriptions();
  const cancel = useCancelSubscription();
  const [pendingId, setPendingId] = useState<string | null>(null);

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
      <BuyerHeader title="Aboneliklerim" />
      <div className="p-4 md:p-8 max-w-3xl space-y-3">
        {isLoading ? (
          <LoadingDots />
        ) : subs.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            <div className="text-4xl mb-2">🌾</div>
            Henüz aboneliğiniz yok.
          </div>
        ) : (
          subs.map((s) => {
            const active = s.status === "active";
            return (
              <div
                key={s.id}
                className="rounded-2xl border p-4"
                style={{ background: "var(--cream)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-dark truncate">{s.farmerName ?? "—"}</div>
                    <div className="text-xs text-hmuted">{s.farmerCity ?? ""}</div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap"
                    style={{
                      background: active
                        ? "var(--saffron)"
                        : "color-mix(in oklab, var(--hmuted) 18%, transparent)",
                      color: active ? "#fff" : "var(--hmuted)",
                    }}
                  >
                    {active ? "Aktif" : "İptal"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {s.volumeCommitment != null && (
                    <div>
                      <div className="text-hmuted">Taahhüt</div>
                      <div className="font-mono text-dark">{s.volumeCommitment} kg/ay</div>
                    </div>
                  )}
                  {s.priceLock && s.lockedPrice != null && (
                    <div>
                      <div className="text-hmuted">Sabit Fiyat</div>
                      <div className="font-mono" style={{ color: "var(--gold)" }}>
                        {formatTRY(s.lockedPrice)}
                      </div>
                    </div>
                  )}
                </div>

                {active && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => setPendingId(s.id)}
                      className="text-xs font-medium text-hred hover:underline"
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

      <AlertDialog open={!!pendingId} onOpenChange={(o) => !o && setPendingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aboneliği iptal et</AlertDialogTitle>
            <AlertDialogDescription>
              Aboneliği iptal etmek istediğinizden emin misiniz?
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
