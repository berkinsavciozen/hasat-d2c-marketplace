import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck,
  MessageCircle,
  Sparkles,
  Leaf,
  Star,
  MapPin,
  Droplets,
  Camera,
  Sprout,
  Scissors,
  ArrowRight,
  Check,
  Utensils,
  Hotel,
  ShoppingBasket,
  Globe2,
  Users2,
  
  Lock,
  Percent,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasat } from "@/lib/hasat/store";
import { HASAT_WHATSAPP_NUMBER } from "@/lib/hasat/constants";
import { submitIndoorInterest } from "@/lib/api/indoor-interest.functions";

const HASAT_TITLE = "Hasat | Çiftçiden Doğrudan Alışveriş — İzlenebilir Tarım Pazarı";
const HASAT_DESC =
  "Hasat, üreticiyi alıcıyla doğrudan buluşturan, her ürünün geçmişini kanıtlı şekilde gösteren Türkiye'nin izlenebilir tarım pazarıdır.";
const HASAT_URL = "https://hasat.lovable.app";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Hasat nedir?",
    a: "Hasat, Türkiye'de çiftçilerin ürünlerini doğrudan restoran, otel, market, ihracatçı ve bireysel alıcılara sattığı bir pazar yeridir. Her ürünün hasat geçmişi kayıt altına alınır.",
  },
  {
    q: "Hasat'ta komisyon ne kadar?",
    a: "Şeffaf ve sabit %5 komisyon uygulanır, gizli ücret yoktur.",
  },
  {
    q: "İzlenebilirlik rozeti nasıl hesaplanır?",
    a: "Çiftçinin tarla günlüğüne girdiği sulama, gübreleme ve hasat kayıtlarının tamlığına göre otomatik hesaplanır — Belgeleniyor, Temel, İyi Belgelenmiş ve Tam İzlenebilir olmak üzere dört seviyesi vardır.",
  },
  {
    q: "Bireysel alıcı olarak alışveriş yapabilir miyim?",
    a: "Evet, Hasat restoran/otel gibi işletmelerin yanında bireysel tüketicilere de açıktır.",
  },
  {
    q: "Ödeme nasıl yapılır?",
    a: "Alıcı, anlaşılan tutarı çiftçinin IBAN'ına doğrudan gönderir; ödeme çiftçi tarafından onaylandığında sipariş tamamlanır.",
  },
  {
    q: "Çiftçi olarak nasıl başlarım?",
    a: "Telefon numaranla ücretsiz kaydolur, parselini ve ürününü eklersin — ilk ilanın otomatik olarak taslak oluşturulur, sen onayladığında yayınlanır.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: HASAT_TITLE },
      { name: "description", content: HASAT_DESC },
      { property: "og:title", content: HASAT_TITLE },
      { property: "og:description", content: HASAT_DESC },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Hasat",
          description: HASAT_DESC,
          url: HASAT_URL,
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: LandingPage,
});

/* Local palette — scoped only to this route via inline vars on the root element. */
const lpVars: React.CSSProperties = {
  ["--lp-primary" as string]: "#1B3A2B",
  ["--lp-primary-2" as string]: "#274d3a",
  ["--lp-accent" as string]: "#4A9B5E",
  ["--lp-earth" as string]: "#6B4A32",
  ["--lp-cream" as string]: "#F5F1E6",
  ["--lp-cream-2" as string]: "#EDE7D6",
  ["--lp-white" as string]: "#FFFFFF",
  ["--lp-gray" as string]: "#8A8F87",
  ["--lp-muted" as string]: "#5A6560",
  ["--lp-ink" as string]: "#14231C",
  ["--lp-line" as string]: "rgba(20,35,28,0.10)",
};

/* Photo URLs — atmospheric stock, no faces, no watermarks. */
import IMG_SAFFRON from "@/assets/crop-saffron.jpg";
import IMG_OLIVE from "@/assets/crop-olive.jpg";
import IMG_HAZELNUT from "@/assets/crop-hazelnut.jpg";
import turkeyOutlineUrl from "@/assets/turkey-outline.svg?url";
const IMG_HERO_FIELD =
  "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=2000&q=80";
const IMG_LAVENDER =
  "https://images.unsplash.com/photo-1499002238440-d264edd596ec?auto=format&fit=crop&w=1200&q=80";
const IMG_SOIL_HANDS =
  "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1600&q=80";

/* --------------------------------------------------------------- */

function LandingPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.user) {
          setChecking(false);
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, name, phone, city, premium")
          .eq("id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        const role = (profile?.role === "buyer" ? "buyer" : "farmer") as "farmer" | "buyer";
        setRole(role);
        if (!profile?.name || profile.name.trim() === "") {
          router.navigate({ to: role === "buyer" ? "/onboarding/buyer" : "/onboarding/farmer" });
          return;
        }
        updateUser({
          id: session.user.id,
          name: profile.name,
          phone: profile.phone ?? "",
          city: profile.city ?? "",
          premium: !!profile.premium,
        });
        router.navigate({ to: role === "buyer" ? "/buyer/discover" : "/farmer/home" });
      } catch (e) {
        console.warn("[landing] session check failed", e);
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router, setRole, updateUser]);

  const goRole = (role: "farmer" | "buyer") => navigate({ to: "/login", search: { role } });

  if (checking) {
    return (
      <div
        className="min-h-screen grid place-items-center"
        style={{ ...lpVars, background: "var(--lp-cream)", color: "var(--lp-ink)" }}
      >
        <div className="text-center opacity-70">
          <div className="text-4xl mb-2 animate-pulse">🌸</div>
          <div className="text-xs font-mono">Hasat</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...lpVars, background: "var(--lp-cream)", color: "var(--lp-ink)" }} className="min-h-screen">
      <LandingStyles />
      <Nav onRole={goRole} />
      <Hero onRole={goRole} />
      <ValuePillars />
      <SupplyChain />
      <TraceabilityMock />
      <MarketplacePreview />
      <TurkeyMap />
      <FarmerStory />
      <BuyerPersonas />
      <AISection />
      <TrustScoreLadder />
      <IndoorSection />
      <FAQ />
      <Footer />
    </div>
  );
}

