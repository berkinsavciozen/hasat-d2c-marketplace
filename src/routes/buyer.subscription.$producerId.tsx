import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Stepper } from "@/components/hasat/Stepper";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatTRY } from "@/lib/hasat/format";
import { useHasat } from "@/lib/hasat/store";

export const Route = createFileRoute("/buyer/subscription/$producerId")({
  head: () => ({ meta: [{ title: "Hasat Aboneliği — Hasat" }] }),
  component: SubscriptionPage,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Üretici bulunamadı.</div>,
});

function SubscriptionPage() {
  const { producerId } = Route.useParams();
  const navigate = useNavigate();
  const producer = useHasat((s) => s.producers.find((p) => p.id === producerId));
  const addSubscription = useHasat((s) => s.addSubscription);
  const [volume, setVolume] = useState(50);
  const [locked, setLocked] = useState(true);
  const [open, setOpen] = useState(false);

  if (!producer) throw notFound();
  const nh = producer.nextHarvest;
  const total = volume * nh.pricePerUnit;
  const savings = locked ? Math.round(total * 0.15) : 0;

  const create = () => {
    addSubscription({
      producerId, producerName: producer.name, crop: producer.crops[0],
      volume, unit: nh.unit, priceLocked: locked, pricePerUnit: nh.pricePerUnit,
      nextHarvest: nh.date, total, createdAt: new Date().toISOString(),
    });
    setOpen(true);
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <Link to="/buyer/producer/$id" params={{ id: producerId }} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-xl">Hasat Aboneliği</h1>
      </div>

      <div className="p-4 md:p-8 max-w-2xl space-y-5">
        <div className="rounded-2xl bg-card border p-4">
          <div className="text-xs text-hmuted">Bu Üreticiyi Abone Ol</div>
          <div className="font-serif text-lg mt-1">{producer.name}</div>
          <div className="text-xs text-hmuted mt-0.5">📍 {producer.city}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Sonraki Hasat</div>
            <div className="font-serif text-lg mt-1">{nh.date}</div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Tahmini Miktar</div>
            <div className="font-serif text-lg mt-1">{nh.estimatedQty}</div>
          </div>
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block">Hacim Taahhüdü</label>
          <Stepper value={volume} onChange={setVolume} step={10} min={10} unit={nh.unit} />
        </div>

        <div className="rounded-2xl p-4 border flex items-start gap-3"
          style={{ background: locked ? "color-mix(in oklab, var(--sage) 14%, transparent)" : "var(--card)", borderColor: locked ? "var(--sage)" : "var(--border)" }}>
          <div className="flex-1">
            <div className="text-sm font-medium">Bugünkü fiyatı kilitle</div>
            <div className="text-xs text-hmuted mt-0.5">{formatTRY(nh.pricePerUnit)}/{nh.unit}</div>
            {locked && <div className="text-xs mt-1" style={{ color: "var(--sage)" }}>Tahmini tasarruf: {formatTRY(savings)}</div>}
          </div>
          <Switch checked={locked} onCheckedChange={setLocked} />
        </div>

        <div className="rounded-xl p-3 text-xs" style={{ background: "color-mix(in oklab, var(--lav) 14%, transparent)", color: "var(--lav)" }}>
          ℹ️ Ödeme hasattan 2 hafta önce alınır (escrow).
        </div>

        <div className="rounded-2xl p-4" style={{ background: "color-mix(in oklab, var(--gold) 14%, transparent)" }}>
          <div className="text-xs text-hmuted">Toplam Taahhüt</div>
          <div className="font-mono text-2xl mt-1" style={{ color: "var(--gold)" }}>{formatTRY(total)}</div>
        </div>

        <button onClick={create}
          className="w-full rounded-xl py-3.5 text-sm font-medium"
          style={{ background: "var(--gold)", color: "var(--dark)" }}>
          Abonelik Oluştur →
        </button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) navigate({ to: "/buyer/discover" }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">🌾 Abonelik Aktif!</DialogTitle>
            <DialogDescription className="text-center pt-2">
              {producer.name} ile {nh.date} hasadı için aboneliğiniz oluşturuldu. Hasattan 2 hafta önce sizi bilgilendireceğiz.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
