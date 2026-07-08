import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FarmerHeader } from "./farmer";
import { useFarmerListings, useCreateListing, useUpdateListing, useDeleteListing, useParcels, useProfile } from "@/lib/hasat/queries";
import { vitrinUrl, copyVitrinLink } from "@/lib/hasat/vitrin";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { Stepper } from "@/components/hasat/Stepper";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import type { Listing } from "@/lib/hasat/types";
import { AIBox } from "@/components/hasat/AIBox";
import { PhotoUploader } from "@/components/hasat/PhotoUploader";
import { MarketDeviationAlert } from "@/components/hasat/MarketDeviationAlert";
import { StockBadge } from "@/components/hasat/StockBadge";
import { CoverageBadge } from "@/components/hasat/CoverageBadge";
import { cropEmoji, findCropConfig, useCropConfigMap, useCropOptions } from "@/lib/hasat/crop-config";
import { computeCoverage } from "@/lib/hasat/coverage";
import { useListingBatchEntries } from "@/lib/hasat/queries";
import { Eye } from "lucide-react";

export const Route = createFileRoute("/farmer/storefront")({
  head: () => ({ meta: [{ title: "Vitrin — Hasat" }] }),
  component: Storefront,
});


function Storefront() {
  const { data: profile } = useProfile();
  const { data: listings = [], isLoading } = useFarmerListings();
  const { data: parcels = [] } = useParcels();
  const deleteListing = useDeleteListing();
  const [sheet, setSheet] = useState<{ open: boolean; editing?: Listing | null }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<Listing | null>(null);
  const vUrl = vitrinUrl(profile ?? undefined);

  const active = listings.filter((l) => l.status === "active");
  const drafts = listings.filter((l) => l.status === "draft");
  const archive = listings.filter((l) => l.status === "sold" || l.status === "expired");
  const parcelName = (id: string | null | undefined) => parcels.find((p) => p.id === id)?.name;

  return (
    <>
      <FarmerHeader title="Vitrin" subtitle="Aktif listelemeleriniz" />
      <div className="px-4 md:px-8 py-5 pb-32 md:pb-5">
        <AIBox page="storefront" />
        <div className="mt-3 rounded-xl border bg-card p-3">
          <button
            onClick={() => copyVitrinLink(profile ?? undefined)}
            className="w-full rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
          >
            Vitrin Linkini Kopyala
          </button>
          <div className="mt-2 truncate font-mono text-[11px] text-hmuted">{vUrl}</div>
        </div>
        <Tabs defaultValue="active" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">Ürünlerim</TabsTrigger>
            <TabsTrigger value="draft">
              Taslak{drafts.length > 0 ? ` (${drafts.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="archive">Arşiv</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-3">
            {isLoading ? (
              <LoadingDots />
            ) : active.length === 0 ? (
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
                  onRemove={() => setConfirmDelete(l)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="draft" className="mt-4 space-y-3">
            {isLoading ? (
              <LoadingDots />
            ) : drafts.length === 0 ? (
              <div className="rounded-2xl border border-dashed py-12 px-6 text-center">
                <div className="mb-3 text-5xl">📝</div>
                <div className="text-xs text-hmuted">
                  Henüz taslak yok. Bir parsel oluşturduğunuzda, o parselin her ürünü için otomatik bir taslak ilan hazırlanır.
                </div>
              </div>
            ) : (
              drafts.map((l) => (
                <ListingCard key={l.id} listing={l} draft
                  parcelLabel={parcelName(l.parcelId)}
                  onEdit={() => setSheet({ open: true, editing: l })}
                  onRemove={() => setConfirmDelete(l)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="archive" className="mt-4 space-y-3">
            {isLoading ? (
              <LoadingDots />
            ) : archive.length === 0 ? (
              <div className="py-12 text-center text-sm text-hmuted">Arşivde kayıt yok.</div>
            ) : (
              archive.map((l) => <ListingCard key={l.id} listing={l} muted />)
            )}
          </TabsContent>
        </Tabs>


        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-lg">Tarlalarım</h2>
            <Link to="/farmer/settings" className="text-xs text-saffron underline">Düzenle</Link>
          </div>
          {parcels.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-hmuted">
              Henüz parsel eklenmemiş. Ayarlar'dan ekleyin.
            </div>
          ) : (
            <div className="space-y-4">
              {parcels.map((p) => (
                <div key={p.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-hmuted">{p.area} dönüm · {p.location.label}</div>
                  </div>
                  {p.photos && p.photos.length > 0 ? (
                    <div className="mt-3 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1">
                      {p.photos.map((u, i) => (
                        <img key={`${p.id}-${i}`} src={u} alt={p.name}
                          className="h-28 w-40 shrink-0 snap-start rounded-lg object-cover" />
                      ))}
                    </div>
                  ) : (
                    <Link to="/farmer/settings"
                      className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed py-4 text-xs text-hmuted hover:bg-muted/50">
                      <ImagePlus className="h-4 w-4" /> Fotoğraf ekle
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {active.length > 0 && (
        <button
          onClick={() => setSheet({ open: true })}
          className="fixed bottom-20 right-4 md:bottom-6 z-30 flex items-center gap-1.5 rounded-full bg-saffron px-4 py-3 text-sm font-medium text-white shadow-xl mb-safe"
        >
          <Plus className="h-4 w-4" /> Yeni Ürün
        </button>
      )}

      <ListingSheet open={sheet.open} editing={sheet.editing ?? null} onClose={() => setSheet({ open: false })} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bu ilanı kaldırmak istediğinizden emin misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatCrop(confirmDelete?.crop)} ilanınız vitrinden kaldırılacak. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await deleteListing.mutateAsync(confirmDelete.id);
                  toast.success("İlan kaldırıldı");
                } catch (e: any) {
                  toast.error(e.message ?? "Silinemedi");
                }
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ListingCard({ listing, muted, onEdit, onRemove }: { listing: Listing; muted?: boolean; onEdit?: () => void; onRemove?: () => void }) {
  const statusLabel = listing.status === "active" ? "Aktif" : listing.status === "sold" ? "Satıldı" : "Süresi Doldu";
  const statusColor = listing.status === "active" ? "var(--sage)" : listing.status === "sold" ? "var(--gold)" : "var(--hmuted)";
  const photo = listing.photos?.[0];
  return (
    <div className={`rounded-2xl border bg-card p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {photo ? (
          <img src={photo} alt={formatCrop(listing.crop)} className="h-12 w-12 rounded-xl object-cover" />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-cream text-2xl">{cropEmoji(listing.crop)}</div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium">{formatCrop(listing.crop)}</div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: statusColor }}>{statusLabel}</span>
            <StockBadge listingId={listing.id} unit={listing.unit} />
          </div>
          <div className="mt-0.5 text-xs text-hmuted">{listing.quantity} {listing.unit} • Min. {listing.minOrder} {listing.unit}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{formatTRY(listing.pricePerUnit)}/{listing.unit}</span>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">Kalite {listing.quality}</span>
          </div>
        </div>
      </div>
      <MarketDeviationAlert crop={listing.crop} pricePerUnit={listing.pricePerUnit} unit={listing.unit} />
      {!muted && (
        <div className="mt-3 flex gap-2">
          <Link to="/batch/$listingId" params={{ listingId: listing.id }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium hover:bg-cream">
            📦 Parti
          </Link>
          <button onClick={onEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium hover:bg-cream"><Pencil className="h-3.5 w-3.5" /> Düzenle</button>
          <button onClick={onRemove} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hred/30 py-2 text-xs font-medium text-hred hover:bg-hred/5"><Trash2 className="h-3.5 w-3.5" /> Kaldır</button>
        </div>
      )}
    </div>
  );
}

function ListingSheet({ open, editing, onClose }: { open: boolean; editing: Listing | null; onClose: () => void }) {
  const createListing = useCreateListing();
  const updateListing = useUpdateListing();

  const [crop, setCrop] = useState(editing?.crop ?? "");
  const { options: cropOptions, isLoading: cropsLoading } = useCropOptions();
  const [quantity, setQuantity] = useState(editing?.quantity ?? 100);
  const [unit, setUnit] = useState<"g" | "kg" | "L">(editing?.unit ?? "g");
  const [price, setPrice] = useState(editing?.pricePerUnit ?? 350);
  const [minOrder, setMinOrder] = useState(editing?.minOrder ?? 10);
  const [quality, setQuality] = useState<"A" | "B" | "C">(editing?.quality ?? "A");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [existingPhotos, setExistingPhotos] = useState<string[]>(editing?.photos ?? []);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  const editingId = editing?.id;
  useEffect(() => {
    if (editing) {
      setCrop(editing.crop); setQuantity(editing.quantity); setUnit(editing.unit);
      setPrice(editing.pricePerUnit); setMinOrder(editing.minOrder); setQuality(editing.quality);
      setDesc(editing.description ?? "");
      setExistingPhotos(editing.photos ?? []);
    } else {
      setCrop(""); setQuantity(100); setUnit("g"); setPrice(350); setMinOrder(10); setQuality("A");
      setDesc("");
      setExistingPhotos([]);
    }
    setPhotoFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const pending = createListing.isPending || updateListing.isPending;

  const save = async () => {
    if (!crop) { toast.error("Ürün seçin"); return; }
    if (unit === "g" && price > 500) {
      const ok = window.confirm(
        `₺${price}/g olarak kaydedilecek. Kilogram fiyatını yanlışlıkla girmiş olabilirsiniz. Devam etmek istiyor musunuz?`
      );
      if (!ok) return;
    }
    try {
      if (editing) {
        await updateListing.mutateAsync({ id: editing.id, patch: { crop, quantity, unit, pricePerUnit: price, minOrder, quality, description: desc || undefined }, photoFiles, existingPhotos });
        toast.success("Ürün güncellendi");
      } else {
        await createListing.mutateAsync({ crop, quantity, unit, pricePerUnit: price, minOrder, quality, description: desc || undefined, photoFiles });
        toast.success("Ürün yayınlandı");
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Kaydedilemedi");
    }
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
              <SelectTrigger><SelectValue placeholder={cropsLoading ? "Yükleniyor…" : "Ürün seçin"} /></SelectTrigger>
              <SelectContent>{cropOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.emoji} {o.label}</SelectItem>)}</SelectContent>
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
          <div>
            <div className="mb-1.5 text-xs font-medium text-hmuted">Fotoğraflar (en fazla 3)</div>
            <PhotoUploader
              value={existingPhotos}
              files={photoFiles}
              onChange={(v, f) => { setExistingPhotos(v); setPhotoFiles(f); }}
              max={3}
            />
          </div>
          <BuyerPreview listingId={editing?.id} crop={crop} />
          <button onClick={save} disabled={pending} className="w-full rounded-xl bg-saffron py-3 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Kaydediliyor…" : "Yayınla ✓"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BuyerPreview({ listingId, crop }: { listingId: string | undefined; crop: string }) {
  const { map } = useCropConfigMap();
  const cfg = findCropConfig(map, crop);
  const { data: entries = [] } = useListingBatchEntries(listingId ?? null);
  const cov = computeCoverage(cfg, entries);

  return (
    <div className="rounded-xl border border-dashed p-3 space-y-2 bg-cream/40">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Eye className="h-3.5 w-3.5" /> Alıcı bunu görecek
      </div>
      {listingId ? (
        <div className="flex items-center gap-2">
          <CoverageBadge listingId={listingId} crop={crop} />
          <span className="text-[11px] text-hmuted">{entries.length} bağlı hasat kaydı</span>
        </div>
      ) : (
        <div className="text-[11px] text-hmuted">
          Yayınladıktan sonra Günlük'ten hasat kayıtlarını bağlayarak izlenebilirliği güçlendirebilirsiniz.
        </div>
      )}
      {cov.missingSteps.length > 0 && (
        <div className="text-[11px] text-hmuted">
          <div className="font-medium mb-0.5">Öneriler (zorunlu değil):</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {cov.missingSteps.map((s) => (
              <li key={s.key}>{s.label} kaydı ekleyin</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

