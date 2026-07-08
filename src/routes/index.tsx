import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Store,
  BookOpen,
  ShieldCheck,
  MessagesSquare,
  Boxes,
  UserPlus,
  Search,
  History,
  BadgeCheck,
  HandCoins,
  Package,
  MessageCircle,
  Bell,
  Sparkles,
  Lock,
  Percent,
  Users,
  Leaf,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasat } from "@/lib/hasat/store";
import { HASAT_WHATSAPP_NUMBER } from "@/lib/hasat/constants";
import { submitIndoorInterest } from "@/lib/api/indoor-interest.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hasat — Tarladan Sofraya, Aracısız" },
      {
        name: "description",
        content:
          "Hasat, çiftçileri restoran, otel ve butik alıcılarla doğrudan buluşturan Türkiye'nin izlenebilir tarım pazarıdır. Safran, zeytin, lavanta ve daha fazlası — aracısız.",
      },
      { property: "og:title", content: "Hasat — Tarladan Sofraya, Aracısız" },
      {
        property: "og:description",
        content:
          "Türkiye'nin izlenebilir tarım pazarı. Üreticiden doğrudan al, tarladan sofraya güvenle.",
      },
    ],
  }),
  component: LandingPage,
});

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
        style={{ background: "var(--dark)", color: "var(--hwhite)" }}
      >
        <div className="text-center opacity-70">
          <div className="text-4xl mb-2 animate-pulse">🌸</div>
          <div className="text-xs" style={{ fontFamily: "Courier New, monospace" }}>Hasat</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--dark)", color: "var(--hwhite)" }} className="min-h-screen">
      <Nav onRole={goRole} />
      <Hero onRole={goRole} />
      <Problem />
      <FarmerSection onRole={() => goRole("farmer")} />
      <BuyerSection onRole={() => goRole("buyer")} />
      <HowItWorks />
      <AISection />
      <TrustSection />
      <IndoorSection />
      <FinalCTA onRole={goRole} />
      <Footer />
    </div>
  );
}

