import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, Image as ImageIcon, MapPin, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { RatingStars } from "@/components/hasat/ReviewModal";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { supabase } from "@/integrations/supabase/client";
import {
  useFarmerPublicProfile,
  useFarmerActiveListings,
  useFarmerProducerStats,
  useMyActiveSubscriptionWith,
  useParcelsByFarmer,
  useFarmerRatingSummary,
  useFarmerRecentReviews,
} from "@/lib/hasat/queries";
import {
  useCropConfigMap,
  findCropConfig,
  cropEmoji,
  resolveListingPhoto,
} from "@/lib/hasat/crop-config";
import { RepresentativePhoto, RepresentativeBadge } from "@/components/hasat/RepresentativePhoto";

function useIsLoggedIn() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setLoggedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setLoggedIn(!!session?.user);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return loggedIn;
}

export const Route = createFileRoute("/buyer/producer/$id")({
  head: () => ({ meta: [{ title: "Üretici — Hasat" }] }),
  component: ProducerProfile,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Üretici bulunamadı.</div>,
});

const MONTH_NAMES_TR = [
  "",
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function monthLabel(m: number | null | undefined): string | null {
  if (!m || m < 1 || m > 12) return null;
  return MONTH_NAMES_TR[m];
}

function ProducerProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useFarmerPublicProfile(id);
  const { data: listings = [] } = useFarmerActiveListings(id);
  const { data: parcels = [] } = useParcelsByFarmer(id);
  const { data: stats } = useFarmerProducerStats(id);
  const { data: subscription } = useMyActiveSubscriptionWith(id);
  const { map: cropMap } = useCropConfigMap();
  const { data: ratingSummary } = useFarmerRatingSummary(id);
  const { data: recentReviews = [] } = useFarmerRecentReviews(id, 5);
  const loggedIn = useIsLoggedIn();

  if (profileLoading)
    return (
      <div className="p-8">
        <LoadingDots />
      </div>
    );
  if (!profile) throw notFound();

  const parcelsWithPhotos = parcels.filter((p) => (p.photos ?? []).length > 0);

  // Primary crop: most-common across parcels (fallback to first active listing's crop)
  const cropCounts = new Map<string, number>();
  for (const p of parcels)
    for (const c of p.crops ?? []) cropCounts.set(c, (cropCounts.get(c) ?? 0) + 1);
  let primaryCrop: string | null = null;
  let maxCount = 0;
  for (const [c, n] of cropCounts)
    if (n > maxCount) {
      maxCount = n;
      primaryCrop = c;
    }
  if (!primaryCrop && listings.length > 0) primaryCrop = listings[0].crop;

  const cfg = primaryCrop ? findCropConfig(cropMap, primaryCrop) : null;
  const realHeroPhoto =
    parcelsWithPhotos[0]?.photos?.[0] ??
    listings.find((listing) => (listing.photos ?? []).length > 0)?.photos?.[0] ??
    null;
  const { photoUrl: heroPhoto, isRepresentative: heroIsRepresentative } = resolveListingPhoto(
    realHeroPhoto ? [realHeroPhoto] : [],
    cfg,
  );
  const startMo = monthLabel(cfg?.harvest_window_start_month ?? null);
  const endMo = monthLabel(cfg?.harvest_window_end_month ?? null);
  const fallbackWindow = startMo && endMo ? `${startMo} – ${endMo}` : "—";

  const nextHarvestLabel = subscription?.nextHarvestDate
    ? new Date(subscription.nextHarvestDate).toLocaleDateString("tr-TR")
    : fallbackWindow;
  const estimatedQtyLabel =
    subscription?.estimatedQty != null ? `${subscription.estimatedQty}` : "—";

  const totalLand = stats ? `${stats.totalLandDonum} dönüm` : "—";
  const avgQuality = stats?.modalQuality ?? "—";
  const orderCount = stats?.orderCount ?? 0;
  const yieldHistory = stats?.yieldHistory ?? [];

  return (
    <div className="pb-8">
      <div
        className="relative h-60 bg-primary"
        style={{
          background: heroPhoto
            ? `linear-gradient(180deg, color-mix(in oklab, var(--primary) 40%, transparent), var(--primary)), url(${heroPhoto}) center/cover no-repeat`
            : undefined,
        }}
      >
        {heroIsRepresentative && <RepresentativeBadge className="absolute right-4 top-4 z-20" />}
        <Link
          to="/buyer/discover"
          className="absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="absolute bottom-5 left-5 right-5 text-white">
          <h1 className="font-serif text-2xl md:text-3xl">{profile.name ?? "Üretici"}</h1>
          <div className="flex items-center gap-3 text-sm opacity-90 mt-1">
            {profile.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {profile.city}
              </span>
            )}
            {ratingSummary && ratingSummary.reviewCount > 0 && ratingSummary.avgRating != null && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4" style={{ color: "var(--gold)", fill: "var(--gold)" }} />
                {ratingSummary.avgRating.toFixed(1)} · {ratingSummary.reviewCount} değerlendirme
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <section aria-label="Üretici kanıt özeti" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Toplam Arazi</div>
            <div className="font-serif text-lg mt-1">{totalLand}</div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Ort. Kalite</div>
            <div className="font-serif text-lg mt-1">{avgQuality}</div>
          </div>
          <div className="rounded-2xl bg-card border p-4">
            <div className="text-xs text-hmuted">Sipariş</div>
            <div className="font-serif text-lg mt-1">{orderCount}</div>
          </div>
        </section>

        <div className="rounded-2xl border border-saffron/50 bg-saffron/10 p-5">
          <h3 className="font-serif text-lg">Hasat Aboneliği</h3>
          <p className="text-sm text-hmuted mt-1">
            Bu üreticinin gelecek hasatından önceden pay alın.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl bg-card p-3">
              <div className="text-xs text-hmuted">Sonraki Hasat</div>
              <div className="font-medium mt-0.5">{nextHarvestLabel}</div>
            </div>
            <div className="rounded-xl bg-card p-3">
              <div className="text-xs text-hmuted">Tahmini Miktar</div>
              <div className="font-medium mt-0.5">{estimatedQtyLabel}</div>
            </div>
          </div>
          {loggedIn === false ? (
            <Link
              to="/login"
              search={{ role: "buyer" } as any}
              className="mt-4 block w-full rounded-md bg-primary py-3 text-center text-sm font-medium text-primary-foreground"
            >
              Abonelik ve Teklif için Hasat'a Üye Ol →
            </Link>
          ) : (
            <button
              onClick={() =>
                navigate({
                  to: "/buyer/subscription/$producerId",
                  params: { producerId: profile.id },
                })
              }
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary bg-card py-3 text-sm font-medium text-primary"
            >
              <CalendarPlus className="h-4 w-4" />
              Hasat Aboneliği Oluştur →
            </button>
          )}
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Verim Geçmişi</h2>
          {yieldHistory.length === 0 ? (
            <div className="rounded-2xl bg-card border p-6 text-sm text-hmuted text-center">
              Henüz hasat kaydı yok.
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-card border p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={yieldHistory}>
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="var(--teal)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-hmuted mt-2">Birim: miktar (tüm ürünler)</div>
            </>
          )}
        </div>

        <div>
          <h2 className="font-serif text-lg mb-3">Aktif Ürünler</h2>
          {listings.length === 0 ? (
            <div className="rounded-2xl bg-card border p-6 text-sm text-hmuted text-center">
              Şu anda aktif ürün yok.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {listings.map((l) => {
                const cfg = findCropConfig(cropMap, l.crop);
                const hasRealPhotos = l.photos && l.photos.length > 0;
                const { photoUrl, isRepresentative } = resolveListingPhoto(l.photos, cfg);
                return (
                  <div key={l.id} className="rounded-2xl bg-card border overflow-hidden">
                    {hasRealPhotos ? (
                      <div className="flex aspect-[4/3] gap-1 overflow-x-auto snap-x snap-mandatory">
                        {l.photos!.map((u, i) => (
                          <img
                            key={i}
                            src={u}
                            alt={l.crop}
                            className="h-full w-full min-w-full snap-start object-cover"
                          />
                        ))}
                      </div>
                    ) : (
                      <RepresentativePhoto
                        src={photoUrl}
                        isRepresentative={isRepresentative}
                        alt={formatCrop(l.crop)}
                        placeholderEmoji={cropEmoji(l.crop, cfg)}
                        className="aspect-[4/3] w-full"
                      >
                        {isRepresentative && (
                          <RepresentativeBadge className="absolute top-2 right-2" />
                        )}
                      </RepresentativePhoto>
                    )}
                    <div className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-medium">
                            {cropEmoji(l.crop)} {formatCrop(l.crop)}
                          </div>
                          <div className="text-xs text-hmuted mt-1">
                            {l.quantity} {l.unit} · Min {l.minOrder} {l.unit}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Kalite {l.quality}
                          </div>
                        </div>
                        <div className="whitespace-nowrap font-mono text-sm font-medium text-foreground">
                          {formatTRY(l.pricePerUnit)}
                          <span className="text-xs text-hmuted">/{l.unit}</span>
                        </div>
                      </div>
                      {loggedIn === false ? (
                        <Link
                          to="/login"
                          search={{ role: "buyer" } as any}
                          className="mt-3 block w-full rounded-md bg-primary py-2.5 text-center text-sm text-primary-foreground"
                        >
                          Üye Ol & Teklif Ver →
                        </Link>
                      ) : (
                        <button
                          onClick={() =>
                            navigate({ to: "/buyer/offer/$listingId", params: { listingId: l.id } })
                          }
                          className="mt-3 w-full rounded-md bg-primary py-2.5 text-sm text-primary-foreground"
                        >
                          Teklif Ver →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {parcelsWithPhotos.length > 0 && (
          <div>
            <h2 className="font-serif text-lg mb-3">Tarlalarım</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {parcelsWithPhotos.map((p) => (
                <div key={p.id} className="rounded-2xl bg-card border overflow-hidden">
                  <div className="grid grid-cols-2 gap-0.5">
                    {(p.photos ?? []).slice(0, 4).map((u, i) => (
                      <img key={i} src={u} alt={p.name} className="h-28 w-full object-cover" />
                    ))}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-hmuted">
                      {p.area} dönüm{p.location.label ? ` · ${p.location.label}` : ""}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Üretici tarafından eklenmiştir
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="font-serif text-lg mb-3">Değerlendirmeler</h2>
          {recentReviews.length === 0 ? (
            <div className="rounded-2xl bg-card border p-6 text-sm text-hmuted text-center">
              Henüz değerlendirme yok.
            </div>
          ) : (
            <div className="space-y-2">
              {recentReviews.map((r) => (
                <div key={r.id} className="rounded-2xl bg-card border p-4">
                  <div className="flex items-center justify-between">
                    <RatingStars rating={r.rating} size={14} />
                    <span className="text-xs text-hmuted">
                      {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                  {r.comment && <p className="text-sm mt-2 text-hmuted">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
