import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHasat } from "@/lib/hasat/store";
import {
  useFarmerListings,
  useEntries,
  useFarmerOffers,
  useFarmerOrders,
  useParcels,
} from "@/lib/hasat/queries";
import { AIBox } from "@/components/hasat/AIBox";
import { FarmerHeader } from "./farmer";
import { formatTRY, formatCrop, formatQuantity } from "@/lib/hasat/format";
import {
  BookOpen,
  LineChart,
  Store,
  Users2,
  MessageCircle,
  Inbox,
  PackageCheck,
} from "lucide-react";
import { MarketDeviationAlert } from "@/components/hasat/MarketDeviationAlert";
import { OnboardingTour } from "@/components/hasat/OnboardingTour";
import { FARMER_TOUR_STEPS, FARMER_TOUR_STORAGE_KEY } from "@/lib/hasat/onboarding-tour";

export const Route = createFileRoute("/farmer/home")({
  head: () => ({ meta: [{ title: "Ana Sayfa — Hasat" }] }),
  component: Home,
});

function openChat(prefill?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("hasat:ai-chat:open", { detail: prefill ? { prefill } : {} }),
  );
}

function ChatInputBar() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm">
      <button
        type="button"
        onClick={() => openChat()}
        data-tour="chat-input"
        className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm text-hmuted"
        aria-label="Hasat AI'ye mesaj yaz"
      >
        <MessageCircle className="h-5 w-5 shrink-0" style={{ color: "var(--primary)" }} />
        <span className="min-w-0 flex-1 truncate">Hasadını yaz…</span>
      </button>
    </div>
  );
}

