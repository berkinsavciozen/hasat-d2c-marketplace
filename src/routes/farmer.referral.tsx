import { createFileRoute } from "@tanstack/react-router";
import { Copy, Link2, MessageCircle, Users, Gift, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FarmerHeader } from "./farmer";
import {
  useProfile,
  useReferredFarmers,
  useReferralQualifications,
  isEffectivelyPremium,
} from "@/lib/hasat/queries";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { PUBLIC_BASE_URL as PUBLIC_BASE } from "@/lib/hasat/constants";

export const Route = createFileRoute("/farmer/referral")({
  head: () => ({ meta: [{ title: "Arkadaşını Davet Et — Hasat" }] }),
  component: ReferralPage,
});

function ReferralPage() {
  const { data: profile, isLoading } = useProfile();
  const { data: referred = [] } = useReferredFarmers();
  const { data: quals = [] } = useReferralQualifications();
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
      <div className="max-w-2xl px-4 py-5 pb-32 md:px-8 md:pb-5">
        {isLoading || !code ? (
          <LoadingDots />
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-5 text-center sm:p-6">
              <p className="text-sm text-muted-foreground">
                Hasat'ı birlikte büyütün, nitelikli davetlerle Premium kazanın.
              </p>
              <div className="mt-5 text-xs uppercase tracking-widest text-hmuted">Davet Kodun</div>
              <div className="mt-3 break-all font-mono text-3xl font-bold tracking-[0.18em] text-primary sm:text-5xl">
                {code}
              </div>
              <div className="mt-2 break-all font-mono text-[11px] text-hmuted">{link}</div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => copy(code, "Kod")}
                  className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium hover:bg-muted"
                >
                  <Copy className="h-4 w-4" /> Kopyala
                </button>
                <button
                  onClick={() => copy(link, "Link")}
                  className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium hover:bg-muted"
                >
                  <Link2 className="h-4 w-4" /> Linki Paylaş
                </button>
              </div>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium text-white"
                style={{ background: "var(--whatsapp)" }}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp ile Paylaş
              </a>
            </div>

            {/* Reward progress */}
            {(() => {
              const count = quals.length;
              const inCycle = count % 3;
              const remaining = inCycle === 0 && count > 0 ? 3 : 3 - inCycle;
              const premiumActive = isEffectivelyPremium(profile);
              return (
                <div className="mt-6 rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-5 w-5 text-gold" />
                    <h2 className="font-serif text-base">Ödül İlerlemen</h2>
                  </div>
                  <p className="text-sm text-hmuted mb-3">
                    Her <strong>3 gerçek sipariş</strong> tamamlayan davetin için sana{" "}
                    <strong>12 ay Premium</strong> hediye.
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-2 flex-1 rounded-full"
                        style={{
                          background:
                            i < inCycle || (inCycle === 0 && count > 0)
                              ? inCycle === 0 && count > 0
                                ? "var(--sage)"
                                : "var(--primary)"
                              : "var(--muted)",
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-xs text-hmuted">
                    {count} nitelikli davet · sonraki ödüle {remaining} kaldı
                  </div>
                  {premiumActive && profile?.premium_until && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-sage/10 p-3 text-sm">
                      <Sparkles className="mt-0.5 h-4 w-4 text-sage" />
                      <div>
                        🎉 Premium aktif —{" "}
                        <strong>
                          {new Date(profile.premium_until).toLocaleDateString("tr-TR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </strong>{" "}
                        tarihine kadar geçerli.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
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
