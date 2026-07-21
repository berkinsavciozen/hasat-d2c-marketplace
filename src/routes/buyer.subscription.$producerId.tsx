import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Stepper } from "@/components/hasat/Stepper";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import {
  useFarmerPublicProfile,
  useFarmerActiveListings,
  useParcelsByFarmer,
  useCreateSubscription,
} from "@/lib/hasat/queries";
import { useCropConfigMap, findCropConfig } from "@/lib/hasat/crop-config";

export const Route = createFileRoute("/buyer/subscription/$producerId")({
  head: () => ({ meta: [{ title: "Hasat Aboneliği — Hasat" }] }),
  component: SubscriptionPage,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Üretici bulunamadı.</div>,
});

const MONTH_NAMES_TR = [
  "", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
function monthLabel(m: number | null | undefined): string | null {
  if (!m || m < 1 || m > 12) return null;
  return MONTH_NAMES_TR[m];
}

function SubscriptionPage() {
  const { producerId } = Route.useParams();
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useFarmerPublicProfile(producerId);
  const { data: listings = [] } = useFarmerActiveListings(producerId);
  const { data: parcels = [] } = useParcelsByFarmer(producerId);
  const { map: cropMap } = useCropConfigMap();
  const createSub = useCreateSubscription();

  const [volume, setVolume] = useState(50);
  const [locked, setLocked] = useState(true);
  const [open, setOpen] = useState(false);

  if (profileLoading) return <div className="p-8"><LoadingDots /></div>;
  if (!profile) throw notFound();

  // Primary crop: most-common across parcels (fallback to first active listing's crop)
  const cropCounts = new Map<string, number>();
  for (const p of parcels) for (const c of p.crops ?? []) cropCounts.set(c, (cropCounts.get(c) ?? 0) + 1);
  let primaryCrop: string | null = null;
  let maxCount = 0;
  for (const [c, n] of cropCounts) if (n > maxCount) { maxCount = n; primaryCrop = c; }
  if (!primaryCrop && listings.length > 0) primaryCrop = listings[0].crop;

  // Reference listing: match primary crop, else first active listing
  const refListing =
    (primaryCrop && listings.find((l) => l.crop === primaryCrop)) ||
    listings[0] ||
    null;
  const referencePrice = refListing?.pricePerUnit ?? null;
  const unit = refListing?.unit ?? "";

  const cfg = primaryCrop ? findCropConfig(cropMap, primaryCrop) : null;
  const startMo = monthLabel(cfg?.harvest_window_start_month ?? null);
  const endMo = monthLabel(cfg?.harvest_window_end_month ?? null);
  const nextHarvestLabel = startMo && endMo ? `${startMo} – ${endMo}` : "—";

  const total = referencePrice != null ? volume * referencePrice : null;
  const savings = locked && total != null ? Math.round(total * 0.15) : 0;

  const create = async () => {
    if (referencePrice == null) {
      toast.error("Bu üreticinin aktif ürünü olmadığından abonelik oluşturulamaz.");
      return;
    }
    try {
      await createSub.mutateAsync({
        farmerId: producerId,
        volumeCommitment: volume,
        priceLock: locked,
        lockedPrice: locked ? referencePrice : null,
        nextHarvestDate: null,
        estimatedQty: null,
      });
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Abonelik oluşturulamadı");
    }
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
          <div className="font-serif text-lg mt-1">{profile.name ?? "Üretici"}</div>
          {profile.city && <div className="text-xs text-hmuted mt-0.5">📍 {profile.city}</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Sonraki Hasat</div>
            <div className="font-serif text-lg mt-1">{nextHarvestLabel}</div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Ürün</div>
            <div className="font-serif text-lg mt-1">{primaryCrop ?? "—"}</div>
          </div>
        </div>

        <div>
          <label className="text-xs text-hmuted mb-2 block">Hacim Taahhüdü</label>
          <Stepper value={volume} onChange={setVolume} step={10} min={10} unit={unit || "birim"} />
        </div>

        <div className="rounded-2xl p-4 border flex items-start gap-3"
          style={{ background: locked ? "color-mix(in oklab, var(--sage) 14%, transparent)" : "var(--card)", borderColor: locked ? "var(--sage)" : "var(--border)" }}>
          <div className="flex-1">
            <div className="text-sm font-medium">Bugünkü fiyatı kilitle</div>
            <div className="text-xs text-hmuted mt-0.5">
              {referencePrice != null ? `${formatTRY(referencePrice)}/${unit}` : "— fiyat referansı yok"}
            </div>
            {locked && total != null && (
              <div className="text-xs mt-1" style={{ color: "var(--sage)" }}>Tahmini tasarruf: {formatTRY(savings)}</div>
            )}
          </div>
          <Switch checked={locked} onCheckedChange={setLocked} disabled={referencePrice == null} />
        </div>

        <div className="rounded-xl p-3 text-xs" style={{ background: "color-mix(in oklab, var(--lav) 14%, transparent)", color: "var(--lav)" }}>
          ℹ️ Hasat yaklaştığında üreticiyle mevcut ödeme akışı (havale/kart) üzerinden iletişime geçilecek.
        </div>

        <div className="rounded-2xl p-4" style={{ background: "color-mix(in oklab, var(--gold) 14%, transparent)" }}>
          <div className="text-xs text-hmuted">Toplam Taahhüt</div>
          <div className="font-mono text-2xl mt-1" style={{ color: "var(--gold)" }}>
            {total != null ? formatTRY(total) : "—"}
          </div>
        </div>

        <button
          onClick={create}
          disabled={createSub.isPending || referencePrice == null}
          className="w-full rounded-xl py-3.5 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--gold)", color: "var(--dark)" }}>
          {createSub.isPending ? "Oluşturuluyor…" : "Abonelik Oluştur →"}
        </button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) navigate({ to: "/buyer/subscriptions" }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">🌾 Abonelik Aktif!</DialogTitle>
            <DialogDescription className="text-center pt-2">
              {profile.name ?? "Üretici"} ile {nextHarvestLabel} hasadı için aboneliğiniz oluşturuldu. Hasattan 2 hafta önce sizi bilgilendireceğiz.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
