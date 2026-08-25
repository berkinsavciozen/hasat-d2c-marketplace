import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Share2,
  CalendarPlus,
  Image as ImageIcon,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dbToListing, dbToParcel, useProfile } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY, formatQuantity } from "@/lib/hasat/format";
import { formatCrop } from "@/lib/hasat/format";
import { CoverageBadge } from "@/components/hasat/CoverageBadge";
import { RepresentativeBadge } from "@/components/hasat/RepresentativePhoto";
import type { Listing, Parcel } from "@/lib/hasat/types";

export const Route = createFileRoute("/s/$slug")({
  head: () => ({ meta: [{ title: "Vitrin | Hasat" }] }),
  component: PublicStorefront,
  notFoundComponent: () => <div className="p-8 text-center text-hmuted">Vitrin bulunamadı.</div>,
});

import {
  cropEmoji,
  findCropConfig,
  resolveListingPhoto,
  useCropConfigMap,
} from "@/lib/hasat/crop-config";

function slugify(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cert = { id: string; type: string; verified_at: string | null; expires_at: string | null };

function useStorefront(slug: string) {
  return useQuery({
    queryKey: ["publicStorefront", slug],
    queryFn: async () => {
      let profile: { id: string; name: string | null; city: string | null } | null = null;
      if (UUID_RE.test(slug)) {
        const { data } = await (supabase as any)
          .from("public_farmer_profiles")
          .select("id, name, city")
          .eq("id", slug)
          .maybeSingle();
        profile = data ?? null;
      }
      if (!profile) {
        const { data } = await (supabase as any)
          .from("public_farmer_profiles")
          .select("id, name, city");
        const match = (data ?? []).find((p: any) => p.name && slugify(p.name) === slug);
        profile = match ?? null;
      }
      if (!profile) return null;
      const [{ data: lRows }, { data: pRows }, { data: cRows }] = await Promise.all([
        supabase
          .from("listings")
          .select("*")
          .eq("farmer_id", profile.id)
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("public_parcel_cards")
          .select("*")
          .eq("farmer_id", profile.id)
          .order("created_at", { ascending: true }),
        (supabase as any)
          .from("public_certifications")
          .select("id, type, verified_at, expires_at")
          .eq("farmer_id", profile.id),
      ]);
      // Public parcels omit lat/lng — construct Parcel-like objects with safe defaults.
      const parcels: Parcel[] = (pRows ?? []).map((r: any) => dbToParcel({ ...r, lat: 0, lng: 0 }));
      return {
        profile,
        listings: (lRows ?? []).map(dbToListing),
        parcels,
        certs: (cRows ?? []) as Cert[],
      };
    },
  });
}

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

function PublicStorefront() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useStorefront(slug);
  const loggedIn = useIsLoggedIn();
  const { data: myProfile } = useProfile();
  const { map: cropMap } = useCropConfigMap();

  if (isLoading)
    return (
      <div className="p-8">
        <LoadingDots />
      </div>
    );
  if (!data) throw notFound();

  const { profile, listings, parcels, certs } = data;
  const isBuyer = loggedIn && myProfile?.role === "buyer";
  const isOwnStorefront = myProfile?.id === profile.id;
  const showSubscribeCTA = isBuyer && !isOwnStorefront;
  const parcelsWithPhotos = parcels.filter((p: Parcel) => (p.photos ?? []).length > 0);
  const realHeroPhoto =
    parcelsWithPhotos[0]?.photos?.[0] ??
    listings.find((l) => (l.photos ?? []).length > 0)?.photos?.[0] ??
    null;
  // P23-M7-g: M7-f'de hero bilinçli dışarıda bırakılmıştı ama gerekçe (56px
  // avatarda etiket okunaklı basmıyor) hero'ya uygulanmıyordu — burada gerçek
  // foto yoksa crop fallback + ⓘ ile Keşfet'le tutarlı hale getirildi. 56px
  // ilan avatarı (aşağıda) kasıtlı olarak dokunulmadı, o karar geçerli.
  const heroCfg = findCropConfig(cropMap, listings[0]?.crop);
  const { photoUrl: heroPhoto, isRepresentative: heroIsRepresentative } = resolveListingPhoto(
    realHeroPhoto ? [realHeroPhoto] : [],
    heroCfg,
  );
  const activeCerts = certs.filter((c) => {
    if (!c.expires_at) return true;
    const t = new Date(c.expires_at).getTime();
    return isNaN(t) || t >= Date.now();
  });

  const shareStorefront = async () => {
    const shareData = {
      title: `${profile.name ?? "Üretici"} — Hasat`,
      text: `${profile.name ?? "Üretici"} vitrinini Hasat'ta keşfet.`,
      url: typeof window !== "undefined" ? window.location.href : "",
    };
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share(shareData);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        toast.success("Vitrin linki kopyalandı");
      }
    } catch {
      /* user canceled */
    }
  };

  return (
    <div className="pb-28">
      <div
        className="relative overflow-hidden bg-primary px-4 pb-6 pt-5 text-primary-foreground md:px-8"
        style={{
          background: heroPhoto
            ? `linear-gradient(180deg, color-mix(in oklab, var(--primary) 48%, transparent) 0%, var(--primary) 100%), url(${heroPhoto}) center/cover no-repeat`
            : undefined,
        }}
      >
        {heroIsRepresentative && <RepresentativeBadge className="absolute bottom-3 right-4 z-20" />}
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <Link
              to="/buyer/discover"
              className="inline-grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/15"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <button
              onClick={shareStorefront}
              aria-label="Vitrini paylaş"
              className="inline-grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/15"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
          <h1 className="mt-4 font-serif text-2xl md:text-3xl drop-shadow-sm">
            {profile.name ?? "Üretici"}
          </h1>
          <div className="mt-1 inline-flex items-center gap-1.5 text-sm opacity-90">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {profile.city ?? "Konum belirtilmemiş"}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <section aria-label="Üretici kanıt özeti" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-xs text-hmuted">Aktif ürün</div>
            <div className="mt-1 font-semibold">{listings.length}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-xs text-hmuted">Aktif sertifika</div>
            <div className="mt-1 font-semibold">{activeCerts.length}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-xs text-hmuted">Fotoğraflı tarla</div>
            <div className="mt-1 font-semibold">{parcelsWithPhotos.length}</div>
          </div>
        </section>

        {activeCerts.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">
              Sertifikalar
            </h2>
            <div className="flex flex-wrap gap-2">
              {activeCerts.map((c) => (
                <span
                  key={c.id}
                  className={
                    c.verified_at
                      ? "inline-flex items-center gap-1.5 rounded-full bg-sage/20 px-3 py-1 text-xs font-medium text-foreground"
                      : "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  }
                >
                  {c.verified_at && (
                    <ShieldCheck className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
                  )}
                  {c.type}
                  {c.expires_at ? ` · ${new Date(c.expires_at).toLocaleDateString("tr-TR")}` : ""}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">
            Aktif Ürünler
          </h2>
          {listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
              Bu üreticinin şu anda aktif ürünü yok.
            </div>
          ) : (
            listings.map((l: Listing) => {
              const canOffer = isBuyer && !isOwnStorefront;
              const handleClick = () => {
                if (canOffer) {
                  navigate({ to: "/buyer/offer/$listingId", params: { listingId: l.id } });
                } else if (loggedIn === false) {
                  navigate({ to: "/login", search: { role: "buyer" } as any });
                }
              };
              const clickable = canOffer || loggedIn === false;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={clickable ? handleClick : undefined}
                  disabled={!clickable}
                  className="flex min-h-[48px] w-full flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition hover:border-primary/50 disabled:cursor-default disabled:hover:border-border sm:flex-row sm:items-center"
                >
                  <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-32">
                    {(() => {
                      const listingCfg = findCropConfig(cropMap, l.crop);
                      const { photoUrl, isRepresentative } = resolveListingPhoto(
                        l.photos,
                        listingCfg,
                      );
                      return photoUrl ? (
                        <>
                          <img
                            src={photoUrl}
                            alt={formatCrop(l.crop)}
                            className="h-full w-full object-cover"
                          />
                          {isRepresentative && (
                            <RepresentativeBadge className="absolute right-2 top-2" />
                          )}
                        </>
                      ) : (
                        <div className="grid h-full w-full place-items-center text-2xl">
                          {cropEmoji(l.crop, listingCfg)}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{formatCrop(l.crop)}</div>
                    <div className="text-xs text-hmuted">
                      {formatQuantity(l.quantity, l.unit)} {l.unit} · Min{" "}
                      {formatQuantity(l.minOrder, l.unit)} {l.unit}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Kalite {l.quality}</div>
                    <div className="mt-1">
                      <CoverageBadge listingId={l.id} crop={l.crop} compact />
                    </div>
                  </div>
                  {loggedIn === false ? (
                    <span className="whitespace-nowrap rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                      Giriş yap
                    </span>
                  ) : (
                    <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
                      <div className="whitespace-nowrap font-mono text-sm font-medium text-foreground">
                        {formatTRY(l.pricePerUnit)}/{l.unit}
                      </div>
                      {canOffer && (
                        <span className="whitespace-nowrap rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                          Teklif Ver
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </section>

        {parcelsWithPhotos.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">Tarlalarım</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {parcelsWithPhotos.map((p) => (
                <div key={p.id} className="rounded-2xl border bg-card overflow-hidden">
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
          </section>
        )}
      </div>

      {showSubscribeCTA && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 pt-3 pb-safe backdrop-blur md:px-8">
          <button
            onClick={() =>
              navigate({
                to: "/buyer/subscription/$producerId",
                params: { producerId: profile.id },
              })
            }
            className="mx-auto flex min-h-[48px] w-full max-w-5xl items-center justify-center gap-2 rounded-md border border-primary bg-card py-3 text-center text-sm font-semibold text-primary"
          >
            <CalendarPlus className="h-4 w-4" />
            Hasat Aboneliği Oluştur
          </button>
        </div>
      )}

      {loggedIn === false && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 pt-3 pb-safe backdrop-blur md:px-8">
          <Link
            to="/login"
            search={{ role: "buyer" } as any}
            className="mx-auto block w-full max-w-5xl rounded-md bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
          >
            Teklif göndermek için giriş yapın
          </Link>
        </div>
      )}
    </div>
  );
}
