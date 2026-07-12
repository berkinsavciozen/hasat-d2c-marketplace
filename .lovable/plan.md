## Items 1–4 (confirmed bugs — implement directly)

### 1. `get_price_history_summary()` case-insensitive fix
Migration rewriting the function. Resolve the canonical crop key first, then use it everywhere:

```sql
CREATE OR REPLACE FUNCTION public.get_price_history_summary(p_crop text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_canonical text;
  v_cfg record;
  v_days int; v_since date;
  v_hasat jsonb; v_official jsonb := NULL;
  v_avg numeric; v_std numeric; v_cnt int; v_last timestamptz;
BEGIN
  SELECT crop INTO v_canonical FROM public.crop_config
    WHERE lower(crop) = lower(p_crop) LIMIT 1;
  IF v_canonical IS NULL THEN
    RETURN jsonb_build_object('hasat_data', jsonb_build_object('insufficient_data', true),
                              'official_data', NULL, 'last_updated', NULL);
  END IF;
  SELECT price_window_type, has_official_price_source, official_source_name
    INTO v_cfg FROM public.crop_config WHERE crop = v_canonical;
  v_days := CASE WHEN v_cfg.price_window_type = 'rolling_365d' THEN 365 ELSE 30 END;
  v_since := current_date - v_days;

  SELECT AVG(price_per_unit), STDDEV_SAMP(price_per_unit),
         COUNT(DISTINCT farmer_id), MAX(created_at)
    INTO v_avg, v_std, v_cnt, v_last
    FROM public.price_history
    WHERE crop = v_canonical AND source = 'order' AND recorded_date >= v_since;

  IF COALESCE(v_cnt,0) < 5 THEN
    v_hasat := jsonb_build_object('insufficient_data', true,
                                  'distinct_farmer_count', COALESCE(v_cnt,0));
  ELSE
    v_hasat := jsonb_build_object('insufficient_data', false,
      'avg_price', v_avg, 'stddev_price', COALESCE(v_std,0),
      'distinct_farmer_count', v_cnt);
  END IF;

  IF v_cfg.has_official_price_source THEN
    SELECT AVG(price_per_unit) INTO v_avg
      FROM public.price_history
      WHERE crop = v_canonical AND source = 'hks' AND recorded_date >= v_since;
    IF v_avg IS NOT NULL THEN
      v_official := jsonb_build_object('avg_price', v_avg,
                                       'official_source_name', v_cfg.official_source_name);
    END IF;
  END IF;

  RETURN jsonb_build_object('hasat_data', v_hasat,
                            'official_data', v_official,
                            'last_updated', v_last);
END $$;
```

Verify by calling with `'Domates'` and `'domates'` → identical output.

### 2. Prices page → global + shared by both roles
- Add a query `useCropsWithPriceData()` returning `distinct listings.crop where status='active'` ∪ `crop_config.crop where has_official_price_source=true`, normalized to canonical (lowercased) then de-duplicated.
- Refactor `farmer.prices.tsx` to use this list and extract the page body + `PriceSummaryCard` into a shared component `src/components/hasat/PricesPageBody.tsx`.
- Create `src/routes/buyer.prices.tsx` mounting the same body with a `BuyerHeader`.
- Add a "Fiyatlar" nav entry to the buyer shell (`src/routes/buyer.tsx` — desktop sidebar + mobile "Daha" sheet).

### 3. Public farmer name leak-safe join
Replace embed joins with a two-step fetch through `public_farmer_profiles`:
- In `useActiveListings()` and `useListing()`: drop the `profiles!listings_farmer_id_fkey` embed; after fetching listings, `SELECT id,name,city FROM public_farmer_profiles WHERE id IN (…)`; merge into a synthetic `profiles` field before `dbToActiveListing`.
- Audit: `s.$slug.tsx` already uses `public_farmer_profiles` (safe). `useBuyerOffers` embeds `farmer:profiles!offers_farmer_id_fkey(...,iban,bank_account_name)` — that path only returns offers the buyer already has, so the narrow RLS policies cover it; **leave unchanged** (also needed for IBAN on paid offers). Same for `useBuyerOrders` (order exists → RLS allows). No other public/anonymous-facing farmer joins found.

### 4. Photo buckets
Call `supabase--storage_update_bucket` on `parcel-photos` and `listing-photos` with `public=true`. Spot-check one existing `parcel.photo_urls[0]` and one `listing.photo_urls[0]` load 200 after the flip.

