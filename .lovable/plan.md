# Fiyatlar (Hal + Hasat ortalama satış) — Denetim Raporu / Gemini Brief

Aşağıdaki metin, fiyat veri katmanını devralacak Gemini'ye olduğu gibi iletilmek üzere hazırlandı. Bu turda hiçbir dosya veya veritabanı değişikliği yapılmadı; tüm bulgular canlı Supabase projesinden (`efuqpiaavrzimvstpdpm`) ve repodan okunarak doğrulandı.

---

## PROMPT FOR GEMINI — Hasat Price Data Layer Ownership

You own the pricing data domain of Hasat (TanStack Start + Supabase, project ref `efuqpiaavrzimvstpdpm`). Below is a verified audit of the current state. Every claim was checked against the live database or repo on 2026-09-15.

### 1. Product surface

- `/farmer/prices` and `/buyer/prices` — `src/routes/farmer.prices.index.tsx`, `src/routes/buyer.prices.index.tsx`, both render `src/components/hasat/PricesPageBody.tsx` (tiered list: own crops, watchlist, all market; per-crop summary chips).
- `/farmer/prices/$crop`, `/buyer/prices/$crop` — render `src/components/hasat/CropDetailBody.tsx` (3m/6m/1y tabs, one card per source, `PriceChart.tsx` sparkline).
- `src/components/hasat/MarketDeviationAlert.tsx` — compares a farmer's listing price to the Hasat band.
- AI: `src/components/hasat/ai-chat/useAIChat.ts` and `supabase/functions/whatsapp-ai-webhook/index.ts` embed an identical Turkish system-prompt clause forbidding a recommended number, requiring HIGH/OK/LOW band language, and requiring official (HKS) data to be reported separately from community data.

### 2. Data layer (live, verified)

Tables in `public`:
- `price_history(id, crop, source, price_per_unit, unit, region, recorded_date, order_id, farmer_id, market_source_code, created_at)` — RLS on; only policy is SELECT `farmer_id = auth.uid()`. All aggregate reads go through SECURITY DEFINER RPCs.
- `crop_config(crop, display_name, default_unit, has_official_price_source, official_source_name, price_window_type, price_benchmark_source, ...)` — 70 rows, public read. `crop` is the canonical lowercase slug and the join key everywhere.
- `market_sources(code, display_name, region, created_at)` — **1 row: `izmir_hal` / "İzmir Toptancı Hali" / İzmir**.
- `crop_market_sources(crop, source_code)` — 29 rows, 29 crops, all pointing at `izmir_hal`.
- `price_alerts(farmer_id, crop, target_price, condition, channels, active)` — 3 rows.
- `price_points(crop, hal_price, d2c_price, export_price, delta_7d, recorded_date)` — 5 rows, legacy.

RPCs (both SECURITY DEFINER, EXECUTE granted to `anon`, `authenticated`, `service_role`):
- `get_price_history_summary(p_crop text)` → `{ hasat_data, official_data, market_sources[], last_updated, unit }`. Hasat segment = AVG/STDDEV/COUNT(DISTINCT farmer_id) over `source='order'` inside a 30d or 365d window from `crop_config.price_window_type`, suppressed when fewer than 5 distinct farmers. Official segment = AVG over `source='hks'` only when `has_official_price_source`. Market segment = per `crop_market_sources` code, AVG over rows matching `market_source_code`.
- `get_price_history_series(p_crop, p_weeks)` → weekly averages, `hasat_series` (same 5-farmer gate per week), `official_series`, `market_series`.

Write path:
- Trigger function `record_order_price_history()` inserts one `source='order'` row when an offer flips to `payment_status='paid'`, mapping `listings.crop` to the canonical slug case-insensitively, stamping `region` from the farmer's `profiles.city`.
- `source='external'` rows are written by the deployed edge function `sync-izmir-hal-prices`, invoked by pg_cron job `sync-izmir-hal-prices-daily` (`0 6 * * *`).

Current row counts in `price_history`:
- `source='order'`: 133 rows, 6 crops, 10 distinct farmers, 2024-06-23 → 2026-08-26.
- `source='external'`: 694 rows, 27 crops, all `market_source_code='izmir_hal'`, 2026-07-01 → 2026-09-15 (fresh).
- `source='hks'`: **0 rows**.

### 3. Confirmed defects and gaps — ordered by impact

