import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, MoreVertical, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  useEntry,
  useEntries,
  useDeleteEntry,
  useFarmerListings,
  useHarvestListingLinks,
  useLinkHarvestToListing,
  useUnlinkHarvestFromListing,
} from "@/lib/hasat/queries";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { toast } from "sonner";
import { formatTRY, formatDelta, formatQuantity } from "@/lib/hasat/format";
import { formatCrop } from "@/lib/hasat/format";
import { AIInsightBanner } from "@/components/hasat/AIInsightBanner";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/farmer/journal/$entryId")({
  head: () => ({ meta: [{ title: "Hasat Detayı — Hasat" }] }),
  component: EntryDetail,
});

function EntryDetail() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();
  const { data: entry, isLoading } = useEntry(entryId);
  const { data: allEntries = [] } = useEntries();
  const deleteEntry = useDeleteEntry();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-12">
        <ProgressDots current={2} total={3} />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="p-8 text-center">
        <p className="text-hmuted">Kayıt bulunamadı.</p>
        <Link to="/farmer/journal" className="text-primary text-sm">
          ← Günlüğe dön
        </Link>
      </div>
    );
  }

  const totalCost = Object.values(entry.costs).reduce((a: number, b: number) => a + b, 0);
  const revenue = entry.quantity * (entry.pricePerUnit ?? 0);
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  // Year-over-year for same parcel
  const sameParcel = allEntries
    .filter((e) => e.parcelId === entry.parcelId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const chartData = sameParcel.map((e, i) => ({
    name: `Yıl ${i + 1}`,
    value: e.quantity,
    current: e.id === entry.id,
  }));
  const prev = sameParcel[sameParcel.findIndex((e) => e.id === entry.id) - 1];
  const yoy = prev ? ((entry.quantity - prev.quantity) / prev.quantity) * 100 : 0;

  const year = entry.date.slice(0, 4);

  return (
    <>
      <div
        className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3"
        style={{ background: "var(--primary)", color: "var(--hwhite)" }}
      >
        <button
          onClick={() => navigate({ to: "/farmer/journal" })}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="flex-1 text-xl font-semibold">
          {year} {formatCrop(entry.crop)} Hasatı
        </h1>
        <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <Pencil className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-30 w-40 rounded-lg border bg-popover text-foreground shadow-lg">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-hred hover:bg-hred/10"
              >
                <Trash2 className="h-4 w-4" /> Sil
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-4 max-w-3xl mx-auto">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Toplam</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">
              {formatQuantity(entry.quantity, entry.unit)}
              <span className="text-sm ml-1 text-hmuted">{entry.unit}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Kalite</div>
            <div className="text-3xl font-semibold mt-1 text-primary">{entry.quality}</div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Gelir Pot.</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{formatTRY(revenue)}</div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Önceki Yıl</div>
            <div className={`text-xl mt-1 tabular-nums ${yoy >= 0 ? "text-sage" : "text-hred"}`}>
              {prev ? formatDelta(yoy) : "—"}
            </div>
          </div>
        </div>

        {/* Yield chart */}
        <div className="rounded-2xl bg-card border p-4">
          <h3 className="font-serif text-lg mb-3">Yıllık Verim</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.current ? "var(--teal)" : "var(--hmuted)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* P&L */}
        <div className="rounded-2xl bg-card border p-4 space-y-2">
          <h3 className="font-serif text-lg">Kâr-Zarar</h3>
          <div className="flex justify-between text-sm">
            <span className="text-hmuted">Toplam maliyet</span>
            <span className="font-mono text-hred">−{formatTRY(totalCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-hmuted">Toplam gelir</span>
            <span className="font-mono text-sage">+{formatTRY(revenue)}</span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="font-medium">Net Kâr</span>
            <div className="text-right">
              <div className="font-mono text-lg text-sage">{formatTRY(profit)}</div>
              <span className="rounded-full bg-sage/15 text-sage text-[10px] px-2 py-0.5 font-mono">
                %{margin.toFixed(0)} marj
              </span>
            </div>
          </div>
        </div>

        <AIInsightBanner>
          {formatCrop(entry.crop)} verimi{" "}
          {prev
            ? yoy > 0
              ? "geçen yıla göre arttı 📈"
              : "geçen yıla göre düştü 📉"
            : "ilk yıl kaydı"}
          . Mevcut D2C fiyatıyla bu hasadı vitrinde listelemen önerilir.
        </AIInsightBanner>

        <BatchLinkSection entryId={entry.id} entryCrop={entry.crop} />

        {/* Storefront shortcut */}
        <div
          className="rounded-2xl border p-4 flex items-center justify-between"
          style={{ background: "color-mix(in oklab, var(--saffron) 12%, var(--card))" }}
        >
          <div>
            <div className="font-medium">Bu ürünü vitrinde listele</div>
            <div className="text-xs text-hmuted">Doğrudan alıcılara ulaş</div>
          </div>
          <Link
            to="/farmer/storefront"
            className="rounded-xl bg-primary px-4 py-2 text-sm text-white"
          >
            Listele →
          </Link>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bu kaydı silmek istiyor musun?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu işlem geri alınamaz. Kayda ait tüm veriler kalıcı olarak silinecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteEntry.mutateAsync(entry.id);
                  navigate({ to: "/farmer/journal" });
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              className="bg-hred text-white"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BatchLinkSection({ entryId, entryCrop }: { entryId: string; entryCrop: string }) {
  const { data: links = [] } = useHarvestListingLinks(entryId);
  const { data: listings = [] } = useFarmerListings();
  const link = useLinkHarvestToListing();
  const unlink = useUnlinkHarvestFromListing();
  const [selected, setSelected] = useState<string>("");

  const linkedIds = new Set(links.map((l) => l.listingId));
  const candidates = listings.filter(
    (l) =>
      l.status === "active" &&
      !linkedIds.has(l.id) &&
      l.crop.toLowerCase().trim() === entryCrop.toLowerCase().trim(),
  );

  return (
    <div className="rounded-2xl border p-4">
      <div className="font-medium">Bu hasatı bir ürüne bağla</div>
      <div className="text-xs text-hmuted mt-0.5">
        Bağlanan hasatlar ürün partisinin izlenebilir stok toplamını oluşturur.
      </div>

      {links.length > 0 && (
        <ul className="mt-3 space-y-2">
          {links.map((l) => (
            <li
              key={l.listingId}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="flex-1">{formatCrop(l.crop)}</span>
              <Link
                to="/batch/$listingId"
                params={{ listingId: l.listingId }}
                className="text-xs text-saffron underline"
              >
                Parti
              </Link>
              <button
                onClick={async () => {
                  try {
                    await unlink.mutateAsync({ listingId: l.listingId, entryId });
                    toast.success("Bağlantı kaldırıldı");
                  } catch (e: any) {
                    toast.error(e.message ?? "Kaldırılamadı");
                  }
                }}
                className="text-xs text-hred"
              >
                Kaldır
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 ? (
        <div className="mt-3 flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 rounded-lg border bg-input px-3 py-2 text-sm"
          >
            <option value="">Ürün seç…</option>
            {candidates.map((l) => (
              <option key={l.id} value={l.id}>
                {formatCrop(l.crop)} · {formatQuantity(l.quantity, l.unit)} {l.unit} · ₺
                {l.pricePerUnit}/{l.unit}
              </option>
            ))}
          </select>
          <button
            disabled={!selected || link.isPending}
            onClick={async () => {
              if (!selected) return;
              try {
                await link.mutateAsync({ listingId: selected, entryId });
                setSelected("");
                toast.success("Bağlandı");
              } catch (e: any) {
                toast.error(e.message ?? "Bağlanamadı");
              }
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            Bağla
          </button>
        </div>
      ) : links.length === 0 ? (
        <div className="mt-3 text-xs text-hmuted">
          Aynı üründe aktif ilanınız yok. Önce vitrine bir ilan ekleyin.
        </div>
      ) : null}
    </div>
  );
}
