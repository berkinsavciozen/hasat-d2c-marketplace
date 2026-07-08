
-- Ensure parcel_id FK sets null on parcel delete
ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_parcel_id_fkey;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_parcel_id_fkey
    FOREIGN KEY (parcel_id) REFERENCES public.parcels(id) ON DELETE SET NULL;

-- Helper: create draft listings for a set of crops on a parcel
CREATE OR REPLACE FUNCTION public.create_draft_listings_for_parcel(
  _farmer_id uuid, _parcel_id uuid, _crops text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c text;
  seed_price numeric;
BEGIN
  IF _crops IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY _crops LOOP
    IF c IS NULL OR btrim(c) = '' THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.listings
      WHERE farmer_id = _farmer_id AND parcel_id = _parcel_id AND crop = c
    ) THEN CONTINUE; END IF;
    seed_price := COALESCE(
      (SELECT price_per_kg FROM public.price_feed
        WHERE crop_name = c ORDER BY recorded_at DESC LIMIT 1),
      0
    );
    INSERT INTO public.listings
      (farmer_id, parcel_id, crop, quantity, unit, price_per_unit, min_order, quality, status)
    VALUES
      (_farmer_id, _parcel_id, c, 0, 'g', seed_price, 10, 'A', 'draft');
  END LOOP;
END $$;

-- Restrict execution: only the trigger owner (postgres) needs this
REVOKE ALL ON FUNCTION public.create_draft_listings_for_parcel(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;

-- Trigger: parcel INSERT
CREATE OR REPLACE FUNCTION public.tg_parcels_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.create_draft_listings_for_parcel(NEW.farmer_id, NEW.id, NEW.crops);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_parcels_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS parcels_after_insert_create_drafts ON public.parcels;
CREATE TRIGGER parcels_after_insert_create_drafts
  AFTER INSERT ON public.parcels
  FOR EACH ROW EXECUTE FUNCTION public.tg_parcels_after_insert();

-- Trigger: parcel UPDATE (only newly-added crops)
CREATE OR REPLACE FUNCTION public.tg_parcels_after_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE added text[];
BEGIN
  IF NEW.crops IS DISTINCT FROM OLD.crops THEN
    SELECT ARRAY(
      SELECT unnest(COALESCE(NEW.crops, ARRAY[]::text[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.crops, ARRAY[]::text[]))
    ) INTO added;
    PERFORM public.create_draft_listings_for_parcel(NEW.farmer_id, NEW.id, added);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_parcels_after_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS parcels_after_update_create_drafts ON public.parcels;
CREATE TRIGGER parcels_after_update_create_drafts
  AFTER UPDATE ON public.parcels
  FOR EACH ROW EXECUTE FUNCTION public.tg_parcels_after_update();

-- Trigger: harvest_entries INSERT → auto-link
CREATE OR REPLACE FUNCTION public.tg_harvest_entries_after_insert_autolink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parcel_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.listing_harvest_entries (listing_id, harvest_entry_id)
  SELECT l.id, NEW.id
    FROM public.listings l
    WHERE l.farmer_id = NEW.farmer_id
      AND l.parcel_id = NEW.parcel_id
      AND l.crop = NEW.crop
      AND l.status IN ('draft','active')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_harvest_entries_after_insert_autolink() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS harvest_entries_after_insert_autolink ON public.harvest_entries;
CREATE TRIGGER harvest_entries_after_insert_autolink
  AFTER INSERT ON public.harvest_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_harvest_entries_after_insert_autolink();

-- Backfill draft listings for existing parcels
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, farmer_id, crops FROM public.parcels LOOP
    PERFORM public.create_draft_listings_for_parcel(r.farmer_id, r.id, r.crops);
  END LOOP;
END $$;

-- Backfill harvest entry links to matching listings
INSERT INTO public.listing_harvest_entries (listing_id, harvest_entry_id)
SELECT l.id, h.id
  FROM public.harvest_entries h
  JOIN public.listings l
    ON l.farmer_id = h.farmer_id
   AND l.parcel_id = h.parcel_id
   AND l.crop = h.crop
   AND l.status IN ('draft','active')
 WHERE h.parcel_id IS NOT NULL
ON CONFLICT DO NOTHING;
