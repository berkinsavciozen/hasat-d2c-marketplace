import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FarmerHeader } from "./farmer";
import {
  usePriceFeed,
  useCreatePriceFeedEntry,
  useProfile,
  useFarmerListings,
  type PriceFeedEntry,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/farmer/prices")({
  head: () => ({ meta: [{ title: "Fiyat Takibi | Hasat" }] }),
  component: Prices,
});

const UNITS = ["kg", "g", "adet", "litre"] as const;

function normalize(s: string) {
  return s.toLowerCase().trim();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

interface Grouped {
  key: string;
  cropName: string;
  latest: PriceFeedEntry;
  series: PriceFeedEntry[];
}

function groupFeed(entries: PriceFeedEntry[]): Grouped[] {
  const map = new Map<string, PriceFeedEntry[]>();
  for (const e of entries) {
    const k = normalize(e.cropName);
    const arr = map.get(k) ?? [];
    arr.push(e);
    map.set(k, arr);
  }
  return Array.from(map.entries()).map(([key, arr]) => {
    const sorted = [...arr].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    );
    return {
      key,
      cropName: sorted[0].cropName,
      latest: sorted[0],
      series: sorted.slice(0, 14).reverse(),
    };
  });
}

function Prices() {
  const { data: profile } = useProfile();
  const { data: entries = [], isLoading } = usePriceFeed();
  const [sheetOpen, setSheetOpen] = useState(false);
  const groups = useMemo(() => groupFeed(entries), [entries]);
  const isFarmer = profile?.role === "farmer";

  return (
    <>
      <FarmerHeader title="Fiyat Takibi" subtitle="Topluluk fiyat akışı" />
      <div className="px-4 md:px-8 py-5 pb-32 md:pb-5 space-y-3">
        {isLoading ? (
          <div className="py-12"><LoadingDots /></div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <div className="mb-3 text-5xl">📊</div>
            <div className="mb-1 font-medium">Fiyat verisi bekleniyor</div>
            <div className="text-xs text-hmuted">
              {isFarmer
                ? "İlk fiyatı sen ekle — topluluk için yararlı olur."
                : "Çiftçilerimiz fiyat eklediğinde burada görünecek."}
            </div>
          </div>
        ) : (
          groups.map((g) => <PriceCard key={g.key} group={g} />)
        )}
      </div>

      {isFarmer && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-36 right-4 md:bottom-6 z-30 flex items-center gap-1.5 rounded-full bg-saffron px-4 py-3 text-sm font-medium text-white shadow-xl mb-safe"
        >
          <Plus className="h-4 w-4" /> Fiyat Güncelle
        </button>
      )}

      {isFarmer && <PriceUpdateSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

function PriceCard({ group }: { group: Grouped }) {
  const { latest, series } = group;
  const data = series.map((e, i) => ({ i, v: e.price }));
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{formatCrop(group.cropName)}</div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="font-mono text-lg font-semibold">{formatTRY(latest.price)}</span>
            <span className="text-xs text-hmuted">/{latest.unit}</span>
          </div>
          <div className="mt-1 text-[11px] text-hmuted">
            {latest.source ? `${latest.source} · ` : ""}{timeAgo(latest.recordedAt)}
          </div>
        </div>
        <div style={{ width: 120, height: 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
              <Line type="monotone" dataKey="v" stroke="var(--saffron)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function PriceUpdateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: listings = [] } = useFarmerListings();
  const create = useCreatePriceFeedEntry();
  const cropSuggestions = useMemo(() => {
    const s = new Set<string>();
    for (const l of listings) s.add(l.crop);
    return Array.from(s);
  }, [listings]);

  const [crop, setCrop] = useState<string>(cropSuggestions[0] ?? "");
  const [customCrop, setCustomCrop] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [unit, setUnit] = useState<string>("kg");
  const [source, setSource] = useState("");

  const useCustom = crop === "__custom__" || cropSuggestions.length === 0;
  const finalCrop = useCustom ? customCrop : crop;

  const submit = async () => {
    if (!finalCrop.trim()) return toast.error("Ürün adı gerekli");
    if (!price || price <= 0) return toast.error("Geçerli bir fiyat girin");
    try {
      await create.mutateAsync({ cropName: finalCrop, price, unit, source });
      toast.success("Fiyat güncellendi");
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
          <SheetTitle className="font-serif text-xl">Fiyat Güncelle</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Ürün</div>
            {cropSuggestions.length > 0 ? (
              <Select value={crop} onValueChange={setCrop}>
                <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  {cropSuggestions.map((c) => (
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
            <div className="mb-1.5 text-xs font-medium text-hmuted">Kaynak</div>
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
