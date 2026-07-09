import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FarmerHeader } from "./farmer";
import {
  usePriceFeedSummary,
  useCreatePriceFeedEntry,
  useProfile,
  useFarmerListings,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/farmer/prices")({
  head: () => ({ meta: [{ title: "Fiyat Takibi | Hasat" }] }),
  component: Prices,
});

const UNITS = ["kg", "g", "adet", "litre"] as const;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

function Prices() {
  const { data: profile } = useProfile();
  const { data: listings = [], isLoading: listingsLoading } = useFarmerListings();
  const [sheetOpen, setSheetOpen] = useState(false);
  const isFarmer = profile?.role === "farmer";

  const crops = useMemo(() => {
    const s = new Set<string>();
    for (const l of listings) if (l.crop) s.add(l.crop);
    return Array.from(s);
  }, [listings]);

  return (
    <>
      <FarmerHeader title="Fiyat Takibi" subtitle="Topluluk fiyat özeti" />
      <div className="px-4 md:px-8 py-5 pb-32 md:pb-5 space-y-3">
        <div className="rounded-xl border bg-muted/40 p-3 text-[11px] text-hmuted flex gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            Rekabet hukuku gereği bireysel fiyat kayıtları gösterilmez. Yalnızca
            son 30 güne ait ortalama ve piyasa aralığı görüntülenir. En az 5
            farklı üreticiden veri gelmediği ürünler için değerlendirme
            yapılmaz.
          </div>
        </div>

        {listingsLoading ? (
          <div className="py-12"><LoadingDots /></div>
        ) : crops.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <div className="mb-3 text-5xl">📊</div>
            <div className="mb-1 font-medium">Fiyat özeti için ürün ekleyin</div>
            <div className="text-xs text-hmuted">
              Vitrine ürün eklediğinizde piyasa aralığı burada görünecek.
            </div>
          </div>
        ) : (
          crops.map((c) => <PriceSummaryCard key={c} crop={c} />)
        )}
      </div>

      {isFarmer && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-36 right-4 md:bottom-6 z-30 flex items-center gap-1.5 rounded-full bg-saffron px-4 py-3 text-sm font-medium text-white shadow-xl mb-safe"
        >
          <Plus className="h-4 w-4" /> Fiyat Ekle
        </button>
      )}

      {isFarmer && <PriceUpdateSheet open={sheetOpen} onClose={() => setSheetOpen(false)} crops={crops} />}
    </>
  );
}

function PriceSummaryCard({ crop }: { crop: string }) {
  const { data: summary, isLoading } = usePriceFeedSummary(crop);
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="font-medium">{formatCrop(crop)}</div>
      {isLoading ? (
        <div className="mt-2 text-xs text-hmuted">Yükleniyor…</div>
      ) : !summary || summary.insufficientData || summary.avgPrice == null ? (
        <div className="mt-2 text-xs text-hmuted">
          Yeterli veri yok (en az 5 farklı üreticiden veri gerekli).
        </div>
      ) : (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xs text-hmuted">Ortalama</span>
            <span className="font-mono text-lg font-semibold">{formatTRY(summary.avgPrice)}</span>
          </div>
          {summary.stddevPrice != null && (
            <div className="mt-0.5 text-xs text-hmuted">
              Piyasa aralığı:{" "}
              <span className="font-mono">{formatTRY(Math.max(0, summary.avgPrice - summary.stddevPrice))}</span>
              {" – "}
              <span className="font-mono">{formatTRY(summary.avgPrice + summary.stddevPrice)}</span>
            </div>
          )}
          <div className="mt-1 text-[11px] text-hmuted">
            {summary.distinctFarmerCount} üretici · son 30 gün · {timeAgo(summary.lastUpdated)}
          </div>
        </>
      )}
    </div>
  );
}

function PriceUpdateSheet({ open, onClose, crops }: { open: boolean; onClose: () => void; crops: string[] }) {
  const create = useCreatePriceFeedEntry();
  const [crop, setCrop] = useState<string>(crops[0] ?? "");
  const [customCrop, setCustomCrop] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [unit, setUnit] = useState<string>("kg");
  const [source, setSource] = useState("");

  const useCustom = crop === "__custom__" || crops.length === 0;
  const finalCrop = useCustom ? customCrop : crop;

  const submit = async () => {
    if (!finalCrop.trim()) return toast.error("Ürün adı gerekli");
    if (!price || price <= 0) return toast.error("Geçerli bir fiyat girin");
    try {
      await create.mutateAsync({ cropName: finalCrop, price, unit, source });
      toast.success("Fiyat eklendi");
      onClose();
      setPrice(0); setSource(""); setCustomCrop("");
    } catch (e: any) {
      toast.error(e?.message ?? "Kaydedilemedi");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">Fiyat Ekle</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border bg-muted/40 p-2.5 text-[11px] text-hmuted">
            Girdiğiniz fiyat topluluk ortalamasına anonim olarak eklenir.
            Bireysel kayıtlar başka üreticilere gösterilmez.
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Ürün</div>
            {crops.length > 0 ? (
              <Select value={crop} onValueChange={setCrop}>
                <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  {crops.map((c) => (
                    <SelectItem key={c} value={c}>{formatCrop(c)}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Diğer (yaz)…</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {useCustom && (
              <Input
                className="mt-2"
                value={customCrop}
                onChange={(e) => setCustomCrop(e.target.value)}
                placeholder="Ürün adı"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1.5 text-xs font-medium text-hmuted">Fiyat (₺)</div>
              <Input
                type="number"
                inputMode="decimal"
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
                className="font-mono"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-hmuted">Birim</div>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Kaynak (opsiyonel)</div>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="İstanbul Hali, TMO, Manuel…"
            />
          </div>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full rounded-xl bg-saffron py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {create.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
