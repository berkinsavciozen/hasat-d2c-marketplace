# Fiyatlar Sayfası: Borsa Tarzı Kompakt Tablo

Çiftçinin gördüğü `/farmer/prices` (ve aynı bileşeni kullanan `/buyer/prices`) sayfasını, kart listesinden **tek bakışta okunan, satır bazlı, trend işaretli bir fiyat tablosuna** çeviriyoruz. Kaynaklar (Hasat gerçekleşen satış ortalaması, İzmir Hali, İstanbul Hali, resmi kaynak) aynı satırda kolon kolon görünür; seçilen zaman aralığındaki yüzde değişim yeşil/kırmızı ok ile işaretlenir.

## Mevcut durum (doğrulandı)

- Sayfa `PricesPageBody` ile üç bölümden oluşuyor: kendi ürünlerin (vitrindeki ilanlardan), izleme listesi (yıldızlananlar), tüm piyasa (akordeon). Her ürün için ayrı bir özet çağrısı yapılıyor, fiyatlar yuvarlak rozetler halinde gösteriliyor.
- **Hiçbir yerde artış/azalış (trend) bilgisi yok.** Veritabanındaki özet fonksiyonu yalnızca dönem ortalaması döndürüyor; değişim hesaplanmıyor.
- Kayıtlı fiyat verisi: İzmir Hali 27 ürün (1 Tem – 15 Eyl), İstanbul Hali 23 ürün (tek gün, 16 Eyl), Hasat gerçekleşen satışlar 6 ürün. Bunlardan yalnızca **domates** 5 üretici eşiğini geçiyor; diğerleri gizlilik kuralı gereği "yetersiz veri" kalacak. Bu doğru davranış, tabloda da korunacak.
- Ürün listesi şu an sadece aktif ilanı olan veya resmi kaynak işaretli ürünlerden geliyor; hal fiyatı olan ama ilanı olmayan ürünler listeye girmiyor.

## Yapılacaklar

### 1. Tek seferde tüm ürünleri getiren yeni bir özet fonksiyonu
Bugün her ürün için ayrı ayrı sorgu atılıyor; 50+ ürünlü bir tabloda bu sürdürülemez. Veritabanına, seçilen zaman aralığı için **tüm ürünlerin tüm kaynaklardaki son fiyatını ve yüzde değişimini tek çağrıda** döndüren yeni bir fonksiyon eklenecek. Mevcut fonksiyonlar (ürün detay sayfası) aynen kalır, hiçbir davranış bozulmaz.

Her satır için dönen bilgi: ürün, birim, kaynak başına { son fiyat, önceki dönem fiyatı, % değişim, son güncelleme tarihi, veri noktası sayısı }. Hasat segmenti 5 üretici eşiğinin altındaysa fiyat yerine "yetersiz veri" işareti döner — sayı asla sızmaz.

### 2. Yeni kompakt tablo arayüzü
`PricesPageBody` yerine borsa listesi görünümü:

```text
Ürün            Hasat        İzmir Hali     İstanbul Hali
Domates      ₺24,50 ▲%3,2   ₺21,00 ▼%1,1      —
Üzüm          yetersiz      ₺38,20 ▲%5,4   ₺39,10 ▲%4,8
```

- **Mobil (393px):** satır başına ürün adı + yıldız + varsayılan kaynağın fiyatı ve trendi büyük punto; altında diğer kaynaklar küçük punto tek satırda yatay kayan rozetler. Yatay taşma yok.
- **Masaüstü:** gerçek kolonlu tablo, kaynak başına bir kolon, sağda mini sparkline.
- Trend rengi ve oku: artış yeşil ▲, azalış kırmızı ▼, değişim yoksa nötr —. Yalnızca gerçek iki veri noktası varsa gösterilir; tek ölçüm varsa trend boş kalır.
- Satıra tıklayınca bugünkü ürün detay sayfası açılır (değişmiyor).

### 3. Zaman aralığı seçici
Tablonun üstünde 7 gün / 30 gün / 90 gün sekmeleri, **varsayılan 30 gün**. Seçim tüm tabloyu etkiler ve kullanıcıda hatırlanır. Ürünün kendi fiyat penceresi 1 yıllık ise (safran gibi) o satırda pencere rozeti gösterilir.

### 4. Üç grup korunur, kompaktlaşır
- **Ürünlerin / İlgilendiğin Ürünler** — vitrindeki aktif ilanlardan (çiftçi) veya siparişlerden (alıcı) gelen ürünler, en üstte.
- **Favoriler** — yıldızlanan ürünler. Yıldız aynı davranışı korur (izleme kaydı açar/kapatır), tablo satırının solunda ince ikon olur.
- **Tüm Piyasa** — geri kalan her şey, yine katlanabilir; arama kutusu üç grupta da filtreler.

Gruplar arasında büyük boşluk yerine yapışkan grup başlıkları kullanılır, böylece üç blok tek akışta kompakt görünür.

### 5. Ürün kapsamını genişletme
Tüm Piyasa listesine, hal kaydı olan ama aktif ilanı olmayan ürünler de eklenecek (bugün görünmüyorlar). Böylece İzmir + İstanbul hali verisi olan ~30 ürün tabloda yer alır.

### 6. Şeffaflık kuralları (değişmez)
- Hasat ortalaması ile hal/resmi fiyatlar asla tek sayıda birleştirilmez; her zaman ayrı kolon.
- 5 farklı üretici eşiği altındaki Hasat verisi sayı olarak gösterilmez.
- Tahmini/temsili sayı yok; veri yoksa "—" ve açıklama.
- Sayfa üstündeki rekabet hukuku bilgi notu korunur, kısaltılıp katlanabilir hale getirilir.

## Teknik notlar

- Yeni SECURITY DEFINER RPC `get_price_board(p_days int, p_crops text[] default null)`; `price_history` üzerinde kaynak başına son fiyat ve önceki pencere ortalaması; `crop_config.price_window_type` ve `default_unit` saygı görür; Hasat segmentinde `count(distinct farmer_id) >= 5` kapısı fonksiyon içinde uygulanır.
- Frontend: `usePriceBoard(days)` hook'u (`src/lib/hasat/queries.ts`), yeni `PriceBoard.tsx` + `PriceBoardRow.tsx` bileşenleri; `PricesPageBody` bunları kullanacak şekilde yeniden yazılır. `CropDetailBody`, `PriceChart`, `MarketDeviationAlert` dokunulmadan kalır.
- `useCropsWithPriceData` genişletilir: aktif ilanlar + resmi kaynak + `price_history`'de kaydı olan ürünler.
- Trend yüzdesi yalnızca RPC'den gelir; istemci tarafında hesap uydurulmaz.
- Mevcut yıldız/izleme mutasyonları ve rotalar aynen korunur; doğrulama tsgo + 320/393/430 ve masaüstü genişliklerinde görsel kontrol.
