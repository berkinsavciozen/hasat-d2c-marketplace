
# Pricing System Overhaul

## Schema verification (confirmed against live DB)

- `listings.crop`, `listings.unit`, `listings.farmer_id` ✓
- `offers.listing_id`, `offers.farmer_id`, `offers.current_price`, `offers.payment_status` ✓
- `orders.offer_id` ✓ (join path for `order_id` in trigger)
- `crop_config.crop` (PK-ish text), `crop_config.display_name`, `harvest_window_start/end_month` ✓
- `price_feed` columns: `id, crop_name, price_per_kg, unit, source, recorded_at, recorded_by, source_type` — will be dropped
- Crop keys confirmed present: `domates`, `patates`, `elma`, `safran`, `safran_soğanı`, `lavanta`, `gül`. I'll also flag `gül` (Gül Yağlık, 5–6) as seasonal — please confirm inclusion.

## 1. Migration (single file)

### a) Drop legacy
```sql
DROP FUNCTION IF EXISTS public.get_price_feed_summary(text);
DROP TABLE IF EXISTS public.price_feed CASCADE;
```

### b) Extend crop_config
```sql
ALTER TABLE public.crop_config
  ADD COLUMN IF NOT EXISTS has_official_price_source boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS official_source_name text,
  ADD COLUMN IF NOT EXISTS price_window_type text NOT NULL DEFAULT 'rolling_30d'
    CHECK (price_window_type IN ('rolling_30d','rolling_365d')),
  ADD COLUMN IF NOT EXISTS is_seasonal_harvest boolean NOT NULL DEFAULT false;

UPDATE public.crop_config
  SET has_official_price_source = true, official_source_name = 'Hal Kayıt Sistemi (HKS)'
  WHERE crop IN ('domates','patates','elma');

UPDATE public.crop_config
  SET price_window_type = 'rolling_365d', is_seasonal_harvest = true
  WHERE crop IN ('safran','safran_soğanı','lavanta','gül');
```

### c) crop_requests
```sql
CREATE TABLE public.crop_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  crop_name_free_text text NOT NULL CHECK (char_length(btrim(crop_name_free_text)) BETWEEN 1 AND 100),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','added','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.crop_requests TO authenticated;
GRANT ALL ON public.crop_requests TO service_role;
ALTER TABLE public.crop_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insert" ON public.crop_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "own select" ON public.crop_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid());
```

### d) price_history
```sql
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop text NOT NULL REFERENCES public.crop_config(crop),
  source text NOT NULL CHECK (source IN ('order','hks')),
  price_per_unit numeric NOT NULL CHECK (price_per_unit > 0),
  unit text NOT NULL,
  region text,
  recorded_date date NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  farmer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_history_crop_date_idx ON public.price_history (crop, recorded_date DESC);
CREATE INDEX price_history_source_idx ON public.price_history (crop, source, recorded_date DESC);

GRANT SELECT ON public.price_history TO authenticated; -- filtered by RLS below
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Farmers can see only their own rows (personal history). Aggregate access is via RPC.
CREATE POLICY "own history" ON public.price_history FOR SELECT TO authenticated
  USING (farmer_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies → only service_role & SECURITY DEFINER trigger can write.
```

### e) Trigger — write `order` rows on payment
```sql
CREATE OR REPLACE FUNCTION public.record_order_price_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_crop text;
  v_unit text;
  v_region text;
  v_order_id uuid;
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    SELECT l.crop, l.unit::text INTO v_crop, v_unit
      FROM public.listings l WHERE l.id = NEW.listing_id;
    SELECT p.city INTO v_region FROM public.profiles p WHERE p.id = NEW.farmer_id;
    SELECT o.id INTO v_order_id FROM public.orders o WHERE o.offer_id = NEW.id;

    IF v_crop IS NOT NULL AND EXISTS (SELECT 1 FROM public.crop_config WHERE crop = v_crop) THEN
      INSERT INTO public.price_history (crop, source, price_per_unit, unit, region, recorded_date, order_id, farmer_id)
      VALUES (v_crop, 'order', COALESCE(NEW.current_price, NEW.price_per_unit),
              v_unit, v_region, current_date, v_order_id, NEW.farmer_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_record_order_price_history
  AFTER UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.record_order_price_history();
```
Fires independently of `enforce_offer_transitions` (BEFORE UPDATE) — no ordering conflict.

