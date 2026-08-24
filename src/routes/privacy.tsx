import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/hasat/BrandLogo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Gizlilik Politikası — Hasat" },
      { name: "description", content: "Hasat gizlilik politikası: telefon numarası kullanımı, veri saklama, üçüncü taraf hizmetler." },
      { property: "og:title", content: "Gizlilik Politikası — Hasat" },
      { property: "og:description", content: "Hasat kişisel veri işleme ve gizlilik politikası." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
          <h1 className="font-serif text-4xl mb-2 text-foreground">Gizlilik Politikası</h1>
          <p className="text-xs text-foreground/60">Son güncelleme: 8 Temmuz 2026</p>
        </div>

        <p className="text-sm text-foreground/80 leading-relaxed">
          Bu politika, Hasat'ın hangi kişisel verileri topladığını, nasıl kullandığını
          ve kimlerle paylaştığını açıklar. Hasat, kullanıcıların gizliliğini korumayı
          taahhüt eder.
        </p>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">1. Topladığımız Veriler</h2>
          <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li><strong className="text-foreground">Telefon numarası</strong> — kimlik doğrulama ve iletişim için.</li>
            <li><strong className="text-foreground">Ad, şehir</strong> — profil oluşturmak için.</li>
            <li><strong className="text-foreground">Parsel ve ürün bilgileri</strong> — çiftçilerin ilan ve günlük kayıtları.</li>
            <li><strong className="text-foreground">Mesaj ve teklif geçmişi</strong> — pazarlık ve ihtilaf çözümü için.</li>
            <li><strong className="text-foreground">Ödeme bilgileri</strong> — IBAN yalnızca çiftçi ödemeleri için saklanır.</li>
            <li><strong className="text-foreground">Fotoğraflar</strong> — tarla günlüğü ve ürün ilan görselleri.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">2. Telefon Numarası Kullanımı</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Telefon numaranız Hasat'ta ana kimlik doğrulama yöntemidir. Numaranızı
            aşağıdaki amaçlarla kullanırız:
          </p>
          <ul className="mt-2 space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li>Giriş ve hesap doğrulama (SMS veya WhatsApp ile tek kullanımlık kod).</li>
            <li>Sipariş, teklif ve önemli hesap olayları için bildirim.</li>
            <li>WhatsApp AI asistanı üzerinden sorularınıza yanıt.</li>
            <li>Karşı taraftaki çiftçi/alıcı ile iletişim (yalnızca aktif işlem sırasında).</li>
          </ul>
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
            Telefon numaranız <strong className="text-foreground">pazarlama amacıyla üçüncü
            taraflarla paylaşılmaz</strong> ve satılmaz.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">3. Veri Depolama — Supabase</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Kullanıcı verileri, kimlik doğrulama ve dosya depolaması{" "}
            <strong className="text-foreground">Supabase</strong> altyapısında saklanır.
            Supabase, PostgreSQL tabanlı ve endüstri standardı güvenlik önlemlerine
            (şifreleme, erişim kontrolü, RLS politikaları) sahip bir platformdur.
            Veriler AB veri merkezlerinde barındırılır.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">4. SMS ve WhatsApp — Twilio</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Kimlik doğrulama kodları ve WhatsApp iletişimi için{" "}
            <strong className="text-foreground">Twilio</strong> altyapısı kullanılır.
            Telefon numaranız ve gönderilen mesaj içerikleri Twilio üzerinden iletilir.
            Twilio, GDPR uyumlu bir iletişim sağlayıcısıdır ve mesaj içeriğini yalnızca
            iletmek amacıyla işler.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">5. Diğer Üçüncü Taraflar</h2>
          <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li><strong className="text-foreground">Lovable AI Gateway</strong> — WhatsApp asistanı ve içerik üretimi için AI çağrıları.</li>
            <li><strong className="text-foreground">Ödeme sağlayıcı</strong> — tahsilat ve IBAN aktarımı için.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">6. Veri Saklama Süresi ve Hesap Silme</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hesabınız aktif olduğu sürece veriler saklanır. Uygulama içinden hesabınızı
            sildiğinizde kişisel verileriniz (telefon numarası, isim, adresler, şirket
            bilgisi, banka bilgisi, kaydettiğiniz tarifler, cihaz/bildirim kayıtları, AI
            kullanım geçmişi) <strong className="text-foreground">anında silinir</strong> ve
            aynı telefon numarasıyla yeniden kayıt olabilirsiniz.
          </p>
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
            Teklif, sipariş, mesaj ve değerlendirme kayıtlarınız ise{" "}
            <strong className="text-foreground">yasal yükümlülük gereği kimliğinizden
            arındırılarak (anonimleştirilerek) saklanır</strong> — karşı tarafın
            (alıcı/çiftçi) sipariş geçmişi ve aldığı değerlendirmeler bu sayede
            kaybolmaz. Bu kayıtlarda adınız/telefonunuz görünmez, yalnızca işlemin
            kendisi (ör. "Silinmiş Kullanıcı") kalır. Ticari kayıtların saklanması,
            faturalandırma ve mali mevzuat kapsamındaki yükümlülüklerimizden kaynaklanır.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">7. Haklarınız</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            KVKK ve GDPR kapsamında şu haklara sahipsiniz:
          </p>
          <ul className="mt-2 space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li>Verilerinize erişme ve kopyasını talep etme.</li>
            <li>Yanlış verilerin düzeltilmesini isteme.</li>
            <li>Hesabınızın ve verilerinizin silinmesini isteme.</li>
            <li>Verilerin belirli bir amaç için işlenmesine itiraz etme.</li>
          </ul>
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
            Hesabınızı ve kişisel verilerinizi <strong className="text-foreground">Ayarlar →
            Hesap</strong> bölümünden uygulama içinden dilediğiniz zaman silebilirsiniz.
            Diğer haklarınızı kullanmak için WhatsApp destek hattımıza ulaşabilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">8. Çerezler</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hasat, oturum yönetimi için yalnızca teknik olarak zorunlu çerezleri
            kullanır. Reklam veya izleme çerezi kullanılmaz.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">9. Değişiklikler</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Bu politika güncellenirse, önemli değişiklikler kullanıcılara SMS veya
            WhatsApp ile bildirilir.
          </p>
        </section>

        <div className="pt-8 border-t border-border flex justify-between text-xs text-foreground/60">
          <Link to="/terms" className="hover:text-foreground underline">← Kullanım Koşulları</Link>
          <Link to="/" className="hover:text-foreground">Anasayfa →</Link>
        </div>
      </article>
    </div>
  );
}
