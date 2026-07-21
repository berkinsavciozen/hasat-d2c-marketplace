# P17-B: Sipariş Sonrası Akış (Kargo/Teslim/İptal/İhtilaf)

Guardrail: migration'lar sadece ADD/CREATE — hiçbir tablo, RLS, kolon veya veri silinmez/değiştirilmez.

## 1) DB Migration (tek dosya, additive)

- `alter type public.order_status add value if not exists 'cancelled';` (mevcut `disputed` zaten var.)
- `orders` tablosuna kolonlar (hepsi nullable):
  - `tracking_number text`, `carrier text`
  - `cancelled_at timestamptz`, `cancel_reason text`
  - `dispute_window_expires_at timestamptz` (teslim onayında set edilir, now()+24h)
- Yeni `public.disputes` tablosu:
  - Kolonlar: `id`, `order_id fk orders`, `opened_by fk profiles`, `reason text not null`, `evidence_photo_urls text[] default '{}'`, `status text default 'open' check in ('open','resolved')`, `resolution text`, `resolved_at timestamptz`, `window_expires_at timestamptz`, `created_at timestamptz default now()`.
  - GRANT: `select, insert, update` → `authenticated`; `all` → `service_role`.
  - RLS enable + policy: SELECT/INSERT/UPDATE ancak `exists (select 1 from orders o where o.id = disputes.order_id and (o.buyer_id = auth.uid() or o.farmer_id = auth.uid()))`.
- Yeni storage bucket: `delivery-photos` (private). storage.objects üzerine RLS: siparişin buyer/farmer'ı okuyabilir/yazabilir (path prefix `<order_id>/`).

## 2) Type güncellemeleri (`src/lib/hasat/types.ts`)

- `OrderStatus`'a `"disputed"` ve `"cancelled"` ekle.
- `Order`'a opsiyonel alanlar: `trackingNumber?`, `carrier?`, `cancelReason?`, `disputeWindowExpiresAt?`, `deliveryPhotoUrl?`.
- Yeni tip: `Dispute { id, orderId, openedBy, reason, evidencePhotoUrls[], status, createdAt }`.

## 3) `src/lib/hasat/queries.ts`

**Bug fix'ler (aynı turda):**
- `statusMap.disputed` → `"disputed"` (artık `preparing`'e ezilmiyor); yeni `cancelled: "cancelled"` map'i eklenir.
- `dbToOrder`'daki sabit `delivery: "Kargo"` → `deliveryLabel(offer.delivery)`; `useFarmerOrders`/`useBuyerOrders` select stringine `offer:offers(..., delivery, ...)` eklenir.
- `dbToOrder`: yeni order kolonları map edilir (`trackingNumber`, `carrier`, `disputeWindowExpiresAt`, `cancelReason`).
- `TIMELINE_DEFAULT`: `cancelled`/`disputed` özel yollar için — `disputed`/`cancelled` statusünde farklı bir timeline dizisi döndüren küçük bir yardımcı (mevcut sıralı akış korunur, terminal step değişir).

**Yeni mutation'lar:**
- `useMarkShipped()` → `{ orderId, trackingNumber, carrier }`:
  - `orders` update (status `preparing`→`shipped`, tracking/carrier set).
  - `order_timeline` insert `{ step:'shipped', label:'Kargoya Verildi', completed_at: now() }`.
  - invalidate: `["orders","farmer"]`, `["order-timeline", orderId]`.
- `useConfirmDelivery()` → `{ orderId, photoFile }`:
  - `delivery-photos` bucket'a `<orderId>/<uuid>.jpg` yükle → public/signed URL al.
  - `orders` update (status `shipped`→`delivered`, `dispute_window_expires_at = now() + interval '24 hours'`).
  - `order_timeline` insert `delivered`.
  - invalidate: buyer orders + timeline.
- `useOpenDispute()` → `{ orderId, reason, photoFiles[] }`:
  - Fotoğrafları `delivery-photos/<orderId>/dispute/` altına yükle.
  - `disputes` insert; `orders` update `status='disputed'`.
  - Pencere kontrolü: client tarafında `dispute_window_expires_at > now()` check + DB'de policy zaten sahiplik gerektiriyor; ek server check gerektirmez (mevcut RLS + trigger yeterli).
- `useCancelOrder()` → `{ orderId, reason }`:
  - `orders` update: sadece `status='preparing'` iken → `cancelled`, `cancelled_at=now()`, `cancel_reason=reason`. `.eq('status','preparing')` filtresi ile korunur.
  - `order_timeline` insert `cancelled`.
- Yeni read: `useOrderDispute(orderId)` — mevcut ihtilaf varsa döner (UI banner'ı için).

## 4) UI

**`farmer.orders.index.tsx` → `OrderCard`:**
- `preparing`: birincil buton "📦 Kargoya Ver" (modal: taşıyıcı select [Yurtiçi/Aras/MNG/PTT/Diğer] + takip no input), ikincil link "İptal Et" (onay + sebep textarea modalı).
- `shipped`: kargo firması + takip no readonly gösterim.
- `disputed`: küçük hred banner "⚠️ Alıcı ihtilaf açtı — nedeni: …".
- `cancelled`: muted "İptal edildi — …" (badge).

**`buyer.orders.$orderId.tsx`:**
- Placeholder "Mesajlaşma yakında..." Sheet'ini ve tetikleyen "Satıcıyla Konuş" butonunu kaldır; WhatsApp/tel butonları zaten var, tek başlarına kalır.
- `shipped`: kargo bilgi kartı + birincil buton "✅ Teslim Aldım" (modal: fotoğraf yükleme zorunlu + onay).
- `delivered` ve `now() < dispute_window_expires_at`: ikincil buton "⚠️ İhtilaf Aç" (modal: sebep + çoklu fotoğraf).
- Aktif dispute varsa üstte durum kartı.

**`OrderTimeline.tsx`:**
- `disputed` ve `cancelled` durumlarında son step için renk tokenı (`--hred` / `--hmuted`) + etiket değişikliği; mevcut visual sistem korunur, sadece `circleBg` seçim map'i genişletilir.

## 5) Doğrulama

- `tsgo` clean.
- Manuel akış: preparing → ship → deliver (photo) → dispute açılabilir (24h içinde); preparing → cancel yolu ayrı.

## Teknik notlar

- `alter type add value` transaction dışında çalışır — migration'da diğer DDL'lerden önce ve `commit` sonrası çalıştırılabilecek şekilde konumlandırılır (Supabase migration runner tek statement olarak alır; gerekirse `commit;` ile ayrılır).
- Storage bucket'ı SQL migration ile değil `supabase--storage_create_bucket` tool ile oluşturulur; RLS policy'leri migration'da yazılır.
- Tüm yeni RLS'ler sahiplik bazlı — kimse başkasının siparişini veya ihtilafını göremez.
