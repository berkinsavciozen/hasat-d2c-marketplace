import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { useBuyerConversations } from "@/lib/hasat/queries";
import { formatCrop } from "@/lib/hasat/format";
import { MessageCircle, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";

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

const STATUS_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Bekliyor", bg: "color-mix(in oklab, var(--saffron) 18%, transparent)", fg: "var(--saffron)" },
  counter: { label: "Karşı Teklif", bg: "color-mix(in oklab, var(--gold) 22%, transparent)", fg: "var(--gold)" },
  accepted: { label: "Kabul", bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  rejected: { label: "Red", bg: "color-mix(in oklab, var(--hred) 18%, transparent)", fg: "var(--hred)" },
};

function Messages() {
  const navigate = useNavigate();
  const { data: convos = [], isLoading } = useBuyerConversations();

  return (
    <>
      <BuyerHeader title="Görüşmeler" subtitle="Doğrudan üreticiyle — Hasat aracı değil, taraf değil." />
      <div className="p-4 md:p-8 max-w-3xl space-y-2">
        {isLoading ? (
          <LoadingDots />
        ) : convos.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            <MessageCircle className="mx-auto h-8 w-8 mb-3 opacity-40" />
            <div className="mb-4">Henüz görüşme yok. Keşfet'ten bir üreticiye teklif göndererek başlayın.</div>
            <Link to="/buyer/discover" className="inline-flex items-center gap-1.5 rounded-full bg-saffron px-4 py-2 text-sm font-medium text-white">
              <Search className="h-4 w-4" /> Keşfet'e Git
            </Link>
          </div>
        ) : (
          convos.map((c) => {
            const s = STATUS_LABEL[c.status] ?? { label: c.status, bg: "color-mix(in oklab, var(--hmuted) 18%, transparent)", fg: "var(--hmuted)" };
            const yourTurn = c.ballSide === "buyer" && (c.status === "pending" || c.status === "counter");
            return (
              <button
                key={c.offerId}
                onClick={() => navigate({ to: "/buyer/negotiation/$offerId", params: { offerId: c.offerId } })}
                className="w-full text-left rounded-2xl border p-4 hover:border-saffron transition"
                style={{ background: "var(--cream)", borderColor: yourTurn ? "var(--saffron)" : "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-dark truncate">{c.farmerName}</span>
                      {yourTurn && (
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--saffron)" }} />
                      )}
                    </div>
                    <div className="text-xs text-hmuted truncate">
                      {formatCrop(c.crop)}{c.farmerCity ? ` · ${c.farmerCity}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-hmuted whitespace-nowrap">
                      {timeAgo(c.lastMessageAt ?? c.createdAt)}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: s.bg, color: s.fg }}>
                      {s.label}
                    </span>
                  </div>
                </div>
                {c.lastMessagePreview && (
                  <div className="mt-2 text-xs text-hmuted line-clamp-1">
                    {c.lastSenderRole === "buyer" ? "Siz: " : ""}{c.lastMessagePreview}
                  </div>
                )}
                {yourTurn && (
                  <div className="mt-2 text-[11px] font-medium" style={{ color: "var(--saffron)" }}>
                    Sıra sizde
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
