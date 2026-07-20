import { createFileRoute, Link } from "@tanstack/react-router";
import { useHasat } from "@/lib/hasat/store";
import { useFarmerListings, useEntries, useFarmerOffers, useFarmerOrders } from "@/lib/hasat/queries";
import { AIBox } from "@/components/hasat/AIBox";
import { FarmerHeader } from "./farmer";
import { formatTRY, formatCrop } from "@/lib/hasat/format";
import { BookOpen, LineChart, Store, Users2, MessageCircle, Inbox, PackageCheck } from "lucide-react";
import { MarketDeviationAlert } from "@/components/hasat/MarketDeviationAlert";
import { HASAT_WHATSAPP_NUMBER } from "@/lib/hasat/constants";

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

  const totalRevenue = entries.reduce((sum, e) => sum + e.quantity * (e.pricePerUnit ?? 0), 0);
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

        <AIBox page="dashboard" />

        {/* Quick actions */}
        <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto pb-1">
          {quickActions.map((a) =>
            "to" in a ? (
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
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <div className="text-4xl mb-2">🌾</div>
            <div className="font-serif text-lg">Hasat'a hoş geldiniz</div>
            <div className="text-sm text-hmuted mt-1">
              Başlamak için sohbete yazın, vitrininize bir ürün ekleyin veya WhatsApp'tan gönderin.
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => openChat("Hasat kaydı eklemek istiyorum: ")}
                className="rounded-full bg-saffron px-4 py-2 text-sm font-medium text-white"
              >
                Hasat Kaydet
              </button>
              <Link to="/farmer/storefront" className="rounded-full border border-saffron px-4 py-2 text-sm font-medium text-saffron">
                Vitrine Ekle
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Revenue card */}
            <div className="rounded-2xl p-5" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-hwhite/60 uppercase tracking-wide">Bu Sezon</div>
                  <div className="mt-1 font-mono text-3xl md:text-4xl" style={{ color: "var(--gold)" }}>
                    {formatTRY(totalRevenue)}
                  </div>
                </div>
              </div>
            </div>

            {/* Active listings */}
            <div className="rounded-2xl bg-card border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg">Aktif Ürünler: {listings.length}</h3>
                <Link to="/farmer/storefront" className="text-sm text-saffron">Vitrin →</Link>
              </div>
              {listings.length === 0 ? (
                <div className="mt-3 text-sm text-hmuted">Henüz aktif ürün yok.</div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {listings.map((l) => (
                    <li key={l.id} className="rounded-lg bg-background/60 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>🌾 {formatCrop(l.crop)} · {l.quantity}{l.unit}</span>
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
    </>
  );
}
