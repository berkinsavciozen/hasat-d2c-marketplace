import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  Bot,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  Database,
  Handshake,
  Leaf,
  MessageCircle,
  PackageCheck,
  Send,
  ShieldCheck,
  Sprout,
  Store,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/hasat/BrandLogo";
import { submitContactInquiry } from "@/lib/api/indoor-interest.functions";
import { HASAT_WHATSAPP_NUMBER, PUBLIC_BASE_URL } from "@/lib/hasat/constants";
import {
  CONTACT_OPTIONS,
  FARMER_BENEFITS,
  FARMER_FAQ,
  HOW_IT_WORKS,
  LANDING_MEDIA,
  type ContactTopic,
} from "@/lib/hasat/landing-content";
import { formatCrop, formatTRY } from "@/lib/hasat/format";
import { useCropsWithPriceData, usePriceHistorySummary } from "@/lib/hasat/queries";
import { isNetworkAuthError } from "@/lib/hasat/sessionGuard";
import { useHasat } from "@/lib/hasat/store";
import { supabase } from "@/integrations/supabase/client";

const TITLE = "Hasat | Üreticinin Ticaret Platformu";
const DESCRIPTION =
  "Mevcut talepleri, gerçek teklifleri ve kaynağı belli fiyatları gör; üretimini ve satışını Hasat AI ile tek yerden yönet.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${PUBLIC_BASE_URL}/` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Hasat",
          url: PUBLIC_BASE_URL,
          description: DESCRIPTION,
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FARMER_FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: LandingPage,
});

