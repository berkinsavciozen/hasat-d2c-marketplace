import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useHasat } from "@/lib/hasat/store";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyStoredReferral } from "@/lib/hasat/queries";
import type { CertificationType } from "@/lib/hasat/types";

export const Route = createFileRoute("/onboarding/farmer")({
  head: () => ({ meta: [{ title: "Kayıt — Hasat Çiftçi" }] }),
  component: Onboarding,
});

const CITIES = ["Karabük / Safranbolu", "Isparta", "Tokat", "Kastamonu", "Diğer"];
const CROPS = ["Safran", "Lavanta", "Tıbbi Bitkiler", "Fındık", "Zeytin", "Diğer"];
const CERTS = [
  { id: "organik", icon: "🌿", label: "Organik Sertifikası", desc: "Tarım Bakanlığı onaylı" },
  { id: "iso", icon: "📐", label: "ISO 3632", desc: "Safran kalite standardı" },
  { id: "globalgap", icon: "🌍", label: "GlobalGAP", desc: "İhracat için gerekli" },
  { id: "cografi", icon: "📍", label: "Coğrafi İşaret", desc: "Bölgesel ürün koruması" },
];

function Onboarding() {
  const navigate = useNavigate();
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [crops, setCrops] = useState<string[]>([]);
  const [land, setLand] = useState(5);
  const [certs, setCerts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        navigate({ to: "/login", search: { role: "farmer" } });
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
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (skip = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Oturum bulunamadı, lütfen tekrar giriş yapın.");
        navigate({ to: "/login", search: { role: "farmer" } });
        return;
      }
      const profileName = skip ? "Çiftçi" : name;
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        role: "farmer",
        name: profileName,
        city: skip ? null : city,
        phone: user.phone ? "+" + user.phone : null,
        premium: false,
      });
      if (pErr) throw pErr;

      if (!skip && certs.length > 0) {
        const validCerts = certs.filter((c): c is CertificationType =>
          ["organik", "iso", "cografi"].includes(c),
        );
        await Promise.all(
          validCerts.map((type) =>
            supabase.from("certifications").insert({ farmer_id: user.id, type }),
          ),
        );
      }

      setRole("farmer");
      updateUser({
        id: user.id,
        name: profileName,
        premium: false,
        ...(skip ? {} : { city, crops, landSize: land, certs }),
      });
      navigate({ to: "/farmer/home" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (arr: string[], setter: (v: string[]) => void, v: string) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mx-auto max-w-md">
        {step > 1 && (
          <div className="mb-6">
            <ProgressDots current={step} total={3} />
          </div>
        )}

        {step === 1 && (
          <>
            <div className="text-center mb-8 mt-8">
              <div className="text-5xl mb-2">🌸</div>
              <h1 style={{ fontFamily: "Georgia, serif", fontSize: 38, color: "var(--saffron)" }}>Hasat'a Hoş Geldin</h1>
              <p className="text-sm text-hwhite/60 mt-2">Tarlandan doğrudan sofraya</p>
            </div>
            <div className="space-y-3">
              {[
                { icon: "📓", title: "Dijital Defter", desc: "Hasatlarını kaydet, kâr/zararını gör" },
                { icon: "📈", title: "Fiyat Zekası", desc: "Hal, D2C ve ihracat fiyatlarını karşılaştır" },
                { icon: "🏪", title: "Vitrin", desc: "Ürünlerini doğrudan premium alıcılara sat" },
              ].map((c) => (
                <div key={c.title} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
                  <div className="text-2xl">{c.icon}</div>
                  <div>
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs text-hwhite/60 mt-0.5">{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              className="mt-8 w-full rounded-xl py-3 text-sm font-medium"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
            >
              Başla →
            </button>
            <div className="mt-4 text-center text-sm text-hwhite/60">
              Zaten hesabın var mı? <Link to="/login" className="text-saffron underline">Giriş Yap</Link>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">Profilini Tanı</h2>
            <p className="text-sm text-hwhite/60 mb-6">Daha iyi eşleşmeler için bilgilerini ekle.</p>

            <label className="text-xs text-hwhite/60">Adın</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mehmet Yılmaz"
              className="mt-1 mb-4 bg-white/5 border-white/10 text-hwhite" />

            <label className="text-xs text-hwhite/60">Şehir / İlçe</label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="mt-1 mb-4 bg-white/5 border-white/10 text-hwhite"><SelectValue placeholder="Seç..." /></SelectTrigger>
              <SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>

            <label className="text-xs text-hwhite/60">Ana Ürünlerin</label>
            <div className="mt-2 mb-4 flex flex-wrap gap-2">
              {CROPS.map((c) => (
                <button key={c} onClick={() => toggle(crops, setCrops, c)}
                  className="rounded-full px-3 py-1.5 text-xs border transition"
                  style={{
                    background: crops.includes(c) ? "var(--saffron)" : "rgba(255,255,255,0.05)",
                    borderColor: crops.includes(c) ? "var(--saffron)" : "rgba(255,255,255,0.15)",
                  }}>{c}</button>
              ))}
            </div>

            <label className="text-xs text-hwhite/60">Arazi Büyüklüğü: <span style={{ color: "var(--saffron)" }}>{land} dönüm</span></label>
            <Slider value={[land]} min={0.5} max={100} step={0.5} onValueChange={([v]) => setLand(v)} className="mt-3 mb-6" />

            <button onClick={() => setStep(3)} disabled={!name || !city}
              className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>Devam →</button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4">
            <h2 className="font-serif text-2xl mb-1">Sertifikalar</h2>
            <p className="text-sm text-saffron mb-6">Belgelenmiş üreticiler 3x daha fazla teklif alıyor</p>

            <div className="space-y-2 mb-4">
              {CERTS.map((c) => {
                const on = certs.includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggle(certs, setCerts, c.id)}
                    className="w-full text-left rounded-xl p-4 flex items-start gap-3 border transition"
                    style={{
                      background: on ? "color-mix(in oklab, var(--saffron) 18%, var(--dark))" : "rgba(255,255,255,0.05)",
                      borderColor: on ? "var(--saffron)" : "rgba(255,255,255,0.1)",
                    }}>
                    <div className="text-2xl">{c.icon}</div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{c.label}</div>
                      <div className="text-xs text-hwhite/60 mt-0.5">{c.desc}</div>
                    </div>
                    <div className="text-lg">{on ? "✓" : ""}</div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border-2 border-dashed border-white/15 p-6 text-center mb-6">
              <FileText className="mx-auto h-8 w-8 opacity-60" />
              <div className="text-sm mt-2">Belge yükle</div>
              <div className="text-xs text-hwhite/50">JPG, PDF — maks 10MB</div>
            </div>

            <button onClick={() => finish(false)} disabled={saving}
              className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}>{saving ? "Kaydediliyor..." : "Profilimi oluştur ✓"}</button>
            <button onClick={() => finish(true)} disabled={saving} className="mt-3 w-full text-sm text-hwhite/50 disabled:opacity-40">Şimdilik atla</button>
          </div>
        )}
      </div>
    </div>
  );
}
