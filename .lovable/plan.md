# Fiyatlar (Hal + Hasat ortalama satış) — Uygulama Planı

## Özet
Canlı sistemde fiyat veri katmanı: Hasat sipariş fiyatları (133 satır, 6 ürün, 10 çiftçi), İzmir Toptancı Hali dış kaynak fiyatları (694 satır, 27 ürün), resmi HKS kanalı ise hiç veri yok. Bu plan denetim bulgularını kapatırken landing sayfasındaki iki küçük polish önerisini de uyguluyor.

## Kullanıcı sorusu: "Bu plandaki her adımı eksiksiz sen uygulayabilir misin?"

**Çoğunu evet, iki alanı seninle beraber çözmemiz gerek:**

| # | Adım | Ben uygulayabilir miyim? | Not |
|---|------|--------------------------|-----|
| 1 | `sync-izmir-hal-prices` edge fonksiyonunun repo'ya alınması + loglama | **Kısmen** | Kaynak kodu canlıdan indirilemiyor. Bana kodu verirsen entegre ederim; veremezsen seninle aynı API/erişim bilgilerini kullanarak sıfırdan yazarız. |
| 2 | Canlıdaki RPC'lerle migration drift'inin kapatılması | **Evet** | `get_price_history_summary` ve `get_price_history_series` canlı tanımlarını migration olarak yazarım. |
| 3 | HKS kararı | **Evet/beraber** | Kodla `has_official_price_source` bayraklarını temizleyip kartı kaldırabilirim. Gerçek HKS entegrasyonu için resmi API/erişim yöntemi gerek. |
| 4 | `price_history` şemasına min/max, kalite sınıfı, hacim, kaynak yayın tarihi eklenmesi; RPC'lerin kaynak bazlı `last_updated` döndürmesi | **Evet** | Şema ve kod değişiklikleri. Mevcut satırların yeni kolonlara nasıl doldurulacağını migration'da tanımlarız. |
| 5 | Yeni hal/bölge kaynakları, ürün kapsamı genişletmesi, `useCropsWithPriceData` güncellemesi | **Kısmen** | Yeni market_sources/crop_market_sources satırlarını ve kodu ben yazarım ama ham veri ingestion'ı için #1 gerekir. |
| 6 | `source` enum/CHECK, `price_points` emekliye ayırma | **Evet** | Hem DB hem query/UI temizliği. |
| 7 | `price_alerts`: değerlendirme/dispatch veya watchlist'e çevirme | **Evet** | Aktif bildirim kanalı varsa (WhatsApp/SMS/push) buna göre seçeriz; şu anki watchlist davranışını koruyup sadece isimlendirme düzeltmesi yapabiliriz. |

## Bugün önerilen sıra
1. Landing polish (2 küçük metin düzeltmesi).
2. Canlı RPC'lerin migration drift'ini kapatmak.
3. `has_official_price_source` bayraklarını ve "Resmi Hal Fiyatı" kartını gerçek veri yoksa gizlemek.
4. `source` değerini enum/CHECK ile kısıtlamak ve `price_points`/`usePricePoints` temizliği.

## Landing polish — uygulanacak değişiklikler
- Hero'daki metin: "Sayısal veri gösterilmez; kayıtlar yalnızca gerçek kaynak bağlandığında görünür." → "Fiyatlar ve satış bilgileri yalnızca kaynağı doğrulanmış gerçek verilerden gösterilir."
- "Tek merkez" / OperationsSection altı karttaki "Henüz veri bulunmuyor" mesajlarını tek ortak mesajla değiştir: "Kayıtlı teklifleriniz, siparişleriniz, teslimatlarınız ve ödemeleriniz burada tek ekranda görünür."

## Plan kuralları / invariants
- Hasat topluluk ortalaması ile resmi/market fiyatları asla tek sayıda birleştirmeyeceğiz.
- 5 farklı çiftçi eşiği korunacak; rekabet hukuku kontrolüdür.
- Ham `price_history` satırları kullanıcılara açılmayacak; tüm okumalar SECURITY DEFINER RPC üzerinden.
- Uydurulmuş/hesaplanmış/tahmini fiyat, gelir, maliyet veya satış verisi gösterilmeyecek; veri yoksa açık "veri yok" durumu.
- `crop_config.crop` (küçük harf slug) her zaman tek kaynak; `listings.crop` büyük/küçük harf duyarsız eşleşir.

## Onay beklentisi
Onay verirsen build moduna geçip landing polish + migration drift + HKS bayrak temizliğini aynı turda uygularım. `sync-izmir-hal-prices` kaynağı için de yol haritası çıkarırım ama kodu yazmak için veri kaynağı bilgilerine ihtiyacım olacak.
