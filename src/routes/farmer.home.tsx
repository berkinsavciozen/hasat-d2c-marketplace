import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHasat } from "@/lib/hasat/store";
import { useFarmerListings, useEntries, useFarmerOffers, useFarmerOrders, useParcels } from "@/lib/hasat/queries";
import { AIBox } from "@/components/hasat/AIBox";
import { FarmerHeader } from "./farmer";
import { formatTRY, formatCrop, formatQuantity } from "@/lib/hasat/format";
import { BookOpen, LineChart, Store, Users2, MessageCircle, Inbox, PackageCheck } from "lucide-react";
import { MarketDeviationAlert } from "@/components/hasat/MarketDeviationAlert";
import { HASAT_WHATSAPP_NUMBER } from "@/lib/hasat/constants";
import { OnboardingTour } from "@/components/hasat/OnboardingTour";
import { FARMER_TOUR_STEPS, FARMER_TOUR_STORAGE_KEY } from "@/lib/hasat/onboarding-tour";

export const Route = createFileRoute("/farmer/home")({
  head: () => ({ meta: [{ title: "Ana Sayfa — Hasat" }] }),
  component: Home,
});

function openChat(prefill?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("hasat:ai-chat:open", { detail: prefill ? { prefill } : {} })
  );
}

function ChatInputBar() {
  const waUrl = `https://wa.me/${HASAT_WHATSAPP_NUMBER}`;
  return (
    <div className="flex items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm">
      <button
        type="button"
        onClick={() => openChat()}
        data-tour="chat-input"
        className="flex min-h-[48px] flex-1 items-center gap-2 px-3 text-left text-sm text-hmuted"
        aria-label="Hasat AI'ye mesaj yaz"
      >
        <MessageCircle className="h-5 w-5 shrink-0" style={{ color: "var(--gold)" }} />
        <span className="truncate">Hasadını yaz veya WhatsApp'tan gönder…</span>
      </button>
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-tour="whatsapp"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: "#25D366", color: "white" }}
        aria-label="WhatsApp'tan gönder"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </a>
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
        <ChatInputBar />

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
                    <div className="font-mono text-lg" style={{ color: "var(--saffron)" }}>
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
                    <div className="font-mono text-lg" style={{ color: "var(--gold)" }}>
                      {preparingOrders}
                    </div>
                  </div>
                  <span className="text-sm text-saffron">→</span>
                </Link>
              ) : null}
            </div>
          </div>
        )}

        <div data-tour="ai-box">
          <AIBox page="dashboard" />
        </div>


        {/* Quick actions */}
        <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto pb-1">
          {quickActions.map((a) =>
            "to" in a && a.to ? (
              <Link
                key={a.label}
                to={a.to}
                className="flex shrink-0 items-center gap-2 rounded-full bg-card border px-4 py-2 text-sm shadow-sm hover:border-saffron"
              >
                <a.icon className="h-4 w-4 text-saffron" />
                {a.label}
              </Link>
            ) : (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className="flex shrink-0 items-center gap-2 rounded-full bg-card border px-4 py-2 text-sm shadow-sm hover:border-saffron"
              >
                <a.icon className="h-4 w-4 text-saffron" />
                {a.label}
              </button>
            )
          )}
        </div>

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed p-6">
            <div className="text-center">
              <div className="text-4xl mb-2">🌾</div>
              <div className="font-serif text-lg">Hasat'a hoş geldiniz</div>
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
                desc="Sohbete yazın ya da WhatsApp'tan gönderin — opsiyonel ama önerilir."
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
            {/* Revenue card */}
            <div className="rounded-2xl p-5" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-hwhite/60 uppercase tracking-wide">Bu Sezon</div>
                  <div className="mt-1 font-mono text-3xl md:text-4xl" style={{ color: "var(--gold)" }}>
                    {formatTRY(ytdRevenue)}
                  </div>
                  {yoyPct !== null && (
                    <div
                      className="mt-1 text-xs"
                      style={{
                        color:
                          yoyPct > 0
                            ? "var(--sage)"
                            : yoyPct < 0
                            ? "var(--hred)"
                            : "var(--hmuted)",
                      }}
                    >
                      {yoyPct > 0 ? "+" : ""}
                      {yoyPct.toFixed(1)}% geçen yıla göre
                    </div>
                  )}
                </div>
              </div>
            </div>


            {/* Active listings */}
            <div className="rounded-2xl bg-card border p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg">Aktif Ürünler: {listings.length}</h2>
                <Link to="/farmer/storefront" className="text-sm text-saffron">Vitrin →</Link>
              </div>
              {listings.length === 0 ? (
                <div className="mt-3 text-sm text-hmuted">Henüz aktif ürün yok.</div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {listings.map((l) => (
                    <li key={l.id} className="rounded-lg bg-background/60 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>🌾 {formatCrop(l.crop)} · {formatQuantity(l.quantity, l.unit)} {l.unit}</span>
                        <span className="font-mono">{formatTRY(l.pricePerUnit)}/{l.unit}</span>
                      </div>
                      <MarketDeviationAlert crop={l.crop} pricePerUnit={l.pricePerUnit} unit={l.unit} />
                    </li>
                  ))}
                </ul>
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
          background: done ? "var(--sage)" : "var(--saffron)",
          color: "white",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-hmuted">{desc}</div>
      </div>
      {!done && (
        to ? (
          <Link
            to={to}
            className="shrink-0 rounded-full border border-saffron px-3 py-1.5 text-xs font-medium text-saffron whitespace-nowrap"
          >
            {cta}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="shrink-0 rounded-full border border-saffron px-3 py-1.5 text-xs font-medium text-saffron whitespace-nowrap"
          >
            {cta}
          </button>
        )
      )}
    </li>
  );
}
