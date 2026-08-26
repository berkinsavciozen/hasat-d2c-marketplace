import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { useHasat } from "@/lib/hasat/store";
import { Check } from "lucide-react";

export const Route = createFileRoute("/farmer/premium")({ component: Premium });

const INCLUDED_FOR_ALL = [
  "Sınırsız ilan yayınlama",
  "Fiyat alarmı & piyasa sapma uyarıları",
  "Gelişmiş analitik",
  "Hasat aboneliği (alıcı taahhütleri)",
  "Topluluk erişimi",
];

function Premium() {
  const navigate = useNavigate();
  const user = useHasat((s) => s.user);
  const isPremium = !!user?.premium;

  return (
    <>
      <FarmerHeader title="Premium" subtitle="Sınırsız AI sohbeti" />
      <div className="max-w-3xl space-y-6 p-4 pb-32 md:p-8">
        <section className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">Premium</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Daha fazla AI sohbeti, aynı güçlü çiftlik araçları
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Premium yalnızca sohbet limitini kaldırır; operasyonel özelliklerin tamamı ücretsiz
            planda kalır.
          </p>
        </section>
        <div className="grid gap-3 md:grid-cols-2">
          <div
            className="rounded-2xl p-5 relative"
            style={{
              background: "var(--dark)",
              color: "var(--hwhite)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {!isPremium && (
              <span className="absolute -top-2 right-4 px-2 py-0.5 text-[10px] rounded-full bg-white/10">
                Mevcut
              </span>
            )}
            <div className="text-sm opacity-70">Ücretsiz</div>
            <div className="font-serif text-3xl mt-1">
              ₺0<span className="text-sm opacity-60"> / sonsuza dek</span>
            </div>
            <div className="mt-4 text-sm opacity-90">
              Ayda <span className="font-mono">50</span> AI mesajı
            </div>
            <div className="text-xs opacity-60 mt-1">Tüm platform özellikleri dahil</div>
          </div>

          <div
            className="rounded-2xl p-5 relative"
            style={{
              background: "var(--dark)",
              color: "var(--hwhite)",
              border: "1px solid var(--saffron)",
            }}
          >
            {isPremium && (
              <span
                className="absolute -top-2 right-4 px-2 py-0.5 text-[10px] rounded-full"
                style={{ background: "var(--sage)", color: "var(--hwhite)" }}
              >
                Aktif
              </span>
            )}
            <div className="text-sm opacity-70">Premium</div>
            <div className="font-serif text-3xl mt-1">
              ₺149<span className="text-sm opacity-60"> / ay</span>
            </div>
            <div className="mt-4 text-sm">
              <span className="font-medium">Sınırsız</span> AI sohbeti
            </div>
            <div className="text-xs opacity-70 mt-1">Aylık mesaj limiti yok</div>
            {!isPremium && (
              <button
                onClick={() => navigate({ to: "/farmer/billing" })}
                className="mt-4 min-h-[48px] w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground"
              >
                Premium'a Geç
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-3">Her iki planda da dahil</div>
          <ul className="space-y-2">
            {INCLUDED_FOR_ALL.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-sage shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-4">
            Premium yalnızca AI sohbet limitini kaldırır. Diğer tüm özellikler ücretsiz planda da
            tam olarak kullanılabilir.
          </p>
        </div>
      </div>
    </>
  );
}
