import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbToListing } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatTRY } from "@/lib/hasat/format";
import { TrustBadge } from "@/components/hasat/TrustBadge";
import type { Listing } from "@/lib/hasat/types";

export const Route = createFileRoute("/s/$slug")({
  head: () => ({ meta: [{ title: "Vitrin | Hasat" }] }),
  component: PublicStorefront,
  notFoundComponent: () => (
    <div className="p-8 text-center text-hmuted">Vitrin bulunamadı.</div>
  ),
});

const CROP_EMOJI: Record<string, string> = {
  Safran: "🌸", Lavanta: "💜", "Tıbbi Bitkiler": "🌿", Fındık: "🌰", Zeytinyağı: "🫒",
};

function slugify(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useStorefront(slug: string) {
  return useQuery({
    queryKey: ["publicStorefront", slug],
    queryFn: async () => {
      let profile: { id: string; name: string | null; city: string | null } | null = null;
      if (UUID_RE.test(slug)) {
        const { data } = await supabase
          .from("profiles").select("id, name, city")
          .eq("id", slug).eq("role", "farmer").maybeSingle();
        profile = data ?? null;
      }
      if (!profile) {
        // Fallback: try to find by slugified name.
        const { data } = await supabase
          .from("profiles").select("id, name, city").eq("role", "farmer");
        const match = (data ?? []).find((p) => p.name && slugify(p.name) === slug);
        profile = match ?? null;
      }
      if (!profile) return null;
      const { data: rows } = await supabase
        .from("listings").select("*")
        .eq("farmer_id", profile.id).eq("status", "active")
        .order("created_at", { ascending: false });
      return { profile, listings: (rows ?? []).map(dbToListing) };
    },
  });
}

function PublicStorefront() {
  const { slug } = Route.useParams();
  const { data, isLoading, error } = useStorefront(slug);

  if (isLoading) return <div className="p-8"><LoadingDots /></div>;
  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-hmuted">Vitrini görmek için giriş yapmalısınız.</div>
        <Link to="/login" className="inline-block rounded-full bg-saffron px-4 py-2 text-sm text-white">Giriş Yap</Link>
      </div>
    );
  }
  if (!data) throw notFound();

  const { profile, listings } = data;

  return (
    <div>
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

      <div className="p-4 md:p-8 space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">Aktif Ürünler</h2>
        {listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
            Bu üreticinin şu anda aktif ürünü yok.
          </div>
        ) : (
          listings.map((l: Listing) => (
            <Link
              key={l.id}
              to="/buyer/offer/$listingId"
              params={{ listingId: l.id }}
              className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:border-saffron/40"
            >
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-cream text-2xl">
                {l.photos?.[0] ? (
                  <img src={l.photos[0]} alt={l.crop} className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  CROP_EMOJI[l.crop] ?? "🌾"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{l.crop}</div>
                <div className="text-xs text-hmuted">
                  {l.quantity} {l.unit} · Min {l.minOrder} {l.unit} · Kalite {l.quality}
                </div>
              </div>
              <div className="font-mono text-sm text-saffron whitespace-nowrap">
                {formatTRY(l.pricePerUnit)}/{l.unit}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
