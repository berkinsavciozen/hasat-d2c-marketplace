import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Phone, PackageCheck, AlertTriangle, Star } from "lucide-react";
import { useState } from "react";
import { OrderTimeline } from "@/components/hasat/OrderTimeline";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { ReviewModal, RatingStars } from "@/components/hasat/ReviewModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatTRY, formatCrop, formatQuantity } from "@/lib/hasat/format";
import {
  useBuyerOrders,
  useOrderTimeline,
  useConfirmDelivery,
  useOpenDispute,
  useOrderDispute,
  useOrderReviews,
  useCreateReview,
  useOrderOfferId,
} from "@/lib/hasat/queries";
import { OfferBatchBreakdown } from "@/components/hasat/OfferBatchBreakdown";

import { useAuthUserId } from "@/lib/hasat/queries";
import { whatsappUrl } from "@/lib/hasat/whatsapp";
import { LifecycleBadge, type LifecycleTone } from "@/components/hasat/LifecycleBadge";
import type { OrderStatus } from "@/lib/hasat/types";

const ORDER_STATUS: Record<OrderStatus, { label: string; tone: LifecycleTone }> = {
  sent: { label: "Teklif gönderildi", tone: "info" },
  accepted: { label: "Kabul edildi", tone: "success" },
  preparing: { label: "Hazırlanıyor", tone: "info" },
  shipped: { label: "Kargoda", tone: "info" },
  delivered: { label: "Teslim edildi", tone: "success" },
  completed: { label: "Tamamlandı", tone: "success" },
  disputed: { label: "İhtilaflı", tone: "danger" },
  cancelled: { label: "İptal edildi", tone: "neutral" },
};

export const Route = createFileRoute("/buyer/orders/$orderId")({
  head: () => ({ meta: [{ title: "Sipariş — Hasat" }] }),
  component: OrderTracker,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Sipariş bulunamadı.</div>,
});