1. **The "Hal fiyatı" promise is not delivered by the official channel.** `crop_config.has_official_price_source = true` for exactly 3 crops (domates, elma, patates) with `official_source_name = 'Hal Kayıt Sistemi (HKS)'`, but no `source='hks'` row has ever been written and no ingestion job for HKS exists. `official_data` is therefore always `NULL`; the "Resmi Hal Fiyatı" card in `CropDetailBody.tsx` never renders. The only real market-hall data is the İzmir wholesale scrape stored under `source='external'`.
2. **`sync-izmir-hal-prices` has no source code in the repo.** `supabase/functions/` contains 33 functions; this is not one of them. The only live market-price ingestion path is unversioned, unreviewable and unreproducible — highest priority to recover, commit, and cover with a scheduled-run health check.
3. **Migration drift on both price RPCs.** The repo migrations (`20260712171252_*.sql` for summary, `20260720135409_*.sql` for series) predate the live definitions: they lack `market_sources` / `market_series`, `unit`, and the `crop_market_sources` join. A replay from `supabase/migrations` onto a fresh environment would silently downgrade the API and break `PricesPageBody.tsx` and `CropDetailBody.tsx`, which both read those fields. Backfill a migration matching the live source exactly, do not re-derive.
4. **Single-source, single-region coverage.** 1 market source, 1 region (İzmir), 29 of 70 crops mapped. Every non-İzmir farmer sees İzmir prices labelled by region but with no local alternative, and 41 crops have no market source at all.
5. **No min/max/quality/volume dimension.** `price_history` stores a single `price_per_unit` with no min/max, no quality class, no traded volume, no source publication date distinct from `recorded_date`, and no per-row source attribution beyond `market_source_code`. The product's transparency requirement (min/max/average, class, unit, publication date, last-sync time, source) cannot currently be satisfied from this schema.
6. **Hasat community coverage is thin and effectively invisible.** Order-derived data exists for 6 crops and 10 farmers total; the 5-distinct-farmer gate means most crops show "yetersiz veri". The gate is correct for competition-law reasons and must stay — but the sparse coverage should be surfaced honestly rather than read as a bug.
7. **`last_updated` is misleading.** `get_price_history_summary` returns a single `last_updated` derived only from `MAX(created_at)` of the Hasat order segment. Official and market segments carry no per-source freshness in the summary payload (`market_sources` computes a `last_updated` in the subquery but does not return it to the client). The UI cannot therefore show "source + last updated" per price, which the product requires.
8. **`price_alerts` is a dead backend.** No database function, trigger, or cron references `price_alerts`. The UI (`WatchStar` / `BigWatchStar`) uses it purely as a watchlist and writes `target_price = 0`, `condition = 'above'`. Either build the evaluation/dispatch path or rename the concept to a watchlist.
9. **Legacy `price_points` is still readable and still queried.** `usePricePoints()` in `src/lib/hasat/queries.ts` reads 5 stale rows with `hal_price` / `d2c_price` / `export_price`. It is superseded by `price_history` and should be retired to avoid two contradictory notions of "hal price".
10. **Crop discovery is indirect.** `useCropsWithPriceData()` builds its list from active `listings` plus crops flagged `has_official_price_source` — it never consults `crop_market_sources`. Crops that have real İzmir hall prices but no active listing do not appear on the Fiyatlar page.
11. **Region on order rows is the farmer's profile city**, not the transaction location, and there is no region dimension in any aggregate. Regional price comparison is not currently possible.
12. **`source` is a free-text column** with three in-use values (`order`, `hks`, `external`) and no CHECK constraint or enum; nothing prevents a fourth value from silently bypassing every aggregate.

### 4. Invariants you must preserve

- Never merge Hasat community averages with official or market-hall prices into a single number, in any RPC, UI, or AI reply.
- Keep the 5-distinct-farmer suppression on every Hasat aggregate (summary and per-week series); it is a competition-law control, not a UX choice.
- Never expose raw `price_history` rows to other users; keep aggregate access behind SECURITY DEFINER RPCs.
- Never display an estimated, modelled, or derived-and-unlabelled price. Absent data must render as an explicit "veri yok / yeterli veri yok" state.
- Keep listing price, offer price, accepted-offer price, and completed-sale price conceptually distinct; only paid orders may enter the Hasat average.
- `crop_config.crop` (lowercase slug) is the single source of truth for crop identity; `listings.crop` is display-cased and must always be matched case-insensitively.

### 5. Recommended work order

1. Recover `sync-izmir-hal-prices` into the repo, add structured sync logging (rows written, source publication date, failures), and alert on a missed daily run.
2. Backfill migrations that match the live definitions of both RPCs exactly, so repo and production converge.
3. Decide the HKS question: either build a real HKS ingestion writing `source='hks'`, or clear `has_official_price_source` on the three crops and drop the "Resmi Hal Fiyatı" concept until it is real.
4. Extend `price_history` (or add a sibling market-price table) with min/max, quality class, traded volume, source publication date, and sync timestamp; extend both RPCs to return per-source `last_updated` and source attribution.
5. Add market sources for other halls/regions, expand `crop_market_sources` coverage past 29 crops, and make `useCropsWithPriceData()` include crops with market-source coverage.
6. Constrain `source` with an enum/CHECK, retire `price_points` and `usePricePoints()`.
7. Resolve `price_alerts`: implement evaluation + dispatch, or rename it to a watchlist in schema and UI.

---

## Bu adımları ben uygulayabilir miyim?

Kendim uygulayabileceklerim (onay verirsen):

- **2 — Migration drift**: canlı RPC tanımlarını birebir migration olarak repoya yazabilirim.
- **4 — Şema genişletme**: min/max, kalite sınıfı, hacim, kaynak yayın tarihi, senkron zamanı alanları + RPC'lerin kaynak bazlı `last_updated` döndürmesi.
- **5 — Kapsam**: yeni hal/bölge kaynakları ve ürün eşleşmeleri ekleyebilir, `useCropsWithPriceData()`'yı market kaynağı olan ürünleri de içerecek şekilde düzeltebilirim (ham fiyat verisini ben üretemem; ingestion gerekir).
- **6 — `source` kısıtı + `price_points`/`usePricePoints()` emekliye ayırma.**
- **7 — `price_alerts`**: ya gerçek değerlendirme + bildirim akışını kurarım, ya da izleme listesi olarak yeniden adlandırırım.
- **3'ün bir yarısı**: HKS gerçek değilse `has_official_price_source` bayraklarını temizleyip "Resmi Hal Fiyatı" kartını kaldırabilirim.

Tek başıma tamamlayamayacaklarım:

- **1 — `sync-izmir-hal-prices`**: canlıda çalışan bu fonksiyonun kaynak kodunu indirme imkânım yok. Kodu bana verirsen repoya alır, loglama ve sağlık kontrolünü eklerim; yoksa aynı işi yapan yeni bir senkron servisi sıfırdan yazmam gerekir (veri kaynağının adresi/erişim şekli sizden gelmeli).
- **3'ün diğer yarısı — gerçek HKS entegrasyonu**: resmi kaynağın erişim yöntemi ve varsa kimlik bilgileri olmadan yapılamaz.