/* ---------- Nav ---------- */
function Nav({ onRole }: { onRole: (r: "farmer" | "buyer") => void }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur border-b border-white/10"
      style={{ background: "color-mix(in oklab, var(--dark) 88%, transparent)" }}>
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌸</span>
          <span className="font-serif text-lg" style={{ color: "var(--saffron)" }}>Hasat</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRole("farmer")}
            className="hidden sm:inline text-xs px-3 py-1.5 rounded-full border border-white/20 text-hwhite/80 hover:bg-white/5"
          >
            Çiftçi girişi
          </button>
          <button
            onClick={() => onRole("buyer")}
            className="text-xs px-3 py-1.5 rounded-full font-medium"
            style={{ background: "var(--gold)", color: "var(--dark)" }}
          >
            Alıcı girişi
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function Hero({ onRole }: { onRole: (r: "farmer" | "buyer") => void }) {
  return (
    <section className="px-4 pt-14 pb-16 md:pt-24 md:pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-6xl mb-4">🌸</div>
        <div className="font-mono text-xs opacity-60 mb-1">هارست</div>
        <h1 className="font-serif text-3xl sm:text-4xl md:text-6xl leading-tight" style={{ color: "var(--hwhite)" }}>
          Tarladan sofraya,{" "}
          <span style={{ color: "var(--saffron)" }}>aracısız.</span>
        </h1>
        <p className="mt-5 text-base md:text-lg text-hwhite/70 max-w-xl mx-auto">
          Hasat, Türkiye'nin küçük üreticilerini restoran, otel ve butik alıcılarla
          doğrudan buluşturur. Ürünün izlenebilir, fiyatı şeffaf, pazarlık senin elinde.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 max-w-md mx-auto">
          <button
            onClick={() => onRole("farmer")}
            className="rounded-2xl px-5 py-4 text-left transition hover:scale-[1.01]"
            style={{ background: "color-mix(in oklab, var(--saffron) 22%, var(--dark))", border: "1px solid var(--saffron)" }}
          >
            <div className="text-2xl mb-1">🌾</div>
            <div className="font-serif text-lg">Çiftçiyim</div>
            <div className="text-xs text-hwhite/60">Ürünümü satmak istiyorum →</div>
          </button>
          <button
            onClick={() => onRole("buyer")}
            className="rounded-2xl px-5 py-4 text-left transition hover:scale-[1.01]"
            style={{ background: "color-mix(in oklab, var(--gold) 18%, var(--dark))", border: "1px solid var(--gold)" }}
          >
            <div className="text-2xl mb-1">🏪</div>
            <div className="font-serif text-lg">Alıcıyım</div>
            <div className="text-xs text-hwhite/60">Doğrudan üreticiden almak istiyorum →</div>
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Problem ---------- */
function Problem() {
  return (
    <section className="px-4 py-16 border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-serif text-3xl md:text-4xl text-center mb-10">
          Tarımda kırık halka
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ProblemCard
            title="Çiftçi için"
            emoji="🌾"
            color="var(--saffron)"
            items={[
              "Aracı, kârın büyük kısmını alıyor.",
              "Ürününün gerçek piyasa fiyatını bilmiyor.",
              "Ürününü profesyonelce tanıtacak bir yeri yok.",
            ]}
          />
          <ProblemCard
            title="Alıcı için"
            emoji="🏪"
            color="var(--gold)"
            items={[
              "Güvenilir, orijinal üretici bulmak zor.",
              "Safran gibi ürünlerde sahtecilik riski çok yüksek.",
              "Fiyatlar şeffaf değil; her aracı farklı fiyat veriyor.",
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function ProblemCard({ title, emoji, items, color }: { title: string; emoji: string; items: string[]; color: string }) {
  return (
    <div className="rounded-2xl p-6 border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{emoji}</span>
        <h3 className="font-serif text-xl" style={{ color }}>{title}</h3>
      </div>
      <ul className="space-y-2 text-sm text-hwhite/75">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span style={{ color }}>—</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Feature sections ---------- */
type Feature = { icon: React.ReactNode; title: string; body: string };

function FeatureGrid({ features, tint }: { features: Feature[]; tint: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {features.map((f) => (
        <div key={f.title} className="rounded-2xl p-5 border border-white/10 bg-white/[0.03] flex gap-4">
          <div
            className="grid place-items-center w-12 h-12 rounded-xl shrink-0"
            style={{ background: `color-mix(in oklab, ${tint} 20%, transparent)`, color: tint }}
          >
            {f.icon}
          </div>
          <div>
            <div className="font-serif text-base mb-1">{f.title}</div>
            <div className="text-sm text-hwhite/70">{f.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FarmerSection({ onRole }: { onRole: () => void }) {
  const features: Feature[] = [
    { icon: <Store className="w-5 h-5" />, title: "Herkese açık vitrin", body: "Kendine ait bir mağaza sayfası: /s/isim. Giriş yapmadan herkes görebilir, paylaşabilir." },
    { icon: <BookOpen className="w-5 h-5" />, title: "Tarla günlüğü", body: "Sulama, gübreleme, hasat — hepsini fotoğrafla kaydet. Alıcıya kanıt olarak sunulur." },
    { icon: <ShieldCheck className="w-5 h-5" />, title: "İzlenebilirlik rozeti", body: "Günlük kayıtlarından otomatik hesaplanan güven skoru: \"Tam İzlenebilir\"e ulaş." },
    { icon: <MessagesSquare className="w-5 h-5" />, title: "Doğrudan pazarlık", body: "Alıcı teklif atar, sen karşı teklif verirsin. Aracı yok, komisyon şeffaf." },
    { icon: <Boxes className="w-5 h-5" />, title: "Otomatik stok takibi", body: "Hasat girişlerinden stok otomatik hesaplanır. Aynı ürünü iki kez satamazsın." },
    { icon: <UserPlus className="w-5 h-5" />, title: "Arkadaşını davet et", body: "Referans kodunla başka çiftçileri davet et, birlikte büyüyün." },
  ];
  return (
    <section className="px-4 py-16 border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">Çiftçiyim</div>
          <h2 className="font-serif text-3xl md:text-4xl">
            Ürününü <span style={{ color: "var(--saffron)" }}>Türkiye'ye aç</span>
          </h2>
        </div>
        <FeatureGrid features={features} tint="var(--saffron)" />
        <div className="mt-8 text-center">
          <button
            onClick={onRole}
            className="rounded-xl px-6 py-3 text-sm font-medium"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
          >
            Çiftçi olarak başla →
          </button>
        </div>
      </div>
    </section>
  );
}

function BuyerSection({ onRole }: { onRole: () => void }) {
  const features: Feature[] = [
    { icon: <Search className="w-5 h-5" />, title: "Keşfet", body: "Doğrulanmış üreticileri ürüne, bölgeye ve izlenebilirlik skoruna göre filtrele." },
    { icon: <History className="w-5 h-5" />, title: "Ürün geçmişi", body: "Hasat tarihinden sofraya kadar her adım kayıtlı. Safran gibi sahteciliğin yaygın olduğu ürünlerde gerçek kanıt." },
    { icon: <BadgeCheck className="w-5 h-5" />, title: "Tam İzlenebilir rozeti", body: "Şeffaf güven skoru — hangi üreticinin ne kadar belgelendiğini bir bakışta gör." },
    { icon: <HandCoins className="w-5 h-5" />, title: "Doğrudan teklif ver", body: "Üreticiyle pazarlık et. Fiyat sana, aracıya değil." },
    { icon: <Package className="w-5 h-5" />, title: "Sipariş takibi", body: "Aktif ve tamamlanan siparişlerini tek yerden yönet, teslimat durumunu gör." },
  ];
  return (
    <section className="px-4 py-16 border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-2">Alıcıyım</div>
          <h2 className="font-serif text-3xl md:text-4xl">
            Güvenilir üreticiyi bul, <span style={{ color: "var(--gold)" }}>doğrudan al</span>
          </h2>
        </div>
        <FeatureGrid features={features} tint="var(--gold)" />
        <div className="mt-8 text-center">
          <button
            onClick={onRole}
            className="rounded-xl px-6 py-3 text-sm font-medium"
            style={{ background: "var(--gold)", color: "var(--dark)" }}
          >
            Alıcı olarak başla →
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */
function HowItWorks() {
  const farmer = [
    "SMS ile üye ol, telefonunla giriş yap.",
    "Parselini ekle, ilk hasadını günlüğe kaydet.",
    "İstanbul'dan bir alıcı teklif verir, pazarlık edersin.",
    "IBAN ile ödemeyi alırsın; arkadaşını davet et, büyü.",
  ];
  const buyer = [
    "Keşfet'te \"Tam İzlenebilir\" rozetli bir safran üreticisi bul.",
    "Üreticinin ürün geçmişini ve tarla günlüğünü incele.",
    "Teklifini yolla, pazarlığı bitir.",
    "Ödemeyi yap, teslim al — düzenli tedarikçin olsun.",
  ];
  return (
    <section className="px-4 py-16 border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-serif text-3xl md:text-4xl text-center mb-10">Nasıl çalışır?</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <JourneyCard
            emoji="🌾"
            color="var(--saffron)"
            who="Ahmet"
            where="Safranbolu, 5 dönüm safran"
            steps={farmer}
          />
          <JourneyCard
            emoji="🏪"
            color="var(--gold)"
            who="Zeynep"
            where="İstanbul, butik baharat mağazası"
            steps={buyer}
          />
        </div>
      </div>
    </section>
  );
}

function JourneyCard({ emoji, color, who, where, steps }: { emoji: string; color: string; who: string; where: string; steps: string[] }) {
  return (
    <div className="rounded-2xl p-6 border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-11 h-11 grid place-items-center rounded-full text-xl"
          style={{ background: `color-mix(in oklab, ${color} 25%, transparent)` }}
        >{emoji}</div>
        <div>
          <div className="font-serif text-lg" style={{ color }}>{who}</div>
          <div className="text-xs text-hwhite/60">{where}</div>
        </div>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm text-hwhite/80">
            <span
              className="shrink-0 w-6 h-6 grid place-items-center rounded-full text-xs font-mono"
              style={{ background: "color-mix(in oklab, var(--hwhite) 10%, transparent)", color }}
            >{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- AI ---------- */
function AISection() {
  return (
    <section className="px-4 py-16 border-t border-white/5"
      style={{ background: "color-mix(in oklab, var(--dark) 92%, black)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest opacity-60 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Hasat AI
          </div>
          <h2 className="font-serif text-3xl md:text-4xl">
            Tarlanın yanında bir <span style={{ color: "var(--saffron)" }}>uzman</span>
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <AICard
            icon={<MessageCircle className="w-5 h-5" />}
            title="WhatsApp asistanı"
            body="7/24 Türkçe soru-cevap. Tarladan mesaj at, hemen cevap al."
            q="Safranımı ne zaman hasat etmeliyim?"
            a="Safranbolu için hasat penceresi 15 Ekim – 10 Kasım. Son günlük kaydına göre ilk çiçekleri 3–5 gün içinde görebilirsin. Sabah 6–8 arası topla."
          />
          <AICard
            icon={<Bell className="w-5 h-5" />}
            title="Fiyat uyarı sistemi"
            body="Piyasa fiyatından %20+ sapma olursa anında haber ver."
            q="Bu haftaki safran fiyatı nasıl?"
            a="Piyasa ortalaması ₺58.000/kg. Senin ilanın ₺42.000/kg — %27 altında. Fiyatı güncellemek ister misin?"
          />
          <AICard
            icon={<ShieldCheck className="w-5 h-5" />}
            title="İzlenebilirlik skoru"
            body="Günlük kayıtlarından otomatik hesaplanan güven puanı."
            q="Skorumu nasıl artırırım?"
            a="Şu an %60 (İyi Belgelenmiş). Sulama ve gübreleme kayıtların eksik. Bu haftaki 2 sulamayı eklersen %80'e çıkarsın."
          />
        </div>
      </div>
    </section>
  );
}

function AICard({ icon, title, body, q, a }: { icon: React.ReactNode; title: string; body: string; q: string; a: string }) {
  return (
    <div className="rounded-2xl p-5 border border-white/10 bg-white/[0.04]">
      <div className="flex items-center gap-2 mb-2" style={{ color: "var(--saffron)" }}>
        {icon}
        <div className="font-serif text-base text-hwhite">{title}</div>
      </div>
      <p className="text-sm text-hwhite/70 mb-4">{body}</p>
      <div className="space-y-2">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs"
          style={{ background: "color-mix(in oklab, var(--sage) 55%, var(--dark))", color: "var(--hwhite)" }}>
          {q}
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm px-3 py-2 text-xs"
          style={{ background: "color-mix(in oklab, var(--hwhite) 8%, transparent)", color: "var(--hwhite)" }}>
          <div className="flex items-center gap-1 text-[10px] opacity-60 mb-0.5">
            <span>🌸</span><span>Hasat</span>
          </div>
          {a}
        </div>
      </div>
    </div>
  );
}

/* ---------- Trust ---------- */
function TrustSection() {
  const items = [
    { icon: <Percent className="w-4 h-4" />, text: "Şeffaf komisyon: %5. İlk 3 ay ücretsiz." },
    { icon: <Lock className="w-4 h-4" />, text: "Verilerin şifreli tutulur, üçüncü tarafla paylaşılmaz." },
    { icon: <Users className="w-4 h-4" />, text: "Her üretici telefonla doğrulanır — sahte hesap yok." },
  ];
  return (
    <section className="px-4 py-14 border-t border-white/5">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-3 md:grid-cols-3">
          {items.map((it) => (
            <div key={it.text} className="rounded-xl p-4 border border-white/10 bg-white/[0.03] flex items-start gap-3">
              <span style={{ color: "var(--saffron)" }}>{it.icon}</span>
              <span className="text-sm text-hwhite/80">{it.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Indoor Farming ---------- */
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
    <section id="indoor-basvuru" className="px-4 py-16 border-t border-white/10"
      style={{ background: "color-mix(in oklab, var(--sage) 12%, var(--dark))" }}>
      <div className="mx-auto max-w-5xl grid gap-10 md:grid-cols-2 items-start">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-70 mb-3">
            <Leaf className="w-3.5 h-3.5" /> Indoor Farming
          </div>
          <h2 className="font-serif text-3xl md:text-4xl mb-4">
            Kırsalda kalın, <span style={{ color: "var(--sage)" }}>toprakta büyüyün</span>
          </h2>
          <p className="text-sm md:text-base text-hwhite/75 mb-4">
            Indoor tarım, gençlerin köyünden ayrılmadan yüksek katma değerli ürün
            yetiştirmesini sağlıyor. Küçük alanda yıl boyu üretim, kontrollü kalite,
            kısa tedarik zinciri.
          </p>
          <ul className="space-y-2 text-sm text-hwhite/80 mb-6">
            <li className="flex gap-2"><span style={{ color: "var(--sage)" }}>✓</span> Kırsalda genç kalıcılığı için somut bir model.</li>
            <li className="flex gap-2"><span style={{ color: "var(--sage)" }}>✓</span> TKDK genç çiftçi hibesiyle başlangıç maliyeti düşer.</li>
            <li className="flex gap-2"><span style={{ color: "var(--sage)" }}>✓</span> Hasat üzerinden doğrudan alıcıya satış.</li>
          </ul>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{ background: "color-mix(in oklab, var(--sage) 60%, var(--dark))", color: "var(--hwhite)", border: "1px solid var(--sage)" }}
          >
            🟢 WhatsApp'tan yaz
          </a>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}
          className="rounded-2xl p-6 border border-white/10 bg-white/[0.04] space-y-4"
        >
          <div className="font-serif text-lg mb-1">Başvuru formu</div>
          <Field label="Ad Soyad *">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-sage" />
          </Field>
          <Field label="Telefon *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20}
              placeholder="+90 5XX XXX XX XX"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-sage" />
          </Field>
          <Field label="Şehir">
            <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-sage" />
          </Field>
          <div>
            <div className="text-xs text-hwhite/60 mb-2">İlgi tipi</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["danışmanlık", "ortaklık", "diğer"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setInterest(t)}
                  className="rounded-lg px-2 py-2 text-xs capitalize"
                  style={{
                    background: interest === t ? "color-mix(in oklab, var(--sage) 45%, var(--dark))" : "rgba(255,255,255,0.05)",
                    border: interest === t ? "1px solid var(--sage)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >{t}</button>
              ))}
            </div>
          </div>
          <Field label="Not (opsiyonel)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-sage" />
          </Field>
          <button type="submit" disabled={!canSubmit}
            className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--sage)", color: "var(--hwhite)" }}>
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
      <div className="text-xs text-hwhite/60 mb-1">{label}</div>
      {children}
    </label>
  );
}

/* ---------- Final CTA ---------- */
function FinalCTA({ onRole }: { onRole: (r: "farmer" | "buyer") => void }) {
  return (
    <section className="px-4 py-16 border-t border-white/5 text-center">
      <div className="mx-auto max-w-2xl">
        <div className="text-4xl mb-3">🌸</div>
        <h2 className="font-serif text-3xl md:text-4xl mb-3">
          Hasat'a katıl
        </h2>
        <p className="text-sm text-hwhite/70 mb-8">
          Telefon numaranla saniyeler içinde başla. Kredi kartı yok, taahhüt yok.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-md mx-auto">
          <button
            onClick={() => onRole("farmer")}
            className="rounded-xl py-3 text-sm font-medium"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
          >🌾 Çiftçi olarak başla</button>
          <button
            onClick={() => onRole("buyer")}
            className="rounded-xl py-3 text-sm font-medium"
            style={{ background: "var(--gold)", color: "var(--dark)" }}
          >🏪 Alıcı olarak başla</button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  const waHref = `https://wa.me/${HASAT_WHATSAPP_NUMBER}`;
  return (
    <footer className="px-4 py-10 border-t border-white/10 text-center text-xs text-hwhite/60">
      <div className="text-2xl mb-1">🌸</div>
      <div className="font-serif text-base" style={{ color: "var(--saffron)" }}>Hasat</div>
      <div className="mt-1">Tarladan sofraya, aracısız.</div>
      <div className="mt-3 flex items-center justify-center gap-4 flex-wrap">
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline hover:text-hwhite">
          İletişim: WhatsApp
        </a>
        <Link to="/terms" className="underline hover:text-hwhite">Kullanım Koşulları</Link>
        <Link to="/privacy" className="underline hover:text-hwhite">Gizlilik</Link>
      </div>
      <div className="mt-4 opacity-50">© {new Date().getFullYear()} Hasat</div>
    </footer>
  );
}
