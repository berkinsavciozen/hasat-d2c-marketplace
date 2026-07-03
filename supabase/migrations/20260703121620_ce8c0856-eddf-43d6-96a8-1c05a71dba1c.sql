
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS parcel_id uuid REFERENCES public.parcels(id);

CREATE TABLE IF NOT EXISTS public.listing_harvest_entries (
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  harvest_entry_id uuid NOT NULL REFERENCES public.harvest_entries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, harvest_entry_id)
);

GRANT SELECT ON public.listing_harvest_entries TO anon, authenticated;
GRANT INSERT, DELETE ON public.listing_harvest_entries TO authenticated;
GRANT ALL ON public.listing_harvest_entries TO service_role;

ALTER TABLE public.listing_harvest_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Farmers manage their batch links" ON public.listing_harvest_entries;
CREATE POLICY "Farmers manage their batch links" ON public.listing_harvest_entries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.farmer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.farmer_id = auth.uid()));

DROP POLICY IF EXISTS "Public read batch links" ON public.listing_harvest_entries;
CREATE POLICY "Public read batch links" ON public.listing_harvest_entries
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_lhe_listing ON public.listing_harvest_entries(listing_id);
CREATE INDEX IF NOT EXISTS idx_lhe_entry ON public.listing_harvest_entries(harvest_entry_id);

-- Stock guard on offer acceptance
CREATE OR REPLACE FUNCTION public.enforce_offer_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_total numeric;
  listing_qty numeric;
  base_stock numeric;
  reserved numeric;
  available numeric;
  requested numeric;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    SELECT COALESCE(SUM(he.quantity), 0), MAX(l.quantity)
      INTO batch_total, listing_qty
      FROM public.listings l
      LEFT JOIN public.listing_harvest_entries lhe ON lhe.listing_id = l.id
      LEFT JOIN public.harvest_entries he ON he.id = lhe.harvest_entry_id
      WHERE l.id = NEW.listing_id
      GROUP BY l.id;

    base_stock := CASE WHEN batch_total > 0 THEN batch_total ELSE COALESCE(listing_qty, 0) END;

    SELECT COALESCE(SUM(o.quantity), 0)
      INTO reserved
      FROM public.offers o
      WHERE o.listing_id = NEW.listing_id
        AND o.status = 'accepted'
        AND o.id <> NEW.id;

    requested := COALESCE(NEW.current_quantity, NEW.quantity);
    available := base_stock - reserved;

    IF requested > available THEN
      RAISE EXCEPTION 'Stok yetersiz';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_offer_stock ON public.offers;
CREATE TRIGGER trg_enforce_offer_stock
  BEFORE UPDATE ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_offer_stock();
