
## Audit — bugün ne var, ne eksik

**Buyer tarafı** (mevcut)
- `buyer.subscription.$producerId.tsx`: sadece **hacim** + **fiyat kilidi** seçtiriyor. Ürün otomatik tahmin ediliyor (parselden), tarih/mesaj yok. Kaydet → doğrudan `status='active'` insert. Üretici onayı hiç sorulmuyor.
- `buyer.subscriptions.tsx`: kendi aboneliklerini listeler, iptal eder, "Şimdi Sipariş Ver" ile ilan seçip `subscriptionId` + `lockedPrice` taşıyarak `/buyer/offer/$listingId`'e gönderir. Bu kısım çalışıyor.
- `buyer.account.tsx`: "Taleplerim" linki var, "Abonelikler" linki yok (nav'da var ama hesap kartında yok).
- `buyer.requests.tsx` = **crop_requests** (spot RFQ), aboneliklerle karışmasın — ayrı bir akış.

**Farmer tarafı** (yok denecek kadar az)
- Sadece order kartlarında "🔁 Abonelik Siparişi" rozeti var.
- Gelen abonelik teklifini **görecek sayfa yok**, kabul/red **yok**, bildirim **yok**, SMS **yok**.

**DB**
- `harvest_subscriptions.status` enum: `active | cancelled | fulfilled` — **`pending` yok**.
- RLS: buyer full CRUD, farmer sadece SELECT. Farmer'ın kabul/red için UPDATE hakkı yok.
- `dispatch_sms` içinde subscription eventleri yok.
- `notif_prefs`'te subscription toggle yok.
- Fulfillment: `offers.subscription_id` var ama hiçbir yerde toplanmıyor ("bu ay X kg / taahhüt Y kg" görünürlüğü yok).

## Hedef akış

```text
BUYER                             FARMER
─────                             ──────
1. Ürün + hacim + (opsiyonel      → in-app bildirim + SMS
   fiyat kilidi, tarih, not) →      "Yeni abonelik talebi"
   "Abonelik Talep Et"
   INSERT status='pending'

2. "Talebi gönderildi"            2. /farmer/subscriptions sayfası
   /buyer/subscriptions'da           - Bekleyen (pending): Kabul / Reddet
   "⏳ Onay bekleniyor"              - Aktif: hasat tarihini gir, tahmini
                                       miktarı gir, duraklat/tamamla
3. Kabul → in-app + SMS           3. Kabul UPDATE status='active'
   "Aboneliğiniz aktif"             (RLS: farmer kendi row'una)

4. "Şimdi Sipariş Ver" akışı      4. Order geldiğinde offer.subscription_id
   (mevcut, dokunulmuyor)            zaten set — dashboard'da kalan
                                     taahhüt (X kg / Y kg) görünür

5. İptal / farmer duraklat / hedef hacme ulaşınca "fulfilled"
```

## Yapılacaklar

### 1) Migration — status genişletme ve RLS
- `subscription_status` enum'una `pending` ve `paused` ekle.
- `useCreateSubscription` default'unu `pending` yap.
- Yeni RLS: farmer kendi `harvest_subscriptions` row'unu UPDATE edebilir **ama** buyer/farmer id, taahhüt, fiyat kilidi gibi ekonomik alanları değiştiremez. Bunun için `enforce_subscription_farmer_update()` trigger'ı:
  - Farmer sadece `status` (pending→active|cancelled, active→paused|fulfilled|cancelled, paused→active|cancelled), `next_harvest_date`, `estimated_qty` alanlarını değiştirebilir.
  - Buyer `status`'u `cancelled`'a çekebilir; diğer alanları değiştiremez.
- `notif_prefs`'e: `subscription_new_sms`, `subscription_accepted_sms`, `subscription_rejected_sms` (default true).
- `dispatch_sms` içine yeni event mapping'leri.
- Bildirim trigger'ı `notify_subscription_changes()`:
  - INSERT → farmer'a "Yeni abonelik talebi" + SMS.
  - status pending→active → buyer'a "Aboneliğiniz kabul edildi" + SMS.
  - status pending→cancelled (farmer eliyle) → buyer'a "Reddedildi" + SMS.
- Fulfillment view / RPC: `get_subscription_fulfillment(sub_id)` → toplam paid offers.quantity (unit dönüşümüyle canonical'a çevrilmiş).

### 2) Buyer — talep akışı iyileştirme
`src/routes/buyer.subscription.$producerId.tsx`:
- Üründen listeye dropdown (üreticinin aktif ilanları + parseldeki mahsuller — case-insensitive dedup).
- Tarih seçici (opsiyonel `next_harvest_date` önerisi).
- Mesaj/not alanı (`crop_requests` gibi opsiyonel not).
- Fiyat kilidi seçili ürüne ait; ürün değişince otomatik güncellenir.
- Buton metni: "Abonelik Talep Et" (aktif değil, talep).
- Başarı diyaloğu: "⏳ Talebiniz üreticiye iletildi — kabul edildiğinde SMS ile bildireceğiz."

`src/routes/buyer.subscriptions.tsx`:
- Status meta'ya `pending` ve `paused` ekle (renk + rozet).
- Pending kartında "Onay bekleniyor" göster; "Şimdi Sipariş Ver" butonu **sadece active**'de.
- Active kartında `get_subscription_fulfillment` sonucuna göre progress bar: "Bu döneme kadar teslim: 12 / 50 kg".
- Farmer'ın girdiği `next_harvest_date` / `estimated_qty` UI'da öne çıksın.

`src/routes/buyer.account.tsx`: "Abonelikler" linkini ekle (Taleplerim'in yanına).

### 3) Farmer — yeni sayfa
`src/routes/farmer.subscriptions.tsx` (yeni):
- Sekmeler: **Bekleyen** / **Aktif** / **Geçmiş**.
- Bekleyen kartı: buyer adı, city, ürün, hacim, önerilen tarih, mesaj → **Kabul / Reddet** butonları (confirm).
- Aktif kartı:
  - Fulfillment progress (RPC'den).
  - "Hasat tarihi gir" (`next_harvest_date`) + "Tahmini miktar" (`estimated_qty`) inline edit → kaydet.
  - "Duraklat" / "Tamamlandı olarak işaretle" / "İptal".
- `useIncomingSubscriptions()`, `useRespondToSubscription({id,status})`, `useUpdateSubscriptionSchedule` hook'ları.

Nav: `src/routes/farmer.tsx` içine `/farmer/subscriptions` linki + pending sayısı için badge.

### 4) MCP tools
- Yeni: `respond_to_subscription` (farmer, `confirm:true` gerekli), `update_subscription_schedule`.
- Mevcut `create_subscription` default status'unu `pending`'e çek.

### 5) Bildirim ayarları UI
- `farmer.settings.notifs.tsx`: yeni "Abonelik talebi" toggle.
- `buyer.settings.notifs.tsx`: "Abonelik kabul/red" toggle'ları.

## Doğrulama
- Migration → farmer row UPDATE sadece izinli alanlarda geçiyor mu (SQL test).
- Buyer akışı: pending oluştur, farmer sayfasında görünüyor → kabul et → buyer'a bildirim.
- SMS'ler `net._http_response` ile teyit.
- `bunx tsgo --noEmit` temiz bitmeli.

## Kapsam dışı (bu turda değil)
- Otomatik tekrarlayan/recurring order oluşturma (subscription bir "rezerv + fiyat kilidi" sözleşmesi; siparişleri hâlâ "Şimdi Sipariş Ver" ile buyer atıyor).
- Escrow, ön ödeme, cezai iptal.
- crop_requests (Taleplerim) ile birleştirme — ayrı kalacak.
