import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, XCircle, Pause, Play, Save } from "lucide-react";
import { FarmerHeader } from "./farmer";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import {
  useIncomingSubscriptions,
  useRespondToSubscription,
  useUpdateSubscriptionSchedule,
  useSubscriptionFulfillment,
} from "@/lib/hasat/queries";
import { formatCrop, formatTRY } from "@/lib/hasat/format";

export const Route = createFileRoute("/farmer/subscriptions")({
  head: () => ({
    meta: [
      { title: "Abonelikler | Hasat" },
      { name: "description", content: "Alıcı abonelik taleplerini yönetin, hasat tarihini ve tahmini rekolteyi güncelleyin." },
    ],
  }),
  component: FarmerSubscriptions,
});

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Onay bekliyor", bg: "color-mix(in oklab, var(--lav) 22%, transparent)", fg: "var(--lav)" },
  active: { label: "Aktif", bg: "var(--saffron)", fg: "#fff" },
  paused: { label: "Duraklatıldı", bg: "color-mix(in oklab, var(--gold) 22%, transparent)", fg: "var(--gold)" },
  fulfilled: { label: "Tamamlandı", bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  cancelled: { label: "İptal", bg: "color-mix(in oklab, var(--hmuted) 18%, transparent)", fg: "var(--hmuted)" },
};

function FulfillmentBar({ id, target }: { id: string; target: number | null }) {
  const { data } = useSubscriptionFulfillment(id);
  if (!target || !data) return null;
  const pct = Math.min(100, Math.round((data.deliveredQty / target) * 100));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px] text-hmuted uppercase tracking-wider mb-1">
        <span>Teslim edildi</span>
        <span>{data.deliveredQty.toFixed(0)} / {target} · {pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: "var(--saffron)" }} />
      </div>
    </div>
  );
}

function ScheduleForm({ id, initialDate, initialQty }: { id: string; initialDate: string | null; initialQty: number | null }) {
  const update = useUpdateSubscriptionSchedule();
  const [date, setDate] = useState(initialDate ?? "");
  const [qty, setQty] = useState<string>(initialQty != null ? String(initialQty) : "");
  const submit = async () => {
    try {
      await update.mutateAsync({
        id,
        nextHarvestDate: date || null,
        estimatedQty: qty === "" ? null : Number(qty),
      });
      toast.success("Program güncellendi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-hmuted">Sonraki Hasat</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2.5 py-2 text-sm min-h-[40px]"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-hmuted">Tahmini Rekolte (kg)</label>
        <input
          type="number"
          min={0}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2.5 py-2 text-sm min-h-[40px]"
        />
      </div>
      <button
        onClick={submit}
        disabled={update.isPending}
        className="mt-5 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium min-h-[40px]"
        style={{ background: "var(--sage)", color: "#fff" }}
      >
        <Save className="h-3.5 w-3.5" /> {update.isPending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </div>
  );
}

function FarmerSubscriptions() {
  const { data: subs = [], isLoading } = useIncomingSubscriptions();
  const respond = useRespondToSubscription();

  const act = async (id: string, status: "active" | "cancelled" | "paused") => {
    try {
      await respond.mutateAsync({ id, status });
      toast.success(
        status === "active" ? "Abonelik onaylandı" :
        status === "cancelled" ? "Abonelik iptal edildi" :
        "Abonelik duraklatıldı"
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const pending = subs.filter((s) => s.status === "pending");
  const active = subs.filter((s) => s.status === "active" || s.status === "paused");
  const closed = subs.filter((s) => s.status === "cancelled" || s.status === "fulfilled");

  return (
    <>
      <FarmerHeader title="Abonelikler" subtitle="Alıcı talepleri ve rezerve hasat programı" />
      <div className="p-4 md:p-8 max-w-3xl space-y-6">
        {isLoading ? (
          <LoadingDots />
        ) : subs.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            <CalendarClock className="mx-auto h-8 w-8 mb-3 opacity-40" />
            <div className="font-medium text-dark">Henüz abonelik talebi yok</div>
            <div className="text-sm mt-1">Alıcılar sizi vitrinden bulup abone olabilir.</div>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <Section title={`Onay bekleyen (${pending.length})`}>
                {pending.map((s) => (
                  <Card key={s.id} sub={s}>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => act(s.id, "active")}
                        disabled={respond.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium min-h-[40px]"
                        style={{ background: "var(--sage)", color: "#fff" }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Onayla
                      </button>
                      <button
                        onClick={() => act(s.id, "cancelled")}
                        disabled={respond.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium min-h-[40px] border"
                        style={{ borderColor: "var(--hred)", color: "var(--hred)" }}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reddet
                      </button>
                    </div>
                  </Card>
                ))}
              </Section>
            )}

            {active.length > 0 && (
              <Section title={`Aktif (${active.length})`}>
                {active.map((s) => (
                  <Card key={s.id} sub={s}>
                    <FulfillmentBar id={s.id} target={s.volumeCommitment} />
                    <ScheduleForm id={s.id} initialDate={s.nextHarvestDate} initialQty={s.estimatedQty} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {s.status === "active" ? (
                        <button
                          onClick={() => act(s.id, "paused")}
                          disabled={respond.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium min-h-[40px] border"
                          style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
                        >
                          <Pause className="h-3.5 w-3.5" /> Duraklat
                        </button>
                      ) : (
                        <button
                          onClick={() => act(s.id, "active")}
                          disabled={respond.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium min-h-[40px]"
                          style={{ background: "var(--sage)", color: "#fff" }}
                        >
                          <Play className="h-3.5 w-3.5" /> Devam Et
                        </button>
                      )}
                      <button
                        onClick={() => act(s.id, "cancelled")}
                        disabled={respond.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium min-h-[40px] border"
                        style={{ borderColor: "var(--hred)", color: "var(--hred)" }}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Sonlandır
                      </button>
                    </div>
                  </Card>
                ))}
              </Section>
            )}

            {closed.length > 0 && (
              <Section title={`Geçmiş (${closed.length})`}>
                {closed.map((s) => (
                  <Card key={s.id} sub={s} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-hmuted">{title}</h2>
      {children}
    </section>
  );
}

type SubCard = ReturnType<typeof useIncomingSubscriptions>["data"] extends (infer T)[] | undefined ? T : never;

function Card({ sub, children }: { sub: SubCard; children?: React.ReactNode }) {
  const meta = STATUS_META[sub.status] ?? STATUS_META.cancelled;
  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--cream)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-dark truncate">{sub.buyerName ?? "Alıcı"}</div>
          <div className="text-xs text-hmuted">
            {sub.buyerCity ?? ""}
            {sub.buyerCity ? " · " : ""}
            {sub.crop ? `${formatCrop(sub.crop)}` : ""}
            {sub.volumeCommitment != null ? ` · ${sub.volumeCommitment} kg/ay` : ""}
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap"
          style={{ background: meta.bg, color: meta.fg }}
        >
          {meta.label}
        </span>
      </div>

      {sub.note && (
        <div className="mt-2 rounded-lg border border-dashed p-2 text-xs text-hmuted">“{sub.note}”</div>
      )}

      {sub.priceLock && sub.lockedPrice != null && (
        <div className="mt-2 text-[11px] text-hmuted">
          🔒 Sabit fiyat talebi: <span className="font-mono" style={{ color: "var(--gold)" }}>{formatTRY(sub.lockedPrice)}</span>
        </div>
      )}

      {children}
    </div>
  );
}
