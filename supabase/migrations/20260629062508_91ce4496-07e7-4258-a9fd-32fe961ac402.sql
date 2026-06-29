
-- A1. Backfill
UPDATE public.offers
SET current_price = COALESCE(current_price, price_per_unit),
    current_quantity = COALESCE(current_quantity, quantity)
WHERE current_price IS NULL OR current_quantity IS NULL;

-- A2. Helper + ping-pong accept guard
CREATE OR REPLACE FUNCTION public.get_my_role_for_offer(offer_row public.offers)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() = offer_row.farmer_id THEN 'farmer'
    WHEN auth.uid() = offer_row.buyer_id THEN 'buyer'
    ELSE NULL
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role_for_offer(public.offers) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role_for_offer(public.offers) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_offer_accept_turn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_role text;
BEGIN
  -- Only guard transitions into 'accepted'
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    -- Skip enforcement for service_role / non-authenticated callers (admin paths)
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    my_role := public.get_my_role_for_offer(OLD);
    IF my_role IS NULL THEN
      RAISE EXCEPTION 'Bu teklif size ait değil';
    END IF;
    IF COALESCE(OLD.ball_side, 'farmer') <> my_role THEN
      RAISE EXCEPTION 'Sırada karşı taraf var, teklifi kabul edemezsiniz';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_offer_accept_turn_trg ON public.offers;
CREATE TRIGGER enforce_offer_accept_turn_trg
BEFORE UPDATE ON public.offers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_offer_accept_turn();

-- A3. Allow message sender to delete their own offer_messages row
DROP POLICY IF EXISTS "Sender can delete own offer_messages" ON public.offer_messages;
CREATE POLICY "Sender can delete own offer_messages"
ON public.offer_messages
FOR DELETE
TO authenticated
USING (sender_id = auth.uid());
