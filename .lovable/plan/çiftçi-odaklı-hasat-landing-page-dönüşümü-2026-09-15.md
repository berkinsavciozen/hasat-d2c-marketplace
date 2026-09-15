# Çiftçi odaklı Hasat landing page dönüşümü

## Hedef

Çıkış yapıldığında açılan `/` sayfasını mevcut Hasat markasını koruyarak çiftçi öncelikli, yaklaşık 10 bölümlük bir anlatıya dönüştürmek. İlk ekranda mevcut talep ve teklifleri görme, gerçek fiyatları karşılaştırma, Hasat AI ile yönetim ve fotoğraflı tarla günlüğü birlikte anlaşılacak; alıcı girişi ikincil kalacak.

## Uygulama planı

1. **İçerik ve veri sözleşmesini ayır**
   - Landing metinlerini, SSS’yi, süreç adımlarını ve değiştirilebilir medya referanslarını küçük yapılandırma dosyalarında tut.
   - Üretim miktarı, fiyat, teklif, satış, tarih, müşteri ve gelir için sabit örnek veri oluşturma; mevcut temsili fiyat kartlarını, harita miktarlarını ve kurgusal kullanıcı alıntısını kaldır.
   - Sayısal olmayan arayüz örneklerini “süreç gösterimi” olarak açıkça ayır; gerçek kayıt veya garanti izlenimi verme.

2. **Header ve çiftçi öncelikli hero**
   - Logo ve “Güven Platformu” kimliğini koru; “Çiftçiyim” varsayılan/aktif, “Alıcıyım” ikincil olsun.
   - Ana CTA’yı “Ürünüm için talep bul” olarak `/login?role=farmer` akışına bağla; ikincil CTA üç adımlı bölüme kaydırsın.
   - İstenen başlık, açıklama ve üç güven maddesini kullan; `%5` ifadesini mevcut koşullarla tutarlı biçimde göster.
   - Karpuz odaklı, rakamsız ve durum tabanlı ürün akışı oluştur: plan → talep → teklif → fiyat kaynağı → kabul/sipariş → günlük → teslimat/ödeme. Mobilde ana CTA için çakışmayan sticky davranış ekle.

3. **Anlatıyı 10 güçlü bölüme indir**
   1. Hero ve ürün akışı
   2. Problem/dönüşüm karşılaştırması
   3. Ekimden ödemeye üç adım
   4. Üç temel çiftçi kazanımı
   5. Fiyat şeffaflığı ve gerçekleşmiş veriler
   6. Hasat AI + WhatsApp ile kolay yönetim
   7. Fotoğraflı tarla günlüğü ve izlenebilirlik
   8. Müşteri ve siparişlerin tek panelde yönetimi
   9. Genç üretici anlatısı + genel iletişim formu
   10. Son CTA + çiftçi odaklı SSS
   - “Neden Hasat?”, tedarik zinciri, uzun rol listeleri ve tekrar eden izlenebilirlik alanlarını bu yapıda birleştir.
   - Alıcıları kısa bir destekleyici mesaj/ikincil giriş olarak koru; tarifleri footer bağlantısına indir.
   - Indoor farming, TKDK, temsili üretici vitrini, kurgusal testimonial, sahte Türkiye haritası verileri ve tekrar eden mobil uygulama vaadini kaldır.

4. **Fiyat şeffaflığı alanını gerçek veri kurallarıyla kur**
   - Mevcut anonim erişimli `get_price_history_summary` verisini kullanarak HKS/resmî kaynak ile Hasat’taki tamamlanmış satış özetini ayrı sekmelerde göster.
   - Hasat ortalamasını mevcut en az 5 farklı üretici eşiğine tabi tut; eşik karşılanmazsa yalnızca “Henüz yeterli satış verisi yok” göster.
   - RPC’nin bugün güvenle verdiği kaynak adı, birim, ortalama ve güncellenme bilgisinin dışına çıkma. HKS’ye ait ayrı güncellenme tarihi, min/max, toplam miktar veya işlem sayısı güvenilir biçimde gelmiyorsa bu değerleri üretme; ilgili satırı gizle veya açık veri-yok durumu göster.
   - Giriş gerektiren kişisel maliyet, teklif, sipariş, gelir ve kalan miktar verilerini landing’de çekme. Bunları rakamsız ürün alanı önizlemesi ve “Giriş yaptığında kendi gerçekleşmiş kayıtların görünür” mesajıyla anlat.
   - İlan fiyatı, teklif, kabul edilmiş teklif ve tamamlanmış satış dilini birbirine karıştırma; haftalık seri RPC’si anonim erişime kapalı olduğu için public sayfada trend grafiği kullanma.

