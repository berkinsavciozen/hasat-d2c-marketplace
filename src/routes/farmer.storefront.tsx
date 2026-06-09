import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { formatTRY } from "@/lib/hasat/format";
import { TrustBadge } from "@/components/hasat/TrustBadge";
import { Stepper } from "@/components/hasat/Stepper";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Listing } from "@/lib/hasat/types";

export const Route = createFileRoute("/farmer/storefront")({
  head: () => ({ meta: [{ title: "Vitrin — Hasat" }] }),
  component: Storefront,
});

const CROP_EMOJI: Record<string, string> = { Safran: "🌸", Lavanta: "💜", "Tıbbi Bitkiler": "🌿", Fındık: "🌰", Zeytinyağı: "🫒" };
const CROPS = ["Safran", "Lavanta", "Tıbbi Bitkiler", "Fındık", "Zeytinyağı"];

function Storefront() {
  const listings = useHasat((s) => s.listings);
  const updateListing = useHasat((s) => s.updateListing);
  const [sheet, setSheet] = useState<{ open: boolean; editing?: Listing | null }>({ open: false });

  const active = listings.filter((l) => l.status === "active");
  const history = listings.filter((l) => l.status !== "active");

  return (
    <>
      <FarmerHeader title="Vitrin" subtitle="Aktif listelemeleriniz" />
      <div className="px-4 md:px-8 py-5">
        <Tabs defaultValue="active">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">Ürünlerim</TabsTrigger>
            <TabsTrigger value="history">Geçmiş</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-3">
            {active.length === 0 ? (
              <div className="rounded-2xl border border-dashed py-12 text-center">
                <div className="mb-3 text-5xl">🏪</div>
                <div className="mb-1 font-medium">Henüz ürün listelemediniz</div>
                <div className="mb-4 text-xs text-hmuted">Hasadınızı vitrine ekleyerek alıcılarla buluşun.</div>
                <button onClick={() => setSheet({ open: true })} className="rounded-full bg-saffron px-4 py-2 text-sm font-medium text-white">Ürün Listele</button>
              </div>
            ) : (
              active.map((l) => (
                <ListingCard key={l.id} listing={l}
                  onEdit={() => setSheet({ open: true, editing: l })}
                  onRemove={() => { updateListing(l.id, { status: "expired" }); toast.success("Ürün kaldırıldı"); }}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            {history.length === 0 ? (
              <div className="py-12 text-center text-sm text-hmuted">Geçmiş kayıt yok.</div>
            ) : (
              history.map((l) => <ListingCard key={l.id} listing={l} muted />)
            )}
          </TabsContent>
        </Tabs>
      </div>

      {active.length > 0 && (
        <button
          onClick={() => setSheet({ open: true })}
          className="fixed bottom-20 right-4 md:bottom-6 z-30 flex items-center gap-1.5 rounded-full bg-saffron px-4 py-3 text-sm font-medium text-white shadow-xl"
        >
          <Plus className="h-4 w-4" /> Yeni Ürün
        </button>
      )}

      <ListingSheet open={sheet.open} editing={sheet.editing ?? null} onClose={() => setSheet({ open: false })} />
    </>
  );
}

function ListingCard({ listing, muted, onEdit, onRemove }: { listing: Listing; muted?: boolean; onEdit?: () => void; onRemove?: () => void }) {
  const statusLabel = listing.status === "active" ? "Aktif" : listing.status === "sold" ? "Satıldı" : "Süresi Doldu";
  const statusColor = listing.status === "active" ? "var(--sage)" : listing.status === "sold" ? "var(--gold)" : "var(--hmuted)";
  return (
    <div className={`rounded-2xl border bg-card p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-cream text-2xl">{CROP_EMOJI[listing.crop] ?? "🌾"}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="font-medium">{listing.crop}</div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: statusColor }}>{statusLabel}</span>
          </div>
          <div className="mt-0.5 text-xs text-hmuted">{listing.quantity} {listing.unit} • Min. {listing.minOrder} {listing.unit}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{formatTRY(listing.pricePerUnit)}/{listing.unit}</span>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">Kalite {listing.quality}</span>
          </div>
        </div>
      </div>
      {!muted && (
        <div className="mt-3 flex gap-2">
          <button onClick={onEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium hover:bg-cream"><Pencil className="h-3.5 w-3.5" /> Düzenle</button>
          <button onClick={onRemove} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hred/30 py-2 text-xs font-medium text-hred hover:bg-hred/5"><Trash2 className="h-3.5 w-3.5" /> Kaldır</button>
        </div>
      )}
    </div>
  );
}

function ListingSheet({ open, editing, onClose }: { open: boolean; editing: Listing | null; onClose: () => void }) {
  const addListing = useHasat((s) => s.addListing);
  const updateListing = useHasat((s) => s.updateListing);

  const [crop, setCrop] = useState(editing?.crop ?? "Safran");
  const [quantity, setQuantity] = useState(editing?.quantity ?? 100);
  const [unit, setUnit] = useState<"g" | "kg" | "L">(editing?.unit ?? "g");
  const [price, setPrice] = useState(editing?.pricePerUnit ?? 350);
  const [minOrder, setMinOrder] = useState(editing?.minOrder ?? 10);
  const [quality, setQuality] = useState<"A" | "B" | "C">(editing?.quality ?? "A");
  const [desc, setDesc] = useState("");

  // re-sync when editing changes
  const editingId = editing?.id;
  useStateSync(editingId, () => {
    if (editing) {
      setCrop(editing.crop); setQuantity(editing.quantity); setUnit(editing.unit);
      setPrice(editing.pricePerUnit); setMinOrder(editing.minOrder); setQuality(editing.quality);
    } else {
      setCrop("Safran"); setQuantity(100); setUnit("g"); setPrice(350); setMinOrder(10); setQuality("A");
    }
    setDesc("");
  });

  const save = () => {
    if (editing) {
      updateListing(editing.id, { crop, quantity, unit, pricePerUnit: price, minOrder, quality });
      toast.success("Ürün güncellendi");
    } else {
      addListing({ crop, quantity, unit, pricePerUnit: price, minOrder, quality, status: "active" });
      toast.success("Ürün yayınlandı");
    }
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">{editing ? "Ürünü Düzenle" : "🏪 Yeni Ürün"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Ürün</div>
            <Select value={crop} onValueChange={setCrop}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CROPS.map((c) => <SelectItem key={c} value={c}>{CROP_EMOJI[c]} {c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Miktar</div>
            <Stepper value={quantity} onChange={setQuantity} step={unit === "g" ? 10 : 1} unit={unit} units={["g", "kg", "L"]} onUnitChange={(u) => setUnit(u as "g" | "kg" | "L")} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Birim fiyat (₺/{unit})</div>
            <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="font-mono text-lg" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Minimum sipariş ({unit})</div>
            <Stepper value={minOrder} onChange={setMinOrder} step={1} unit={unit} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Kalite</div>
            <div className="grid grid-cols-3 gap-2">
              {(["A", "B", "C"] as const).map((q) => (
                <button key={q} type="button" onClick={() => setQuality(q)}
                  className={`rounded-xl border py-3 text-sm font-semibold ${quality === q ? "bg-saffron text-white border-saffron" : "border-input text-hmuted"}`}>
                  Kalite {q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Açıklama</div>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Ürününüzü tanıtın..." />
          </div>
          <button onClick={save} className="w-full rounded-xl bg-saffron py-3 text-sm font-medium text-white">Yayınla ✓</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// tiny helper to reset form state when editing target changes
import { useEffect } from "react";
function useStateSync(key: unknown, fn: () => void) {
  useEffect(() => { fn(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
}
