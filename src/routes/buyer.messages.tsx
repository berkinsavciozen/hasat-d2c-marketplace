import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { useBuyerConversations } from "@/lib/hasat/queries";
import { formatCrop } from "@/lib/hasat/format";
import { MessageCircle, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { LifecycleBadge, type LifecycleTone } from "@/components/hasat/LifecycleBadge";

export const Route = createFileRoute("/buyer/messages")({
  head: () => ({ meta: [{ title: "Görüşmeler | Hasat" }] }),
  component: Messages,
});

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} gün`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

const STATUS_LABEL: Record<string, { label: string; tone: LifecycleTone }> = {
  pending: { label: "Aktif görüşme", tone: "info" },
  counter: { label: "Aktif görüşme", tone: "info" },
  accepted: { label: "Kabul", tone: "success" },
  rejected: { label: "Red", tone: "danger" },
};

function Messages() {
  const navigate = useNavigate();
  const { data: convos = [], isLoading } = useBuyerConversations();

  return (
    <div className="min-w-0 overflow-x-hidden">
      <BuyerHeader
        title="Görüşmeler"
        subtitle="Mesajlar gelen kutunuz; işlemler Siparişlerim'de."
      />
      <div className="w-full min-w-0 max-w-3xl space-y-2 p-4 md:w-[calc(100vw-230px)] md:p-8">
        {isLoading ? (
          <LoadingDots />
        ) : convos.length === 0 ? (
          <div className="min-w-0 break-words rounded-2xl border border-dashed p-6 text-center text-hmuted sm:p-10">
            <MessageCircle className="mx-auto h-8 w-8 mb-3 opacity-40" />
            <div className="mb-4">
              Henüz görüşme yok. Keşfet'ten bir üreticiye teklif göndererek başlayın.
            </div>
            <Link
              to="/buyer/discover"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Search className="h-4 w-4" /> Keşfet'e Git
            </Link>
          </div>
        ) : (
          convos.map((c) => {
            const s = STATUS_LABEL[c.status] ?? {
              label: c.status,
              tone: "neutral" as const,
            };
            const yourTurn =
              c.ballSide === "buyer" && (c.status === "pending" || c.status === "counter");
            return (
              <button
                key={c.offerId}
                onClick={() =>
                  navigate({ to: "/buyer/negotiation/$offerId", params: { offerId: c.offerId } })
                }
                className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: "var(--cream)",
                  borderColor: yourTurn ? "var(--saffron)" : "var(--border)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-dark truncate">{c.farmerName}</span>
                      {yourTurn && (
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: "var(--saffron)" }}
                        />
                      )}
                    </div>
                    <div className="text-xs text-hmuted truncate">
                      {formatCrop(c.crop)}
                      {c.farmerCity ? ` · ${c.farmerCity}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-hmuted whitespace-nowrap">
                      {timeAgo(c.lastMessageAt ?? c.createdAt)}
                    </span>
                    <LifecycleBadge tone={s.tone}>{s.label}</LifecycleBadge>
                  </div>
                </div>
                {c.lastMessagePreview && (
                  <div className="mt-2 text-xs text-hmuted line-clamp-1">
                    {c.lastSenderRole === "buyer" ? "Siz: " : ""}
                    {c.lastMessagePreview}
                  </div>
                )}
                {yourTurn && (
                  <LifecycleBadge tone="action" className="mt-2">
                    Sıra sizde
                  </LifecycleBadge>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
