import { createFileRoute, Link } from "@tanstack/react-router";

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
    <div className="min-h-screen" style={{ background: "var(--dark)", color: "var(--hwhite)" }}>
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl">🌸</span>
            <span className="font-serif text-lg" style={{ color: "var(--saffron)" }}>Hasat</span>
          </Link>
          <Link to="/" className="text-xs text-hwhite/70 hover:text-hwhite">← Anasayfa</Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <div>
          <h1 className="font-serif text-4xl mb-2" style={{ color: "var(--saffron)" }}>Gizlilik Politikası</h1>
          <p className="text-xs text-hwhite/50">Son güncelleme: 8 Temmuz 2026</p>
        </div>

        <p className="text-sm text-hwhite/80 leading-relaxed">
          Bu politika, Hasat'ın hangi kişisel verileri topladığını, nasıl kullandığını
          ve kimlerle paylaştığını açıklar. Hasat, kullanıcıların gizliliğini korumayı
          taahhüt eder.
        </p>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>1. Topladığımız Veriler</h2>
          <ul className="space-y-2 text-sm text-hwhite/80 leading-relaxed list-disc pl-5">
            <li><strong className="text-hwhite">Telefon numarası</strong> — kimlik doğrulama ve iletişim için.</li>
            <li><strong className="text-hwhite">Ad, şehir</strong> — profil oluşturmak için.</li>
            <li><strong className="text-hwhite">Parsel ve ürün bilgileri</strong> — çiftçilerin ilan ve günlük kayıtları.</li>
            <li><strong className="text-hwhite">Mesaj ve teklif geçmişi</strong> — pazarlık ve ihtilaf çözümü için.</li>
            <li><strong className="text-hwhite">Ödeme bilgileri</strong> — IBAN yalnızca çiftçi ödemeleri için saklanır.</li>
            <li><strong className="text-hwhite">Fotoğraflar</strong> — tarla günlüğü ve ürün ilan görselleri.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>2. Telefon Numarası Kullanımı</h2>
          <p className="text-sm text-hwhite/80 leading-relaxed">
            Telefon numaranız Hasat'ta ana kimlik doğrulama yöntemidir. Numaranızı
            aşağıdaki amaçlarla kullanırız:
          </p>
          <ul className="mt-2 space-y-2 text-sm text-hwhite/80 leading-relaxed list-disc pl-5">
            <li>Giriş ve hesap doğrulama (SMS veya WhatsApp ile tek kullanımlık kod).</li>
            <li>Sipariş, teklif ve önemli hesap olayları için bildirim.</li>
            <li>WhatsApp AI asistanı üzerinden sorularınıza yanıt.</li>
            <li>Karşı taraftaki çiftçi/alıcı ile iletişim (yalnızca aktif işlem sırasında).</li>
          </ul>
          <p className="mt-3 text-sm text-hwhite/80 leading-relaxed">
            Telefon numaranız <strong className="text-hwhite">pazarlama amacıyla üçüncü
            taraflarla paylaşılmaz</strong> ve satılmaz.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>3. Veri Depolama — Supabase</h2>
          <p className="text-sm text-hwhite/80 leading-relaxed">
            Kullanıcı verileri, kimlik doğrulama ve dosya depolaması{" "}
            <strong className="text-hwhite">Supabase</strong> altyapısında saklanır.
            Supabase, PostgreSQL tabanlı ve endüstri standardı güvenlik önlemlerine
            (şifreleme, erişim kontrolü, RLS politikaları) sahip bir platformdur.
            Veriler AB veri merkezlerinde barındırılır.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>4. SMS ve WhatsApp — Twilio</h2>
          <p className="text-sm text-hwhite/80 leading-relaxed">
            Kimlik doğrulama kodları ve WhatsApp iletişimi için{" "}
            <strong className="text-hwhite">Twilio</strong> altyapısı kullanılır.
            Telefon numaranız ve gönderilen mesaj içerikleri Twilio üzerinden iletilir.
            Twilio, GDPR uyumlu bir iletişim sağlayıcısıdır ve mesaj içeriğini yalnızca
            iletmek amacıyla işler.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>5. Diğer Üçüncü Taraflar</h2>
          <ul className="space-y-2 text-sm text-hwhite/80 leading-relaxed list-disc pl-5">
            <li><strong className="text-hwhite">Lovable AI Gateway</strong> — WhatsApp asistanı ve içerik üretimi için AI çağrıları.</li>
            <li><strong className="text-hwhite">Ödeme sağlayıcı</strong> — tahsilat ve IBAN aktarımı için.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>6. Veri Saklama Süresi</h2>
          <p className="text-sm text-hwhite/80 leading-relaxed">
            Hesabınız aktif olduğu sürece veriler saklanır. Hesap silme talebinden
            sonra kişisel veriler 30 gün içinde silinir. Yasal olarak saklanması gereken
            mali kayıtlar (fatura, ödeme geçmişi) 10 yıl boyunca saklanır.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>7. Haklarınız</h2>
          <p className="text-sm text-hwhite/80 leading-relaxed">
            KVKK ve GDPR kapsamında şu haklara sahipsiniz:
          </p>
          <ul className="mt-2 space-y-2 text-sm text-hwhite/80 leading-relaxed list-disc pl-5">
            <li>Verilerinize erişme ve kopyasını talep etme.</li>
            <li>Yanlış verilerin düzeltilmesini isteme.</li>
            <li>Hesabınızın ve verilerinizin silinmesini isteme.</li>
            <li>Verilerin belirli bir amaç için işlenmesine itiraz etme.</li>
          </ul>
          <p className="mt-3 text-sm text-hwhite/80 leading-relaxed">
            Bu haklarınızı kullanmak için WhatsApp destek hattımıza ulaşabilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>8. Çerezler</h2>
          <p className="text-sm text-hwhite/80 leading-relaxed">
            Hasat, oturum yönetimi için yalnızca teknik olarak zorunlu çerezleri
            kullanır. Reklam veya izleme çerezi kullanılmaz.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3" style={{ color: "var(--gold)" }}>9. Değişiklikler</h2>
          <p className="text-sm text-hwhite/80 leading-relaxed">
            Bu politika güncellenirse, önemli değişiklikler kullanıcılara SMS veya
            WhatsApp ile bildirilir.
          </p>
        </section>

        <div className="pt-8 border-t border-white/10 flex justify-between text-xs text-hwhite/60">
          <Link to="/terms" className="hover:text-hwhite underline">← Kullanım Koşulları</Link>
          <Link to="/" className="hover:text-hwhite">Anasayfa →</Link>
        </div>
      </article>
    </div>
  );
}
