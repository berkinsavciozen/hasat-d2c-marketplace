
-- ============================================================
-- P21-B+C: multi-batch offers via offer_items
-- ============================================================

-- 1) offer_items table
CREATE TABLE public.offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  price_per_unit numeric NOT NULL CHECK (price_per_unit >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_items_offer_id_idx ON public.offer_items(offer_id);
CREATE INDEX offer_items_listing_id_idx ON public.offer_items(listing_id);

GRANT SELECT, INSERT ON public.offer_items TO authenticated;
GRANT ALL ON public.offer_items TO service_role;

ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read offer items"
  ON public.offer_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = offer_items.offer_id
      AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
  ));

CREATE POLICY "Buyer inserts own offer items"
  ON public.offer_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = offer_items.offer_id
      AND o.buyer_id = auth.uid()
  ));

-- 2) Update enforce_offer_stock to consider offer_items rows.
--    When the offer has offer_items, validate each listing separately.
--    Otherwise fall back to legacy single-listing behaviour.
CREATE OR REPLACE FUNCTION public.enforce_offer_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  items_count int;
  rec record;
  batch_total numeric;
  listing_qty numeric;
  base_stock numeric;
  reserved numeric;
  available numeric;
  requested numeric;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    SELECT count(*) INTO items_count FROM public.offer_items WHERE offer_id = NEW.id;

    IF items_count > 0 THEN
      -- Per-listing check across all offer_items rows (grouped by listing)
      FOR rec IN
        SELECT listing_id, SUM(quantity) AS requested_qty
        FROM public.offer_items
        WHERE offer_id = NEW.id
        GROUP BY listing_id
      LOOP
        SELECT COALESCE(SUM(he.quantity), 0), MAX(l.quantity)
          INTO batch_total, listing_qty
          FROM public.listings l
          LEFT JOIN public.listing_harvest_entries lhe ON lhe.listing_id = l.id
          LEFT JOIN public.harvest_entries he ON he.id = lhe.harvest_entry_id
          WHERE l.id = rec.listing_id
          GROUP BY l.id;

        base_stock := CASE WHEN batch_total > 0 THEN batch_total ELSE COALESCE(listing_qty, 0) END;

        SELECT COALESCE(SUM(oi.quantity), 0)
          INTO reserved
          FROM public.offer_items oi
          JOIN public.offers o ON o.id = oi.offer_id
          WHERE oi.listing_id = rec.listing_id
            AND o.status = 'accepted'
            AND o.id <> NEW.id;

        available := base_stock - reserved;
        IF rec.requested_qty > available THEN
          RAISE EXCEPTION 'Stok yetersiz (batch)';
        END IF;
      END LOOP;
    ELSE
      -- Legacy single-listing path (unchanged behaviour)
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
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Enforce unit consistency between harvest_entries and listings when linking.
CREATE OR REPLACE FUNCTION public.enforce_link_unit_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  he_unit text;
  l_unit text;
BEGIN
  SELECT unit::text INTO he_unit FROM public.harvest_entries WHERE id = NEW.harvest_entry_id;
  SELECT unit::text INTO l_unit  FROM public.listings        WHERE id = NEW.listing_id;
  IF he_unit IS NOT NULL AND l_unit IS NOT NULL AND he_unit <> l_unit THEN
    RAISE EXCEPTION 'Hasat birimi (%) ilanın birimi (%) ile eşleşmiyor', he_unit, l_unit;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_enforce_link_unit_match ON public.listing_harvest_entries;
CREATE TRIGGER tg_enforce_link_unit_match
  BEFORE INSERT ON public.listing_harvest_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_link_unit_match();

-- 4) Traceability RLS: buyer can read listing / harvest_entries / links
--    regardless of listing status if they have an offer_items row referencing it.

CREATE POLICY "Buyers read listings via offer_items"
  ON public.listings FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.offer_items oi
    JOIN public.offers o ON o.id = oi.offer_id
    WHERE oi.listing_id = listings.id
      AND o.buyer_id = auth.uid()
  ));

CREATE POLICY "Buyers read harvest entries via offer_items"
  ON public.harvest_entries FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.listing_harvest_entries lhe
    JOIN public.offer_items oi ON oi.listing_id = lhe.listing_id
    JOIN public.offers o ON o.id = oi.offer_id
    WHERE lhe.harvest_entry_id = harvest_entries.id
      AND o.buyer_id = auth.uid()
  ));