/* ---------- Scoped keyframes & reveal styles ---------- */
function LandingStyles() {
  return (
    <style>{`
      @keyframes lp-fade-up { from { opacity:0; transform: translateY(14px);} to { opacity:1; transform:none;} }
      @keyframes lp-fade-in { from { opacity:0 } to { opacity:1 } }
      @keyframes lp-pin { 0%{ transform: scale(1); opacity:.9 } 70%{ transform: scale(2.6); opacity:0 } 100%{ transform: scale(2.6); opacity:0 } }
      @keyframes lp-draw { from { stroke-dashoffset: 400 } to { stroke-dashoffset: 0 } }
      @keyframes lp-timeline-grow { from { height: 0 } to { height: 100% } }
      .lp-reveal { opacity: 0; transform: translateY(14px); transition: opacity .7s ease-out, transform .7s ease-out; }
      .lp-revealed .lp-reveal { opacity: 1; transform: none; }
      .lp-revealed .lp-reveal-d1 { transition-delay: .08s; }
      .lp-revealed .lp-reveal-d2 { transition-delay: .16s; }
      .lp-revealed .lp-reveal-d3 { transition-delay: .24s; }
      .lp-revealed .lp-reveal-d4 { transition-delay: .32s; }
      .lp-revealed .lp-reveal-d5 { transition-delay: .40s; }
      .lp-glass { background: rgba(255,255,255,0.72); backdrop-filter: blur(18px) saturate(140%); border: 1px solid rgba(255,255,255,0.6); }
      .lp-card { background: var(--lp-white); border: 1px solid var(--lp-line); }
      .lp-card-hover { transition: transform .35s ease, box-shadow .35s ease; }
      .lp-card-hover:hover { transform: translateY(-3px); box-shadow: 0 20px 40px -24px rgba(20,35,28,0.25); }
      .lp-pin-halo { animation: lp-pin 2.4s ease-out infinite; }
    `}</style>
  );
}

