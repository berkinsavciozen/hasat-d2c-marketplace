import { createFileRoute, Link, Outlet, redirect, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, BookOpen, Home, LineChart, Store, Users, Settings, Crown, Handshake, MoreHorizontal, Gift, HelpCircle, CalendarClock } from "lucide-react";
import { FARMER_TOUR_STORAGE_KEY } from "@/lib/hasat/onboarding-tour";
import { useProfile, useParcels, useRealtimeSync, useAuthUserId, useFarmerOffers, useIncomingSubscriptions } from "@/lib/hasat/queries";
import { SeasonBanner } from "@/components/hasat/SeasonBanner";
import { FarmPill } from "@/components/hasat/FarmPill";
import { NotificationBell } from "@/components/hasat/NotificationBell";
import { BrandLogo } from "@/components/hasat/BrandLogo";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FarmerAIChat } from "@/components/hasat/ai-chat/FarmerAIChat";

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

const mobileTabs = [
  { to: "/farmer/home", label: "Ana Sayfa", icon: Home },
  { to: "/farmer/journal", label: "Günlük", icon: BookOpen },
  { to: "/farmer/prices", label: "Fiyatlar", icon: LineChart },
  { to: "/farmer/storefront", label: "Vitrin", icon: Store },
] as const;

const moreItems = [
  { to: "/farmer/analytics", label: "Analitik", icon: BarChart3 },
  { to: "/farmer/community", label: "Topluluk", icon: Users },
  { to: "/farmer/orders", label: "Teklifler", icon: Handshake },
  { to: "/farmer/subscriptions", label: "Abonelikler", icon: CalendarClock },
  { to: "/farmer/referral", label: "Arkadaşını Davet Et", icon: Gift },
] as const;

const sidebarExtras = [
  { to: "/farmer/community", label: "Topluluk", icon: Users },
  { to: "/farmer/orders", label: "Teklifler", icon: Handshake },
  { to: "/farmer/subscriptions", label: "Abonelikler", icon: CalendarClock },
  { to: "/farmer/referral", label: "Arkadaşını Davet Et", icon: Gift },
] as const;



