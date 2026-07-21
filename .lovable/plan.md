# P17-C: Karşılıklı Değerlendirme (Rating/Review) Sistemi

Guardrail: migration additive — mevcut tablolar/RLS/veri değişmez.

## 1) DB Migration (tek dosya, additive)

**`public.reviews` tablosu:**
- `id uuid pk default gen_random_uuid()`
- `order_id uuid not null references public.orders(id) on delete cascade`
- `reviewer_id uuid not null references public.profiles(id) on delete cascade`
- `reviewee_id uuid not null references public.profiles(id) on delete cascade`
- `reviewer_role text not null check (reviewer_role in ('farmer','buyer'))`
- `rating int not null check (rating between 1 and 5)`
- `comment text`
- `created_at timestamptz not null default now()`
- `unique (order_id, reviewer_id)` — bir siparişe bir taraf tek review.
- Index: `(reviewee_id)` — profil özet sorguları için.

**GRANT:**
- `grant select on public.reviews to anon, authenticated;` (public okuma — pazaryeri şeffaflığı)
- `grant insert on public.reviews to authenticated;`
- `grant all on public.reviews to service_role;`

**RLS (enable + policies):**
- `select`: `to public using (true)` — herkes okuyabilir.
- `insert`: `to authenticated with check (auth.uid() = reviewer_id AND exists (select 1 from public.orders o where o.id = order_id AND o.status in ('delivered','completed') AND ((reviewer_role='buyer' AND o.buyer_id = auth.uid() AND o.farmer_id = reviewee_id) OR (reviewer_role='farmer' AND o.farmer_id = auth.uid() AND o.buyer_id = reviewee_id))))`
- Update/Delete policy yok — review'lar immutable (v1 için basit).

**RPC `public.get_farmer_rating_summary(_farmer_id uuid)`:**
- `returns table(avg_rating numeric, review_count int)`
- `security definer`, `set search_path = public`, `stable`
- Body: `select avg(rating)::numeric, count(*)::int from reviews where reviewee_id = _farmer_id and reviewer_role = 'buyer'`
- `grant execute to anon, authenticated;`

## 2) Types (`src/lib/hasat/types.ts`)

Yeni tip:
```ts
export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  revieweeId: string;
  reviewerRole: 'farmer' | 'buyer';
  rating: number;
  comment: string | null;
  createdAt: string;
}
export interface FarmerRatingSummary { avgRating: number | null; reviewCount: number }
```

## 3) Queries (`src/lib/hasat/queries.ts`)

- **`useCreateReview()`** → `{ orderId, revieweeId, reviewerRole, rating, comment? }`
  - `reviews` insert (auth.uid() reviewer_id olarak).
  - Invalidate: `["order-reviews", orderId]`, `["farmer-rating", revieweeId]`, `["orders","buyer"]` veya `["orders","farmer"]`.
- **`useOrderReviews(orderId)`** — o siparişteki 0-2 review'ı döner.
- **`useFarmerRatingSummary(farmerId)`** — RPC çağırır, `{avgRating, reviewCount}`.

## 4) UI

**`buyer.orders.$orderId.tsx`:**
- `order.status === 'delivered' || 'completed'` iken:
  - Kullanıcının verdiği review varsa → "Değerlendirdiniz ✓ ⭐ {rating}/5" pill.
  - Yoksa → "⭐ Değerlendir" butonu; modal (1-5 yıldız seçici + opsiyonel yorum textarea) → `useCreateReview({ reviewerRole: 'buyer', revieweeId: order.producerId })`.

**`farmer.orders.index.tsx` (`OrderCard`):**
- `delivered/completed` iken aynı desen: "⭐ Alıcıyı Değerlendir" veya "Değerlendirdiniz ✓" — reviewerRole `'farmer'`, revieweeId order'ın buyer_id'si (mevcut `Order` tipinde yoksa `queries.ts`'de map'e ekle).
- Not: `Order` tipinde `buyerId` alanı olup olmadığını kontrol edip yoksa `dbToOrder`'a ekle (`offers.buyer_id`'den).

**`buyer.producer.$id.tsx`:**
- Profil kartında yıldız + ortalama + review sayısı gösterimi (`useFarmerRatingSummary(id)`).
- Aşağı yeni bir "Değerlendirmeler" bölümü: son 5 buyer→farmer yorumu (yeni bir `useFarmerRecentReviews(farmerId, limit=5)` ile — bu 4. hook olur, plan içine dahil).
- Veri yoksa "Henüz değerlendirme yok" hint.

## 5) Doğrulama

- `tsgo` clean.
- Manuel: bir `delivered` sipariş üzerinden buyer değerlendirir → producer profile ortalama güncellenir; ikinci review denemesi unique constraint ile engellenir.

## Notlar

- Review'lar public SELECT — buyer yorumları rakip çiftçilere de görünür; bu bilinçli (pazaryeri şeffaflığı) ve mevcut community post pattern'i ile tutarlı.
- Immutable review kararı v1 için — düzenleme/silme ileride ayrı bir feature.
- RLS check sipariş durumunu ve tarafların doğru eşleşmesini DB seviyesinde zorlar — client validation ek katman.
