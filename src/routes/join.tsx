import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { NotebookPen, LineChart, Store } from "lucide-react";
import { lookupReferralOwner } from "@/lib/hasat/queries";
import { BrandLogo } from "@/components/hasat/BrandLogo";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Hasat'a Katıl — Çiftçi Daveti" },
      { name: "description", content: "Bir çiftçi seni Hasat'a davet etti. Ürünlerini doğrudan alıcılara sat." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search) => z.object({ ref: z.string().optional() }).parse(search),
  component: JoinPage,
});

function JoinPage() {
  const { ref } = Route.useSearch();
  const [inviter, setInviter] = useState<{ id: string; name: string | null } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ref) { setChecking(false); return; }
      const owner = await lookupReferralOwner(ref);
      if (cancelled) return;
      if (owner) {
        window.localStorage.setItem("hasat_ref", ref.trim().toUpperCase());
        setInviter(owner);
      }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [ref]);

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mx-auto max-w-md pt-10">
        <div className="text-center">
          <BrandLogo variant="monogram" tone="white" height={52} className="mx-auto mb-3" />
          <h1 className="font-serif text-4xl text-hwhite">Hasat'a Hoş Geldin</h1>
          {checking ? (
            <p className="mt-3 text-sm text-hwhite/60">Davet doğrulanıyor…</p>
          ) : inviter ? (
            <p className="mt-3 text-sm text-hwhite/70">
              <span className="font-medium text-hwhite">{inviter.name ?? "Bir çiftçi"}</span> seni Hasat'a davet etti.
            </p>
          ) : ref ? (
            <p className="mt-3 text-sm text-hred/80">Davet kodu bulunamadı, yine de kayıt olabilirsin.</p>
          ) : (
            <p className="mt-3 text-sm text-hwhite/60">Tarlandan doğrudan sofraya.</p>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {[
            { icon: NotebookPen, title: "Dijital Tarla Günlüğü", desc: "Hasatlarını kaydet, kâr/zararını gör" },
            { icon: LineChart, title: "Fiyat Zekâsı", desc: "Hal, D2C ve ihracat fiyatlarını karşılaştır" },
            { icon: Store, title: "Vitrin ve Doğrudan Satış", desc: "Ürünlerini doğrudan premium alıcılara sat" },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
              <div className="grid place-items-center w-9 h-9 shrink-0 rounded-lg" style={{ background: "color-mix(in oklab, var(--primary) 20%, transparent)", color: "var(--primary)" }}>
                <c.icon className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-hwhite/60 mt-0.5">{c.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <Link
          to="/login"
          search={{ role: "farmer" }}
          className="mt-8 block w-full rounded-xl py-3 text-center text-sm font-medium"
          style={{ background: "var(--primary)", color: "var(--hwhite)" }}
        >
          Kayıt Ol / Giriş Yap →
        </Link>
        <div className="mt-4 text-center text-xs text-hwhite/50">
          Devam ederek Hasat Kullanım Şartları'nı kabul edersin.
        </div>
      </div>
    </div>
  );
}
