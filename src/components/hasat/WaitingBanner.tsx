import { useOfferMessages, useWithdrawCounter, useAuthUserId } from "@/lib/hasat/queries";
import { toast } from "sonner";
import type { Offer, BallSide } from "@/lib/hasat/types";

interface Props {
  offer: Offer;
  viewer: BallSide;
}

const WAITING_TEXT: Record<BallSide, string> = {
  farmer: "Karşı teklifiniz iletildi, alıcı yanıtı bekleniyor.",
  buyer: "Yanıtınız iletildi, çiftçi yanıtı bekleniyor.",
};

export function WaitingBanner({ offer, viewer }: Props) {
  const userId = useAuthUserId();
  const { data: messages = [] } = useOfferMessages(offer.id);
  const withdraw = useWithdrawCounter();

  const last = messages[messages.length - 1];
  const canWithdraw = !!last && last.senderId === userId && offer.status !== "accepted" && offer.status !== "rejected";

  const onWithdraw = async () => {
    try {
      await withdraw.mutateAsync(offer.id);
      toast.success("Karşı teklif geri çekildi");
    } catch (e: any) {
      toast.error(e.message ?? "Geri çekilemedi");
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-hmuted">
      <div>{WAITING_TEXT[viewer]}</div>
      {canWithdraw && (
        <button
          onClick={onWithdraw}
          disabled={withdraw.isPending}
          className="mt-2 rounded-md border border-hmuted/40 px-3 py-1.5 text-[11px] font-medium text-hwhite hover:bg-white/5 disabled:opacity-50"
        >
          {withdraw.isPending ? "Geri çekiliyor…" : "↩︎ Karşı Teklifi Geri Çek"}
        </button>
      )}
    </div>
  );
}