/* ---------- reveal hook ---------- */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("lp-revealed");
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/* ---------- Nav ---------- */
function Nav({ onRole }: { onRole: (r: "farmer" | "buyer") => void }) {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: "var(--lp-cream)", borderColor: "var(--lp-line)" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">🌸</span>
          <span className="font-serif text-lg" style={{ color: "var(--lp-primary)" }}>Hasat</span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-widest ml-2" style={{ color: "var(--lp-muted)" }}>
            GÜVEN PLATFORMU
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRole("farmer")}
            className="text-xs px-3 py-1.5 rounded-full border transition hover:bg-black/[0.03]"
            style={{ borderColor: "var(--lp-line)", color: "var(--lp-ink)" }}
          >
            Çiftçiyim
          </button>
          <button
            onClick={() => onRole("buyer")}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition hover:opacity-90"
            style={{ background: "var(--lp-primary)", color: "var(--lp-cream)" }}
          >
            Alıcıyım
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function Hero({ onRole }: { onRole: (r: "farmer" | "buyer") => void }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="relative isolate overflow-hidden" ref={ref}>
      {/* Background photo, desaturated & dimmed */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${IMG_HERO_FIELD})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(35%) brightness(0.42)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--lp-primary) 90%, transparent) 0%, color-mix(in oklab, var(--lp-primary) 76%, transparent) 58%, color-mix(in oklab, var(--lp-primary) 64%, transparent) 100%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-24 md:pt-24 md:pb-28 grid gap-12 md:grid-cols-2 items-center">
        <div className="lp-reveal" style={{ color: "var(--lp-white)", textShadow: "0 2px 18px rgba(0,0,0,0.32)" }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-widest"
            style={{ background: "rgba(255,255,255,0.18)", color: "#FFFFFF" }}>
            <ShieldCheck className="w-3.5 h-3.5" /> Türkiye'nin izlenebilir tarım pazarı
          </div>
          <h1 className="mt-5 font-serif leading-[1.05] text-4xl sm:text-5xl md:text-6xl">
            Ürününü değil,{" "}
            <span style={{ color: "#CFE8D3" }}>güveni</span>{" "}
            satıyoruz.
          </h1>
          <p className="mt-5 text-base md:text-lg max-w-lg" style={{ color: "rgba(255,255,255,0.94)" }}>
            Çiftçiler ürününü doğrudan alıcıya listeler, her hasat kaydı
            fotoğrafla belgelenir, fiyat pazarlıkla şeffaf şekilde belirlenir.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => onRole("farmer")}
              className="rounded-full px-5 py-3 text-sm font-medium transition hover:opacity-90 inline-flex items-center gap-2"
              style={{ background: "var(--lp-accent)", color: "#fff" }}
            >
              Çiftçiyim <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onRole("buyer")}
              className="rounded-full px-5 py-3 text-sm font-medium transition hover:bg-white/10 inline-flex items-center gap-2"
              style={{ border: "1px solid rgba(255,255,255,0.4)", color: "#fff" }}
            >
              Alıcıyım <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating glass product card + timeline */}
        <div className="relative lp-reveal lp-reveal-d2">
          <div className="lp-glass rounded-3xl p-4 shadow-2xl max-w-sm mx-auto md:ml-auto">
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
              <img src={IMG_SAFFRON} alt="Safran çiçeği" className="w-full h-full object-cover" />
              <span
                className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                style={{ background: "var(--lp-primary)", color: "#fff" }}
              >
                <ShieldCheck className="w-3 h-3" /> Tam İzlenebilir
              </span>
            </div>
            <div className="p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-serif text-lg" style={{ color: "var(--lp-ink)" }}>Safran · 50 gr</div>
                <div className="text-sm font-medium" style={{ color: "var(--lp-primary)" }}>₺2.900</div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--lp-muted)" }}>
                <MapPin className="w-3 h-3" /> Safranbolu · A. Y. <span className="opacity-70">· örnek üretici</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--lp-muted)" }}>
                <div className="inline-flex items-center gap-0.5" style={{ color: "var(--lp-accent)" }}>
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-3 h-3 fill-current" />)}
                </div>
                <span>·</span><span>Hasat: 22 Ekim 2025</span>
              </div>
            </div>
          </div>

          {/* Timeline overlay */}
          <div
            className="lp-glass rounded-2xl p-6 mt-4 max-w-sm mx-auto md:ml-auto md:-mt-6 md:mr-6 md:translate-x-4"
            style={{ boxShadow: "0 20px 40px -18px rgba(0,0,0,0.3)" }}
          >
            <div className="text-[11px] uppercase tracking-widest mb-4" style={{ color: "var(--lp-muted)" }}>
              Tarla günlüğü
            </div>
            <TimelineDraw
              items={[
                { icon: <Droplets className="w-4 h-4" />, label: "Sulandı", date: "3 Eki" },
                { icon: <Camera className="w-4 h-4" />, label: "Fotoğraf eklendi", date: "8 Eki" },
                { icon: <Sprout className="w-4 h-4" />, label: "Gübrelendi", date: "15 Eki" },
                { icon: <Scissors className="w-4 h-4" />, label: "Hasat edildi", date: "22 Eki" },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineDraw({ items }: { items: { icon: React.ReactNode; label: string; date: string }[] }) {
  return (
    <ol className="relative pl-9 space-y-5">
      <span
        className="absolute left-[11px] top-2 bottom-2 w-px"
        style={{ background: "var(--lp-accent)", animation: "lp-timeline-grow 1.6s ease-out forwards" }}
      />
      {items.map((it, i) => (
        <li
          key={it.label}
          className="relative grid grid-cols-[1fr_auto] items-center gap-4"
          style={{ animation: `lp-fade-up .6s ease-out ${0.4 + i * 0.25}s both` }}
        >
          <span
            className="absolute -left-9 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-6 rounded-full"
            style={{ background: "var(--lp-accent)", color: "#fff" }}
          >
            {it.icon}
          </span>
          <div className="text-sm" style={{ color: "var(--lp-ink)" }}>{it.label}</div>
          <div className="text-xs tabular-nums" style={{ color: "var(--lp-muted)" }}>{it.date}</div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Value pillars ---------- */
function ValuePillars() {
  const ref = useReveal<HTMLDivElement>();
  const items = [
    { icon: <Sprout className="w-5 h-5" />, title: "Doğrudan Üreticiden", body: "Aracı zinciri yok. Ödeme çiftçinin IBAN'ına gider, komisyon şeffaf." },
    { icon: <ShieldCheck className="w-5 h-5" />, title: "Tam İzlenebilir", body: "Her ürünün sulama, gübreleme, hasat kaydı fotoğraflı olarak kayıtlı." },
    { icon: <Percent className="w-5 h-5" />, title: "Adil Fiyat", body: "Güncel piyasa fiyatını görürsün; fiyatın çok farklıysa hem sana hem alıcıya haber verilir." },
  ];
  return (
    <section className="px-4 py-16 md:py-20" style={{ background: "var(--lp-cream)", position: "relative", isolation: "isolate" }} ref={ref}>
      <div className="mx-auto max-w-6xl">
        <h2 className="font-serif text-xl md:text-2xl mb-6 text-center" style={{ color: "var(--lp-ink)" }}>
          Neden Hasat?
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
        {items.map((it, i) => (
          <div
            key={it.title}
            className={`lp-card lp-card-hover rounded-2xl p-6 lp-reveal lp-reveal-d${i + 1}`}
          >
            <div
              className="grid place-items-center w-11 h-11 rounded-xl mb-4"
              style={{ background: "color-mix(in oklab, var(--lp-accent) 15%, transparent)", color: "var(--lp-accent)" }}
            >
              {it.icon}
            </div>
            <div className="font-serif text-lg mb-1" style={{ color: "var(--lp-ink)" }}>{it.title}</div>
            <div className="text-sm" style={{ color: "var(--lp-muted)" }}>{it.body}</div>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Supply chain comparison ---------- */
function SupplyChain() {
  const ref = useReveal<HTMLDivElement>();
  const [mode, setMode] = useState<"traditional" | "hasat">("traditional");
  const traditional = [
    { label: "Çiftçi", pct: 100 },
    { label: "Aracı", pct: 62 },
    { label: "Toptancı", pct: 46 },
    { label: "Distribütör", pct: 32 },
    { label: "Perakendeci", pct: 22 },
    { label: "Tüketici", pct: 14 },
  ];
  const direct = [
    { label: "Çiftçi", pct: 100 },
    { label: "Alıcı", pct: 95 },
  ];
  const isHasat = mode === "hasat";
  const nodes = isHasat ? direct : traditional;
  const barTint = isHasat ? "var(--lp-accent)" : "var(--lp-earth)";
  const nodeBg = isHasat
    ? "color-mix(in oklab, var(--lp-accent) 12%, var(--lp-white))"
    : "color-mix(in oklab, var(--lp-earth) 12%, var(--lp-white))";
  const calloutRef = useReveal<HTMLDivElement>();
  return (
    <section
      className="px-4 py-16 md:py-24 border-t"
      style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream-2)", position: "relative", isolation: "isolate" }}
      ref={ref}
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-8 lp-reveal">
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>Tedarik zinciri</div>
          <h2 className="font-serif text-3xl md:text-4xl" style={{ color: "var(--lp-ink)" }}>
            Üreticinin eline ne kadar geçiyor?
          </h2>
          <p className="mt-3 text-sm max-w-xl mx-auto" style={{ color: "var(--lp-muted)" }}>
            Alıcının ödediği her ₺100'ün, üreticiye kalan payı.
          </p>
        </div>

        {/* Headline callout */}
        <div ref={calloutRef} className="grid gap-4 md:grid-cols-2 mb-10">
          <div
            className="rounded-3xl p-6 md:p-8 text-center lp-reveal"
            style={{ background: "var(--lp-white)", border: "1px solid var(--lp-line)" }}
          >
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: "var(--lp-earth)" }}>Geleneksel</div>
            <div className="font-serif tabular-nums text-6xl md:text-7xl leading-none" style={{ color: "var(--lp-earth)" }}>
              %<CountUp to={14} />
            </div>
            <div className="mt-3 text-sm" style={{ color: "var(--lp-muted)" }}>üreticiye kalan pay</div>
          </div>
          <div
            className="rounded-3xl p-6 md:p-8 text-center lp-reveal lp-reveal-d2"
            style={{ background: "var(--lp-primary)", color: "#fff" }}
          >
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: "#CFE8D3" }}>Hasat ile</div>
            <div className="font-serif tabular-nums text-6xl md:text-7xl leading-none" style={{ color: "#CFE8D3" }}>
              %<CountUp to={95} />
            </div>
            <div className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>üreticiye kalan pay</div>
          </div>
        </div>



        {/* Toggle */}
        <div className="mx-auto mb-8 inline-flex rounded-full p-1 lp-reveal lp-reveal-d1"
          style={{ background: "var(--lp-white)", border: "1px solid var(--lp-line)" }}>
          <button
            onClick={() => setMode("traditional")}
            className="rounded-full px-4 py-2 text-xs md:text-sm font-medium transition"
            style={{
              background: !isHasat ? "var(--lp-earth)" : "transparent",
              color: !isHasat ? "#fff" : "var(--lp-muted)",
            }}
          >Geleneksel</button>
          <button
            onClick={() => setMode("hasat")}
            className="rounded-full px-4 py-2 text-xs md:text-sm font-medium transition"
            style={{
              background: isHasat ? "var(--lp-primary)" : "transparent",
              color: isHasat ? "#fff" : "var(--lp-muted)",
            }}
          >Hasat ile</button>
        </div>

        <div className="lp-card rounded-3xl p-6 md:p-10 lp-reveal lp-reveal-d2">
          <div className="flex items-baseline justify-between mb-6">
            <div className="text-xs uppercase tracking-widest" style={{ color: isHasat ? "var(--lp-accent)" : "var(--lp-earth)" }}>
              {isHasat ? "Hasat ile" : "Geleneksel"}
            </div>
            <div className="text-xs" style={{ color: "var(--lp-muted)" }}>Üreticinin eline geçen değer</div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0,1fr))` }}>
            {nodes.map((n, i) => (
              <div key={n.label} className="flex flex-col items-center relative">
                {i < nodes.length - 1 && (
                  <span className="hidden md:block absolute top-4 left-1/2 w-full h-px" style={{ background: "var(--lp-line)" }} aria-hidden />
                )}
                <div
                  className="rounded-full px-3 py-1.5 text-[11px] md:text-xs relative z-10 text-center w-full max-w-[140px]"
                  style={{ background: nodeBg, color: "var(--lp-ink)", border: "1px solid var(--lp-line)" }}
                >
                  {n.label}
                </div>
                {/* Value bar */}
                <div className="mt-4 w-full max-w-[80px] flex flex-col items-center">
                  <div className="relative w-full h-24 md:h-32 rounded-lg overflow-hidden" style={{ background: "color-mix(in oklab, var(--lp-line) 60%, transparent)" }}>
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-lg transition-all duration-700 ease-out"
                      style={{ height: `${n.pct}%`, background: barTint }}
                    />
                  </div>
                  <div className="mt-2 text-sm md:text-base font-semibold tabular-nums" style={{ color: "var(--lp-ink)" }}>
                    {n.pct}%
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t text-xs md:text-sm text-center" style={{ borderColor: "var(--lp-line)", color: "var(--lp-muted)" }}>
            {isHasat
              ? "Şeffaf komisyon: %5. Ödeme doğrudan çiftçinin IBAN'ına."
              : "Ortalama olarak son tüketicinin ödediği her ₺100'ün yalnızca ~₺14'ü üreticide kalıyor."}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Traceability phone mock ---------- */
function TraceabilityMock() {
  const ref = useReveal<HTMLDivElement>();
  const rows = [
    { icon: <Sprout className="w-4 h-4" />, label: "Dikim", date: "10 Mar" },
    { icon: <Droplets className="w-4 h-4" />, label: "Sulama", date: "18 Haz" },
    { icon: <Camera className="w-4 h-4" />, label: "Fotoğraf: dal", date: "5 Eyl" },
    { icon: <Sprout className="w-4 h-4" />, label: "Gübreleme", date: "22 Eyl" },
    { icon: <Scissors className="w-4 h-4" />, label: "Hasat", date: "8 Kas" },
  ];
  return (
    <section
      className="px-4 py-16 md:py-24 border-t"
      style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream)", position: "relative", isolation: "isolate" }}
      ref={ref}
    >
      <div className="mx-auto max-w-6xl grid gap-12 md:grid-cols-2 items-center">
        <div className="lp-reveal">
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>İzlenebilirlik</div>
          <h2 className="font-serif text-3xl md:text-4xl mb-4" style={{ color: "var(--lp-ink)" }}>
            Her ürünün kanıtlı bir geçmişi var.
          </h2>
          <p className="text-base mb-6" style={{ color: "var(--lp-muted)" }}>
            Tarla günlüğü fotoğraflı olarak tutulur. Alıcı, satın almadan önce
            sulama, gübreleme, hasat tarihini tek tek görür. "Tam İzlenebilir"
            rozeti, uydurma değil — her adımın kaydından hesaplanır.
          </p>
          <ul className="space-y-2 text-sm" style={{ color: "var(--lp-ink)" }}>
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5" style={{ color: "var(--lp-accent)" }} /> Fotoğraflı adım kayıtları</li>
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5" style={{ color: "var(--lp-accent)" }} /> Parsel & harita konumu</li>
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5" style={{ color: "var(--lp-accent)" }} /> Otomatik güven skoru</li>
          </ul>
        </div>

        {/* Phone mockup */}
        <div className="lp-reveal lp-reveal-d2 mx-auto">
          <div
            className="w-[300px] md:w-[340px] rounded-[36px] p-3"
            style={{ background: "var(--lp-ink)", boxShadow: "0 30px 60px -20px rgba(20,35,28,0.35)" }}
          >
            <div className="rounded-[28px] overflow-hidden" style={{ background: "var(--lp-white)" }}>
              <div className="relative aspect-[16/10]">
                <img src={IMG_OLIVE} alt="Ayvalık'ta zeytin dalında olgunlaşmış zeytinler" className="w-full h-full object-cover" />
                <span
                  className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]"
                  style={{ background: "rgba(255,255,255,0.92)", color: "var(--lp-primary)" }}
                >
                  <MapPin className="w-3 h-3" /> Ayvalık
                </span>
              </div>
              <div className="p-5">
                <div className="font-serif text-base mb-4" style={{ color: "var(--lp-ink)" }}>Zeytin · Parsel 1</div>
                <ol className="space-y-4">
                  {rows.map((r, i) => (
                    <li
                      key={r.label}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-4 opacity-0"
                      style={{ animation: `lp-fade-up .55s ease-out ${0.1 + i * 0.18}s both` }}
                    >
                      <span
                        className="grid place-items-center w-7 h-7 rounded-full shrink-0"
                        style={{ background: "color-mix(in oklab, var(--lp-accent) 18%, transparent)", color: "var(--lp-accent)" }}
                      >
                        {r.icon}
                      </span>
                      <span className="text-sm min-w-0 truncate" style={{ color: "var(--lp-ink)" }}>{r.label}</span>
                      <span className="text-xs tabular-nums" style={{ color: "var(--lp-muted)" }}>{r.date}</span>
                    </li>
                  ))}
                </ol>
                <div
                  className="mt-5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                  style={{ background: "var(--lp-primary)", color: "#fff" }}
                >
                  <ShieldCheck className="w-3 h-3" /> Tam İzlenebilir · %92
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Marketplace preview ---------- */
function MarketplacePreview() {
  const ref = useReveal<HTMLDivElement>();
  const items = [
    { img: IMG_SAFFRON, crop: "Safran", loc: "Safranbolu", farmer: "A. Y.", tier: "Tam İzlenebilir", qty: "50 gr", price: "₺2.900", when: "Hasat: 22 Eki 2025", delivery: "Kargo" },
    { img: IMG_OLIVE, crop: "Zeytinyağı · Erken hasat", loc: "Ayvalık", farmer: "M. K.", tier: "İyi Belgelenmiş", qty: "1 L", price: "₺620", when: "Hasat: 3 Kas 2025", delivery: "Kargo" },
    { img: IMG_LAVENDER, crop: "Lavanta kurusu", loc: "Isparta", farmer: "A. D.", tier: "Tam İzlenebilir", qty: "250 gr", price: "₺380", when: "Hasat: 18 Tem 2025", delivery: "Kargo" },
    { img: IMG_HAZELNUT, crop: "Fındık · Levant", loc: "Giresun", farmer: "S. T.", tier: "İyi Belgelenmiş", qty: "1 kg", price: "₺310", when: "Hasat: 25 Ağu 2025", delivery: "Kargo · Elden" },
  ];
  return (
    <section
      className="px-4 py-16 md:py-24 border-t"
      style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream-2)", position: "relative", isolation: "isolate" }}
      ref={ref}
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between mb-8 lp-reveal">
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>Pazar yeri</div>
            <h2 className="font-serif text-3xl md:text-4xl" style={{ color: "var(--lp-ink)" }}>Öne çıkan üreticiler.</h2>
            <div className="text-xs mt-1" style={{ color: "var(--lp-muted)" }}>Vitrin ilanları böyle görünür — en yeni tarihe göre sıralanır, ücretli öne çıkarma yoktur.</div>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <article
              key={it.crop}
              className={`lp-card lp-card-hover rounded-2xl overflow-hidden lp-reveal lp-reveal-d${(i % 4) + 1}`}
            >
              <div className="relative aspect-[4/3]">
                <img src={it.img} alt={it.crop} loading="lazy" className="w-full h-full object-cover" />
                <span
                  className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                  style={{ background: "var(--lp-primary)", color: "#fff" }}
                >
                  <ShieldCheck className="w-3 h-3" /> {it.tier}
                </span>
                <span
                  className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "rgba(255,255,255,0.92)", color: "var(--lp-muted)", border: "1px solid var(--lp-line)" }}
                >
                  Gösterim
                </span>
              </div>
              <div className="p-4">
                <div className="font-serif text-base mb-1" style={{ color: "var(--lp-ink)" }}>{it.crop}</div>
                <div className="text-xs mb-3 flex items-center gap-1" style={{ color: "var(--lp-muted)" }}>
                  <MapPin className="w-3 h-3" /> {it.loc} · Üretici {it.farmer}
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm" style={{ color: "var(--lp-muted)" }}>{it.qty}</span>
                  <span className="text-base font-medium" style={{ color: "var(--lp-primary)" }}>{it.price}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--lp-muted)" }}>
                  <span>{it.when}</span>
                  <span>{it.delivery}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Turkey map ---------- */
type Pin = { id: string; xPct: number; yPct: number; region: string; crop: string; qty: string; tier: string };
const PINS: Pin[] = [
  // Coordinates are % positions inside the visible Turkey outline area (cropped band).
  { id: "safranbolu", xPct: 47, yPct: 30, region: "Safranbolu", crop: "Safran", qty: "1.2 kg", tier: "Tam İzlenebilir" },
  { id: "isparta",    xPct: 34, yPct: 62, region: "Isparta",    crop: "Lavanta",    qty: "40 kg", tier: "Tam İzlenebilir" },
  { id: "ayvalik",    xPct: 14, yPct: 48, region: "Ayvalık",    crop: "Zeytinyağı", qty: "800 L", tier: "İyi Belgelenmiş" },
  { id: "giresun",    xPct: 70, yPct: 24, region: "Giresun",    crop: "Fındık",     qty: "2 t",   tier: "İyi Belgelenmiş" },
  { id: "malatya",    xPct: 71, yPct: 55, region: "Malatya",    crop: "Kayısı",     qty: "1.5 t", tier: "İyi Belgelenmiş" },
  { id: "izmir",      xPct: 13, yPct: 60, region: "İzmir",      crop: "İncir",      qty: "600 kg", tier: "Tam İzlenebilir" },
  { id: "antalya",    xPct: 37, yPct: 78, region: "Antalya",    crop: "Nar",        qty: "900 kg", tier: "Temel" },
];

function TurkeyMap() {
  const ref = useReveal<HTMLDivElement>();
  const [active, setActive] = useState<string>("safranbolu");
  const pin = useMemo(() => PINS.find((p) => p.id === active) ?? PINS[0], [active]);
  return (
    <section
      className="px-4 py-16 md:py-24 border-t"
      style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream)", position: "relative", isolation: "isolate" }}
      ref={ref}
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-10 lp-reveal">
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>Üretim haritası</div>
          <h2 className="font-serif text-3xl md:text-4xl" style={{ color: "var(--lp-ink)" }}>Türkiye'nin dört bir yanından.</h2>
        </div>

        <div className="lp-card rounded-3xl p-4 md:p-8 lp-reveal lp-reveal-d1 grid gap-6 md:grid-cols-[1fr_260px] items-center">
          <div
            className="relative w-full mx-auto"
            style={{ aspectRatio: "16 / 8", maxWidth: 720 }}
          >
            <img
              src={turkeyOutlineUrl}
              alt="Türkiye haritası ana hattı"
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: "cover",
                objectPosition: "center",
                /* Recolor the black silhouette to a soft primary tint */
                filter: "brightness(0) saturate(100%) invert(19%) sepia(19%) saturate(1113%) hue-rotate(97deg) brightness(96%) contrast(88%) opacity(0.55)",
              }}
            />
            {/* Pin overlay */}
            {PINS.map((p) => {
              const isActive = p.id === active;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActive(p.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
                  aria-label={p.region}
                >
                  <span
                    className="block rounded-full"
                    style={{
                      width: isActive ? 14 : 10,
                      height: isActive ? 14 : 10,
                      background: isActive ? "var(--lp-accent)" : "var(--lp-primary)",
                      boxShadow: isActive
                        ? "0 0 0 4px color-mix(in oklab, var(--lp-accent) 25%, transparent)"
                        : "0 0 0 2px var(--lp-white)",
                      transition: "all .25s ease",
                    }}
                  />
                  <span
                    className="absolute left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium pointer-events-none"
                    style={{
                      top: "100%",
                      background: isActive ? "var(--lp-primary)" : "var(--lp-white)",
                      color: isActive ? "#fff" : "var(--lp-ink)",
                      border: "1px solid var(--lp-line)",
                      opacity: isActive ? 1 : 0.85,
                    }}
                  >
                    {p.region}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl p-4" style={{ background: "var(--lp-cream-2)", border: "1px solid var(--lp-line)" }}>
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>
              Gösterim
            </div>
            <div className="font-serif text-xl mb-1" style={{ color: "var(--lp-ink)" }}>{pin.region}</div>
            <div className="text-sm mb-3" style={{ color: "var(--lp-muted)" }}>{pin.crop} · {pin.qty}</div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
              style={{ background: "var(--lp-primary)", color: "#fff" }}
            >
              <ShieldCheck className="w-3 h-3" /> {pin.tier}
            </span>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PINS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  className="text-[11px] rounded-full px-2 py-1 border transition"
                  style={{
                    borderColor: p.id === active ? "var(--lp-primary)" : "var(--lp-line)",
                    background: p.id === active ? "var(--lp-primary)" : "transparent",
                    color: p.id === active ? "#fff" : "var(--lp-ink)",
                  }}
                >
                  {p.region}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Farmer story ---------- */
function FarmerStory() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="px-4 py-16 md:py-24 border-t" style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream-2)" }} ref={ref}>
      <div className="mx-auto max-w-6xl grid gap-10 md:grid-cols-[1.2fr_1fr] items-center">
        <div className="relative rounded-3xl overflow-hidden aspect-[4/3] lp-reveal">
          <img src={IMG_SOIL_HANDS} alt="Toprakla çalışan eller" className="w-full h-full object-cover" style={{ filter: "saturate(0.9)" }} />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, transparent 40%, rgba(20,35,28,0.35) 100%)" }}
          />
        </div>
        <div className="lp-reveal lp-reveal-d2">
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>Çiftçi hikayesi</div>
          <blockquote className="font-serif text-2xl md:text-3xl leading-snug" style={{ color: "var(--lp-ink)" }}>
            "Ürünümü ilk defa doğru fiyata sattım. Alıcı, tarlamın her adımını
            görüyor — güven kendiliğinden geliyor."
          </blockquote>
          <div className="mt-4 text-sm" style={{ color: "var(--lp-muted)" }}>
            <span className="italic">Örnek senaryo — </span> Üretici A. Y., Safranbolu · 5 dönüm safran
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Buyer personas ---------- */
function BuyerPersonas() {
  const ref = useReveal<HTMLDivElement>();
  const personas = [
    { icon: <Utensils className="w-5 h-5" />, title: "Restoran / Kafe", body: "Mevsimlik, hikayesi olan ürünlerle menünü farklılaştır." },
    { icon: <Hotel className="w-5 h-5" />, title: "Otel", body: "Kahvaltıdan spa'ya — bölgesel özgün ürünlerle konuğuna hikaye anlat." },
    { icon: <ShoppingBasket className="w-5 h-5" />, title: "Market / Manav", body: "Doğrudan üreticiden, kanıtlı geçmişli ürünlerle raflarını farklılaştır." },
    { icon: <Globe2 className="w-5 h-5" />, title: "İhracatçı", body: "İzlenebilirlik belgesiyle beraber ihracata hazır tedarik." },
    { icon: <Users2 className="w-5 h-5" />, title: "Bireysel Tüketici", body: "Ailen için güvenli, taze ve gerçekten üreticiden gelen ürünler." },
  ];
  return (
    <section className="px-4 py-16 md:py-24 border-t" style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream)", position: "relative", isolation: "isolate" }} ref={ref}>
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-10 lp-reveal">
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>Alıcılar</div>
          <h2 className="font-serif text-3xl md:text-4xl" style={{ color: "var(--lp-ink)" }}>Herkese göre çözümler.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {personas.map((p, i) => (
            <div
              key={p.title}
              className={`lp-card lp-card-hover rounded-2xl p-5 lp-reveal lp-reveal-d${(i % 5) + 1}`}
            >
              <div
                className="grid place-items-center w-10 h-10 rounded-xl mb-3"
                style={{ background: "color-mix(in oklab, var(--lp-primary) 12%, transparent)", color: "var(--lp-primary)" }}
              >
                {p.icon}
              </div>
              <div className="font-serif text-base mb-1" style={{ color: "var(--lp-ink)" }}>{p.title}</div>
              <div className="text-sm" style={{ color: "var(--lp-muted)" }}>{p.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- AI (WhatsApp-style) ---------- */
function AISection() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="px-4 py-16 md:py-24 border-t" style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream-2)" }} ref={ref}>
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10 lp-reveal">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>
            <Sparkles className="w-3.5 h-3.5" /> Hasat AI
          </div>
          <h2 className="font-serif text-3xl md:text-4xl" style={{ color: "var(--lp-ink)" }}>
            Tarlanda bir <span style={{ color: "var(--lp-accent)" }}>uzman</span>.
          </h2>
          <p className="mt-3 text-sm max-w-xl mx-auto" style={{ color: "var(--lp-muted)" }}>
            Türkçe WhatsApp asistanı. Tarladan yaz — cevap gelsin, ilanın kendiliğinden güncellensin.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ChatCard
            title="Soru-cevap"
            messages={[
              { who: "farmer", text: "Safranımı ne zaman hasat etmeliyim?" },
              { who: "hasat", text: "Safranbolu için hasat penceresi 15 Ekim – 10 Kasım. Son günlük kaydına göre ilk çiçekleri 3–5 gün içinde görebilirsin. Sabah 6–8 arası topla." },
            ]}
          />
          <ChatCard
            title="Otomatik ilan güncellemesi"
            messages={[
              { who: "farmer", text: "Bugün hasat yaptım, 320 gr safran çıktı." },
              { who: "hasat", text: "Harika 🌸 İlanına 320 gr eklendi, güven skoru %78 → %92'ye çıktı. Fiyatı ₺2.900 olarak güncelledim, onaylıyor musun?" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function ChatCard({ title, messages }: { title: string; messages: { who: "farmer" | "hasat"; text: string }[] }) {
  return (
    <div className="lp-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4" style={{ color: "var(--lp-primary)" }}>
        <MessageCircle className="w-4 h-4" />
        <div className="font-serif text-base" style={{ color: "var(--lp-ink)" }}>{title}</div>
      </div>
      <div className="space-y-2.5">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm ${m.who === "farmer" ? "ml-auto rounded-tr-sm" : "rounded-tl-sm"}`}
            style={{
              background: m.who === "farmer" ? "color-mix(in oklab, var(--lp-accent) 22%, var(--lp-white))" : "var(--lp-white)",
              color: "var(--lp-ink)",
              border: "1px solid var(--lp-line)",
            }}
          >
            {m.who === "hasat" && (
              <div className="flex items-center gap-1 text-[10px] mb-0.5" style={{ color: "var(--lp-muted)" }}>
                <span>🌸</span><span>Hasat</span>
              </div>
            )}
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Trust score ladder ---------- */
function TrustScoreLadder() {
  const ref = useReveal<HTMLDivElement>();
  const tiers = [
    { key: "belgeleniyor", label: "Belgeleniyor", desc: "Ürün geçmişi henüz yok.", pct: 15 },
    { key: "temel", label: "Temel", desc: "İlk kayıtlar girildi.", pct: 40 },
    { key: "iyi", label: "İyi Belgelenmiş", desc: "Sezonun büyük kısmı belgeli.", pct: 70 },
    { key: "tam", label: "Tam İzlenebilir", desc: "Sezon adımları tam kayıtlı.", pct: 100 },
  ];
  return (
    <section className="px-4 py-16 md:py-24 border-t" style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream)", position: "relative", isolation: "isolate" }} ref={ref}>
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-10 lp-reveal">
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>Güven skoru</div>
          <h2 className="font-serif text-3xl md:text-4xl" style={{ color: "var(--lp-ink)" }}>
            Kanıtladıkça güçlenen bir rozet.
          </h2>
        </div>

        <div className="lp-card rounded-3xl p-6 md:p-10 lp-reveal lp-reveal-d1">
          <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "var(--lp-cream-2)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: "100%",
                background: "linear-gradient(90deg, var(--lp-gray), var(--lp-earth), var(--lp-accent), var(--lp-primary))",
                animation: "lp-fade-in 1.4s ease-out",
              }}
            />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((t, i) => (
              <div
                key={t.key}
                className={`rounded-2xl p-4 lp-reveal lp-reveal-d${i + 1}`}
                style={{ background: "var(--lp-cream)", border: "1px solid var(--lp-line)" }}
              >
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest mb-2" style={{ color: "var(--lp-muted)" }}>
                  <span>Aşama {i + 1}</span>
                </div>
                <div className="font-serif text-lg mb-1" style={{ color: "var(--lp-ink)" }}>{t.label}</div>
                <div className="text-sm mb-3" style={{ color: "var(--lp-muted)" }}>{t.desc}</div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--lp-cream-2)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${t.pct}%`,
                      background: i === 3 ? "var(--lp-primary)" : i === 2 ? "var(--lp-accent)" : i === 1 ? "var(--lp-earth)" : "var(--lp-gray)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--lp-muted)" }}>
            <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Verileriniz şifreli</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Telefonla doğrulanmış üreticiler</span>
            <span className="inline-flex items-center gap-1"><Percent className="w-3 h-3" /> Şeffaf komisyon: %5</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Indoor Farming (kept wiring, restyled) ---------- */
function IndoorSection() {
  const submit = useServerFn(submitIndoorInterest);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [interest, setInterest] = useState<"danışmanlık" | "ortaklık" | "diğer">("danışmanlık");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => submit({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        city: city.trim() || null,
        interest_type: interest,
        note: note.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Başvurunuz alındı. En kısa sürede döneceğiz.");
      setName(""); setPhone(""); setCity(""); setNote(""); setInterest("danışmanlık");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Bir hata oluştu.");
    },
  });

  const canSubmit = name.trim().length > 0 && phone.replace(/\D/g, "").length >= 10 && !mutation.isPending;

  const waHref = `https://wa.me/${HASAT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Hasat indoor farming hakkında bilgi almak istiyorum",
  )}`;

  return (
    <section
      id="indoor-basvuru"
      className="px-4 py-16 md:py-24 border-t"
      style={{ borderColor: "var(--lp-line)", background: "var(--lp-primary)", color: "#fff" }}
    >
      <div className="mx-auto max-w-6xl grid gap-10 md:grid-cols-2 items-start">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80 mb-3">
            <Leaf className="w-3.5 h-3.5" /> Indoor Farming
          </div>
          <h2 className="font-serif text-3xl md:text-4xl mb-4">
            Kırsalda kalın, <span style={{ color: "#CFE8D3" }}>toprakta büyüyün</span>.
          </h2>
          <p className="text-sm md:text-base text-white/85 mb-4">
            Indoor tarım, gençlerin köyünden ayrılmadan yüksek katma değerli ürün
            yetiştirmesini sağlıyor. Küçük alanda yıl boyu üretim, kontrollü
            kalite, kısa tedarik zinciri.
          </p>
          <ul className="space-y-2 text-sm text-white/90 mb-6">
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5" style={{ color: "#CFE8D3" }} /> Kırsalda genç kalıcılığı için somut bir model.</li>
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5" style={{ color: "#CFE8D3" }} /> TKDK genç çiftçi hibesiyle başlangıç maliyeti düşer.</li>
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5" style={{ color: "#CFE8D3" }} /> Hasat üzerinden doğrudan alıcıya satış.</li>
          </ul>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
            style={{ background: "var(--lp-accent)", color: "#fff" }}
          >
            🟢 WhatsApp'tan yaz
          </a>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}
          className="rounded-3xl p-6 space-y-4"
          style={{ background: "var(--lp-cream)", color: "var(--lp-ink)", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          <div className="font-serif text-xl mb-1">Başvuru formu</div>
          <Field label="Ad Soyad *">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "#fff", border: "1px solid var(--lp-line)", color: "var(--lp-ink)" }} />
          </Field>
          <Field label="Telefon *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20}
              placeholder="+90 5XX XXX XX XX"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "#fff", border: "1px solid var(--lp-line)", color: "var(--lp-ink)" }} />
          </Field>
          <Field label="Şehir">
            <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "#fff", border: "1px solid var(--lp-line)", color: "var(--lp-ink)" }} />
          </Field>
          <div>
            <div className="text-xs mb-2" style={{ color: "var(--lp-muted)" }}>İlgi tipi</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["danışmanlık", "ortaklık", "diğer"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setInterest(t)}
                  className="rounded-lg px-2 py-2 text-xs capitalize transition"
                  style={{
                    background: interest === t ? "var(--lp-primary)" : "#fff",
                    color: interest === t ? "#fff" : "var(--lp-ink)",
                    border: "1px solid var(--lp-line)",
                  }}
                >{t}</button>
              ))}
            </div>
          </div>
          <Field label="Not (opsiyonel)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "#fff", border: "1px solid var(--lp-line)", color: "var(--lp-ink)" }} />
          </Field>
          <button type="submit" disabled={!canSubmit}
            className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40 transition hover:opacity-90"
            style={{ background: "var(--lp-primary)", color: "#fff" }}>
            {mutation.isPending ? "Gönderiliyor..." : "Başvuruyu Gönder"}
          </button>
        </form>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs mb-1" style={{ color: "var(--lp-muted)" }}>{label}</div>
      {children}
    </label>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  const waHref = `https://wa.me/${HASAT_WHATSAPP_NUMBER}`;
  return (
    <footer
      className="px-4 py-12 border-t text-center text-xs"
      style={{ borderColor: "var(--lp-line)", background: "var(--lp-cream)", color: "var(--lp-muted)" }}
    >
      <div className="text-2xl mb-1">🌸</div>
      <div className="font-serif text-base" style={{ color: "var(--lp-primary)" }}>Hasat</div>
      <div className="mt-1">Tarımda güven altyapısı.</div>
      <div className="mt-4 flex items-center justify-center gap-4 flex-wrap">
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
          İletişim: WhatsApp
        </a>
        <Link to="/terms" className="underline hover:opacity-80">Kullanım Koşulları</Link>
        <Link to="/privacy" className="underline hover:opacity-80">Gizlilik</Link>
      </div>
      <div className="mt-4 opacity-70">© {new Date().getFullYear()} Hasat</div>
    </footer>
  );
}
