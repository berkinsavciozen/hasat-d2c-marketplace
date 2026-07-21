## Durum: İş zaten tamamlandı

Bu istekteki 4 maddenin tamamı önceki turda uygulandı ve `tsgo` başarıyla geçti. Yeni bir kod değişikliği gerekmiyor. Aşağıda her maddenin hangi dosyada karşılandığı özetlenmiştir:

### 1) Alıcı Bildirim Tercihleri
- `src/routes/buyer.settings.notifs.tsx` **oluşturuldu** — farmer sayfasıyla aynı yapı, `useNotifPrefs`/`useUpdateNotifPrefs`, `BuyerHeader`, geri linki `/buyer/account`, mobil kart + masaüstü tablo layoutu, 48px dokunma alanları.
- `src/routes/buyer.account.tsx` içine `Bell + ChevronRight` desenli "Bildirim Tercihleri" linki eklendi.

### 2) `buyer.account.tsx` bayat veri düzeltmesi
Zustand yerine `useProfile()` kullanılıyor: `profile.name`, `profile.city`, `profile.phone`, ve premium rozeti `isEffectivelyPremium(profile)` üzerinden. `useHasat` sadece gerçek fallback (isim yoksa) ve `crops` (ilgi alanları) için tutuluyor.

### 3) Toggle toast'ları
Hem `buyer.settings.notifs.tsx` hem `farmer.settings.notifs.tsx` içinde `onToggle` helper'ı:
- Başarı → `toast.success("Tercih güncellendi")`
- Hata → `toast.error(...)`

### 4) P17-F: Tekrar Sipariş + Adreslerim
- **`queries.ts`**: `ORDER_SELECT` `listing.id + status` ekliyor; `dbToOrder` `listingId` ve `listingActive` map ediyor. Yeni hooks: `useBuyerAddresses`, `useCreateAddress`, `useDeleteAddress`, `useSetDefaultAddress`.
- **`types.ts`**: `Order`'a `listingId?` + `listingActive?`; yeni `BuyerAddress` tipi.
- **`buyer.offer.$listingId.tsx`**: `validateSearch` ile `qty` + `suggestedPrice` search params kabul edip prefill; abonelik kilitli fiyatı önerildiğinde uyarı satırı gösteriyor.
- **`buyer.orders.tsx`** (`DoneOrderRow`): Listing aktifse "🔁 Tekrar Sipariş Ver" butonu (qty prefill), değilse "Bu ürün artık satışta değil" notu.
- **`buyer.orders.$orderId.tsx`**: Aynı buton delivered/completed durumlarında.
- **`buyer.subscriptions.tsx`**: Aktif abonelikte "Şimdi Sipariş Ver" butonu → `useFarmerActiveListings` ile diyalog; `priceLock` varsa her ilanda kilitli fiyat notu ve `suggestedPrice` ile offer sayfasına yönlendirme.
- **`buyer.account.tsx`**: "Adreslerim" bölümü — liste + inline ekleme formu + varsayılan yap (Star) + sil (Trash2). İlk adres otomatik varsayılan.

### Hook adlandırma notu
İstek `useCreateBuyerAddress` / `useDeleteBuyerAddress` / `useSetDefaultBuyerAddress` isimlerinden bahsediyor; kod `useCreateAddress` / `useDeleteAddress` / `useSetDefaultAddress` olarak eklendi (buyer scope zaten `auth.uid()` filtresinden geliyor). Farklı istenirse rename yapılabilir.

### Öneri
Yeni değişiklik yapılmasına gerek yok — sadece "onaylıyorum" derseniz bu planı **no-op** olarak kapatırım. Eğer yukarıdakilerden birinde davranış değişikliği (ör. hook rename, form UX, adres alanı ekle) isterseniz belirtin.
