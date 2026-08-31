import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Utensils, Hotel, ShoppingBasket, Ship, Building2, Star } from "lucide-react";
import { useHasat } from "@/lib/hasat/store";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CropChips } from "@/components/hasat/CropChips";
import { activatePremium } from "@/lib/api/premium.functions";
import { markExpectedSignOut, isNetworkAuthError } from "@/lib/hasat/sessionGuard";

export const Route = createFileRoute("/onboarding/buyer")({
  head: () => ({ meta: [{ title: "Kayıt — Hasat Alıcı" }] }),
  component: BuyerOnboarding,
});

const TYPES = [
  { id: "restoran", icon: Utensils, label: "Restoran" },
  { id: "otel", icon: Hotel, label: "Otel" },
  { id: "market", icon: ShoppingBasket, label: "Organik Market" },
  { id: "ihracatci", icon: Ship, label: "İhracatçı" },
  { id: "diger", icon: Building2, label: "Diğer" },
] as const;

const VOLUMES = ["< 100g", "100g–1kg", "1–10kg", "10kg+"];

function BuyerOnboarding() {
  const navigate = useNavigate();
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);
  const setPremium = useHasat((s) => s.setPremium);

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"company" | "individual">("company");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["id"] | "">("");
  const [interests, setInterests] = useState<string[]>([]);
  const [volume, setVolume] = useState("");
  const [address, setAddress] = useState("");
  const [trial, setTrial] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        // P23-M8-b-2 — geçici bir ağ hatası bu sayfaya doğru şekilde
        // ulaşmış (giriş yapılmış) bir kullanıcıyı /login'e geri
        // fırlatmasın; bir sonraki adımda (Devam Et) zaten gerçek bir
        // Supabase çağrısı yapılıyor, o an gerçekten oturum yoksa orada
        // ortaya çıkar.
        if (isNetworkAuthError(error) && useHasat.getState().user?.role === "buyer") {
          return;
        }
        navigate({ to: "/login", search: { role: "buyer" } });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.name && profile.name.trim() !== "") {
        const r = profile.role === "buyer" ? "buyer" : "farmer";
        navigate({ to: r === "buyer" ? "/buyer/discover" : "/farmer/home" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P23-M8-b-2 — bu sayfanın hiç çıkış yolu yoktu: bir kullanıcı buraya
  // yanlışlıkla düşerse (ör. geçici ağ hatası) ne devam edebiliyordu (henüz
  // kayıt tamamlanmadığı için "Zaten hesabın var mı?" linki işine yaramıyor)
  // ne de çıkış yapabiliyordu — "o sayfada tamamen kilitleniyor" bulgusunun
  // kök nedeni buydu. `markExpectedSignOut()` + `signOut()`, merkezi
  // `AuthBootstrap` dinleyicisinin (kural #106 deseni) aynı temizliği
  // yapmasına bırakıyor.
  const handleSignOut = async () => {
    markExpectedSignOut();
    await supabase.auth.signOut();
  };

  const toggle = (arr: string[], setter: (v: string[]) => void, v: string) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Oturum bulunamadı, lütfen tekrar giriş yapın.");
        navigate({ to: "/login", search: { role: "buyer" } });
        return;
      }
      const isIndividual = mode === "individual";
      const buyerType = isIndividual
        ? "bireysel"
        : ((type || "diger") as (typeof TYPES)[number]["id"]);
      const dbType = buyerType === "market" ? "organik_market" : buyerType;

      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        role: "buyer",
        name: company,
        phone: user.phone ? "+" + user.phone : null,
        buyer_type: dbType,
      });
      if (pErr) throw pErr;

      const { error: bErr } = await supabase.from("buyer_profiles").insert({
        user_id: user.id,
        company_name: company,
        company_type: dbType,
        monthly_volume: volume,
      });
      if (bErr) throw bErr;

      setRole("buyer");
      updateUser({
        id: user.id,
        name: company || "Alıcı",
        crops: interests,
        company: { name: company, type: buyerType as never, address, volume },
      });
      if (trial) {
        try {
          await activatePremium();
          setPremium(true);
        } catch (e) {
          toast.error("Premium deneme başlatılamadı. Bilgileriniz korundu; tekrar deneyin.");
          return;
        }
      }
      navigate({ to: "/buyer/discover" });
    } catch (e) {
      toast.error(
        isNetworkAuthError(e instanceof Error ? e : null)
          ? "Bağlantı kurulamadı. Bilgileriniz korundu; internetinizi kontrol edip tekrar deneyin."
          : "Kayıt tamamlanamadı. Bilgileriniz korundu; lütfen tekrar deneyin.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <ProgressDots current={step} total={3} />
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs underline text-hwhite/60 hover:text-hwhite"
          >
            Çıkış Yap
          </button>
        </div>

        {step === 1 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">
              {mode === "individual" ? "Kişisel Bilgiler" : "Şirket Bilgileri"}
            </h2>
            <p className="text-sm text-hwhite/60 mb-6">Üreticilerin sizi tanıması için.</p>

            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl p-1 border border-white/10 bg-white/5">
              {(["company", "individual"] as const).map((m) => {
                const on = mode === m;
                return (
                  <button
                    type="button"
                    key={m}
                    aria-pressed={on}
                    onClick={() => {
                      setMode(m);
                      if (m === "individual") setType("");
                    }}
                    className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition"
                    style={{
                      background: on ? "var(--primary)" : "transparent",
                      color: "var(--hwhite)",
                    }}
                  >
                    {m === "company" ? "Şirket" : "Bireysel"}
                  </button>
                );
              })}
            </div>

            <label htmlFor="buyer-name" className="text-xs text-hwhite/60">
              {mode === "individual" ? "Adınız Soyadınız" : "Şirket Adı"}
            </label>
            <Input
              id="buyer-name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={mode === "individual" ? "Örn. Ayşe Yılmaz" : "Örn. Mikla Restaurant"}
              className="mt-1 mb-5 bg-white/5 border-white/10 text-hwhite"
            />

            {mode === "company" && (
              <>
                <label className="text-xs text-hwhite/60 mb-2 block">İşletme Tipi</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map((t) => {
                    const on = type === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        aria-pressed={on}
                        onClick={() => setType(t.id)}
                        className="rounded-xl p-4 text-left border transition"
                        style={{
                          background: on
                            ? "color-mix(in oklab, var(--primary) 18%, var(--dark))"
                            : "rgba(255,255,255,0.05)",
                          borderColor: on ? "var(--primary)" : "rgba(255,255,255,0.1)",
                        }}
                      >
                        <Icon
                          className="w-5 h-5 mb-1.5"
                          style={{ color: on ? "var(--primary)" : "var(--hwhite)" }}
                        />
                        <div className="text-sm font-medium">{t.label}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!company || (mode === "company" && !type)}
              className="mt-8 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--primary)", color: "var(--hwhite)" }}
            >
              Devam →
            </button>
            <div className="mt-4 text-center text-sm text-hwhite/60">
              Zaten hesabın var mı?{" "}
              <Link
                to="/login"
                search={{ role: "buyer" }}
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline text-hwhite/80"
              >
                Giriş Yap
              </Link>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">Ne Alıyorsunuz?</h2>
            <p className="text-sm text-hwhite/60 mb-6">Eşleşmeler için ilgi alanlarınız.</p>
            <label className="text-xs text-hwhite/60">İlgilendiğiniz Ürünler</label>
            <div className="mt-2 mb-6">
              <CropChips value={interests} onChange={setInterests} variant="dark" context="buyer" />
            </div>
            <label className="text-xs text-hwhite/60 mb-2 block">Aylık Tahmini Hacim</label>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {VOLUMES.map((v) => {
                const on = volume === v;
                return (
                  <button
                    type="button"
                    key={v}
                    aria-pressed={on}
                    onClick={() => setVolume(v)}
                    className="rounded-xl px-3 py-3 text-sm border transition"
                    style={{
                      background: on
                        ? "color-mix(in oklab, var(--primary) 18%, var(--dark))"
                        : "rgba(255,255,255,0.05)",
                      borderColor: on ? "var(--primary)" : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!interests.length || !volume}
              className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--primary)", color: "var(--hwhite)" }}
            >
              Devam →
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-3 min-h-11 w-full text-xs text-hwhite/50"
            >
              ← Geri
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">Son Adım</h2>
            <p className="text-sm text-hwhite/60 mb-6">
              Adresinizi ekleyin ve denemenizi başlatın.
            </p>
            <label htmlFor="buyer-address" className="text-xs text-hwhite/60">
              {mode === "individual" ? "Adres (opsiyonel)" : "Şirket Adresi (opsiyonel)"}
            </label>
            <Input
              id="buyer-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Beyoğlu, İstanbul"
              className="mt-1 mb-6 bg-white/5 border-white/10 text-hwhite"
            />
            <div
              className="rounded-xl p-4 flex items-start gap-3 border"
              style={{
                background: "color-mix(in oklab, var(--gold) 14%, var(--dark))",
                borderColor: "var(--gold)",
              }}
            >
              <Star className="w-5 h-5 shrink-0" style={{ color: "var(--gold)" }} />
              <div className="flex-1">
                <div className="font-medium text-sm">30 gün ücretsiz Premium</div>
                <div className="text-xs text-hwhite/70 mt-0.5">
                  Öncelikli eşleşme, gelişmiş analitik ve hasat aboneliği.
                </div>
              </div>
              <Switch
                checked={trial}
                onCheckedChange={setTrial}
                aria-label="30 günlük Premium denemeyi başlat"
              />
            </div>
            <Button
              onClick={finish}
              loading={saving}
              loadingLabel="Bilgiler kaydediliyor"
              className="mt-8 w-full rounded-xl text-sm font-medium"
            >
              Keşfetmeye Başla →
            </Button>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={saving}
              className="mt-3 min-h-11 w-full text-xs text-hwhite/50 disabled:opacity-40"
            >
              ← Geri
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
