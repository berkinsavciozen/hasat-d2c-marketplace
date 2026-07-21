# Admin KPI Dashboard Planı

Kurucu-only iç araç. Mevcut farmer/buyer akışlarına, RLS'ye ve view tanımlarına dokunulmaz.

## 1) Secret
- `ADMIN_DASHBOARD_KEY` = `Xu1qlPBdOySu8dNjy22-mUi5-zAdfGyHZBBD65NZyQw` olarak Supabase secret'larına eklenir (`secrets--set_secret`).

## 2) Edge Function: `admin-kpi`
- Yeni `supabase/functions/admin-kpi/index.ts` + `supabase/config.toml`'a `verify_jwt = false` girişi.
- Service role client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env'den).
- `x-admin-key` header'ı `Deno.env.get("ADMIN_DASHBOARD_KEY")` ile karşılaştırılır (timing-safe); yoksa/hatalıysa 401.
- CORS: `*` origin, `x-admin-key, content-type` header'ları, `GET, OPTIONS` metodları. OPTIONS için 204.
- Tüm view'lar paralel `Promise.all` ile sorgulanır:
  - `v_kpi_north_star` → month asc
  - `v_kpi_dispute_rate` → month asc
  - `v_kpi_full_acceptance_rate` → month asc
  - `v_kpi_buyer_repeat_rate`
  - `v_kpi_review_avg` → `.is('reviewee_id', null)` filtre
  - `v_kpi_order_base` → `.eq('is_realized_sale', true)` → JS'te count + `sum(gmv)` reduce (all-time totals)
- Response şekli:
  ```json
  {
    "north_star": [...],
    "dispute_rate": [...],
    "full_acceptance_rate": [...],
    "buyer_repeat_rate": [...],
    "review_avg": [...],
    "totals": { "order_count": n, "total_gmv": n }
  }
  ```
- Herhangi bir view sorgusu hata verirse ilgili alan `null` döner (dashboard kısmi göster); üst hata olursa 500 + `{ error }`.
- Deploy: `supabase--deploy_edge_functions ["admin-kpi"]`.

## 3) Frontend: `/admin/kpi`
Yeni dosya `src/routes/admin.kpi.tsx` (TanStack Start flat route).

- `__root` altında ama farmer/buyer shell'inin dışında; hiçbir nav/menüye eklenmez.
- `head()`: title "Admin KPI", `robots: noindex`.
- State: `key` (string), `submittedKey` (string | null). localStorage/sessionStorage yok.
- Form: tek `<input type="password">` + "Gir" butonu → `setSubmittedKey(key)`.
- Fetch: `submittedKey` set olunca `useQuery(['admin-kpi', submittedKey], …)`:
  - `supabase.functions.invoke("admin-kpi", { headers: { "x-admin-key": submittedKey }, method: "GET" })`; 401 gelirse toast "Hatalı anahtar" + `setSubmittedKey(null)`.
- Render (başarılıysa):
  a. 3 büyük KPI kartı (`StatCard`): Toplam GMV (`totals.total_gmv`, `formatTRY`), Bu ayki ihtilafsız pay %, Bu ayki tam kabul %. "Bu ay" = sıralı dizideki son satır.
  b. North Star trend: recharts `LineChart` — X: month, iki `Line` (`total_gmv`, `dispute_free_gmv`, ₺ ekseni).
  c. Dispute & Full acceptance: tek `LineChart`, ay bazında iki `Line` (`dispute_rate_pct`, `full_acceptance_rate_pct`, % ekseni 0-100).
  d. Buyer repeat rate: `BarChart` — segment adı TR sözlüğüyle map (`bireysel/restoran/otel/organik_market/ihracatçı/genel`), Y ekseninde `repeat_buyer_rate_pct`.
  e. Review avg: `SectionCard` içinde küçük kart listesi — role TR ("Çiftçi"/"Alıcı"/"Genel"), `avg_rating` (1 desimal) + `review_count`.
- Boş dizi/`null` alanlarda "Henüz veri yok" placeholder; grafik render edilmez.
- `recharts` zaten shadcn ile yüklü; ek paket yok.

## 4) Doğrulama
- `bunx tsgo --noEmit` temiz.
- `supabase--curl_edge_functions` ile hem yanlış hem doğru `x-admin-key` denenir (401 vs 200 doğrulanır).

## Dokunulmayacaklar
Mevcut farmer/buyer route'ları, navigasyon, RLS, `v_kpi_*` view tanımları, diğer edge function'lar.
