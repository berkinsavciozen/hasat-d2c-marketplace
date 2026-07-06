-- Lifecycle step tagging for harvest entries + date-lock trigger for anti-fraud
ALTER TABLE public.harvest_entries ADD COLUMN IF NOT EXISTS step_key text;

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
        AND l.status IN ('active','sold','completed')
    ) THEN
      RAISE EXCEPTION 'Aktif veya satılmış bir ürüne bağlı hasadın olay tarihi değiştirilemez';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_harvest_date_lock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_harvest_date_lock ON public.harvest_entries;
CREATE TRIGGER trg_enforce_harvest_date_lock
BEFORE UPDATE ON public.harvest_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_harvest_date_lock();