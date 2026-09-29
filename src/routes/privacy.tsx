import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/hasat/BrandLogo";
import { HASAT_SUPPORT_EMAIL } from "@/lib/hasat/constants";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Gizlilik Politikası ve KVKK Aydınlatma Metni — Hasat" },
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
          <h1 className="font-serif text-4xl mb-2 text-foreground">Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
          <p className="text-xs text-foreground/60">Son güncelleme: 29 Eylül 2026</p>
        </div>

        <p className="text-sm text-foreground/80 leading-relaxed">
          Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") md. 10 kapsamında, Hasat'ın
          (hasat-ai.com ve Hasat mobil uygulaması) kişisel verilerinizi hangi amaçlarla ve hangi hukuki
          sebeplerle işlediğini, kimlere aktardığını ve haklarınızı açıklar.
        </p>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">1. Veri Sorumlusu</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hasat şu an bir girişim olarak kurucusu Berkin Savcıözen tarafından yürütülmektedir; bu metin
            kapsamındaki veri sorumlusu Berkin Savcıözen'dir. İletişim:{" "}
            <a href={`mailto:${HASAT_SUPPORT_EMAIL}`} className="underline">{HASAT_SUPPORT_EMAIL}</a>. Şirketleşme hâlinde bu bölüm güncellenir ve kullanıcılara bildirilir.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">2. İşlenen Veriler, Amaçlar ve Hukuki Sebepler</h2>
          <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li><strong className="text-foreground">Telefon numarası (SMS ile tek kullanımlık kod)</strong> — hesap oluşturma, giriş ve hesap güvenliği — sözleşmenin kurulması ve ifası (KVKK md. 5/2-c).</li>
            <li><strong className="text-foreground">Ad, şehir, rol (çiftçi/alıcı), alıcı işletme bilgisi</strong> — profil ve hizmetin sunulması — md. 5/2-c.</li>
            <li><strong className="text-foreground">Çiftçi ilan, parsel, hasat ve tarla günlüğü kayıtları, ürün ve parsel fotoğrafları</strong> — ilan ve vitrin hizmeti; çiftçinin vitrininde ad, şehir, parsel adı/konum etiketi ve fotoğraflar herkese açık gösterilir — md. 5/2-c.</li>
            <li><strong className="text-foreground">Ürün talepleri ("Talep Et")</strong> — talebin eşleşen üreticilere iletilmesi — md. 5/2-c.</li>
            <li><strong className="text-foreground">Tarifler, Defterim içerikleri ve Hasat AI'a (sohbet, tarif çıkarma/uyarlama) gönderdiğiniz metin ve fotoğraflar</strong> — talep ettiğiniz özelliğin sunulması — md. 5/2-c.</li>
            <li><strong className="text-foreground">Bildirim tercihleri ve cihaz bildirim anahtarı</strong> — SMS ve anlık bildirim gönderimi — md. 5/2-c.</li>
            <li><strong className="text-foreground">Kullanım olayları ve teknik hata kayıtları</strong> — (ör. siparişlerin henüz açık olmadığı bir ekranın görüntülenmesi: ürün, sayfa türü, platform ve giriş yaptıysanız kullanıcı kimliği; telefon veya e-posta içermez) hizmetin güvenliği, hataların giderilmesi ve geliştirilmesi — veri sorumlusunun meşru menfaati (md. 5/2-f).</li>
            <li><strong className="text-foreground">Hesap silindikten sonra kimliğinizden arındırılarak saklanan teklif, sipariş, mesaj ve değerlendirme kayıtları</strong> — hukuki yükümlülükler (md. 5/2-ç) ve karşı tarafın işlem geçmişinin korunması (md. 5/2-f).</li>
            <li><strong className="text-foreground">Siparişler açıldığında</strong> — çiftçinin IBAN'ı yalnız onaylanan sipariş için ilgili alıcıya gösterilir; Hasat ödemeyi tahsil etmez. (Kontrollü pilotta siparişler henüz açık değildir.)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">3. Açık Rıza</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Hasat, bu metinde sayılan işlemler için açık rızanıza dayanmaz. İleride açık rıza gerektiren bir
            işleme (ör. pazarlama iletisi) başlanırsa, bu metinden ayrı ve isteğe bağlı bir onay istenir; onay
            vermemeniz hizmeti kullanmanızı engellemez.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">4. Aktarım ve Hizmet Sağlayıcılar</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Verileriniz yalnız hizmetin sunulması için gerekli ölçüde aşağıdaki sağlayıcılarla paylaşılır;
            satılmaz ve pazarlama amacıyla üçüncü kişilere verilmez:
          </p>
          <ul className="mt-2 space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li><strong className="text-foreground">Supabase</strong> — veritabanı, kimlik doğrulama ve dosya depolama (Japonya, Tokyo).</li>
            <li><strong className="text-foreground">Twilio</strong> — SMS iletimi (ABD).</li>
            <li><strong className="text-foreground">Google (Gemini) ve Lovable AI Gateway</strong> — Hasat AI sohbeti, tarif çıkarma/uyarlama ve görsel üretimi (ABD).</li>
            <li><strong className="text-foreground">Sentry</strong> — uygulama hata kayıtları (ABD).</li>
            <li><strong className="text-foreground">Expo</strong> — mobil anlık bildirim iletimi (ABD).</li>
            <li><strong className="text-foreground">Resend</strong> — e-posta iletimi (ABD).</li>
          </ul>
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
            Alıcı ile çiftçi arasında yalnız aktif bir işlem için gerekli bilgiler karşı tarafla paylaşılır.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">5. Yurt Dışına Aktarım</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Yukarıdaki sağlayıcıların sunucuları Türkiye dışında (Japonya ve ABD) bulunduğundan kişisel
            verileriniz yurt dışına aktarılmaktadır. Bu aktarımlar KVKK md. 9'da öngörülen güvencelere
            dayanılarak yürütülür; sağlayıcılarla Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart
            sözleşmelerin akdedilmesi ve Kurul'a bildirilmesi süreci devam etmektedir. Bu bölüm süreç
            tamamlandığında güncellenir.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">6. Saklama Süresi ve Hesap Silme</h2>
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
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
            Kullanım olayları ve teknik hata kayıtları, amaçları için gerekli süre boyunca saklanır
            ve kişisel veri içermeyecek şekilde toplulaştırılır.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3 text-foreground">7. Haklarınız (KVKK md. 11)</h2>
          <ul className="space-y-2 text-sm text-foreground/80 leading-relaxed list-disc pl-5">
            <li>İşlenip işlenmediğini öğrenme.</li>
            <li>İşlenmişse bilgi talep etme.</li>
            <li>İşleme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme.</li>
            <li>Yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme.</li>
            <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme.</li>
            <li>md. 7 çerçevesinde silinmesini veya yok edilmesini isteme.</li>
            <li>Düzeltme ve silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme.</li>
            <li>Otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme.</li>
            <li>Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme.</li>
          </ul>
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
            Başvuru: <a href={`mailto:${HASAT_SUPPORT_EMAIL}`} className="underline">{HASAT_SUPPORT_EMAIL}</a> adresine kimliğinizi ve talebinizi
            belirterek; başvurular en geç 30 gün içinde ücretsiz yanıtlanır. Yanıtı yeterli bulmazsanız
            Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.
          </p>
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
            Hesabınızı ve kişisel verilerinizi <strong className="text-foreground">Ayarlar → Hesap</strong>{" "}
            bölümünden dilediğiniz zaman silebilirsiniz.
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
            Bu metin güncellendiğinde yeni sürüm bu sayfada yayımlanır; önemli değişiklikler SMS ile ayrıca
            bildirilir.
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