function Home() {
  const user = useHasat((s) => s.user);
  const { data: entries = [] } = useEntries();
  const { data: listings = [] } = useFarmerListings();
  const { data: offers = [] } = useFarmerOffers();
  const { data: orders = [] } = useFarmerOrders();
  const { data: parcels = [] } = useParcels();

  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldOpen = !localStorage.getItem(FARMER_TOUR_STORAGE_KEY);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (shouldOpen) {
      t = setTimeout(() => setTourOpen(true), 600);
    }
    const onRestart = () => setTourOpen(true);
    window.addEventListener("hasat:tour:restart", onRestart);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("hasat:tour:restart", onRestart);
    };
  }, []);

  const pendingOffers = offers.filter(
    (o) => (o.status === "pending" || o.status === "counter") && o.ballSide === "farmer",
  ).length;
  const preparingOrders = orders.filter((o) => o.status === "preparing").length;
  const showPending = pendingOffers > 0 || preparingOrders > 0;

  // YTD revenue + YoY comparison
  const now = new Date();
  const yStart = new Date(now.getFullYear(), 0, 1);
  const prevStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59);
  let ytdRevenue = 0;
  let prevRevenue = 0;
  let prevCount = 0;
  for (const e of entries) {
    const d = e.date ? new Date(e.date) : null;
    if (!d || isNaN(d.getTime())) continue;
    const rev = e.quantity * (e.pricePerUnit ?? 0);
    if (d >= yStart && d <= now) ytdRevenue += rev;
    else if (d >= prevStart && d <= prevEnd) {
      prevRevenue += rev;
      prevCount += 1;
    }
  }
  const yoyPct =
    prevCount > 0 && prevRevenue > 0 ? ((ytdRevenue - prevRevenue) / prevRevenue) * 100 : null;

  const isEmpty = entries.length === 0 && listings.length === 0;

  const quickActions = [
    {
      icon: BookOpen,
      label: "Hasat Kaydet",
      onClick: () => openChat("Hasat kaydı eklemek istiyorum: "),
    },
    { icon: LineChart, label: "Bugünkü Fiyat", to: "/farmer/prices" as const },
    { icon: Store, label: "Vitrine Ekle", to: "/farmer/storefront" as const },
    { icon: Users2, label: "Alıcı Bul", to: "/farmer/community" as const },
  ];

  return (
    <>
      <FarmerHeader title={`Merhaba, ${user?.name?.split(" ")[0] ?? "Çiftçi"} 👋`} />

      <div className="p-4 md:p-8 space-y-4">
        {showPending && (
          <div
            className="rounded-2xl border bg-card overflow-hidden"
            style={{ borderLeft: "3px solid var(--saffron)" }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
              {pendingOffers > 0 ? (
                <Link
                  to="/farmer/orders"
                  className="flex min-h-[48px] items-center gap-3 px-4 py-3 hover:bg-background/60"
                >
                  <Inbox className="h-5 w-5 shrink-0" style={{ color: "var(--saffron)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-hmuted">Yanıt bekleyen teklif</div>
                    <div
                      className="text-lg font-semibold tabular-nums"
                      style={{ color: "var(--saffron)" }}
                    >
                      {pendingOffers}
                    </div>
                  </div>
                  <span className="text-sm text-saffron">→</span>
                </Link>
              ) : null}
              {preparingOrders > 0 ? (
                <Link
                  to="/farmer/orders"
                  className="flex min-h-[48px] items-center gap-3 px-4 py-3 hover:bg-background/60"
                >
                  <PackageCheck className="h-5 w-5 shrink-0" style={{ color: "var(--gold)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-hmuted">Hazırlanan sipariş</div>
                    <div
                      className="text-lg font-semibold tabular-nums"
                      style={{ color: "var(--saffron)" }}
                    >
                      {preparingOrders}
                    </div>
                  </div>
                  <span className="text-sm text-saffron">→</span>
                </Link>
              ) : null}
            </div>
          </div>
        )}

        <ChatInputBar />

        <div data-tour="ai-box">
          <AIBox page="dashboard" />
        </div>

        {/* Quick actions */}
        <div className="-mx-4 flex min-w-0 max-w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:max-w-full md:px-0">
          {quickActions.map((a) =>
            "to" in a && a.to ? (
              <Link
                key={a.label}
                to={a.to}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-card border px-4 py-2 text-sm hover:border-primary"
              >
                <a.icon className="h-4 w-4 text-primary" />
                {a.label}
              </Link>
            ) : (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-card border px-4 py-2 text-sm hover:border-primary"
              >
                <a.icon className="h-4 w-4 text-primary" />
                {a.label}
              </button>
            ),
          )}
        </div>

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed p-6">
            <div className="text-center">
              <BookOpen className="mx-auto mb-2 h-9 w-9 text-primary" />
              <div className="text-lg font-semibold">Hasat'a hoş geldiniz</div>
              <div className="text-sm text-hmuted mt-1">Nasıl başlarım? Üç adım:</div>
            </div>
            <ol className="mt-5 space-y-3">
              <StartStep
                done={parcels.length > 0}
                label="Parsel ekleyin"
                desc="Arazinizi ve yetiştirdiğiniz ürünü tanımlayın."
                to="/farmer/journal"
                cta="Parsel Ekle"
              />
              <StartStep
                done={entries.length > 0}
                label="Hasadınızı kaydedin"
                desc="Sohbete yazın — opsiyonel ama önerilir."
                cta="Hasat Kaydet"
                onClick={() => openChat("Hasat kaydı eklemek istiyorum: ")}
              />
              <StartStep
                done={listings.length > 0}
                label="Vitrine ilan ekleyin"
                desc="Ürününüzü yayınlayın, alıcılar teklif versin."
                to="/farmer/storefront"
                cta="Vitrine Ekle"
              />
            </ol>
          </div>
        ) : (
          <>
            {/* Active listings */}
            <div className="rounded-2xl bg-card border p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Aktif Ürünler: {listings.length}</h2>
                <Link to="/farmer/storefront" className="text-sm font-medium text-primary">
                  Vitrin →
                </Link>
              </div>
              {listings.length === 0 ? (
                <div className="mt-3 text-sm text-hmuted">Henüz aktif ürün yok.</div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {listings.map((l) => (
                    <li key={l.id} className="rounded-lg bg-background/60 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>
                          {formatCrop(l.crop)} · {formatQuantity(l.quantity, l.unit)} {l.unit}
                        </span>
                        <span className="tabular-nums">
                          {formatTRY(l.pricePerUnit)}/{l.unit}
                        </span>
                      </div>
                      <MarketDeviationAlert
                        crop={l.crop}
                        pricePerUnit={l.pricePerUnit}
                        unit={l.unit}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Revenue summary follows the action surfaces. */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "var(--primary)", color: "var(--hwhite)" }}
            >
              <div className="text-xs text-hwhite/60 uppercase tracking-wide">Bu Sezon</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums md:text-4xl">
                {formatTRY(ytdRevenue)}
              </div>
              {yoyPct !== null && (
                <div
                  className={`mt-1 text-xs ${yoyPct > 0 ? "text-sage" : yoyPct < 0 ? "text-hred" : "text-hwhite/60"}`}
                >
                  {yoyPct > 0 ? "+" : ""}
                  {yoyPct.toFixed(1)}% geçen yıla göre
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <OnboardingTour
        steps={FARMER_TOUR_STEPS}
        open={tourOpen}
        onClose={() => setTourOpen(false)}
      />
    </>
  );
}

// P23-M8-c (E4): "Nasıl başlarım" rehberi — boş hesaplı bir çiftçiye ilk
// parsel/ilan oluşturma sırasını (parsel → hasat kaydı (opsiyonel) →
// vitrin) gösterir. `ListingSheet` (farmer.storefront.tsx) parsel
// seçilmeden yeni ilan kaydetmeyi reddediyor, bu yüzden sıra önemli —
// önceki metin ("Vitrine bir ürün ekleyin") parsel adımını hiç
// söylemiyordu.
function StartStep({
  done,
  label,
  desc,
  cta,
  to,
  onClick,
}: {
  done: boolean;
  label: string;
  desc: string;
  cta: string;
  to?: "/farmer/journal" | "/farmer/storefront";
  onClick?: () => void;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
        style={{
          background: done ? "var(--sage)" : "var(--primary)",
          color: "white",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-hmuted">{desc}</div>
      </div>
      {!done &&
        (to ? (
          <Link
            to={to}
            className="shrink-0 rounded-xl border border-primary px-3 py-1.5 text-xs font-medium text-primary whitespace-nowrap"
          >
            {cta}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="shrink-0 rounded-xl border border-primary px-3 py-1.5 text-xs font-medium text-primary whitespace-nowrap"
          >
            {cta}
          </button>
        ))}
    </li>
  );
}
