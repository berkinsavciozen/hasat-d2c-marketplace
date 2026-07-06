CREATE POLICY "Public read entries linked to a listing"
ON public.harvest_entries
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.listing_harvest_entries lhe
    JOIN public.listings l ON l.id = lhe.listing_id
    WHERE lhe.harvest_entry_id = harvest_entries.id
      AND l.status IN ('active','sold')
  )
);

GRANT SELECT ON public.harvest_entries TO anon;

CREATE OR REPLACE FUNCTION public.enforce_harvest_date_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.harvest_date IS DISTINCT FROM OLD.harvest_date THEN
    IF EXISTS (
      SELECT 1
      FROM public.listing_harvest_entries lhe
      JOIN public.listings l ON l.id = lhe.listing_id
      WHERE lhe.harvest_entry_id = NEW.id
        AND l.status IN ('active','sold')
    ) THEN
      RAISE EXCEPTION 'Aktif veya satılmış bir ürüne bağlı hasadın olay tarihi değiştirilemez';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_harvest_date_lock() FROM PUBLIC, anon, authenticated;