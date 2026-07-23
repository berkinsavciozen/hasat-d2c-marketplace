# P21-B+C — Buyer çoklu-batch keşif, ürün detayı, çoklu-batch tek teklif

## Amaç
Buyer tarafında aynı çiftçi+ürün için birden fazla batch (listing) varsa: Keşfet'te tek karta grupla, açılan yeni ürün detay sayfasında batch dağılımını göster, buyer birden fazla batch'ten aynı anda miktar seçip **tek teklif** gönderebilsin. Backend'de bu tek teklif `offer_items` alt satırlarıyla temsil edilsin. Stok kontrolü ve traceability RLS bu modele uyacak şekilde güncellensin.

## 1) Migration (tek migration)

**a) `offer_items` tablosu**
```sql
CREATE TABLE public.offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  price_per_unit numeric NOT NULL CHECK (price_per_unit >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.offer_items(offer_id);
CREATE INDEX ON public.offer_items(listing_id);
GRANT SELECT, INSERT ON public.offer_items TO authenticated;
GRANT ALL ON public.offer_items TO service_role;
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;
```
- **SELECT policy**: `EXISTS (SELECT 1 FROM offers o WHERE o.id = offer_items.offer_id AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid()))`
- **INSERT policy**: aynı EXISTS + `o.buyer_id = auth.uid()` (buyer, kendi offer'ına eklesin).

**b) `offers` toplam kolonlarının anlamı (geri uyum)**
Tek-batch teklifler dahil her offer için `offer_items`'a en az 1 satır yazılır. `offers.listing_id` = **birincil batch** (buyer'ın sepetteki ilk seçtiği veya tek batch'liyse o batch — mevcut UI'ların crashlemesini önlemek için). `offers.quantity` = `SUM(offer_items.quantity)`. `offers.price_per_unit` = **ağırlıklı ortalama** (Σ(qty×price) / Σ(qty)). Neden ağırlıklı ortalama: mevcut UI'lar (negotiation, orders, notifications, `notify_offer_received`) `quantity × price_per_unit` ile toplam ciroyu hesaplıyor; ağırlıklı ortalama bu invariant'ı korur (Σqty × wavg = Σ(qty×price)). "İlk batch fiyatı" seçilirse toplam ciro yanlış görünür.

**c) `enforce_offer_stock` güncelle**
Şu an sadece `NEW.listing_id` üzerinden çalışıyor. Yeni davranış: offer `accepted`'e geçtiğinde, offer'ın **her `offer_items` satırı için ayrı ayrı** stok kontrolü yap. Her listing için: base_stock (batch_total veya listing.quantity fallback) − reserved (aynı listing'e diğer accepted offer'ların `offer_items.quantity` toplamı, bu offer hariç) ≥ bu offer'ın o listing için `offer_items.quantity` toplamı. Backward-compat: offer'ın hiç `offer_items` satırı yoksa mevcut tekil kontrole düş.

**d) `harvest_entries.unit` vs `listings.unit` tutarlılık kontrolü**
Yeni trigger `tg_enforce_link_unit_match` (BEFORE INSERT on `listing_harvest_entries`): bağlanacak `harvest_entries.unit` ile `listings.unit` farklıysa `RAISE EXCEPTION`. Sadece uyarı değil hata — kg/g karışıklığı ciddi bir stok bug'ı yaratıyor. Mevcut kayıtlara dokunmuyoruz (backfill/temizlik yapmıyoruz), sadece yeni link'leri koruyor.

**e) Traceability RLS**
Mevcut `listings` SELECT policy'si "status active" ile sınırlıysa, ek bir OR policy ekle: buyer'ın o listing için `offer_items` → `offers` (herhangi statüde) veya `orders` (offer üzerinden) satırı varsa okuyabilsin. Aynı mantık `harvest_entries` ve `listing_harvest_entries` için: buyer'ın o listing ile ilişkili `offer_items`'ı varsa okuyabilsin.

## 2) Frontend — Keşfet grouping

