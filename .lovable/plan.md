# Admin KPI Dashboard — 14 Yeni View Entegrasyonu

Mevcut 6 view/bölüm ve `x-admin-key` mantığı korunacak; sadece ekleme yapılacak.

## 1) Edge Function: `supabase/functions/admin-kpi/index.ts`

`Promise.all` dizisine 14 yeni `safe(supabase.from(...).select("*"))` çağrısı eklenir. Çok satırlı olanlarda anlamlı sıralama:

- `v_kpi_farmer_gmv` → `.order("month", { ascending: true })`
- `v_kpi_farmer_retention` → `.order("cohort_month", { ascending: true })`
- `v_kpi_buyer_gmv_retention` → `.order("cohort_month", { ascending: true })`
- `v_kpi_buyer_aov_segment`, `v_kpi_buyer_seller_ratio`, `v_kpi_price_vs_market` → default sıra
- Tek satırlı 8 view → filtresiz `select("*")`

Response JSON'a eklenecek yeni key'ler (view adı → key):

```
farmer_activation, listing_offer_rate, farmer_sellthrough, farmer_verified_pct,
buyer_activation, horeca_order_frequency, supply_density, offer_conversion,
farmer_gmv, farmer_retention, buyer_aov_segment, buyer_gmv_retention,
buyer_seller_ratio, price_vs_market
```

Tek satırlı özet view'lar için edge function düzeyinde `?.[0] ?? null` ile ilk satır çıkarılıp döner (frontend'de tekrar `.[0]` gerekmesin). Çok satırlı olanlar array olarak döner. Hata → `safe()` `null` yutar.

## 2) Frontend: `src/routes/admin.kpi.tsx`

Mevcut 6 bölüm "Genel" sekmesinde kalır; üstte 4 sekmeli basit tab bar eklenir:

```
[ Genel | Çiftçi | Alıcı | Platform ]
```

`useState<"genel"|"ciftci"|"alici"|"platform">("genel")` ile geçiş. Aktif sekme sadece kendi bölümlerini render eder (koşullu render, hepsini DOM'da tutmaya gerek yok).

TAM kolon adları birebir kullanılacak — önceki `gmv` bug'ı tekrarlanmayacak.

### Çiftçi sekmesi
- 4 `StatCard`:
  - Aktivasyon: `farmer_activation.median_hours_to_first_listing` sa + `pct_listing_within_7d` %
  - İlan→Teklif: `listing_offer_rate.offer_rate_14d_pct` % + `median_hours_to_first_offer` sa
  - Sell-through 30g: `farmer_sellthrough.sellthrough_30d_pct` %
  - Doğrulanmış üretici: `farmer_verified_pct.verified_pct` % (`verified_active_farmer_count`/`active_farmer_count`)
- `SectionCard` "Aylık GMV / Aktif Çiftçi" → `LineChart` (X: `month`, Y: `gmv_per_active_farmer`, ₺ ekseni)
- `SectionCard` "Kohort Retention (M1/M3)" → basit tablo (`cohort_month`, `cohort_farmers`, `m1_retention_pct`, `m3_retention_pct`)

### Alıcı sekmesi
- 3 `StatCard`:
  - Aktivasyon medyan gün: `buyer_activation.median_days_to_first_order`
  - HoReCa haftalık sıklık: `horeca_order_frequency.median_weekly_order_frequency` (alt satırda avg)
  - HoReCa 2+ siparişli alıcı sayısı: `horeca_order_frequency.horeca_buyers_with_2plus_orders`
- `SectionCard` "Segment AOV" → `BarChart` (`buyer_aov_segment.filter(r => r.segment !== 'genel')`, mevcut `SEGMENT_LABELS`, Y: `aov`, ₺)
- `SectionCard` "M0→M1 GMV Retention" → tablo (`cohort_month`, `cohort_buyers`, `m0_gmv_total`, `m1_gmv_total`, `m1_gmv_retention_pct`)

### Platform sekmesi
- 3 `StatCard`:
  - Teklif→Sipariş: `offer_conversion.conversion_pct` % + `median_hours_offer_to_order` sa
  - Tedarik yoğunluğu (il×ürün): `supply_density.dense_cell_pct` % (`dense_cells`/`total_cells`)
  - Toplam teklif: `offer_conversion.total_offers`
- `SectionCard` "Alıcı:Satıcı Oranı (il)" → `BarChart` (`buyer_seller_ratio.filter(r => r.region !== 'genel')`, Y: `buyer_to_seller_ratio`)
- `SectionCard` "Hal Fiyatı Karşılaştırması" → tablo (`crop`, `month`, `hasat_avg_price`, `market_avg_price`, `price_diff_pct`). Boşsa özel not: "Henüz veri yok — yalnızca İzmir pilot ürünlerinde (domates/elma/patates) satır oluşur."

Tüm array/null durumları için mevcut `EmptyState`. `SEGMENT_LABELS` yeniden kullanılır. `₺` biçimlendirme `formatTRY`, `%` için mevcut `fmtPct`.

## 3) Doğrulama

- `supabase--deploy_edge_functions ["admin-kpi"]`
- Doğru `x-admin-key` ile `supabase--curl_edge_functions` GET
- Response body'sinden:
  - Tek satırlı 8 alanın (`farmer_activation`, `listing_offer_rate`, ...) obje olarak dolu geldiği gösterilir
  - Çok satırlı 6 alanın array uzunluğu + ilk satırı örnek olarak yapıştırılır (özellikle `farmer_gmv`, `farmer_retention`, `buyer_aov_segment`, `buyer_seller_ratio`)
  - `price_vs_market` boşsa boş array olarak raporlanır (bug değil)
- `bunx tsgo --noEmit` temiz

## Dokunulmayacaklar
Mevcut 6 view'a bağlı bölümler (Genel sekmesine taşınacak ama JSX değiştirilmeyecek), `x-admin-key` doğrulama, CORS, farmer/buyer route'ları, RLS, view tanımları.