5. **Açıklayıcı, hafif motion sistemi**
   - Yeni paket eklemeden mevcut CSS animasyonlarını durum geçişleri, kaynak seçimi, tekliflerin panelde birleşmesi, kullanıcı onaylı AI kaydı ve günlük ilerlemesi için kullan.
   - Metinleri başlangıçta okunur tut; yalnızca kart/durum vurgularını hareketlendir.
   - `prefers-reduced-motion` altında tüm süreçleri statik ve eksiksiz göster; autoplay video ekleme.

6. **Genel iletişim formuna dönüştür**
   - Mevcut kayıt ve SMS bildirim altyapısını koruyarak indoor formunu genel iletişim formuna çevir.
   - İstenen beş kullanıcı seçeneğini mevcut üç saklama kategorisine güvenli biçimde eşleştir; seçilen gerçek etiketi not içeriğiyle birlikte kaybetmeden gönder. Yeni tablo veya sahte entegrasyon oluşturma.
   - Başarı mesajını ve WhatsApp ön metnini istenen genel iletişim diline güncelle; mevcut WhatsApp numarasını koru.

7. **Marka, erişilebilirlik ve içerik güvenliği**
   - Mevcut lacivert, krem, tarımsal yeşil; amber keşif vurgusu; Inter/Manrope ve 12px kontrol yarıçapı sistemini koru.
   - Mevcut `Button` ve form bileşenlerini kullan; semantik başlık sırası, tek H1, klavye odağı, dokunma hedefleri ve açıklayıcı görsel alt metinlerini koru.
   - Hero, genç üretici ve gelecekteki gerçek hikâye görsellerini tek bir medya yapılandırmasından değiştirilebilir yap; gerçek kullanıcı hikâyesi alanını doğrulanmış içerik gelene kadar yayınlama.
   - Ana sayfa başlık/açıklama, Open Graph, Twitter ve FAQ yapılandırılmış verisini yeni çiftçi anlatısıyla eşleştir.

8. **Dosya kapsamı**
   - Ana çalışma: `src/routes/index.tsx`.
   - Yeni küçük landing bileşenleri ve içerik/medya yapılandırmaları: `src/components/hasat/landing/*`, `src/lib/hasat/landing-content.ts` benzeri istemci güvenli dosyalar.
   - Genel form sözleşmesi ve bildirim metni: `src/lib/api/indoor-interest.functions.ts`; mevcut tablo korunacak.
   - Gerekirse yalnızca landing’e özgü semantik stil/animasyon yardımcıları: `src/styles.css`.
   - Mevcut `/login`, auth yönlendirmeleri, yasal sayfalar, WhatsApp numarası, tarif rotaları ve diğer ürün ekranları değiştirilmeyecek.

9. **Doğrulama**
   - Kaynakta ve render edilmiş sayfada para/miktar/tarih taraması yaparak kurgusal veya tahmini sayısal veri kalmadığını doğrula.
   - Ana CTA, alıcı girişi, bölüm içi kaydırma, iletişim formu, WhatsApp, kullanım koşulları ve gizlilik bağlantılarını uçtan uca kontrol et.
   - 320, 375, 390, 430px mobil ve geniş masaüstünde taşma, sticky CTA, metin okunurluğu ve hareket azaltma durumunu Playwright ekran görüntüleriyle doğrula.
   - `tsgo`, ilgili testler ve production build çalıştır; gerçek veri gelmeyen alanları final özette açıkça listele.

## Teknik sınırlar ve doğrulanmış mevcut durum

- Mevcut landing 15 içerik bölümü, nav ve footerdan oluşuyor; sabit fiyat/miktar/tarih içeren üç ayrı temsili veri alanı bulunuyor.
- `get_price_history_summary` anonim kullanıma açık ve Hasat satış özetini 5 farklı üretici eşiğiyle koruyor; HKS ile Hasat verisini ayrı döndürüyor.
- Ayrıntılı haftalık fiyat serisi anonim kullanıma açık değil. Kişisel maliyetler, teklifler, siparişler ve gelirler sahip bazlı korunuyor; landing bunları okumayacak.
- Mevcut fiyat özeti HKS için ayrı güncellenme zamanı ile istenen tüm min/max/adet/miktar alanlarını sağlamıyor. Bu çalışma backend kapsamını büyütmeden mevcut doğrulanabilir alanları gösterecek; eksik alanlarda sayı uydurulmayacak.
- Framer Motion kurulu değil; hafif CSS motion kullanılacak.
- Veritabanı migration’ı, yeni public veri izni veya yeni entegrasyon planlanmıyor.