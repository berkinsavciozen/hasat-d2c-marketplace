
CREATE OR REPLACE FUNCTION public.record_order_price_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_listing_crop text;
  v_canonical_crop text;
  v_unit text;
  v_region text;
  v_order_id uuid;
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    SELECT l.crop, l.unit::text INTO v_listing_crop, v_unit
      FROM public.listings l WHERE l.id = NEW.listing_id;

    IF v_listing_crop IS NULL THEN
      RETURN NEW;
    END IF;

    -- Case-insensitive lookup: listings.crop is display-cased, crop_config.crop is canonical (lowercase).
    SELECT cc.crop INTO v_canonical_crop
      FROM public.crop_config cc
      WHERE lower(cc.crop) = lower(v_listing_crop)
      LIMIT 1;

    IF v_canonical_crop IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT p.city INTO v_region FROM public.profiles p WHERE p.id = NEW.farmer_id;
    SELECT o.id INTO v_order_id FROM public.orders o WHERE o.offer_id = NEW.id;

    INSERT INTO public.price_history (crop, source, price_per_unit, unit, region, recorded_date, order_id, farmer_id)
    VALUES (v_canonical_crop, 'order', COALESCE(NEW.current_price, NEW.price_per_unit),
            v_unit, v_region, current_date, v_order_id, NEW.farmer_id);
  END IF;
  RETURN NEW;
END $$;
