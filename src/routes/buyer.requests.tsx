import { createFileRoute, Link } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { useMyCropRequests } from "@/lib/hasat/queries";
import { formatTRY } from "@/lib/hasat/format";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/buyer/requests")({
  head: () => ({ meta: [{ title: "Taleplerim — Hasat" }] }),
  component: MyRequests,
});

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  open: { label: "Açık", bg: "var(--saffron)", color: "#fff" },
  matched: { label: "Eşleşti", bg: "var(--gold)", color: "var(--dark)" },
  closed: { label: "Kapandı", bg: "var(--muted)", color: "var(--hmuted)" },
};

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  } catch { return d; }
}

function MyRequests() {
  const { data: requests = [], isLoading } = useMyCropRequests();

  return (
    <>
      <BuyerHeader title="Taleplerim">
        <Link to="/buyer/account" aria-label="Geri" className="inline-flex items-center gap-1 text-xs text-hwhite/70 hover:text-hwhite mt-2">
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
            const dateRange = start && end ? `${start} – ${end}` : start ?? end ?? null;
            return (
              <div key={r.id} className="rounded-2xl bg-card border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-serif text-base truncate">🌾 {r.cropName}</div>
                    <div className="text-[11px] text-hmuted mt-0.5">{fmtDate(r.createdAt)}</div>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {r.quantity != null && (
                    <div>
                      <div className="text-hmuted">Miktar</div>
                      <div className="font-medium">{r.quantity} {r.unit ?? ""}</div>
                    </div>
                  )}
                  {r.region && (
                    <div>
                      <div className="text-hmuted">Bölge</div>
                      <div className="font-medium">{r.region}</div>
                    </div>
                  )}
                  {dateRange && (
                    <div>
                      <div className="text-hmuted">Hedef tarih</div>
                      <div className="font-medium">{dateRange}</div>
                    </div>
                  )}
                  {r.targetPrice != null && (
                    <div>
                      <div className="text-hmuted">Hedef fiyat</div>
                      <div className="font-medium" style={{ color: "var(--saffron)", fontFamily: "Courier New, monospace" }}>
                        {formatTRY(r.targetPrice)}{r.unit ? `/${r.unit}` : ""}
                      </div>
                    </div>
                  )}
                </div>

                {r.note && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs text-hmuted">
                    {r.note}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