function OrderTracker() {
  const { orderId } = Route.useParams();
  const userId = useAuthUserId();
  const { data: orders = [], isLoading } = useBuyerOrders();
  const { data: timeline = [] } = useOrderTimeline(orderId);
  const { data: dispute } = useOrderDispute(orderId);
  const { data: reviews = [] } = useOrderReviews(orderId);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const confirmDelivery = useConfirmDelivery();
  const openDispute = useOpenDispute();
  const createReview = useCreateReview();

  if (isLoading)
    return (
      <div className="p-8">
        <LoadingDots />
      </div>
    );
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw notFound();

  const orderWithTimeline = { ...order, timeline };

  const windowOpen = !order.disputeWindowExpiresAt
    ? order.status === "delivered"
    : new Date(order.disputeWindowExpiresAt).getTime() > Date.now();
  const canConfirmDelivery = order.status === "shipped";
  const canOpenDispute = (order.status === "shipped" || order.status === "delivered") && windowOpen;
  const canReview = order.status === "delivered" || order.status === "completed";
  const myReview = reviews.find((r) => r.reviewerId === userId && r.reviewerRole === "buyer");

  const onConfirmDelivery = async () => {
    try {
      await confirmDelivery.mutateAsync({ orderId: order.id, photoFile });
      toast.success("Teslim alındı olarak işaretlendi. 24 saat itiraz pencereniz var.");
      setDeliverOpen(false);
      setPhotoFile(null);
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };
  const onOpenDispute = async () => {
    try {
      await openDispute.mutateAsync({
        orderId: order.id,
        reason: disputeReason,
        photoFiles: disputeFiles,
      });
      toast.success("İhtilaf açıldı. Hasat ekibi inceleyecek.");
      setDisputeOpen(false);
      setDisputeReason("");
      setDisputeFiles([]);
    } catch (e: any) {
      toast.error(e.message ?? "İşlem başarısız");
    }
  };

  return (
    <div>
      <div
        className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3"
        style={{ background: "var(--dark)", color: "var(--hwhite)" }}
      >
        <Link
          to="/buyer/orders"
          aria-label="Geri"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-xl">Sipariş Takibi</h1>
          <div className="truncate text-xs opacity-60 tabular-nums">{order.code}</div>
        </div>
        <LifecycleBadge tone={ORDER_STATUS[order.status].tone}>
          {ORDER_STATUS[order.status].label}
        </LifecycleBadge>
      </div>

      <div className="p-4 md:p-8 space-y-5 max-w-2xl">
        <div className="rounded-2xl bg-card border p-4">
          <div className="font-medium">
            {formatCrop(order.crop)} — {order.producerName}
          </div>
          <div className="text-xs text-hmuted mt-1">
            {formatQuantity(order.quantity, order.unit)} {order.unit} · {order.delivery}
          </div>
          {order.status === "shipped" && order.trackingNumber && (
            <div className="mt-2 rounded-lg bg-muted/40 p-2.5 text-xs">
              📦 <span className="text-hmuted">{order.carrier ?? "Kargo"}:</span>{" "}
              <span className="font-mono font-medium">{order.trackingNumber}</span>
            </div>
          )}
          {order.status === "cancelled" && (
            <div
              className="mt-2 rounded-lg p-2.5 text-xs"
              style={{
                background: "color-mix(in oklab, var(--hred) 12%, transparent)",
                color: "var(--hred)",
              }}
            >
              Sipariş iptal edildi{order.cancelReason ? `: ${order.cancelReason}` : "."}
            </div>
          )}
          {order.status === "disputed" && dispute && (
            <div
              className="mt-2 rounded-lg p-2.5 text-xs"
              style={{
                background: "color-mix(in oklab, var(--hred) 12%, transparent)",
                color: "var(--hred)",
              }}
            >
              ⚠️ İhtilaf açık: {dispute.reason}
            </div>
          )}
          <div className="mt-3 flex items-baseline justify-between border-t pt-3">
            <span className="text-xs text-hmuted">Toplam</span>
            <span className="text-lg font-semibold tabular-nums">{formatTRY(order.total)}</span>
          </div>
        </div>

        <div className="rounded-2xl bg-card border p-5">
          <h2 className="font-serif text-lg mb-4">Durum</h2>
          <OrderTimeline order={orderWithTimeline} />
        </div>

        <OrderOfferBreakdown orderId={order.id} />

        {canReview && (
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-sm font-medium mb-1">Üreticiyi Değerlendir</div>
            {myReview ? (
              <div className="flex items-center gap-2 text-sm">
                <RatingStars rating={myReview.rating} size={18} />
                <span className="text-hmuted">Değerlendirdiniz ✓ {myReview.rating}/5</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-hmuted mb-2">
                  Bu sipariş için üreticiyi puanlayın — diğer alıcılara yardımcı olur.
                </p>
                <button
                  onClick={() => setReviewOpen(true)}
                  className="rounded-xl min-h-[48px] px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2"
                  style={{ background: "var(--gold)", color: "var(--dark)" }}
                >
                  <Star className="h-4 w-4" /> Değerlendir
                </button>
              </>
            )}
          </div>
        )}

        {(order.status === "delivered" || order.status === "completed") &&
          order.listingId &&
          (order.listingActive ? (
            <Link
              to="/buyer/offer/$listingId"
              params={{ listingId: order.listingId }}
              search={{ qty: order.quantity }}
              className="rounded-xl min-h-[48px] px-4 py-3 text-sm font-medium border-2 flex items-center justify-center gap-2"
              style={{ borderColor: "var(--saffron)", color: "var(--saffron)" }}
            >
              Tekrar Sipariş Ver
            </Link>
          ) : (
            <div className="rounded-xl border border-dashed p-3 text-center text-xs text-hmuted">
              Bu ürün artık satışta değil — üreticinin diğer ilanlarına göz atın.
            </div>
          ))}

        {(canConfirmDelivery || canOpenDispute) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {canConfirmDelivery && (
              <button
                onClick={() => setDeliverOpen(true)}
                className="rounded-xl min-h-[48px] px-4 py-3 text-sm font-medium text-white flex items-center justify-center gap-2"
                style={{ background: "var(--sage)" }}
              >
                <PackageCheck className="h-4 w-4" /> Teslim Aldım
              </button>
            )}
            {canOpenDispute && (
              <button
                onClick={() => setDisputeOpen(true)}
                className="rounded-xl min-h-[48px] px-4 py-3 text-sm font-medium border-2 flex items-center justify-center gap-2"
                style={{ borderColor: "var(--hred)", color: "var(--hred)" }}
              >
                <AlertTriangle className="h-4 w-4" /> İhtilaf Aç
              </button>
            )}
          </div>
        )}

        {(() => {
          const wa = whatsappUrl(
            order.producerPhone,
            `Merhaba, ${order.code} numaralı sipariş hakkında bilgi almak istiyorum.`,
          );
          const tel = order.producerPhone ? `tel:${order.producerPhone}` : null;
          if (!wa && !tel) return null;
          return (
            <div className="grid gap-2 sm:grid-cols-2">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl min-h-[48px] px-4 py-3 text-sm font-medium text-white flex items-center justify-center gap-2"
                  style={{ background: "var(--whatsapp)" }}
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp'tan sor
                </a>
              )}
              {tel && (
                <a
                  href={tel}
                  className="rounded-xl min-h-[48px] px-4 py-3 text-sm font-medium border flex items-center justify-center gap-2"
                  style={{ borderColor: "var(--border)", color: "var(--dark)" }}
                >
                  <Phone className="h-4 w-4" /> Ara
                </a>
              )}
            </div>
          );
        })()}
      </div>

      {/* Confirm delivery modal */}
      <Dialog
        open={deliverOpen}
        onOpenChange={(open) => !confirmDelivery.isPending && setDeliverOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teslim Aldım</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-hmuted">
            Siparişi teslim aldığınızı onaylıyorsunuz. Onay sonrası <b>24 saat</b> içinde ihtilaf
            açabilirsiniz. Bir teslim fotoğrafı eklemek isterseniz aşağıya yükleyin (opsiyonel).
          </p>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirmDelivery.isPending}
              onClick={() => setDeliverOpen(false)}
            >
              Vazgeç
            </Button>
            <Button
              onClick={onConfirmDelivery}
              loading={confirmDelivery.isPending}
              loadingLabel="Teslimat onaylanıyor"
              style={{ background: "var(--sage)", color: "var(--hwhite)" }}
            >
              Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute modal */}
      <Dialog
        open={disputeOpen}
        onOpenChange={(open) => !openDispute.isPending && setDisputeOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>İhtilaf Aç</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-hmuted">
            Siparişle ilgili yaşadığınız sorunu açıklayın. Kanıt fotoğrafı ekleyebilirsiniz.
          </p>
          <label htmlFor="dispute-reason" className="text-sm font-medium">
            Sorun açıklaması
          </label>
          <Textarea
            id="dispute-reason"
            rows={4}
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Örn: Ürün hasarlı geldi, miktar eksik..."
          />
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setDisputeFiles(Array.from(e.target.files ?? []))}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={openDispute.isPending}
              onClick={() => setDisputeOpen(false)}
            >
              Vazgeç
            </Button>
            <Button
              onClick={onOpenDispute}
              disabled={!disputeReason.trim()}
              loading={openDispute.isPending}
              loadingLabel="İhtilaf açılıyor"
              variant="destructive"
            >
              İhtilaf Aç
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReviewModal
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="Üreticiyi Değerlendir"
        subtitle={`${order.producerName} — ${formatCrop(order.crop)}`}
        pending={createReview.isPending}
        onSubmit={async ({ rating, comment }) => {
          try {
            await createReview.mutateAsync({
              orderId: order.id,
              revieweeId: order.producerId,
              reviewerRole: "buyer",
              rating,
              comment,
            });
            toast.success("Değerlendirmeniz için teşekkürler.");
            setReviewOpen(false);
          } catch (e: any) {
            toast.error(e.message ?? "Gönderilemedi");
          }
        }}
      />
    </div>
  );
}

function OrderOfferBreakdown({ orderId }: { orderId: string }) {
  const { data: offerId } = useOrderOfferId(orderId);
  if (!offerId) return null;
  return <OfferBatchBreakdown offerId={offerId} />;
}
