import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Search, Package, BarChart3, MessageCircle, User, Repeat } from "lucide-react";
import { useRealtimeSync } from "@/lib/hasat/queries";

export const Route = createFileRoute("/buyer")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("hasat-store");
    if (!raw) throw redirect({ to: "/" });
    try {
      const role = JSON.parse(raw)?.state?.user?.role;
      if (role !== "buyer") throw redirect({ to: "/" });
    } catch {
      throw redirect({ to: "/" });
    }
  },
  component: BuyerShell,
});

const tabs = [
  { to: "/buyer/discover", label: "Keşfet", icon: Search },
  { to: "/buyer/orders", label: "Siparişler", icon: Package },
  { to: "/buyer/subscriptions", label: "Abonelikler", icon: Repeat },
  { to: "/buyer/reports", label: "Raporlar", icon: BarChart3 },
  { to: "/buyer/messages", label: "Mesajlar", icon: MessageCircle },
  { to: "/buyer/account", label: "Hesap", icon: User },
] as const;

function BuyerShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useRealtimeSync();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="hidden md:flex flex-col gap-1 p-4 sticky top-0 h-screen" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🌸</span>
          <div>
            <div className="font-serif text-lg leading-tight">Hasat</div>
            <div className="font-mono text-[10px] opacity-50 tracking-widest">ALICI PANELİ</div>
          </div>
        </div>
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link key={to} to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? "bg-saffron text-white" : "text-hwhite/70 hover:bg-white/5"}`}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
      </aside>
      <main className="pb-24 md:pb-0 min-h-screen"><Outlet /></main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t pb-safe" style={{ background: "var(--dark)" }}>
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link key={to} to={to} className="flex flex-col items-center gap-0.5 py-2 text-[10px]"
              style={{ color: active ? "var(--saffron)" : "var(--hwhite)" }}>
              <Icon className="h-5 w-5" /><span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
