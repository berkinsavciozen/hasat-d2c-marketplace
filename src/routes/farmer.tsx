import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Bell, BarChart3, BookOpen, Home, LineChart, Store, Users, Settings, Crown, Handshake } from "lucide-react";
import { useHasat } from "@/lib/hasat/store";
import { SeasonBanner } from "@/components/hasat/SeasonBanner";
import { FarmPill } from "@/components/hasat/FarmPill";
import { RoleSwitcher } from "@/components/hasat/RoleSwitcher";

export const Route = createFileRoute("/farmer")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("hasat-store");
    if (!raw) throw redirect({ to: "/" });
    try {
      const role = JSON.parse(raw)?.state?.user?.role;
      if (role !== "farmer") throw redirect({ to: "/" });
    } catch {
      throw redirect({ to: "/" });
    }
  },
  component: FarmerShell,
});

const tabs = [
  { to: "/farmer/home", label: "Ana Sayfa", icon: Home },
  { to: "/farmer/journal", label: "Günlük", icon: BookOpen },
  { to: "/farmer/prices", label: "Fiyatlar", icon: LineChart },
  { to: "/farmer/storefront", label: "Vitrin", icon: Store },
  { to: "/farmer/analytics", label: "Analitik", icon: BarChart3 },
] as const;

const sidebarExtras = [
  { to: "/farmer/community", label: "Topluluk", icon: Users },
  { to: "/farmer/orders", label: "Teklifler", icon: Handshake, badge: 3 },
] as const;


function FarmerShell() {
  const user = useHasat((s) => s.user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col gap-4 p-4 sticky top-0 h-screen" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌸</span>
            <div>
              <div className="font-serif text-lg leading-tight">Hasat</div>
              <div className="font-mono text-[10px] opacity-50 tracking-widest">ÇİFTÇİ PANELİ</div>
            </div>
          </div>
          <div className="mt-3">
            <FarmPill city="Karabük" area={5} crop="Safran" />
          </div>
          <div className="mt-3">
            <SeasonBanner />
          </div>
        </div>

        <nav className="flex flex-col gap-1 mt-2">
          {[...tabs, ...sidebarExtras].map(({ to, label, icon: Icon, ...rest }) => {
            const active = pathname.startsWith(to);
            const badge = (rest as { badge?: number }).badge;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-saffron text-white" : "text-hwhite/70 hover:bg-white/5"}`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {badge ? <span className="rounded-full bg-saffron px-1.5 text-[10px] text-white">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <Link
            to="/farmer/premium"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ background: "color-mix(in oklab, var(--gold) 18%, transparent)", color: "var(--gold)" }}
          >
            <Crown className="h-4 w-4" /> Premium'a Geç
          </Link>
          <Link to="/farmer/settings" className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 p-2 hover:bg-white/10">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-saffron text-xs font-bold">
              {user?.name?.[0] ?? "M"}
            </div>
            <div className="flex-1 text-xs">
              <div className="font-medium">{user?.name}</div>
              <div className="opacity-50">{user?.city}</div>
            </div>
            <Settings className="h-4 w-4 opacity-50" />
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="pb-20 md:pb-0 min-h-screen">
        <Outlet />
      </main>

      {/* Bottom tabs (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t" style={{ background: "var(--dark)" }}>
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link key={to} to={to} className="flex flex-col items-center gap-0.5 py-2 text-[10px]"
              style={{ color: active ? "var(--saffron)" : "var(--hwhite)" }}>
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <RoleSwitcher />
    </div>
  );
}

export function FarmerHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 pt-5 pb-4 md:px-8 md:pt-8" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl">{title}</h1>
          {subtitle ? <p className="text-sm text-hwhite/60 mt-0.5">{subtitle}</p> : null}
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <Bell className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}