const whatsappHref = (message: string) =>
  `https://wa.me/${HASAT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

function LandingPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const setRole = useHasat((state) => state.setRole);
  const updateUser = useHasat((state) => state.updateUser);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session?.user) {
          const cached = useHasat.getState().user;
          if (isNetworkAuthError(error) && cached) {
            void router.navigate({ to: cached.role === "buyer" ? "/buyer/discover" : "/farmer/home" });
            return;
          }
          setChecking(false);
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, name, phone, city, premium")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (cancelled) return;
        const role = profile?.role === "buyer" ? "buyer" : "farmer";
        setRole(role);
        if (!profile?.name?.trim()) {
          void router.navigate({ to: role === "buyer" ? "/onboarding/buyer" : "/onboarding/farmer" });
          return;
        }
        updateUser({
          id: data.session.user.id,
          name: profile.name,
          phone: profile.phone ?? "",
          city: profile.city ?? "",
          premium: Boolean(profile.premium),
        });
        void router.navigate({ to: role === "buyer" ? "/buyer/discover" : "/farmer/home" });
      } catch (error) {
        console.warn("[landing] session check failed", error);
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, setRole, updateUser]);

  const goRole = (role: "farmer" | "buyer") => navigate({ to: "/login", search: { role } });

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <BrandLogo variant="wordmark" height={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingMotionStyles />
      <Header onRole={goRole} />
      <main>
        <Hero onRole={goRole} />
        <ProblemSection />
        <HowItWorks />
        <BenefitSection />
        <PriceTransparency />
        <AISection />
        <TraceabilitySection />
        <OperationsSection />
        <YoungFarmerAndContact />
        <FinalCTAAndFAQ onRole={goRole} />
      </main>
      <Footer />
      <MobileCTA onRole={goRole} />
    </div>
  );
}

function LandingMotionStyles() {
  return (
    <style>{`
      @keyframes landing-step { 0%, 12% { opacity: .35; transform: translateY(2px) } 20%, 82% { opacity: 1; transform: none } 90%, 100% { opacity: .35; transform: translateY(2px) } }
      @keyframes landing-pulse { 0%, 100% { transform: scale(.86); opacity: .45 } 50% { transform: scale(1); opacity: 1 } }
      .landing-flow-step { animation: landing-step 8s ease-in-out infinite; }
      .landing-flow-step:nth-child(2) { animation-delay: 1.1s; }
      .landing-flow-step:nth-child(3) { animation-delay: 2.2s; }
      .landing-flow-step:nth-child(4) { animation-delay: 3.3s; }
      .landing-flow-step:nth-child(5) { animation-delay: 4.4s; }
      .landing-flow-step:nth-child(6) { animation-delay: 5.5s; }
      .landing-pulse { animation: landing-pulse 2.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .landing-flow-step, .landing-pulse { animation: none !important; opacity: 1 !important; transform: none !important; }
      }
    `}</style>
  );
}

function Header({ onRole }: { onRole: (role: "farmer" | "buyer") => void }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo variant="wordmark" height={23} />
          <span className="hidden border-l pl-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            Güven Platformu
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button size="sm" onClick={() => onRole("farmer")} aria-pressed="true">
            Çiftçiyim
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onRole("buyer")}>
            Alıcıyım
          </Button>
          <Button className="hidden lg:inline-flex" size="sm" onClick={() => onRole("farmer")}>
            Ürünüm için talep bul
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onRole }: { onRole: (role: "farmer" | "buyer") => void }) {
  return (
    <section className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-dark text-hwhite md:min-h-[760px]">
      <img
        src={LANDING_MEDIA.heroFarmerCrop}
        alt="Karpuz tarlasında ürününü inceleyen bir üretici"
        width={1600}
        height={1000}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-[68%_center] md:object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--dark)_96%,transparent)_0%,color-mix(in_oklab,var(--dark)_86%,transparent)_42%,color-mix(in_oklab,var(--dark)_18%,transparent)_100%)]" />
      <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl content-between gap-10 px-4 py-12 md:min-h-[760px] md:grid-cols-[1.05fr_.95fr] md:items-center md:px-8 md:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-saffron">
            Hasat · Üreticinin ticaret platformu
          </p>
          <h1 className="mt-5 max-w-xl font-serif text-4xl font-extrabold leading-[1.06] sm:text-5xl md:text-7xl">
            Ürün yetişmeden,<br />talep ve teklif hazır.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-hwhite/85 md:text-lg">
            Ne ekeceğini yalnızca bir kişinin sözüne göre değil, platformdaki gerçek talepleri görerek planla. Hal fiyatlarını, tekliflerini, üretim kayıtlarını ve müşterilerini tek yerden yönet.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="bg-hwhite text-primary hover:bg-hwhite/90" onClick={() => onRole("farmer")}>
              Ürünüm için talep bul <ArrowRight />
            </Button>
            <Button size="lg" variant="outline" className="border-hwhite/40 bg-dark/30 text-hwhite hover:bg-hwhite/10 hover:text-hwhite" asChild>
              <a href="#nasil-calisir">Nasıl çalıştığını gör <ArrowDown /></a>
            </Button>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-hwhite/80">
            {["Kaynağı belli hal fiyatları", "Fotoğraflı tarla günlüğü", "Kontrollü pilotta komisyon yok"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-sage" />{item}</span>
            ))}
          </div>
        </div>
        <ProductFlow />
      </div>
    </section>
  );
}

const FLOW_STEPS = [
  [Sprout, "Üretim planı", "Karpuz üretimi kayda hazırlanır"],
  [Users, "Mevcut talep", "Platformdaki açık talepler görünür"],
  [Handshake, "Gerçek teklifler", "Teklifler tek panelde toplanır"],
  [BarChart3, "Fiyat kaynakları", "Hal ve tamamlanmış satış ayrılır"],
  [BookOpenCheck, "Tarla günlüğü", "Üretim adımları kayıt altına alınır"],
  [PackageCheck, "Teslimat ve ödeme", "Kesinleşen sipariş takip edilir"],
] as const;

function ProductFlow() {
  return (
    <div className="self-end md:self-auto md:justify-self-end">
      <div className="rounded-2xl border border-hwhite/15 bg-dark/80 p-4 shadow-2xl backdrop-blur-md sm:p-5 md:w-[430px]">
        <div className="flex items-center justify-between border-b border-hwhite/10 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-saffron">Süreç gösterimi</p>
            <p className="mt-1 font-serif text-xl">Karpuz üretim akışı</p>
          </div>
          <span className="landing-pulse h-2.5 w-2.5 rounded-full bg-sage" aria-hidden="true" />
        </div>
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-2 md:grid-cols-1">
          {FLOW_STEPS.map(([Icon, title, body]) => (
            <li key={title} className="landing-flow-step flex min-h-16 items-center gap-3 rounded-xl border border-hwhite/10 bg-hwhite/5 px-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-hwhite/10 text-saffron"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0"><strong className="block text-sm">{title}</strong><span className="block text-xs leading-snug text-hwhite/60">{body}</span></span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-hwhite/50">Fiyatlar ve satış bilgileri yalnızca kaynağı doğrulanmış gerçek verilerden gösterilir.</p>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body, align = "left" }: { eyebrow?: string; title: string; body?: string; align?: "left" | "center" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
      {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-saffron">{eyebrow}</p> : null}
      <h2 className="mt-3 font-serif text-3xl font-extrabold leading-tight md:text-5xl">{title}</h2>
      {body ? <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{body}</p> : null}
    </div>
  );
}

function ProblemSection() {
  const traditional = ["Tek bir tüccarın sözü", "Hasatta değişen karar", "Görünmeyen piyasa fiyatı", "Ürünün elde kalma riski", "Dağınık konuşmalar ve notlar"];
  const hasat = ["Birden fazla alıcı ve görünür talep", "Kayıtlı teklifler", "Kaynağı belli hal fiyatları", "Tamamlanmış satışların şeffaf özeti", "Müşteriler ve siparişler tek yerde"];
  return (
    <section className="border-b bg-card px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Belirsizlikten görünürlüğe" title="Bir kişinin sözüne güvenerek değil, talebi görerek üret." body="Hasat, üretim başlamadan önce platformdaki farklı alıcı taleplerini ve kayıtlı teklifleri görmeni sağlar." />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Comparison title="Geleneksel" items={traditional} muted />
          <Comparison title="Hasat ile" items={hasat} />
        </div>
        <div className="mt-8 overflow-hidden rounded-xl border bg-background p-4">
          <div className="grid grid-cols-4 items-center gap-2 text-center text-xs font-medium text-muted-foreground">
            {["Ekim planı", "Mevcut talep", "Kayıtlı teklif", "Hasat ve teslimat"].map((item, index) => (
              <div key={item} className="relative">
                <span className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">{index + 1}</span>
                <span>{item}</span>
                {index < 3 ? <span className="absolute left-[calc(50%+1rem)] right-[calc(-50%+1rem)] top-4 h-px bg-border" /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Comparison({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className={`rounded-xl border p-6 md:p-8 ${muted ? "bg-muted/55" : "border-primary/30 bg-background"}`}>
      <p className={`text-sm font-bold uppercase tracking-[0.12em] ${muted ? "text-muted-foreground" : "text-primary"}`}>{title}</p>
      <ul className="mt-5 grid gap-3">
        {items.map((item) => <li key={item} className="flex items-start gap-2.5 text-sm md:text-base"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${muted ? "text-muted-foreground" : "text-sage"}`} />{item}</li>)}
      </ul>
    </div>
  );
}

