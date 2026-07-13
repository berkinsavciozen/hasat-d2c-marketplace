import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Package, Sprout } from "lucide-react";
import { useAuthUserId, useListing, useListingStock, useListingBatchEntries, useListingOrders, useUnlinkHarvestFromListing } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { ProvenanceTimeline } from "@/components/hasat/ProvenanceTimeline";
import { CoverageBadge } from "@/components/hasat/CoverageBadge";
import { findCropConfig, useCropConfigMap } from "@/lib/hasat/crop-config";
import { labelForStepKey } from "@/lib/hasat/coverage";
import { formatCrop, formatTRY } from "@/lib/hasat/format";
import { toast } from "sonner";

export const Route = createFileRoute("/batch/$listingId")({
  head: () => ({ meta: [{ title: "Parti Detayı — Hasat" }] }),
  component: BatchPage,
});

function BatchPage() {
  const { listingId } = Route.useParams();
  const navigate = useNavigate();
  const userId = useAuthUserId();
  const { data: listing, isLoading } = useListing(listingId);
  const { data: stock } = useListingStock(listingId);
  const { data: entries = [] } = useListingBatchEntries(listingId);
  const { data: orders = [] } = useListingOrders(listingId);
  const unlink = useUnlinkHarvestFromListing();

  if (isLoading) return <div className="p-8"><LoadingDots /></div>;
  if (!listing) {
    return (
      <div className="p-8 text-center">
        <p className="text-hmuted">İlan bulunamadı.</p>
      </div>
    );
  }

  const isOwner = !!userId && userId === listing.producerId;
  const { map: cropMap } = useCropConfigMap();
  const cfg = findCropConfig(cropMap, listing.crop);

  return (
    <>
      <div className="px-4 pt-5 pb-4 md:px-8 flex items-center gap-3" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <button onClick={() => navigate({ to: ".." as any })} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="font-serif text-xl">{formatCrop(listing.crop)} · Parti</h1>
          <div className="text-xs text-hwhite/60">{listing.farmerName} {listing.farmerCity ? `· ${listing.farmerCity}` : ""}</div>
        </div>
        <CoverageBadge listingId={listing.id} crop={listing.crop} compact />
      </div>

      <div className="p-4 md:p-8 space-y-4 max-w-3xl mx-auto">
        {listing.photos && listing.photos.length > 0 && (
          <div className="rounded-2xl overflow-hidden border bg-card">
            <div className="flex gap-1 overflow-x-auto snap-x snap-mandatory">
              {listing.photos.map((u, i) => (
                <img
                  key={i}
                  src={u}
                  alt={formatCrop(listing.crop)}
                  className="h-48 w-full min-w-full snap-start object-cover"
                />
              ))}
            </div>
          </div>
        )}

        {/* Stock summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Toplam Parti</div>
            <div className="font-mono text-xl mt-1">{stock?.base ?? "—"}<span className="text-xs ml-1 text-hmuted">{listing.unit}</span></div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Rezerve</div>
            <div className="font-mono text-xl mt-1 text-hred">−{stock?.reserved ?? 0}<span className="text-xs ml-1 text-hmuted">{listing.unit}</span></div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Mevcut</div>
            <div className="font-mono text-xl mt-1 text-sage">{stock?.available ?? 0}<span className="text-xs ml-1 text-hmuted">{listing.unit}</span></div>
          </div>
        </div>
        {stock?.usingFallback && isOwner && (
          <div className="rounded-xl border border-dashed p-3 text-xs text-hmuted">
            Bu ilana henüz bir hasat kaydı bağlanmadı. İzlenebilirlik için Günlük'ten bir hasadı bu ürüne bağlayın.
          </div>
        )}

        {/* Buyer-facing timeline (public, no costs, no notes) */}
        {!isOwner && (
          <div className="rounded-2xl bg-card border p-4">
            <h2 className="font-serif text-lg mb-3">Ürün Geçmişi</h2>
            <ProvenanceTimeline crop={listing.crop} entries={entries} />
          </div>
        )}

        {/* Owner: linked entries with management */}
        {isOwner && (
          <div className="rounded-2xl bg-card border p-4">
            <h2 className="font-serif text-lg flex items-center gap-2"><Sprout className="h-5 w-5" /> Hasat Kayıtları</h2>
            {entries.length === 0 ? (
              <div className="mt-3 text-sm text-hmuted">Henüz bağlı hasat kaydı yok.</div>
            ) : (
              <ul className="mt-3 divide-y">
                {entries.map((e) => {
                  const backdated = e.createdAt && new Date(e.createdAt).toISOString().slice(0, 10) !== e.date;
                  return (
                    <li key={e.id} className="py-3 flex items-start gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {labelForStepKey(cfg, e.step_key)} · {new Date(e.date).toLocaleDateString("tr-TR")}
                        </div>
                        <div className="text-xs text-hmuted mt-0.5">
                          {e.quantity} {e.unit} · Kalite {e.quality}
                          {backdated && e.createdAt ? ` · kayıt ${new Date(e.createdAt).toLocaleDateString("tr-TR")}` : ""}
                        </div>
                        {e.notes ? <div className="text-xs text-hmuted mt-0.5">{e.notes}</div> : null}
                      </div>
                      <button
                        onClick={async () => {
                          try { await unlink.mutateAsync({ listingId, entryId: e.id }); toast.success("Bağlantı kaldırıldı"); }
                          catch (err: any) { toast.error(err.message ?? "Kaldırılamadı"); }
                        }}
                        className="text-[11px] text-hred underline"
                      >Kaldır</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link to="/farmer/journal" className="mt-3 inline-block text-xs text-saffron underline">Günlükten hasat bağla →</Link>
          </div>
        )}



        {/* Related orders / sales */}
        <div className="rounded-2xl bg-card border p-4">
          <h2 className="font-serif text-lg flex items-center gap-2"><Package className="h-5 w-5" /> İlgili Siparişler</h2>
          {orders.length === 0 ? (
            <div className="mt-3 text-sm text-hmuted">Henüz sipariş yok.</div>
          ) : (
            <ul className="mt-3 divide-y">
              {orders.map((o: any) => {
                const qty = Number(o.offer?.quantity ?? 0);
                const price = Number(o.offer?.price_per_unit ?? 0);
                return (
                  <li key={o.id} className="py-3 flex items-center gap-3 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">{o.order_ref ?? o.id.slice(0, 8)}</div>
                      <div className="text-xs text-hmuted">{qty} {listing.unit} · {formatTRY(qty * price)} · {o.status}</div>
                    </div>
                    {isOwner && o.offer?.buyer?.name ? <div className="text-xs text-hmuted">{o.offer.buyer.name}</div> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