Migration + code edits + `tsgo --noEmit` at the end.

---

## Item 5 (investigate before building — proposal below)

### Findings

**`buyer.messages` — genuinely empty (stub).** Route is a "yakında" placeholder. Real per-offer chat already works elsewhere via `<NegotiationThread offerId=…>` embedded inside `buyer.orders.tsx` (row expand) and `buyer.negotiation.$offerId.tsx`. No dedicated inbox exists. Data layer (`offer_messages` + realtime) works.

**`buyer.reports` — data works, UI is thin.** `useBuyerAnalytics()` fetches orders (any status except cancelled) with `offer.quantity * offer.price_per_unit`. Two data-quality caveats worth fixing:
- Includes `sent`/`accepted` offers before payment → "Toplam Harcama" overstates. Should filter `status IN ('preparing','shipped','delivered','completed')` (or key off `offer.payment_status='paid'`).
- Uses `offer.price_per_unit` not `current_price` — after negotiated counter-offers the accepted price is `current_price`. Should `COALESCE(current_price, price_per_unit)`.

Otherwise the page renders correctly; the redesign is UI/structure.

**`buyer.subscriptions` — data works, UX minimal.** `useMySubscriptions` / `useCancelSubscription` function correctly. `useCreateSubscription` is wired from `buyer.subscription.$producerId.tsx`. No dedicated realtime channel, but subscription state is buyer-controlled so it's fine.

### Proposed redesigns (visual/structural; no data-layer changes except the two reports fixes)

**Messages — "Görüşmeler" inbox.** New list view aggregating all offers the buyer has active negotiation on (`useBuyerOffers` already returns them + farmer + listing). Each row: farmer name/city, crop, last message preview + timestamp (last `offer_messages` for that offer, plus current offer status pill), unread dot from an existing timestamp comparison. Tapping a row → existing `/buyer/negotiation/$offerId`. Empty state directs to Keşfet. Trust framing: header microcopy "Doğrudan üreticiyle görüşme — Hasat aracı değil, taraf değil."

**Raporlar — trust-oriented supply diary.** Sections:
1. KPIs (paid-only): Toplam Harcama, Tamamlanan Sipariş, Aktif Üretici Sayısı, Ortalama Tedarik Süresi.
2. Existing 6-month bar chart, restricted to paid orders and using `current_price`.
3. New "Ürün kırılımı" horizontal bar (spend per crop) — reuses existing `cropTotals`.
4. New "Tedarikçi güveni" list — per farmer: order count, on-time %, last order date. Aggregated client-side from existing `useBuyerOrders`/`useBuyerAnalytics` data; no new queries.
5. Existing order list moves to bottom as "Son siparişler".
6. Export CSV button (client-side blob; useful for restoran/otel/ihracatçı personas).

**Abonelikler — "Sürekli tedarik".** Keep the current cards but:
- Header explainer chip: "Rezerve edilmiş hasat — üretici bu miktarı size ayırır."
- Card additions (all from existing schema): next_harvest_date, estimated_qty, locked_at date, since (created_at), "Bu ay ne bekleniyor?" microline computed from `next_harvest_date`.
- Status pills for `paused`/`completed` (currently only handles `active` vs "İptal"); enum already supports them.
- Empty state gets a persona-neutral CTA ("Restoranınız, oteliniz veya evinize düzenli teslimat için…").
- No mutation changes; `useCancelSubscription` flow untouched.

### Files touched (item 5, when approved)
- `src/routes/buyer.messages.tsx` — replace stub with inbox.
- `src/routes/buyer.reports.tsx` — restructure + apply the two `useBuyerAnalytics` correctness fixes (paid-only filter + `current_price` fallback in the hook).
- `src/routes/buyer.subscriptions.tsx` — expanded cards + explainer.
- `src/lib/hasat/queries.ts` — small helper: `useBuyerConversations()` (derived from `useBuyerOffers` + last-message join on `offer_messages`); adjust `useBuyerAnalytics` return shape.

No RLS or schema changes for item 5.

---

## Order of work
1. Items 1–4 as one batch: migration for #1, storage-tool calls for #4, code edits for #2/#3, then `tsgo --noEmit`.
2. Pause for approval on item 5 redesigns, then implement.
