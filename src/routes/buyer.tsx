import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  Search,
  Package,
  BarChart3,
  MessageCircle,
  User,
  Repeat,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { useRealtimeSync, useAuthUserId } from "@/lib/hasat/queries";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BrandLogo } from "@/components/hasat/BrandLogo";

export const Route = createFileRoute("/buyer")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    // Public exception: producer profile is viewable by guests (with limited CTAs).
    if (location.pathname.startsWith("/buyer/producer/")) return;
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
  { to: "/buyer/community", label: "Topluluk", icon: Users },
  { to: "/buyer/account", label: "Hesap", icon: User },
] as const;

const mobileTabs = [
  { to: "/buyer/discover", label: "Keşfet", icon: Search },
  { to: "/buyer/orders", label: "Siparişler", icon: Package },
  { to: "/buyer/messages", label: "Mesajlar", icon: MessageCircle },
  { to: "/buyer/reports", label: "Raporlar", icon: BarChart3 },
] as const;

const moreItems = [
  { to: "/buyer/subscriptions", label: "Abonelikler", icon: Repeat },
  { to: "/buyer/community", label: "Topluluk", icon: Users },
  { to: "/buyer/account", label: "Hesap", icon: User },
] as const;

function BuyerShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  useRealtimeSync(useAuthUserId());
  const moreActive = moreItems.some((i) => pathname.startsWith(i.to));
  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside
        className="hidden md:flex flex-col gap-1 p-4 sticky top-0 h-screen"
        style={{ background: "var(--dark)", color: "var(--hwhite)" }}
      >
        <div className="mb-6">
          <BrandLogo variant="wordmark" tone="white" height={20} />
          <div className="font-mono text-[10px] opacity-50 tracking-widest mt-1">ALICI PANELİ</div>
        </div>
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? "text-hwhite" : "text-hwhite/70 hover:bg-white/5"}`}
              style={
                active
                  ? {
                      background: "color-mix(in oklab, var(--primary) 28%, transparent)",
                      borderLeft: "2px solid var(--primary)",
                    }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
      </aside>
      <main className="min-w-0 overflow-x-hidden pb-24 md:pb-0 min-h-screen">
        <Outlet />
      </main>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t pb-safe"
        style={{ background: "var(--dark)" }}
      >
        {mobileTabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-0.5 py-2 text-[10px]"
              style={{ color: active ? "var(--primary)" : "var(--hwhite)" }}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[10px]"
          style={{ color: moreActive ? "var(--primary)" : "var(--hwhite)" }}
          aria-label="Daha fazla"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>Daha</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-2xl border-t-0 p-0"
          style={{ background: "var(--dark)", color: "var(--hwhite)" }}
        >
          <SheetHeader className="px-4 pt-4 pb-2 text-left">
            <SheetTitle className="text-hwhite font-serif">Menü</SheetTitle>
          </SheetHeader>
          <div className="px-3 pb-6 space-y-1">
            {moreItems.map(({ to, label, icon: Icon }) => {
              const active = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${active ? "text-hwhite" : "text-hwhite/80 hover:bg-white/5"}`}
                  style={
                    active
                      ? {
                          background: "color-mix(in oklab, var(--primary) 28%, transparent)",
                          borderLeft: "2px solid var(--primary)",
                        }
                      : undefined
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
