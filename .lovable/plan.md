## P17-E Frontend — RFQ (Talep Akışı)

Not: Şema (kolonlar + RLS) zaten canlı. Bu plan sadece `src/` içinde ilerler.

### 1) `src/lib/hasat/queries.ts`

**`useCreateCropRequest` güncellemesi**
- `CreateCropRequestInput` tipi: `cropName`, `note?`, `quantity? | null`, `unit? | null`, `region? | null`, `targetDateStart? | null`, `targetDateEnd? | null`, `targetPrice? | null`.
- Insert: `crop_requests`'e yeni kolonlarla birlikte `requested_by = auth.uid()`.
- Best-effort eşleşme + bildirim (try/catch, `useCreateReply` deseniyle):
  1. `crop_config`'ten canonical crop adını bul (`crop` veya `display_name` `ilike`).
  2. `listings` (status in ('active','draft')) — canonical `ilike` — ve `parcels.crops @> [canonical]` birleşiminden `farmer_id` seti.
  3. `region` doluysa: `profiles` üzerinden `city = region` olanlara filtre uygula.
  4. Her eşleşen çiftçiye `notifications` insert: `{type:'crop_request', title:'Yeni ürün talebi', body:'{buyerName} {ürün} arıyor — {miktar} {birim} · {region}'}`, `related_id = request.id`.
- `onSuccess`: `["cropRequests"]` ve `["myCropRequests"]` invalidate.

**Yeni `useMyCropRequests()`**
- `crop_requests` — `requested_by = auth.uid()` — kolonlar: `id, crop_name_free_text, note, quantity, unit, region, target_date_start, target_date_end, target_price, status, created_at`, `created_at desc`.
- `MyCropRequest` DTO'ya map.

### 2) `src/routes/buyer.discover.tsx`

- Yeni `requestOpen` state + `CropRequestModal` bileşeni (aynı dosyada).
- "Sonuç bulunamadı" boş durumuna "Bu ürünü talep et" butonu.
- Modal alanları: crop (query'den prefill), miktar + birim (kg/g/L), bölge (`TR_PROVINCES`), tarih başlangıç/bitiş, hedef fiyat, not.
- Gönderim `useCreateCropRequest.mutateAsync` + sonner toast.
- `TR_PROVINCES` importu `@/lib/hasat/cities`.

### 3) `src/routes/buyer.requests.tsx` (yeni)

- `createFileRoute("/buyer/requests")`, `head()` ile "Taleplerim — Hasat".
- `BuyerHeader` başlık + `/buyer/account`'a geri linki.
- `useMyCropRequests()` ile liste; boş durum CTA ("Keşfet'e git").
- Kart: ürün, tarih, durum rozeti, grid (miktar/bölge/tarih aralığı/hedef fiyat), varsa not.

### 4) `src/routes/buyer.account.tsx`

- Bildirim Tercihleri satırının hemen altına "Taleplerim" linki (`ClipboardList` + `ChevronRight`, mevcut satırlarla aynı görsel desen).

### 5) Doğrulama
- `bunx tsgo --noEmit` temiz olmalı.
