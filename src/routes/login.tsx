import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, MessageSquareText } from "lucide-react";
import { useHasat } from "@/lib/hasat/store";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/hasat/BrandLogo";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Giriş — Hasat" }] }),
  validateSearch: (s: Record<string, unknown>): { role?: "farmer" | "buyer"; next?: string } => {
    const out: { role?: "farmer" | "buyer"; next?: string } = {};
    if (s.role === "buyer") out.role = "buyer";
    else if (s.role === "farmer") out.role = "farmer";
    // Only preserve same-origin relative paths — never external URLs.
    if (typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")) {
      out.next = s.next;
    }
    return out;
  },
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
  const { role: roleParam, next } = Route.useSearch();
  const role: "farmer" | "buyer" = roleParam ?? "farmer";
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"wa" | "sms">("wa");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState<string | null>(null);
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
      const hasProfile = !!profile?.name && profile.name.trim() !== "";
      if (next && hasProfile) {
        window.location.href = next;
        return;
      }
      if (!hasProfile) {
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
    setOtpError(null);
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
      setOtpError(null);
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
    setOtpError(null);
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

      // Normalize phone to 905XXXXXXXXX (no '+') to match DB unique constraint and webhook lookup
      const normalizedPhone = "90" + phoneDigits;

      if (!profile.name || profile.name.trim() === "") {
        updateUser({ id: data.user.id, phone: normalizedPhone });
        navigate({ to: profileRole === "buyer" ? "/onboarding/buyer" : "/onboarding/farmer" });
      } else {
        updateUser({
          id: data.user.id,
          name: profile.name,
          phone: (profile.phone ?? normalizedPhone).replace(/^\+/, ""),
          city: profile.city ?? "",
          premium: !!profile.premium,
        });
        if (next) {
          window.location.href = next;
        } else {
          navigate({ to: profileRole === "buyer" ? "/buyer/discover" : "/farmer/home" });
        }
      }
    } catch (e) {
      const msg = translateAuthError(e as Error);
      toast.error(msg);
      setOtpError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const otherRole: "farmer" | "buyer" = role === "buyer" ? "farmer" : "buyer";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mb-10 text-center">
        <BrandLogo variant="wordmark" tone="white" height={36} className="mx-auto mb-2" />
        <div className="mt-2 text-xs text-hwhite/60">{role === "buyer" ? "Alıcı Girişi" : "Üretici Girişi"}</div>
        <Link
          to="/login"
          search={{ role: otherRole, ...(next ? { next } : {}) }}
          className="mt-1 inline-block text-[11px] underline text-hwhite/50 hover:text-hwhite/80"
        >
          Rol değiştir
        </Link>
      </div>

      <div className="w-full max-w-sm">
        {step === "phone" ? (
          <>
            <label className="text-xs text-hwhite/60 mb-2 block">Telefon Numaranız</label>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 focus-within:border-primary">
              <span className="rounded-md bg-white/10 px-2 py-1 text-sm text-hwhite/80">+90</span>
              <input value={formattedPhone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="5XX XXX XX XX"
                className="flex-1 bg-transparent outline-none text-base placeholder:text-hwhite/30" />
            </div>
            <div className="mt-5">
              <div className="text-xs text-hwhite/60 mb-2">Kod nereye gelsin?</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setChannel("wa")}
                  className="rounded-xl px-3 py-3 text-sm min-h-[48px] inline-flex items-center justify-center gap-1.5 transition"
                  style={{
                    background: channel === "wa" ? "color-mix(in oklab, var(--primary) 22%, var(--dark))" : "rgba(255,255,255,0.05)",
                    border: channel === "wa" ? "1px solid var(--primary)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <MessageCircle className="w-4 h-4" style={{ color: "var(--whatsapp)" }} /> WhatsApp
                </button>
                <button
                  onClick={() => setChannel("sms")}
                  className="rounded-xl px-3 py-3 text-sm min-h-[48px] inline-flex items-center justify-center gap-1.5 transition"
                  style={{
                    background: channel === "sms" ? "color-mix(in oklab, var(--primary) 22%, var(--dark))" : "rgba(255,255,255,0.05)",
                    border: channel === "sms" ? "1px solid var(--primary)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <MessageSquareText className="w-4 h-4 text-hwhite/70" /> SMS
                </button>
              </div>
            </div>
            <button disabled={phoneDigits.length !== 10 || sending} onClick={sendOtp}
              className="mt-6 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--primary)", color: "var(--hwhite)" }}>{sending ? "Gönderiliyor..." : "Kod Gönder →"}</button>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <div className="text-xs text-hwhite/60">+90 {formattedPhone}</div>
              <div className="text-sm mt-1">6 haneli kodu girin</div>
            </div>
            <div className="flex justify-between gap-1" onPaste={handleOtpPaste}>
              {otp.map((d, i) => (
                <input key={i} ref={(el) => { inputsRef.current[i] = el; }} value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKey(i, e)}
                  inputMode="numeric" maxLength={1}
                  aria-invalid={otpError ? true : undefined}
                  className="w-10 h-12 sm:w-12 sm:h-14 min-w-0 flex-1 text-center rounded-lg border bg-white/5 outline-none font-mono text-xl transition-colors"
                  style={{ borderColor: otpError ? "var(--hred)" : "rgba(255,255,255,0.15)" }} />
              ))}
            </div>
            {otpError && (
              <p className="mt-2 text-center text-[11px]" style={{ color: "var(--hred)" }}>{otpError}</p>
            )}
            <div className="mt-3 text-center text-[11px] text-hwhite/50">
              {countdown > 0 ? `Tekrar gönder (${countdown}s)` : (<button onClick={resend} className="underline" style={{ color: "var(--teal)" }}>Tekrar gönder</button>)}
            </div>
            <button disabled={otp.some((d) => !d) || verifying} onClick={verify}
              className="mt-6 w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--primary)", color: "var(--hwhite)" }}>{verifying ? "Doğrulanıyor..." : "Giriş Yap"}</button>
            <button onClick={() => { setStep("phone"); setOtpError(null); }} className="mt-3 w-full text-xs text-hwhite/50">← Numarayı değiştir</button>
          </>
        )}
        <div className="mt-8 text-center text-xs text-hwhite/50">
          Hesabın yoksa otomatik oluşturulur. Telefonunla devam et.
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-hwhite/50">
          <Link to="/terms" className="underline hover:text-hwhite/80">Kullanım Koşulları</Link>
          <Link to="/privacy" className="underline hover:text-hwhite/80">Gizlilik</Link>
        </div>
      </div>
    </div>
  );
}