function FarmerShell() {
  const { data: profile } = useProfile();
  const { data: parcels = [] } = useParcels();
  const { data: offers } = useFarmerOffers();
  const { data: incomingSubs } = useIncomingSubscriptions();
  const pendingCount = offers?.filter((o) => o.status === "pending").length ?? 0;
  const pendingSubs = incomingSubs?.filter((s) => s.status === "pending").length ?? 0;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  useRealtimeSync(useAuthUserId());

  const restartTour = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(FARMER_TOUR_STORAGE_KEY);
    }
    setMoreOpen(false);
    const trigger = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hasat:tour:restart"));
      }
    };
    if (pathname.startsWith("/farmer/home")) {
      trigger();
    } else {
      navigate({ to: "/farmer/home" }).then(() => setTimeout(trigger, 300));
    }
  };
  const totalArea = parcels.reduce((s, p) => s + (p.area ?? 0), 0);
  const allCrops = parcels.flatMap((p) => p.crops ?? []);
  const cropCounts = allCrops.reduce<Record<string, number>>((m, c) => { m[c] = (m[c] ?? 0) + 1; return m; }, {});
  const primaryCrop = allCrops.length === 0 ? "—" : Object.entries(cropCounts).sort((a, b) => b[1] - a[1])[0][0];
  const areaForChip = parcels.length === 0 ? null : totalArea;

  const city = profile?.city ?? "—";
  const displayName = profile?.name ?? "";

  const moreActive = moreItems.some((i) => pathname.startsWith(i.to)) ||
    pathname.startsWith("/farmer/premium") || pathname.startsWith("/farmer/settings");

  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col gap-4 p-4 sticky top-0 h-screen" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
        <div>
          <div>
            <BrandLogo variant="wordmark" tone="white" height={20} />
            <div className="font-mono text-[10px] opacity-50 tracking-widest mt-1">ÇİFTÇİ PANELİ</div>
          </div>
          <div className="mt-3">
            <FarmPill city={city} area={areaForChip} crop={primaryCrop} />
          </div>
          <div className="mt-3">
            <SeasonBanner />
          </div>
        </div>

        <nav className="flex flex-col gap-1 mt-2">
          {[...tabs, ...sidebarExtras].map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            const badge = to === "/farmer/orders" ? pendingCount : to === "/farmer/subscriptions" ? pendingSubs : 0;
            return (

              <Link
                key={to}
                to={to}
                data-tour={to === "/farmer/storefront" ? "tab-storefront" : to === "/farmer/prices" ? "tab-prices" : undefined}
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
          <button
            type="button"
            onClick={restartTour}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-hwhite/70 hover:bg-white/5 min-h-[48px]"
          >
            <HelpCircle className="h-4 w-4" /> Nasıl Çalışır?
          </button>
          <Link to="/farmer/settings" className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 p-2 hover:bg-white/10">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-saffron text-xs font-bold">
              {displayName?.[0] ?? "M"}
            </div>
            <div className="flex-1 text-xs">
              <div className="font-medium">{displayName}</div>
              <div className="opacity-50">{city}</div>

            </div>
            <Settings className="h-4 w-4 opacity-50" />
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="pb-24 md:pb-0 min-h-screen">
        <Outlet />
      </main>

      {/* Bottom tabs (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t pb-safe" style={{ background: "var(--dark)" }}>
        {mobileTabs.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              data-tour={to === "/farmer/storefront" ? "tab-storefront" : to === "/farmer/prices" ? "tab-prices" : undefined}
              className="flex flex-col items-center gap-0.5 py-2 text-[10px]"
              style={{ color: active ? "var(--saffron)" : "var(--hwhite)" }}
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
          style={{ color: moreActive ? "var(--saffron)" : "var(--hwhite)" }}
          aria-label="Daha fazla"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>Daha</span>
        </button>
      </nav>

      {/* Mobile "More" sheet */}
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
            <Link
              to="/farmer/settings"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg bg-white/5 p-3 hover:bg-white/10"
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-saffron text-sm font-bold">
                {displayName?.[0] ?? "M"}
              </div>
              <div className="flex-1 text-sm">
                <div className="font-medium">{displayName || "Profil"}</div>
                <div className="opacity-60 text-xs">{city}</div>
              </div>
              <Settings className="h-4 w-4 opacity-60" />
            </Link>

            {moreItems.map(({ to, label, icon: Icon }) => {
              const badge = to === "/farmer/orders" ? pendingCount : to === "/farmer/subscriptions" ? pendingSubs : 0;
              const active = pathname.startsWith(to);
              return (

                <Link
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${active ? "bg-saffron text-white" : "text-hwhite/80 hover:bg-white/5"}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                  {badge ? <span className="rounded-full bg-saffron px-1.5 text-[10px] text-white">{badge}</span> : null}
                </Link>
              );
            })}

            <Link
              to="/farmer/premium"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm"
              style={{ background: "color-mix(in oklab, var(--gold) 18%, transparent)", color: "var(--gold)" }}
            >
              <Crown className="h-4 w-4" />
              <span className="flex-1">Premium'a Geç</span>
            </Link>

            <button
              type="button"
              onClick={restartTour}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-hwhite/80 hover:bg-white/5 min-h-[48px]"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="flex-1 text-left">Nasıl Çalışır?</span>
            </button>

            <Link
              to="/farmer/settings"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-hwhite/80 hover:bg-white/5"
            >
              <Settings className="h-4 w-4" />
              <span className="flex-1">Ayarlar</span>
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      <FarmerAIChat />
    </div>
  );
}

export function FarmerHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  const { data: profile } = useProfile();
  const { data: parcels = [] } = useParcels();
  const totalArea = parcels.reduce((s, p) => s + (p.area ?? 0), 0);
  const allCrops = parcels.flatMap((p) => p.crops ?? []);
  const cropCounts = allCrops.reduce<Record<string, number>>((m, c) => { m[c] = (m[c] ?? 0) + 1; return m; }, {});
  const primaryCrop = allCrops.length === 0 ? "—" : Object.entries(cropCounts).sort((a, b) => b[1] - a[1])[0][0];
  const areaForChip = parcels.length === 0 ? null : totalArea;
  const city = profile?.city ?? "—";

  return (
    <div className="px-4 pt-5 pb-4 md:px-8 md:pt-8" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl md:text-3xl truncate">{title}</h1>
          {subtitle ? <p className="text-sm text-hwhite/60 mt-0.5 truncate">{subtitle}</p> : null}
        </div>
        <NotificationBell />

      </div>
      <div className="md:hidden mt-3 flex flex-wrap items-center gap-2">
        <FarmPill city={city} area={areaForChip} crop={primaryCrop} />
      </div>
      <div className="md:hidden mt-3">
        <SeasonBanner />
      </div>
      {children}
    </div>
  );
}