`buyer.discover.tsx`: `useActiveListings()` sonucunu client-side `(farmer_id, crop_lowercase)` ile grupla. Grup kartı üstünde:
- Toplam available stok: her batch için `useListingStock` sonuçlarının toplamı (kartlar mount olduğunda hook'lar paralel çalışır; N-batch senaryosunda tek grup için N sorgu, kabul edilebilir).
- "N parti" rozeti (N>1 iken).
- Fiyat aralığı: `min===max` ise tek fiyat, aksi halde `₺X–Y/{unit}`.
- Tıklama → yeni ürün detay sayfası.

## 3) Yeni route — ürün detay (multi-batch)

Dosya: `src/routes/buyer.product.$farmerId.$crop.tsx` (path: `/buyer/product/$farmerId/$crop`).
- URL'den `farmerId` + `crop` (lowercase slug) al; `listings` sorgusu: `farmer_id = $farmerId AND lower(crop) = $crop AND status = 'active'`.
- Üstte çiftçi başlık kartı (isim, şehir — mevcut `public_farmer_profiles` ile).
- Batch listesi (her batch bir accordion satırı):
  - Sol: `batch_name || 'Batch #'+n`, kalite, `useListingStock` available, `price_per_unit`.
  - Sağ: miktar input'u (0 – available, adım input'un unit'ine göre).
  - Genişletildiğinde: `useListingBatchEntries(listingId)` ile bağlı harvest_entries listesi (tarih, quantity+unit, quality, notes) — kronolojik, basit `<ul>`. Takvim yok.
- Alt sabit çubuk: canlı toplam = Σ(seçilen_qty × batch_price), toplam adet, "Teklif Gönder" butonu. Buton yalnız en az bir batch'te qty>0 iken enable.
- Butona basınca yeni hook `useCreateMultiBatchOffer` çağrılır (aşağıda).

Route dosyasında `errorComponent`, `notFoundComponent`, unique `head()` (title/description/og — çiftçi + ürün ismi ile).

## 4) `useCreateMultiBatchOffer` (yeni hook, `queries.ts`)

Girdi:
```ts
{ farmerId: string; items: { listingId: string; quantity: number; pricePerUnit: number }[]; delivery?; deliveryDate?; note? }
```
Adımlar (client-side; tek RPC yok, iki insert):
1. `totalQty = Σ items.quantity`, `wavgPrice = Σ(qty×price) / totalQty`, `primaryListingId = items[0].listingId`.
2. `INSERT INTO offers ({ listing_id: primary, quantity: totalQty, price_per_unit: wavgPrice, current_quantity, current_price, ...mevcut alanlar })` → `offer.id` al.
3. `INSERT INTO offer_items` — items map'i, `offer_id = offer.id`.
4. Hata olursa (2. adım geçip 3. adım patlarsa) offer'ı delete et (best-effort rollback). Not: RLS + FK ON DELETE CASCADE zaten korur ama orphan offer bırakmayalım.

`useCreateOffer` (mevcut tek-batch hook) **kaldırılmıyor** — çağıran yerler var (`buyer.offer.$listingId.tsx`, MCP `create-offer` tool). Bunun yerine `useCreateOffer` internal olarak `useCreateMultiBatchOffer` mantığına delege edilir: tek-item bir çağrı yaparak `offer_items`'a 1 satır yazmayı da garanti eder. Böylece "her offer en az 1 offer_item'a sahip" invariant'ı hem eski hem yeni yoldan sağlanır.

MCP `create-offer` tool'u da aynı desene taşınacak (tool handler içinde ikinci insert). Bu turda dahil.

## 5) Offer/Order detay — batch dağılımı

- Yeni hook `useOfferItems(offerId)`: `offer_items` + join `listings(id, crop, batch_name, unit)` + join `public_farmer_profiles` (zaten var). Sıra: `created_at`.
- Etkilenen sayfalar: `buyer.negotiation.$offerId.tsx`, `buyer.orders.$orderId.tsx`, farmer tarafındaki offer/order detay ekranları (`farmer.orders.index.tsx` ve varsa farmer negotiation ekranı — araştırıp gerekli tüm yerlere ekle).
- "Batch dağılımı" bölümü: her `offer_items` satırı için `batch_name` + qty + price + subtotal; tıklanınca `useListingBatchEntries(listing_id)` ile harvest entry listesi (madde 3'teki gibi) açılır.

## 6) Etkilenen dosyalar (özet)

- **Yeni**: 1 migration; `src/routes/buyer.product.$farmerId.$crop.tsx`.
- **Değişen**: `src/lib/hasat/queries.ts` (yeni `useCreateMultiBatchOffer`, `useOfferItems`; `useCreateOffer` refactor; `useActiveListings` opsiyonel — grouping client-side olacağı için değişmeyebilir), `src/routes/buyer.discover.tsx` (grouping + kart), `src/routes/buyer.negotiation.$offerId.tsx`, `src/routes/buyer.orders.$orderId.tsx`, farmer offer/order detay dosya(ları), `src/lib/mcp/tools/create-offer.ts` (offer_items ikinci insert).
- **Dokunulmaz**: `farmer.storefront.tsx`, care/journal takvim işleri (kapsam dışı).

## 7) Doğrulama
- Migration RLS ve trigger'lar için manuel SELECT/UPDATE denemeleri.
- `bunx tsgo --noEmit` sonucu raporlanır.
- Rapor: değişen dosya listesi + migration özeti + tsgo çıktısı.

## Açık varsayımlar (yanlışsa düzeltin)
- **Ağırlıklı ortalama** seçildi (bkz. 1b). "İlk batch fiyatı" tercih ediliyorsa söyleyin — o zaman notify_offer_received / order total hesaplarını da güncellemek gerek.
- Farklı **kalite** (A/B/C) batch'lerin aynı offer'da birleştirilmesine izin veriliyor (buyer isterse); UI'da her satırda kalite görünür ama karma engel yok.
- `harvest_entries.unit` ↔ `listings.unit` uyumsuzluğunda **hata fırlatılıyor** (uyarı değil). Mevcut kayıtları migrate etmiyoruz.
