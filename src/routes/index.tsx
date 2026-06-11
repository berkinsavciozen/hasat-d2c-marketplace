import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHasat } from "@/lib/hasat/store";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Hasat — Çiftçi & Alıcı Platformu" }] }),
  component: Entry,
});

function Entry() {
  const user = useHasat((s) => s.user);
  const setRole = useHasat((s) => s.setRole);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "farmer") navigate({ to: "/farmer/home" });
    else if (user?.role === "buyer") navigate({ to: "/buyer/discover" });
  }, [user, navigate]);

  const pick = (role: "farmer" | "buyer") => {
    if (role === "farmer") {
      navigate({ to: "/login" });
      return;
    }
    setRole(role);
    navigate({ to: "/buyer/discover" });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="mb-12 text-center">
        <div className="text-6xl mb-3">🌸</div>
        <h1 className="font-serif text-5xl mb-1">Hasat</h1>
        <div className="font-mono text-sm opacity-60">هارست</div>
        <p className="mt-4 max-w-xs text-sm text-hwhite/60">Tarlandan doğrudan sofraya. Türkiye'nin specialty üretici-alıcı platformu.</p>
      </div>
      <div className="grid w-full max-w-md gap-4">
        <button
          onClick={() => pick("farmer")}
          className="rounded-2xl p-6 text-left transition hover:scale-[1.01]"
          style={{ background: "color-mix(in oklab, var(--saffron) 18%, var(--dark))", border: "1px solid var(--saffron)" }}
        >
          <div className="mb-1 text-2xl">🌾</div>
          <div className="font-serif text-xl">Çiftçiyim</div>
          <div className="text-sm text-hwhite/60">Üretici olarak devam et →</div>
        </button>
        <button
          onClick={() => pick("buyer")}
          className="rounded-2xl p-6 text-left transition hover:scale-[1.01]"
          style={{ background: "color-mix(in oklab, var(--gold) 14%, var(--dark))", border: "1px solid var(--gold)" }}
        >
          <div className="mb-1 text-2xl">🏪</div>
          <div className="font-serif text-xl">Alıcıyım</div>
          <div className="text-sm text-hwhite/60">Restoran, otel, market, ihracatçı →</div>
        </button>
      </div>
    </div>
  );
}
