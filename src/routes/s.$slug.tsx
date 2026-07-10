import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbToListing, dbToParcel } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { formatCrop } from "@/lib/hasat/format";
import { TrustBadge } from "@/components/hasat/TrustBadge";
import { CoverageBadge } from "@/components/hasat/CoverageBadge";
import type { Listing, Parcel } from "@/lib/hasat/types";

export const Route = createFileRoute("/s/$slug")({
  head: () => ({ meta: [{ title: "Vitrin | Hasat" }] }),
  component: PublicStorefront,
  notFoundComponent: () => (
    <div className="p-8 text-center text-hmuted">Vitrin bulunamadı.</div>
  ),
});

import { cropEmoji } from "@/lib/hasat/crop-config";

function slugify(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
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
          .from("public_farmer_profiles").select("id, name, city")
          .eq("id", slug).maybeSingle();
        profile = data ?? null;
      }
      if (!profile) {
        const { data } = await (supabase as any)
          .from("public_farmer_profiles").select("id, name, city");
        const match = (data ?? []).find((p: any) => p.name && slugify(p.name) === slug);
        profile = match ?? null;
      }
      if (!profile) return null;
      const [{ data: lRows }, { data: pRows }, { data: cRows }] = await Promise.all([
        supabase.from("listings").select("*")
          .eq("farmer_id", profile.id).eq("status", "active")
          .order("created_at", { ascending: false }),
        (supabase as any).from("public_parcel_cards").select("*")
          .eq("farmer_id", profile.id)
          .order("created_at", { ascending: true }),
        (supabase as any).from("public_certifications")
          .select("id, type, verified_at, expires_at")
          .eq("farmer_id", profile.id),
      ]);
      // Public parcels omit lat/lng — construct Parcel-like objects with safe defaults.
      const parcels = (pRows ?? []).map((r: any) => ({
        ...dbToParcel({ ...r, lat: 0, lng: 0 }),
      }));
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
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);
  return loggedIn;
}

function PublicStorefront() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useStorefront(slug);
  const loggedIn = useIsLoggedIn();

  if (isLoading) return <div className="p-8"><LoadingDots /></div>;
  if (!data) throw notFound();

  const { profile, listings, parcels, certs } = data;
  const parcelsWithPhotos = parcels.filter((p: Parcel) => (p.photos ?? []).length > 0);
  const activeCerts = certs.filter((c) => {
    if (!c.expires_at) return true;
    const t = new Date(c.expires_at).getTime();
    return isNaN(t) || t >= Date.now();
  });

  return (
    <div className="pb-24">
      <div className="px-4 pt-5 pb-6 md:px-8" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <Link to="/buyer/discover" className="inline-grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="mt-3 font-serif text-2xl">{profile.name ?? "Üretici"}</h1>
        <div className="text-sm opacity-80">📍 {profile.city ?? "—"}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TrustBadge type="hasat" />
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-6">
        {activeCerts.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">Sertifikalar</h2>
            <div className="flex flex-wrap gap-2">
              {activeCerts.map((c) => (
                <span key={c.id}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: "color-mix(in oklab, var(--sage) 30%, transparent)" }}>
                  ✓ {c.type}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">Aktif Ürünler</h2>
          {listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
              Bu üreticinin şu anda aktif ürünü yok.
            </div>
          ) : (
            listings.map((l: Listing) => (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4"
              >
                <div className="grid h-14 w-14 place-items-center rounded-xl bg-cream text-2xl overflow-hidden">
                  {l.photos?.[0] ? (
                    <img src={l.photos[0]} alt={formatCrop(l.crop)} className="h-14 w-14 object-cover" />
                  ) : (
                    cropEmoji(l.crop)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{formatCrop(l.crop)}</div>
                  <div className="text-xs text-hmuted">
                    {l.quantity} {l.unit} · Min {l.minOrder} {l.unit} · Kalite {l.quality}
                  </div>
                  <div className="mt-1"><CoverageBadge listingId={l.id} crop={l.crop} compact /></div>
                </div>
                <div className="font-mono text-sm text-saffron whitespace-nowrap">
                  {formatTRY(l.pricePerUnit)}/{l.unit}
                </div>
              </div>
            ))
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
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {loggedIn === false && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur px-4 py-3 md:px-8">
          <Link
            to="/login"
            search={{ role: "buyer" } as any}
            className="block w-full rounded-full py-3 text-center text-sm font-semibold"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
          >
            Teklif göndermek için giriş yapın
          </Link>
        </div>
      )}
    </div>
  );
}
