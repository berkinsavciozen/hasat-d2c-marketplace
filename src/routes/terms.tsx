import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/hasat/BrandLogo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Kullanım Koşulları — Hasat" },
      { name: "description", content: "Hasat platformu kullanım koşulları: komisyon, çiftçi ve alıcı sorumlulukları, ihtilaf çözümü." },
      { property: "og:title", content: "Kullanım Koşulları — Hasat" },
      { property: "og:description", content: "Hasat platformu kullanım koşulları." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--cream)", color: "var(--foreground)" }}>
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo variant="wordmark" height={18} />
          </Link>
          <Link to="/" className="text-xs text-foreground/70 hover:text-foreground">← Anasayfa</Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <div>
          <h1 className="font-serif text-4xl mb-2 text-foreground">Kullanım Koşulları</h1>
          <p className="text-xs text-foreground/60">Son güncelleme: 8 Temmuz 2026</p>
        </div>

        <p className="text-sm text-foreground/80 leading-relaxed">
          Hasat'a hoş geldiniz. Bu koşullar, platformu kullanan çiftçiler ve alıcılar
          için geçerli kuralları tanımlar. Hasat'a üye olarak veya platformu kullanarak
          aşağıdaki koşulları kabul etmiş olursunuz.
        </p>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">1. Platform Hakkında</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hasat, çiftçileri restoran, otel ve butik alıcılarla doğrudan buluşturan
            bir tarım pazar yeridir. Hasat, satıcı veya alıcı değildir; taraflar
            arasındaki ticareti kolaylaştıran bir aracı platformdur.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">2. Komisyon</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hasat, platform üzerinden gerçekleştirilen her başarılı satıştan
            <strong className="text-foreground"> %5 GMV (brüt satış hacmi) komisyonu</strong>{" "}
            alır. Komisyon, ödeme tahsilatı sırasında düşülür ve kalan tutar çiftçinin
            IBAN'ına aktarılır. Komisyon oranları değişirse, en az 30 gün önceden
            bildirilir.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">3. Çiftçi Sorumlulukları</h2>
          <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li>İlan edilen ürünlerin gerçek, kendi üretimi ve açıklamayla uyumlu olması.</li>
            <li>Tarla günlüğü kayıtlarının doğru ve dürüst tutulması; sahte kayıt yasaktır.</li>
            <li>Stok bilgisinin güncel tutulması; onaylanan siparişin karşılanması.</li>
            <li>Yasal olarak gerekli izin ve belgelere sahip olunması.</li>
            <li>Alıcıyla iletişimde saygılı ve profesyonel olunması.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">4. Alıcı Sorumlulukları</h2>
          <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li>Onaylanan siparişler için ödemenin zamanında yapılması.</li>
            <li>Ürün tesliminde makul kabul süreleri içinde inceleme yapılması.</li>
            <li>Sipariş kapsamı ve teslimat koşullarının net olarak belirtilmesi.</li>
            <li>Çiftçiyle iletişimde saygılı ve profesyonel olunması.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">5. Ödeme ve İade</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Ödemeler platform üzerinden tahsil edilir. Ürün tesliminden sonra 48 saat
            içinde alıcı itiraz etmezse, tutar (komisyon düşülerek) çiftçiye aktarılır.
            İadeler yalnızca ürünün tanıma uygun olmaması durumunda geçerlidir.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">6. İhtilaf Çözümü</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Taraflar arasında bir anlaşmazlık çıkması durumunda:
          </p>
          <ol className="mt-2 space-y-2 text-sm text-foreground/80 leading-relaxed list-decimal pl-5">
            <li>Öncelikle taraflar Hasat mesajlaşma sistemi üzerinden çözüm aramalıdır.</li>
            <li>Uzlaşma sağlanamazsa, Hasat destek ekibi arabuluculuk yapar.</li>
            <li>
              Hasat, tarla günlüğü, mesaj geçmişi ve ödeme kayıtlarını inceleyerek
              hangi tarafın haklı olduğuna dair tavsiye niteliğinde karar sunar.
            </li>
            <li>
              Yasal ihtilaflarda Türkiye Cumhuriyeti kanunları geçerlidir; yetkili
              mahkeme İstanbul mahkemeleridir.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">7. Hesap Askıya Alma</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Sahte ilan, sahte günlük kaydı, ödeme yapılmaması veya diğer platform
            kurallarının ihlali durumunda Hasat, hesabı geçici veya kalıcı olarak
            askıya alma hakkını saklı tutar.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">Rekabet ve Fiyat Koordinasyonu Yasağı</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hasat platformunu (Topluluk özelliği dahil) diğer üreticilerle
            satış fiyatı, üretim miktarı ya da hangi alıcıya veya bölgeye satış
            yapılıp yapılmayacağı konularında anlaşmak veya bunları koordine
            etmek için kullanamazsınız. Bu tür girişimler ilgili hesabın
            askıya alınmasına yol açabilir.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">8. Sorumluluk Sınırı</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hasat, taraflar arasındaki alım-satım işleminin fiziksel ifasından
            (üretim kalitesi, teslimat, hasar vb.) doğrudan sorumlu değildir. Platform,
            "olduğu gibi" sunulur ve kesintisiz hizmet garantisi verilmez.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">9. Değişiklikler</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Bu koşullar zaman zaman güncellenebilir. Önemli değişiklikler kullanıcılara
            SMS veya WhatsApp ile bildirilir. Güncellemeden sonra platformu kullanmaya
            devam etmek, yeni koşulların kabulü anlamına gelir.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">10. İletişim</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Sorularınız için WhatsApp destek hattımızdan bize ulaşabilirsiniz.
          </p>
        </section>

        <div className="pt-8 border-t border-border flex justify-between text-xs text-foreground/60">
          <Link to="/privacy" className="hover:text-foreground underline">Gizlilik Politikası →</Link>
          <Link to="/" className="hover:text-foreground">← Anasayfa</Link>
        </div>
      </article>
    </div>
  );
}
