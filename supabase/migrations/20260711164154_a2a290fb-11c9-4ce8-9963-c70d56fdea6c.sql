CREATE OR REPLACE FUNCTION public.create_draft_listings_for_parcel(_farmer_id uuid, _parcel_id uuid, _crops text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c text;
  seed_price numeric;
  summary jsonb;
  hasat jsonb;
BEGIN
  IF _crops IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY _crops LOOP
    IF c IS NULL OR btrim(c) = '' THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.listings
      WHERE farmer_id = _farmer_id AND parcel_id = _parcel_id AND crop = c
    ) THEN CONTINUE; END IF;

    seed_price := 0;
    BEGIN
      summary := public.get_price_history_summary(c);
      hasat := summary->'hasat_data';
      IF hasat IS NOT NULL
         AND COALESCE((hasat->>'insufficient_data')::boolean, true) = false THEN
        seed_price := COALESCE((hasat->>'avg_price')::numeric, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      seed_price := 0;
    END;

    INSERT INTO public.listings
      (farmer_id, parcel_id, crop, quantity, unit, price_per_unit, min_order, quality, status)
    VALUES
      (_farmer_id, _parcel_id, c, 0, 'g', seed_price, 10, 'A', 'draft');
  END LOOP;
END $function$;