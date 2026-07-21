# Plan: Abonelik-Teklif Bağı + Dürüstlük Düzeltmesi

## 1) Migration (yalnızca ekler)
- `offers` tablosuna `subscription_id uuid null references public.harvest_subscriptions(id) on delete set null` ekle.
- İsteğe bağlı hafif index: `create index if not exists offers_subscription_id_idx on public.offers(subscription_id);`
- RLS/GRANT değişikliği yok (kolon mevcut policy kapsamında).

## 2) Uçtan uca `subscriptionId` taşınması

**`src/lib/hasat/types.ts`**
- `PendingOffer`'a `subscriptionId?: string` ekle.
- `Offer` ve `Order` tiplerine `subscriptionId?: string | null` ekle.

**`src/routes/buyer.subscriptions.tsx`**
- `orderSub` state'ine `subscriptionId: string` alanını ekle (aboneliğin `id`'si).
- Modal içindeki `Link`'in `search` prop'una `subscriptionId: orderSub.subscriptionId` ekle (mevcut `qty`/`suggestedPrice` yanına).

**`src/routes/buyer.offer.$listingId.tsx`**
- `validateSearch`'e `subscriptionId?: string` alanı ekle (string doğrulama, boşsa atla).
- `submit()` içinde `setPendingOffer({..., subscriptionId: search.subscriptionId})` geç.

**`src/lib/hasat/queries.ts`**
- `OfferInput`'a `subscriptionId?: string | null` ekle.
- `useCreateOffer` insert payload'una `subscription_id: input.subscriptionId ?? null` ekle.
- `OFFER_SELECT` / `ORDER_SELECT` sorgularına `subscription_id` ekle.
- `dbToOffer` ve `dbToOrder` map'lerinde `subscriptionId: r.subscription_id ?? null` döndür.

**`src/routes/buyer.payment.tsx`**
- `createOffer.mutateAsync`'e `subscriptionId: pending.subscriptionId` geç.

## 3) Çiftçi tarafı rozet
**`src/routes/farmer.orders.index.tsx`** (`OfferCard` ve `OrderCard`)
- Buyer adı satırında, `subscriptionId` varsa `BuyerRatingBadge` ile aynı satırda küçük "🔁 Abonelik Siparişi" chip'i göster (mevcut chip stiline uyumlu, gold/saffron paletinden).

## 4) Dürüstlük düzeltmesi
**`src/routes/buyer.subscription.$producerId.tsx`**
- Yanlış escrow satırını kaldırıp yerine:
  > ℹ️ Hasat yaklaştığında üreticiyle mevcut ödeme akışı (havale/kart) üzerinden iletişime geçilecek.

## Doğrulama
- `tsgo` ile typecheck.

## Kapsam dışı
- Otomatik escrow/tahsilat mekanizması (yok).
- Aboneliğin "kullanıldı" olarak işaretlenmesi/consume mantığı — sadece izleme rozeti eklenir.