### f) RPC — get_price_history_summary
```sql
CREATE OR REPLACE FUNCTION public.get_price_history_summary(p_crop text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg record;
  v_days int;
  v_since date;
  v_hasat jsonb;
  v_official jsonb := NULL;
  v_avg numeric; v_std numeric; v_cnt int; v_last timestamptz;
BEGIN
  SELECT price_window_type, has_official_price_source, official_source_name
    INTO v_cfg FROM public.crop_config WHERE crop = p_crop;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('hasat_data', jsonb_build_object('insufficient_data', true),
                              'official_data', NULL, 'last_updated', NULL);
  END IF;

  v_days := CASE WHEN v_cfg.price_window_type = 'rolling_365d' THEN 365 ELSE 30 END;
  v_since := current_date - v_days;

  SELECT AVG(price_per_unit), STDDEV_SAMP(price_per_unit),
         COUNT(DISTINCT farmer_id), MAX(created_at)
    INTO v_avg, v_std, v_cnt, v_last
    FROM public.price_history
    WHERE crop = p_crop AND source = 'order' AND recorded_date >= v_since;

  IF COALESCE(v_cnt,0) < 5 THEN
    v_hasat := jsonb_build_object('insufficient_data', true,
                                  'distinct_farmer_count', COALESCE(v_cnt,0));
  ELSE
    v_hasat := jsonb_build_object('insufficient_data', false,
                                  'avg_price', v_avg,
                                  'stddev_price', COALESCE(v_std,0),
                                  'distinct_farmer_count', v_cnt);
  END IF;

  IF v_cfg.has_official_price_source THEN
    SELECT AVG(price_per_unit) INTO v_avg
      FROM public.price_history
      WHERE crop = p_crop AND source = 'hks' AND recorded_date >= v_since;
    IF v_avg IS NOT NULL THEN
      v_official := jsonb_build_object('avg_price', v_avg,
                                       'official_source_name', v_cfg.official_source_name);
    END IF;
  END IF;

  RETURN jsonb_build_object('hasat_data', v_hasat,
                            'official_data', v_official,
                            'last_updated', v_last);
END $$;

REVOKE ALL ON FUNCTION public.get_price_history_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_price_history_summary(text) TO anon, authenticated;
```

## 2. Code changes

- `src/lib/hasat/queries.ts`
  - Remove `usePriceFeedSummary`, `useCreatePriceFeedEntry`. Add `usePriceHistorySummary(crop)` calling the new RPC and returning `{ hasat, official, lastUpdated }`.
- `src/components/hasat/MarketDeviationAlert.tsx` — switch to `hasat` segment; same YÜKSEK/UYGUN/DÜŞÜK band logic; renders nothing when insufficient.
- `src/routes/farmer.prices.tsx` — rebuild:
  - Cards call `usePriceHistorySummary`.
  - Show Hasat band line (avg ± stddev) or "Yeterli veri yok".
  - When `official` present, second labeled line "Resmi Hal Fiyatı — Kaynak: Hal Kayıt Sistemi (HKS)" with the avg.
  - Remove the "Fiyat Ekle" FAB + `PriceUpdateSheet` entirely (no manual entry anymore).
- `src/lib/hasat/crop-config.ts` — extend `CropConfig` and `CropOption` with `has_official_price_source`, `official_source_name`, `price_window_type`, `is_seasonal_harvest`. Select `*` already picks them up.
- `src/components/hasat/CropChips.tsx` — render "🏛️" badge next to label when `has_official_price_source`.
- Crop request UI — add `CropRequestDialog` component. In `CropChips` (both variants) append a trailing chip "Ürününüzü bulamadınız mı? Talep edin" that opens the dialog; dialog inserts into `crop_requests` with `requested_by = auth.uid()`.
- `src/components/hasat/ai-chat/useAIChat.ts` — swap price_feed guardrail paragraph to reference `get_price_history_summary` / `price_history`, keep band-only rule; add sentence: never conflate Hasat community data with official HKS data.
- `supabase/functions/whatsapp-ai-webhook/index.ts` — same paragraph swap.
- `src/lib/mcp/tools/*` — scan for `price_feed` references; none expected but will grep and remove any.
- `supabase/config.toml` — unchanged.

## 3. Verification

- Run `tsgo --noEmit` at the end.
- Confirm no remaining references: `rg "price_feed|usePriceFeedSummary|get_price_feed_summary|PriceUpdateSheet"`.

## Open confirmation

Adding `gül` (Gül Yağlık, May–Jun window) to the seasonal/365d list. If you'd rather leave it at defaults, say so and I'll drop it before running the migration.
