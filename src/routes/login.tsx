import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useHasat } from "@/lib/hasat/store";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Giriş — Hasat" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ role: (s.role === "buyer" ? "buyer" : "farmer") as "farmer" | "buyer" }),
  component: LoginPage,
});

function translateAuthError(e: Error): string {
  const m = (e?.message || "").toLowerCase();
  if (m.includes("expired") || m.includes("invalid") && m.includes("token") || m.includes("otp")) {
    return "Kod hatalı veya süresi dolmuş. Tekrar deneyin.";
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("limit")) {
    return "Çok fazla deneme. Lütfen biraz bekleyin.";
  }
  if (m.includes("phone")) return "Telefon numarası geçersiz.";
  return e?.message || "Bir hata oluştu.";
}

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = Route.useSearch();
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"wa" | "sms">("wa");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(30);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== "otp") return;
    setCountdown(30);
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Redirect already-authenticated users away from /login
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const r = (profile?.role === "buyer" ? "buyer" : "farmer") as "farmer" | "buyer";
      if (!profile?.name || profile.name.trim() === "") {
        navigate({ to: r === "buyer" ? "/onboarding/buyer" : "/onboarding/farmer" });
      } else {
        navigate({ to: r === "buyer" ? "/buyer/discover" : "/farmer/home" });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strip leading 0 (TR local format: 0533... -> 533...) before taking 10 digits
  const phoneDigits = phone.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10);
  const formattedPhone = phoneDigits.replace(/(\d{3})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(" "),
  );

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp]; next[i] = digit; setOtp(next);
    if (digit && i < 5) inputsRef.current[i + 1]?.focus();
  };
  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const txt = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!txt) return; e.preventDefault();
    const next = ["", "", "", "", "", ""];
    txt.split("").forEach((d, i) => (next[i] = d));
    setOtp(next);
    inputsRef.current[Math.min(txt.length, 5)]?.focus();
  };

  const sendOtp = async () => {
    if (phoneDigits.length !== 10 || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: "+90" + phoneDigits,
        options: {
          channel: channel === "wa" ? "whatsapp" : "sms",
          data: { role },
        },
      });
      if (error) throw error;
      setStep("otp");
      setOtp(["", "", "", "", "", ""]);
    } catch (e) {
      toast.error(translateAuthError(e as Error));
    } finally {
      setSending(false);
    }
  };

  const resend = async () => {
    if (countdown > 0) return;
    setCountdown(30);
    await sendOtp();
  };

  const verify = async () => {
    if (otp.some((d) => !d) || verifying) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: "+90" + phoneDigits,
        token: otp.join(""),
        type: "sms",
      });
      if (error || !data.user) throw error ?? new Error("Doğrulama başarısız");

      const profile = await queryClient.fetchQuery({
        queryKey: ["profile", data.user.id],
        queryFn: async () => {
          const { data: p, error: pErr } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", data.user!.id)
            .single();
          if (pErr) throw pErr;
          return p;
        },
      });

      const profileRole = (profile.role === "buyer" ? "buyer" : "farmer") as "farmer" | "buyer";
      setRole(profileRole);

      if (!profile.name || profile.name.trim() === "") {
        updateUser({ id: data.user.id, phone: data.user.phone ? "+" + data.user.phone : "+90 " + formattedPhone });
        navigate({ to: profileRole === "buyer" ? "/onboarding/buyer" : "/onboarding/farmer" });
      } else {
        updateUser({
          id: data.user.id,
          name: profile.name,
          phone: profile.phone ?? "+90 " + formattedPhone,
          city: profile.city ?? "",
          premium: !!profile.premium,
        });
        navigate({ to: profileRole === "buyer" ? "/buyer/discover" : "/farmer/home" });
      }
    } catch (e) {
      toast.error(translateAuthError(e as Error));
    } finally {
      setVerifying(false);
    }
  };

  const onbHref = role === "buyer" ? "/onboarding/buyer" : "/onboarding/farmer";
  const titleColor = role === "buyer" ? "var(--gold)" : "var(--saffron)";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mb-10 text-center">
        <div className="text-5xl mb-2">🌸</div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 38, color: titleColor }}>Hasat</h1>
        <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "var(--hmuted)" }}>هارست</div>
        <div className="mt-2 text-xs text-hwhite/60">{role === "buyer" ? "Alıcı Girişi" : "Çiftçi Girişi"}</div>
      </div>

      <div className="w-full max-w-sm">
        {step === "phone" ? (
          <>
            <label className="text-xs text-hwhite/60 mb-2 block">Telefon Numaranız</label>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
              <span className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-sm">🇹🇷 +90</span>
              <input value={formattedPhone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="5XX XXX XX XX"
                className="flex-1 bg-transparent outline-none text-base placeholder:text-hwhite/30" />
            </div>
            <div className="mt-5">
              <div className="text-xs text-hwhite/60 mb-2">Kod nereye gelsin?</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setChannel("wa")} className="rounded-xl px-3 py-3 text-sm"
                  style={{ background: channel === "wa" ? "color-mix(in oklab, var(--sage) 30%, var(--dark))" : "rgba(255,255,255,0.05)", border: channel === "wa" ? "1px solid var(--sage)" : "1px solid rgba(255,255,255,0.1)" }}>🟢 WhatsApp</button>
                <button onClick={() => setChannel("sms")} className="rounded-xl px-3 py-3 text-sm"
                  style={{ background: channel === "sms" ? "color-mix(in oklab, var(--saffron) 30%, var(--dark))" : "rgba(255,255,255,0.05)", border: channel === "sms" ? "1px solid var(--saffron)" : "1px solid rgba(255,255,255,0.1)" }}>💬 SMS</button>
              </div>
              <p className="text-[11px] text-hwhite/50 mt-2">Çiftçilerin %95'i WhatsApp kullanıyor</p>
            </div>
            <button disabled={phoneDigits.length !== 10 || sending} onClick={sendOtp}
              className="mt-6 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: titleColor, color: "var(--hwhite)" }}>{sending ? "Gönderiliyor..." : "Kod Gönder →"}</button>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <div className="text-xs text-hwhite/60">+90 {formattedPhone}</div>
              <div className="text-sm mt-1">6 haneli kodu girin</div>
            </div>
            <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
              {otp.map((d, i) => (
                <input key={i} ref={(el) => { inputsRef.current[i] = el; }} value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKey(i, e)}
                  inputMode="numeric" maxLength={1}
                  className="w-12 h-14 text-center rounded-lg border border-white/15 bg-white/5 outline-none focus:border-saffron"
                  style={{ fontFamily: "Courier New, monospace", fontSize: 22 }} />
              ))}
            </div>
            <div className="mt-3 text-center text-[11px] text-hwhite/50">
              {countdown > 0 ? `Tekrar gönder (${countdown}s)` : (<button onClick={resend} className="underline">Tekrar gönder</button>)}
            </div>
            <button disabled={otp.some((d) => !d) || verifying} onClick={verify}
              className="mt-6 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: titleColor, color: "var(--hwhite)" }}>{verifying ? "Doğrulanıyor..." : "Giriş Yap ✓"}</button>
            <button onClick={() => setStep("phone")} className="mt-3 w-full text-xs text-hwhite/50">← Numarayı değiştir</button>
          </>
        )}
        <div className="mt-8 text-center text-xs text-hwhite/50">
          Hesabın yoksa otomatik oluşturulur. Telefonunla devam et.
        </div>
      </div>
    </div>
  );
}
