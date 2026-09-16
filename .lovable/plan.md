# Fiyatlar: Gerçek tablo yapısı + görünür trend işaretleri

İki sorun var:

1. Telefonda sayfa tablo değil, kart/liste gibi görünüyor. İleride yeni hal kaynakları (İstanbul'dan sonra Ankara, Antalya vb.) eklendikçe liste yapısı büyümez.
2. Artış/azalış okları çoğu satırda görünmüyor.

## Trend oklarının neden görünmediği (doğrulandı)

Veritabanındaki durum:

- İzmir Hali: 1 Temmuz – 15 Eylül arası, 27 ürün, günlük kayıt → 27 ürünün tamamında hem bu dönem hem önceki dönem ortalaması var, yani yüzde değişim hesaplanabiliyor.
- İstanbul Hali: yalnızca 16 Eylül, 23 ürün → karşılaştırılacak önceki dönem yok, değişim boş.
- Hasat gerçekleşen satışlar: 6 ürün, 5 üretici eşiğini yalnız domates geçiyor → diğerlerinde sayı da değişim de gösterilmiyor (kural gereği doğru).

Telefon görünümünde her satırda sadece "öne çıkan tek kaynağın" fiyatı ve oku yazılıyor; diğer kaynaklar küçük punto ve oksuz. Öne çıkan kaynak İstanbul ya da eşik altı Hasat olduğunda satırda hiç ok kalmıyor. Yani veri var, arayüz onu göstermiyor.

## Yapılacaklar (yalnız arayüz, veritabanı değişikliği yok)

### 1. Her ekran boyutunda gerçek tablo

- Telefon dahil tek bir tablo bileşeni: ilk sütun ürün adı + favori yıldızı, sabit (yatay kaydırmada yerinde kalır), diğer sütunlar her fiyat kaynağı için birer sütun.
- Tablo yatay kaydırılabilir; kaynak sayısı arttıkça yeni sütun eklenir, tasarım bozulmaz. Sağda kaydırma olduğunu belli eden hafif gölge.
- Sütun başlıkları kısa ad ("Hasat", "İzmir", "İstanbul") + başlık altında son veri tarihi.
- Satır yüksekliği kompakt; fiyat rakamları sabit genişlikli, sağa hizalı.

### 2. Trend işaretleri her hücrede

- Her fiyat hücresinde fiyatın altında yüzde değişim: yeşil yukarı ok / kırmızı aşağı ok / değişmediyse nötr çizgi.
- Karşılaştırma yapılamıyorsa (İstanbul gibi tek günlük kaynak) rakam yerine "yeni kaynak" ibaresi ve nedenini açıklayan kısa ipucu; sessizce boş bırakılmaz.
- Hasat sütununda 5 üretici eşiği altındaki ürünlerde bugünkü davranış aynen korunur: "yetersiz veri".
- Tablonun üstüne tek satırlık açıklama: yüzde değişim seçilen dönemin bir önceki eş dönemine göre.

### 3. Korunanlar

- 7 / 30 / 90 gün seçici, seçimi hatırlama, ürün arama.
- Üç grup (Ürünlerin / İlgilendiğin Ürünler, Favoriler, Tüm Piyasa) ve yapışkan grup başlıkları.
- Hasat ile resmi/hal fiyatlarının asla birleştirilmemesi, 5 üretici eşiği, uydurma sayı yok.
- Ürün adına tıklayınca ürün detay sayfasına gidiş, yıldız davranışı.

## Teknik notlar

- Değişecek dosyalar: `src/components/hasat/PriceBoard.tsx` (tek tablo yapısına yeniden yazım, sticky ilk sütun, hücre içi trend), gerekiyorsa `src/components/hasat/PricesPageBody.tsx` (başlık/açıklama satırı).
- `get_price_board` RPC'si zaten kaynak başına `price`, `prev_price`, `change_pct`, `points`, `last_date` döndürüyor; yeni migration gerekmiyor. Sütun kümesi satırlardaki kaynaklardan dinamik üretilmeye devam eder.
- Erişilebilirlik: gerçek `<table>` semantiği, ok işaretleri için metin karşılığı; 320 px'te taşma yok (yatay kaydırma tablonun kendi içinde).

## Referans görsel (kullanıcı eki)

Ekteki borsa uygulaması listesi referans alınır, kendi paletimizle:

- Sade satırlar, ince ayırıcı çizgiler, kart gölgesi/çerçeve gürültüsü yok.
- Sol sütun: favori ikonu + ürün adı; sağa hizalı fiyat sütunları; yüzde değişim yeşil/kırmızı.
- Başlık satırı küçük, büyük harf, soluk renk ("Ürün", "Hasat", "İzmir", "İstanbul").
- Renkler Hasat paletinden: artış `--sage` yeşil, azalış `--hred` kırmızı, fiyat metni ana metin rengi; koyu tema kopyalanmaz.
- Fonksiyonel değişiklik yok: aynı veriler, aynı kurallar, aynı bağlantılar.
