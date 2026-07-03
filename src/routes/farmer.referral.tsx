import { createFileRoute } from "@tanstack/react-router";
import { Copy, Link2, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { FarmerHeader } from "./farmer";
import { useProfile, useReferredFarmers } from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";

export const Route = createFileRoute("/farmer/referral")({
  head: () => ({ meta: [{ title: "Arkadaşını Davet Et — Hasat" }] }),
  component: ReferralPage,
});

const PUBLIC_BASE = "https://hasat.lovable.app";

function ReferralPage() {
  const { data: profile, isLoading } = useProfile();
  const { data: referred = [] } = useReferredFarmers();
  const code = profile?.referral_code ?? "";
  const link = `${PUBLIC_BASE}/join?ref=${code}`;
  const waMessage = `Hasat'ta ürünlerini D2C satmaya başla! Davet kodum: ${code} — ${link}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} kopyalandı`);
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  return (
    <>
      <FarmerHeader title="Arkadaşını Davet Et" subtitle="Diğer çiftçileri Hasat'a çağır" />
      <div className="px-4 md:px-8 py-5 pb-32 md:pb-5 max-w-2xl">
        {isLoading || !code ? (
          <LoadingDots />
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-6 text-center">
              <div className="text-xs uppercase tracking-widest text-hmuted">Davet Kodun</div>
              <div className="mt-3 font-mono text-5xl font-bold tracking-widest" style={{ color: "var(--saffron)" }}>
                {code}
              </div>
              <div className="mt-2 truncate font-mono text-[11px] text-hmuted">{link}</div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => copy(code, "Kod")}
                  className="flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium hover:bg-cream"
                >
                  <Copy className="h-4 w-4" /> Kopyala
                </button>
                <button
                  onClick={() => copy(link, "Link")}
                  className="flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium hover:bg-cream"
                >
                  <Link2 className="h-4 w-4" /> Linki Paylaş
                </button>
              </div>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium text-white"
                style={{ background: "#25D366" }}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp ile Paylaş
              </a>
            </div>

            <section className="mt-8">
              <h2 className="font-serif text-lg flex items-center gap-2">
                <Users className="h-5 w-5" /> Davet Ettiğin Çiftçiler
              </h2>
              {referred.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed p-8 text-center text-sm text-hmuted">
                  Davet ettiğin çiftçiler burada görünecek.
                </div>
              ) : (
                <ul className="mt-3 divide-y rounded-2xl border bg-card">
                  {referred.map((r: any) => (
                    <li key={r.id} className="flex items-center gap-3 p-4">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-saffron text-white text-sm font-bold">
                        {r.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{r.name ?? "Çiftçi"}</div>
                        <div className="text-xs text-hmuted">{r.city ?? ""}</div>
                      </div>
                      <div className="text-[11px] text-hmuted">
                        {new Date(r.created_at).toLocaleDateString("tr-TR")}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
