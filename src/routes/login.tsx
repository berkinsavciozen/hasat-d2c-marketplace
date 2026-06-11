import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useHasat } from "@/lib/hasat/store";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Giriş — Hasat" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"wa" | "sms">("wa");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(30);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== "otp") return;
    setCountdown(30);
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const phoneDigits = phone.replace(/\D/g, "").slice(0, 10);
  const formattedPhone = phoneDigits.replace(/(\d{3})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(" "),
  );

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const txt = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!txt) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    txt.split("").forEach((d, i) => (next[i] = d));
    setOtp(next);
    inputsRef.current[Math.min(txt.length, 5)]?.focus();
  };

  const submit = () => {
    setRole("farmer");
    updateUser({ phone: "+90 " + formattedPhone });
    navigate({ to: "/farmer/home" });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mb-10 text-center">
        <div className="text-5xl mb-2">🌸</div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 38, color: "var(--saffron)" }}>Hasat</h1>
        <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "var(--hmuted)" }}>هارست</div>
      </div>

      <div className="w-full max-w-sm">
        {step === "phone" ? (
          <>
            <label className="text-xs text-hwhite/60 mb-2 block">Telefon Numaranız</label>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
              <span className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-sm">🇹🇷 +90</span>
              <input
                value={formattedPhone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                placeholder="5XX XXX XX XX"
                className="flex-1 bg-transparent outline-none text-base placeholder:text-hwhite/30"
              />
            </div>

            <div className="mt-5">
              <div className="text-xs text-hwhite/60 mb-2">Kod nereye gelsin?</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setChannel("wa")}
                  className="rounded-xl px-3 py-3 text-sm transition"
                  style={{
                    background: channel === "wa" ? "color-mix(in oklab, var(--sage) 30%, var(--dark))" : "rgba(255,255,255,0.05)",
                    border: channel === "wa" ? "1px solid var(--sage)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  🟢 WhatsApp
                </button>
                <button
                  onClick={() => setChannel("sms")}
                  className="rounded-xl px-3 py-3 text-sm transition"
                  style={{
                    background: channel === "sms" ? "color-mix(in oklab, var(--saffron) 30%, var(--dark))" : "rgba(255,255,255,0.05)",
                    border: channel === "sms" ? "1px solid var(--saffron)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  💬 SMS
                </button>
              </div>
              <p className="text-[11px] text-hwhite/50 mt-2">Çiftçilerin %95'i WhatsApp kullanıyor</p>
            </div>

            <button
              disabled={phoneDigits.length !== 10}
              onClick={() => setStep("otp")}
              className="mt-6 w-full rounded-xl py-3 text-sm font-medium transition disabled:opacity-40"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
            >
              Kod Gönder →
            </button>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <div className="text-xs text-hwhite/60">+90 {formattedPhone}</div>
              <div className="text-sm mt-1">6 haneli kodu girin</div>
            </div>
            <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputsRef.current[i] = el; }}
                  value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKey(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  className="w-12 h-14 text-center rounded-lg border border-white/15 bg-white/5 outline-none focus:border-saffron"
                  style={{ fontFamily: "Courier New, monospace", fontSize: 22 }}
                />
              ))}
            </div>
            <div className="mt-3 text-center text-[11px] text-hwhite/50">
              {countdown > 0 ? `Tekrar gönder (${countdown}s)` : (
                <button onClick={() => setCountdown(30)} className="underline">Tekrar gönder</button>
              )}
            </div>
            <button
              disabled={otp.some((d) => !d)}
              onClick={submit}
              className="mt-6 w-full rounded-xl py-3 text-sm font-medium transition disabled:opacity-40"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
            >
              Giriş Yap ✓
            </button>
            <button onClick={() => setStep("phone")} className="mt-3 w-full text-xs text-hwhite/50">
              ← Numarayı değiştir
            </button>
          </>
        )}

        <div className="mt-8 text-center text-sm text-hwhite/60">
          Hesabın yok mu?{" "}
          <Link to="/onboarding/farmer" className="text-saffron underline">Kayıt ol →</Link>
        </div>
      </div>
    </div>
  );
}
