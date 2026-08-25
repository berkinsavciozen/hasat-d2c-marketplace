import { createFileRoute, Link } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { useMyCropRequests } from "@/lib/hasat/queries";
import { formatTRY, formatQuantity } from "@/lib/hasat/format";
import { ChevronLeft } from "lucide-react";
import { LifecycleBadge, type LifecycleTone } from "@/components/hasat/LifecycleBadge";

export const Route = createFileRoute("/buyer/requests")({
  head: () => ({ meta: [{ title: "Taleplerim — Hasat" }] }),
  component: MyRequests,
});

const STATUS_LABEL: Record<string, { label: string; tone: LifecycleTone }> = {
  open: { label: "Açık", tone: "info" },
  matched: { label: "Eşleşti", tone: "success" },
  closed: { label: "Kapandı", tone: "neutral" },
};

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function MyRequests() {
  const { data: requests = [], isLoading } = useMyCropRequests();

  return (
    <>
      <BuyerHeader title="Taleplerim">
        <Link
          to="/buyer/account"
          aria-label="Geri"
          className="inline-flex items-center gap-1 text-xs text-hwhite/70 hover:text-hwhite mt-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Hesap
        </Link>
      </BuyerHeader>

      <div className="p-4 md:p-8 max-w-2xl space-y-4">
        {isLoading ? (
          <LoadingDots />
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <div className="text-5xl mb-3">📝</div>
            <div className="font-serif text-lg">Henüz talep oluşturmadın</div>
            <div className="text-sm text-hmuted mt-2 max-w-sm mx-auto">
              Keşfet'te aradığın ürün yoksa "Bu ürünü talep et" butonu ile buraya ekleyebilirsin.
            </div>
            <Link
              to="/buyer/discover"
              className="mt-4 inline-flex items-center rounded-full px-4 py-2 text-xs font-medium min-h-[44px]"
              style={{ background: "var(--saffron)", color: "#fff" }}
            >
              Keşfet'e git
            </Link>
          </div>
        ) : (
          requests.map((r) => {
            const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.open;
            const start = fmtDate(r.targetDateStart);
            const end = fmtDate(r.targetDateEnd);
            const dateRange = start && end ? `${start} – ${end}` : (start ?? end ?? null);
            return (
              <article key={r.id} className="rounded-2xl bg-card border p-4">
                <div className="min-w-0 font-medium text-base break-words">{r.cropName}</div>

                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  {r.quantity != null && (
                    <div>
                      <div className="text-hmuted">Miktar</div>
                      <div className="font-medium">
                        {formatQuantity(r.quantity, r.unit)} {r.unit ?? ""}
                      </div>
                    </div>
                  )}
                  {r.region && (
                    <div>
                      <div className="text-hmuted">Bölge</div>
                      <div className="font-medium">{r.region}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-hmuted">Oluşturulma</div>
                    <div className="font-medium tabular-nums">{fmtDate(r.createdAt)}</div>
                  </div>
                  {dateRange && (
                    <div>
                      <div className="text-hmuted">Hedef tarih</div>
                      <div className="font-medium">{dateRange}</div>
                    </div>
                  )}
                  {r.targetPrice != null && (
                    <div>
                      <div className="text-hmuted">Hedef fiyat</div>
                      <div className="font-medium tabular-nums text-amber-700">
                        {formatTRY(r.targetPrice)}
                        {r.unit ? `/${r.unit}` : ""}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <LifecycleBadge tone={st.tone}>{st.label}</LifecycleBadge>
                </div>

                {r.note && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs text-hmuted">
                    {r.note}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
