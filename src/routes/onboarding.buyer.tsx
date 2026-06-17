import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useHasat } from "@/lib/hasat/store";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding/buyer")({
  head: () => ({ meta: [{ title: "Kayıt — Hasat Alıcı" }] }),
  component: BuyerOnboarding,
});

const TYPES = [
  { id: "restoran", icon: "🍽️", label: "Restoran" },
  { id: "otel", icon: "🏨", label: "Otel" },
  { id: "market", icon: "🛒", label: "Organik Market" },
  { id: "ihracatci", icon: "🚢", label: "İhracatçı" },
  { id: "diger", icon: "🏢", label: "Diğer" },
] as const;

const CROPS = ["Safran", "Lavanta", "Tıbbi Bitkiler", "Fındık", "Zeytin", "Diğer"];
const VOLUMES = ["< 100g", "100g–1kg", "1–10kg", "10kg+"];

function BuyerOnboarding() {
  const navigate = useNavigate();
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);
  const setPremium = useHasat((s) => s.setPremium);

  const [step, setStep] = useState(1);
  const [company, setCompany] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["id"] | "">("");
  const [interests, setInterests] = useState<string[]>([]);
  const [volume, setVolume] = useState("");
  const [address, setAddress] = useState("");
  const [trial, setTrial] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggle = (arr: string[], setter: (v: string[]) => void, v: string) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Oturum bulunamadı, lütfen tekrar giriş yapın.");
        navigate({ to: "/login", search: { role: "buyer" } });
        return;
      }
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        role: "buyer",
        name: company,
        phone: user.phone ? "+" + user.phone : null,
      });
      if (pErr) throw pErr;

      const buyerType = (type || "diger") as (typeof TYPES)[number]["id"];
      const dbType =
        buyerType === "market" ? "organik_market" : buyerType;
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
      if (trial) setPremium(true);
      navigate({ to: "/buyer/discover" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mx-auto max-w-md">
        <div className="mb-6"><ProgressDots current={step} total={3} /></div>

        {step === 1 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">Şirket Bilgileri</h2>
            <p className="text-sm text-hwhite/60 mb-6">Üreticilerin sizi tanıması için.</p>
            <label className="text-xs text-hwhite/60">Şirket Adı</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Örn. Mikla Restaurant"
              className="mt-1 mb-5 bg-white/5 border-white/10 text-hwhite" />
            <label className="text-xs text-hwhite/60 mb-2 block">İşletme Tipi</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => {
                const on = type === t.id;
                return (
                  <button key={t.id} onClick={() => setType(t.id)}
                    className="rounded-xl p-4 text-left border transition"
                    style={{ background: on ? "color-mix(in oklab, var(--gold) 18%, var(--dark))" : "rgba(255,255,255,0.05)", borderColor: on ? "var(--gold)" : "rgba(255,255,255,0.1)" }}>
                    <div className="text-2xl mb-1">{t.icon}</div>
                    <div className="text-sm font-medium">{t.label}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setStep(2)} disabled={!company || !type}
              className="mt-8 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--gold)", color: "var(--dark)" }}>Devam →</button>
            <div className="mt-4 text-center text-sm text-hwhite/60">
              Zaten hesabın var mı? <Link to="/login" search={{ role: "buyer" }} className="underline" style={{ color: "var(--gold)" }}>Giriş Yap</Link>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">Ne Alıyorsunuz?</h2>
            <p className="text-sm text-hwhite/60 mb-6">Eşleşmeler için ilgi alanlarınız.</p>
            <label className="text-xs text-hwhite/60">İlgilendiğiniz Ürünler</label>
            <div className="mt-2 mb-6 flex flex-wrap gap-2">
              {CROPS.map((c) => (
                <button key={c} onClick={() => toggle(interests, setInterests, c)}
                  className="rounded-full px-3 py-1.5 text-xs border transition"
                  style={{ background: interests.includes(c) ? "var(--gold)" : "rgba(255,255,255,0.05)", color: interests.includes(c) ? "var(--dark)" : undefined, borderColor: interests.includes(c) ? "var(--gold)" : "rgba(255,255,255,0.15)" }}>{c}</button>
              ))}
            </div>
            <label className="text-xs text-hwhite/60 mb-2 block">Aylık Tahmini Hacim</label>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {VOLUMES.map((v) => {
                const on = volume === v;
                return (
                  <button key={v} onClick={() => setVolume(v)}
                    className="rounded-xl px-3 py-3 text-sm border transition"
                    style={{ background: on ? "color-mix(in oklab, var(--gold) 18%, var(--dark))" : "rgba(255,255,255,0.05)", borderColor: on ? "var(--gold)" : "rgba(255,255,255,0.1)" }}>{v}</button>
                );
              })}
            </div>
            <button onClick={() => setStep(3)} disabled={!interests.length || !volume}
              className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--gold)", color: "var(--dark)" }}>Devam →</button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">Son Adım</h2>
            <p className="text-sm text-hwhite/60 mb-6">Adresinizi ekleyin ve denemenizi başlatın.</p>
            <label className="text-xs text-hwhite/60">Şirket Adresi (opsiyonel)</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Beyoğlu, İstanbul"
              className="mt-1 mb-6 bg-white/5 border-white/10 text-hwhite" />
            <div className="rounded-xl p-4 flex items-start gap-3 border"
              style={{ background: "color-mix(in oklab, var(--gold) 14%, var(--dark))", borderColor: "var(--gold)" }}>
              <div className="text-2xl">⭐</div>
              <div className="flex-1">
                <div className="font-medium text-sm">30 gün ücretsiz Premium</div>
                <div className="text-xs text-hwhite/70 mt-0.5">Öncelikli eşleşme, gelişmiş analitik ve hasat aboneliği.</div>
              </div>
              <Switch checked={trial} onCheckedChange={setTrial} />
            </div>
            <button onClick={finish} disabled={saving}
              className="mt-8 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--gold)", color: "var(--dark)" }}>{saving ? "Kaydediliyor..." : "Keşfetmeye Başla →"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
