
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS batch_name text;

CREATE OR REPLACE FUNCTION public.tg_harvest_entries_after_insert_autolink()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  match_count int;
  only_listing_id uuid;
BEGIN
  IF NEW.parcel_id IS NULL THEN RETURN NEW; END IF;

  SELECT count(*), min(l.id)
    INTO match_count, only_listing_id
    FROM public.listings l
    WHERE l.farmer_id = NEW.farmer_id
      AND l.parcel_id = NEW.parcel_id
      AND l.crop = NEW.crop
      AND l.status IN ('draft','active');

  IF match_count = 1 THEN
    INSERT INTO public.listing_harvest_entries (listing_id, harvest_entry_id)
    VALUES (only_listing_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;
