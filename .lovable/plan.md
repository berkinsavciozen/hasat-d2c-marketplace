İki ana sayfaya, mevcut hook'lardan client-side türetilen, retention odaklı hafif katmanlar ekleyeceğim. Yeni sorgu, yeni endpoint, yeni migration YOK.

## 1) `src/routes/farmer.home.tsx`

### a) "Bekleyen" kartı (AIBox'ın üzerine)
- `useFarmerOffers()` ve `useFarmerOrders()` çağırılır (zaten mevcut).
- **Yanıt bekleyen teklif sayısı**: `offers.filter(o => (o.status === "pending" || o.status === "counter") && o.ballSide === "farmer").length` — yani top çiftçide olan aktif müzakereler.
- **Hazırlanan sipariş sayısı**: `orders.filter(o => o.status === "preparing").length`.
- Kart iki satırlı kompakt bir görünüm: sol "Yanıt bekleyen X teklif" → `Link to="/farmer/orders"` (mevcut sekme, teklifler burada gösteriliyor), sağ "Hazırlanan X sipariş" → `Link to="/farmer/orders"` aynı sayfaya (sayfa içi sekme yoksa aynı rota; ayrı rota bulunursa güncellenir).
- Her iki sayı da 0 ise kartın tamamı gizlenir (sahte veri üretilmez, boş "0 bekleyen" gösterilmez).
- Stil: `SectionCard` benzeri `rounded-2xl border bg-card`, sol kenarında `--saffron` accent şeridi; tıklanabilir satırlar `min-h-[48px]`.

### b) "Bu Sezon" yüzde kıyası
- `entries` içinden **cari yıl başından bugüne** (`[Jan 1 → today]`) toplam gelir hesaplanır (zaten `totalRevenue` var; onu bu pencereye daraltırız).
- **Aynı takvim penceresi geçen yıl** (`[prev Jan 1 → prev today]`) için ikinci bir toplam hesaplanır.
- Geçen yıl aynı pencerede en az 1 entry yoksa hiçbir şey render edilmez.
- Varsa, mevcut "Bu Sezon" başlığının altına `+X.X% geçen yıla göre` veya `−X.X%` küçük satır eklenir; pozitif için `--sage`, negatif için `--hred`, nötr için `--hmuted` renk tokeni.
- Şu anki `totalRevenue` (tüm zamanlar) yerine YTD kullanılır — bu "Bu Sezon" etiketiyle zaten daha tutarlı; kıyas olmayan kullanıcılar için (yeni çiftçi) sadece rakam gösterilir.

## 2) `src/routes/buyer.discover.tsx`

### "Senin İçin" şeridi (kategoriler gridinin üzerine)
- Yeni hook çağrıları: `useBuyerOffers()`, `useMySubscriptions()`, `usePriceAlerts()` — üçü de mevcut.
- Üç adet küçük kart, yatay `overflow-x-auto` şerit; kart genişliği ~180px, `min-h-[48px]` tıklama alanı; `rounded-2xl border bg-card p-4` + `--gold`/`--saffron` accent ikonlar.
- **Bekleyen teklifler**: `offers.filter(o => (o.status === "pending" || o.status === "counter") && o.ballSide === "buyer").length` → `Link to="/buyer/messages"`. Sayı 0 ise kart yok.
- **En yakın abonelik teslimatı**: `subs.filter(s => s.nextHarvestDate && new Date(s.nextHarvestDate) >= today && s.status === "active")` → en erken tarih, kartta "Bir sonraki teslimat: <tarih, üretici adı>" → `Link to="/buyer/subscriptions"`. Uygun kayıt yoksa kart yok.
- **Aktif fiyat alarmı sayısı**: `alerts.filter(a => a.active).length` → `Link to="/buyer/reports"` (mevcut alıcı raporlar sayfası; alarmlar için ayrı rota yok). Sayı 0 ise kart yok.
- Üç kartın tamamı boşsa şeridin ve başlığının tümü render edilmez (yer kaplamaz).
- Başlık: küçük `font-serif` "Senin İçin" — yalnızca en az bir kart varsa görünür.

## 3) Stil ve erişilebilirlik
- Yalnızca `var(--saffron)`, `var(--gold)`, `var(--sage)`, `var(--hred)`, `var(--hmuted)` tokenleri; ham hex yok.
- Tüm tıklanabilir elemanlar `min-h-[48px]`; `Link` bileşenleri blok/flex ile dikey padding'i karşılar.
- Yeni component dosyası açılmaz; mantık `farmer.home.tsx` ve `buyer.discover.tsx` içinde küçük yerel helper'lar olarak yaşar (mevcut `SectionCard`/`StatCard` gerekirse tercih edilir; aksi halde satır içi).

## Doğrulama
- Yalnızca `src/` düzenlenir; `supabase/` dokunulmaz.
- Değişiklik sonrası `bunx tsgo --noEmit` temiz olmalı.
- Manuel akış: yeni çiftçi (entries boş) → "Bekleyen" ve karşılaştırma gizli; alıcı hiç aboneliği/alarmı/bekleyen teklifi yoksa şerit tamamen gizli.