function HowItWorks() {
  const icons = [Sprout, BarChart3, PackageCheck];
  return (
    <section id="nasil-calisir" className="scroll-mt-20 px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Üç adımda Hasat" title="Ekimden ödemeye, tek kanalda." align="center" />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {HOW_IT_WORKS.map((item, index) => {
            const Icon = icons[index];
            return <article key={item.title} className="rounded-xl border bg-card p-6 md:p-8"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Icon /></span><p className="mt-6 text-xs font-bold text-saffron">ADIM {index + 1}</p><h3 className="mt-2 font-serif text-xl">{item.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p><div className="mt-6 flex min-h-14 items-center gap-2 rounded-lg border bg-background px-3 text-xs text-muted-foreground"><CircleCheck className="h-4 w-4 shrink-0 text-teal" />{item.state}</div></article>;
          })}
        </div>
      </div>
    </section>
  );
}

function BenefitSection() {
  const icons = [TrendingUp, Database, Users];
  return (
    <section className="bg-dark px-4 py-20 text-hwhite md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Üretici için" title="Daha az belirsizlik. Daha çok kontrol." body="Ticari görünürlüğü, kolay yönetimi ve kayıtlı üretimi aynı yerde birleştir." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-hwhite/15 bg-hwhite/15 md:grid-cols-3">
          {FARMER_BENEFITS.map((item, index) => {
            const Icon = icons[index];
            return <article key={item.title} className="bg-dark p-7 md:p-9"><Icon className="h-6 w-6 text-saffron" /><h3 className="mt-8 font-serif text-xl">{item.title}</h3><p className="mt-3 text-sm leading-relaxed text-hwhite/65">{item.body}</p></article>;
          })}
        </div>
      </div>
    </section>
  );
}

function PriceTransparency() {
  const { data: crops = [], isLoading: cropsLoading } = useCropsWithPriceData();
  const [selectedCrop, setSelectedCrop] = useState("");
  useEffect(() => {
    if (!selectedCrop && crops.length > 0) setSelectedCrop(crops[0]);
  }, [crops, selectedCrop]);
  const { data, isLoading, isError } = usePriceHistorySummary(selectedCrop || null);
  const [tab, setTab] = useState<"official" | "hasat">("official");
  const hasat = data?.hasat;
  const updated = data?.lastUpdated ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(data.lastUpdated)) : null;

  return (
    <section className="border-b bg-card px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
        <div>
          <SectionHeading eyebrow="Fiyat şeffaflığı" title="Fiyatı tek bir alıcının sözüyle değil, pazarın verisiyle belirle." body="Farklı hal kaynaklarını ve Hasat'ta tamamlanan satışların anonim özetini birbirine karıştırmadan karşılaştır." />
          <p className="mt-7 border-l-2 border-saffron pl-4 font-serif text-xl">Fiyatı alıcı değil, görünür pazar belirlesin.</p>
        </div>
        <div className="rounded-xl border bg-background p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
            <label className="block min-w-0 flex-1 text-xs font-semibold text-muted-foreground">Ürün
              <select value={selectedCrop} onChange={(event) => setSelectedCrop(event.target.value)} className="mt-1 block w-full rounded-md border bg-input px-3 text-sm text-foreground" disabled={cropsLoading || crops.length === 0}>
                {crops.length === 0 ? <option value="">Henüz veri bulunmuyor</option> : crops.map((crop) => <option key={crop} value={crop}>{formatCrop(crop)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 rounded-md border bg-muted p-1" aria-label="Fiyat veri grubu">
              <Button size="sm" variant={tab === "official" ? "default" : "ghost"} onClick={() => setTab("official")}>Hal fiyatları</Button>
              <Button size="sm" variant={tab === "hasat" ? "default" : "ghost"} onClick={() => setTab("hasat")}>Hasat satışları</Button>
            </div>
          </div>
          <div className="min-h-64 pt-6" aria-live="polite">
            {isLoading || cropsLoading ? <EmptyData title="Veriler kontrol ediliyor" body="Kaynak ve güncellenme bilgisi doğrulanıyor." /> : isError ? <EmptyData title="Bu ürün için güncel veri bulunamadı" body="Bağlantı yeniden kurulduğunda tekrar deneyebilirsin." /> : !selectedCrop ? <EmptyData title="Henüz veri bulunmuyor" body="Kaynağı doğrulanmış bir ürün verisi geldiğinde burada gösterilecek." /> : tab === "official" ? (
              data && data.marketSources.length > 0 ? <MarketSourcesList sources={data.marketSources} unit={data.unit} updated={updated} /> : <EmptyData title="Bu ürün için güncel hal verisi bulunamadı" body="Sisteme bağlı olmayan hal veya şehir için fiyat üretilmez." />
            ) : hasat && !hasat.insufficientData && hasat.avgPrice != null ? (
              <PriceRecord label="Tamamlanmış Hasat satış ortalaması" price={hasat.avgPrice} unit={data?.unit} source="Hasat'ta tamamlanmış satışlar" updated={updated ? `Son güncelleme: ${updated}` : "Güncellenme bilgisi bulunmuyor"} />
            ) : <EmptyData title="Henüz yeterli satış verisi yok" body="Ticari gizliliği koruyan minimum eşik karşılandığında anonim özet gösterilir." />}
          </div>
          <div className="mt-4 grid gap-2 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-2">
            <span className="inline-flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-sage" />Satıcı ve alıcı kimlikleri gösterilmez.</span>
            <span className="inline-flex gap-2"><Database className="h-4 w-4 shrink-0 text-teal" />İlan ve teklif fiyatı satış ortalamasına katılmaz.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketSourcesList({ sources, unit, updated }: { sources: { sourceCode: string; displayName: string; region: string | null; avgPrice: number | null }[]; unit: string | null; updated: string | null }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Güncel hal fiyatları</p>
      <ul className="mt-4 grid gap-2">
        {sources.map((source) => (
          <li key={source.sourceCode} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
              <Store className="h-4 w-4 shrink-0 text-saffron" />
              <span className="truncate">{source.displayName}</span>
            </span>
            <span className="shrink-0 text-right font-serif text-lg text-primary">
              {source.avgPrice != null ? formatTRY(source.avgPrice) : "—"}
              {source.avgPrice != null ? <span className="ml-1 text-xs text-muted-foreground">/{unit ?? "kg"}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {updated ? <p className="mt-4 text-right text-xs text-muted-foreground">Son güncelleme: {updated}</p> : null}
    </div>
  );
}

function PriceRecord({ label, price, unit, source, updated }: { label: string; price: number; unit?: string | null; source: string; updated: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-4 font-serif text-4xl text-primary md:text-5xl">{formatTRY(price)}<span className="ml-1 text-base text-muted-foreground">/{unit ?? "birim"}</span></p><dl className="mt-7 grid gap-3 rounded-lg border bg-card p-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Veri kaynağı</dt><dd className="text-right font-medium">{source}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Güncellenme</dt><dd className="text-right font-medium">{updated}</dd></div></dl></div>;
}

function EmptyData({ title, body }: { title: string; body: string }) {
  return <div className="grid min-h-56 place-items-center rounded-lg border border-dashed bg-card p-6 text-center"><div><Database className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">{title}</p><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p></div></div>;
}

function AISection() {
  return (
    <section className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
        <div className="order-2 rounded-xl border bg-card p-4 shadow-sm lg:order-1 sm:p-6">
          <div className="flex items-center gap-2 border-b pb-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Bot /></span><div><strong className="block text-sm">Hasat AI</strong><span className="text-xs text-muted-foreground">Kayıt hazırlama</span></div></div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="ml-auto max-w-[84%] rounded-xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">Bugün karpuz hasadını kaydetmek istiyorum.</div>
            <div className="max-w-[88%] rounded-xl rounded-bl-sm border bg-background px-4 py-3">Hasat miktarını ve parseli yazarsan kaydı hazırlayabilirim.</div>
            <div className="rounded-xl border border-saffron/40 bg-background p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-saffron">Onay bekleyen kayıt</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{["Tarla günlüğü", "Kayıtlı ürün miktarı", "İlan", "Satışa açık miktar"].map((field) => <span key={field} className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{field}: Kullanıcı bilgisi bekleniyor</span>)}</div>
              <Button className="mt-4 w-full" disabled>Bilgileri girip onayla</Button>
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2"><SectionHeading eyebrow="Kolay yönetim" title="Tarlada çalış. Takibi Hasat AI kolaylaştırsın." body="Uzun formlar doldurmak zorunda değilsin. Türkçe yaz veya WhatsApp'tan mesaj gönder; Hasat AI verdiğin bilgileri düzenlemene ve kayıtlarını takip etmene yardım etsin." /><p className="mt-5 text-sm text-muted-foreground">AI, vermediğin miktarı, maliyeti veya fiyatı üretmez. Hazırlanan kayıt sen onaylamadan kesinleşmez.</p><Button className="mt-7 bg-whatsapp text-dark hover:bg-whatsapp/90" asChild><a href={whatsappHref("Hasat hakkında bilgi almak istiyorum")} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp'tan yaz</a></Button></div>
      </div>
    </section>
  );
}

function TraceabilitySection() {
  const steps = ["Ekim", "Sulama", "Gübreleme", "Fotoğraf eklendi", "Hasat", "Teslimat"];
  return (
    <section className="border-y bg-card px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <div><SectionHeading eyebrow="Güven ve şeffaflık" title="Emeğin kayıtlıysa, ürünün daha güvenilir." body="Sulama, gübreleme, bakım ve hasat adımlarını fotoğraflı tarla günlüğünde tut. Alıcı kayıtlı geçmişi görsün; sen de üretimini baştan sona takip et." /><div className="mt-7 flex flex-wrap gap-2">{["Fotoğraflı üretim geçmişi", "Alıcı için şeffaf bilgi", "Çiftçi için kolay sezon takibi"].map((item) => <span key={item} className="rounded-md border bg-background px-3 py-2 text-xs font-medium">{item}</span>)}</div></div>
        <div className="rounded-xl border bg-background p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Tarla günlüğü</p><p className="font-serif text-lg">Gerçek kayıtlar geldiğinde ilerler</p></div><BookOpenCheck className="text-primary" /></div><ol className="mt-7 grid gap-2">{steps.map((step, index) => <li key={step} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><span className="flex-1 text-sm font-medium">{step}</span><span className="text-xs text-muted-foreground">Henüz kayıt yok</span></li>)}</ol><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Kayıt kapsamı bir kalite garantisi veya bağımsız doğrulama sonucu değildir.</p></div>
      </div>
    </section>
  );
}

function OperationsSection() {
  const groups = [["Yeni teklifler", Handshake], ["Kabul edilmiş teklifler", BadgeCheck], ["Düzenli alımlar", Clock3], ["Kesinleşmiş siparişler", PackageCheck], ["Yaklaşan teslimatlar", Store], ["Bekleyen ödemeler", WalletCards]] as const;
  return (
    <section className="px-4 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-7xl"><SectionHeading eyebrow="Tek merkez" title="Farklı tüccarlar, dağınık konuşmalar ve defterler yerine tek ekran." body="Teklif, sipariş, teslimat ve ödeme durumlarını yalnızca sisteme kaydedilmiş gerçek durumlarıyla takip et." /><div className="mt-12 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">{groups.map(([label, Icon]) => <div key={label} className="flex min-h-24 items-center gap-3 rounded-lg border bg-background p-4"><span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-primary"><Icon /></span><div><p className="text-sm font-semibold">{label}</p></div></div>)}<div className="col-span-full rounded-lg border border-dashed bg-background/50 p-4 text-center text-sm text-muted-foreground">Kayıtlı teklifleriniz, siparişleriniz, teslimatlarınız ve ödemeleriniz burada tek ekranda görünür.</div></div></div></section>
  );
}

function YoungFarmerAndContact() {
  return (
    <section id="iletisim" className="scroll-mt-20 border-y bg-dark px-4 py-20 text-hwhite md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div><div className="overflow-hidden rounded-xl"><img src={LANDING_MEDIA.youngFarmer} alt="Tarlada üretim kaydını telefonundan yöneten genç üretici" width={1200} height={1000} loading="lazy" className="aspect-[6/5] w-full object-cover" /></div><h2 className="mt-7 font-serif text-3xl md:text-4xl">Çiftçilik belirsiz bir mecburiyet değil, yönetilebilir bir iş olsun.</h2><p className="mt-4 text-hwhite/70">Mevcut talebi gör, gerçekleşmiş maliyetlerini kaydet, fiyat kaynaklarını karşılaştır, alıcılara ulaş ve işini telefondan yönet.</p><div className="mt-6 grid gap-2 sm:grid-cols-2">{["Mevcut talepleri görme", "Gerçekleşmiş maliyetleri kaydetme", "Alıcı ağına erişim", "Telefondan kolay yönetim"].map((item) => <span key={item} className="flex items-center gap-2 text-sm text-hwhite/80"><Check className="h-4 w-4 text-sage" />{item}</span>)}</div></div>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const submit = useServerFn(submitContactInquiry);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [topic, setTopic] = useState<ContactTopic>("farmer");
  const [note, setNote] = useState("");
  const mutation = useMutation({ mutationFn: () => submit({ data: { name, phone, city: city || null, topic, note: note || null } }), onSuccess: () => { toast.success("Teşekkürler. Ekibimiz en kısa sürede sizinle iletişime geçecek."); setName(""); setPhone(""); setCity(""); setTopic("farmer"); setNote(""); }, onError: (error: Error) => toast.error(error.message || "Mesajınız gönderilemedi.") });
  const valid = name.trim().length > 0 && phone.replace(/\D/g, "").length >= 10;
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (valid) mutation.mutate(); }} className="rounded-xl bg-background p-5 text-foreground sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-saffron">İletişim</p><h2 className="mt-3 font-serif text-2xl">Hasat'la ne yapmak istediğinizi konuşalım.</h2><p className="mt-2 text-sm text-muted-foreground">Ürününüzü satmak, düzenli ürün almak, iş birliği yapmak veya bilgi edinmek için bize ulaşın.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Ad Soyad"><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-md border bg-input px-3" /></Field><Field label="Telefon"><input required inputMode="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-md border bg-input px-3" /></Field><Field label="Şehir"><input maxLength={80} value={city} onChange={(event) => setCity(event.target.value)} className="w-full rounded-md border bg-input px-3" /></Field><Field label="Size en uygun seçenek"><select value={topic} onChange={(event) => setTopic(event.target.value as ContactTopic)} className="w-full rounded-md border bg-input px-3">{CONTACT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div>
      <Field label="Mesaj"><textarea maxLength={500} rows={4} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-md border bg-input px-3 py-3" /></Field>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button type="submit" loading={mutation.isPending} disabled={!valid} loadingLabel="Gönderiliyor"><Send /> Bize ulaşın</Button><Button variant="outline" asChild><a href={whatsappHref("Hasat platformu hakkında bilgi almak istiyorum")} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp'tan yazın</a></Button></div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mt-4 block text-xs font-semibold text-muted-foreground">{label}<span className="mt-1 block">{children}</span></label>;
}

function FinalCTAAndFAQ({ onRole }: { onRole: (role: "farmer" | "buyer") => void }) {
  return (
    <section className="px-4 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-5xl"><div className="rounded-xl bg-primary p-7 text-primary-foreground md:p-12"><h2 className="max-w-3xl font-serif text-3xl md:text-5xl">Bu sezonu talebi ve gerçek fiyatları görerek planla.</h2><div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button size="lg" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90" onClick={() => onRole("farmer")}>Ürünüm için talep bul <ArrowRight /></Button><Button size="lg" variant="outline" className="border-primary-foreground/35 bg-primary text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" asChild><a href={whatsappHref("Hasat'a nasıl başlayabileceğim hakkında bilgi almak istiyorum")} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp'tan bilgi al</a></Button></div></div><div className="mt-20"><SectionHeading eyebrow="SSS" title="Çiftçilerin en çok sordukları" /><div className="mt-8 divide-y border-y">{FARMER_FAQ.map((item) => <details key={item.q} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-semibold"><span>{item.q}</span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary><p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{item.a}</p></details>)}</div></div></div></section>
  );
}

function Footer() {
  return <footer className="border-t bg-card px-4 pb-28 pt-12 text-sm text-muted-foreground md:pb-12"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left"><div><BrandLogo variant="wordmark" height={22} /><p className="mt-2 text-xs">Üreticinin ticaret platformu.</p></div><nav className="flex flex-wrap items-center justify-center gap-5"><Link to="/tarifler" className="hover:text-foreground">Tarifler</Link><a href={whatsappHref("Hasat hakkında bilgi almak istiyorum")} target="_blank" rel="noreferrer" className="hover:text-foreground">WhatsApp</a><Link to="/terms" className="hover:text-foreground">Kullanım Koşulları</Link><Link to="/privacy" className="hover:text-foreground">Gizlilik</Link></nav><p className="text-xs">© {new Date().getFullYear()} Hasat</p></div></footer>;
}

function MobileCTA({ onRole }: { onRole: (role: "farmer" | "buyer") => void }) {
  return <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-3 backdrop-blur md:hidden"><Button className="w-full" onClick={() => onRole("farmer")}>Ürünüm için talep bul <ArrowRight /></Button></div>;
}