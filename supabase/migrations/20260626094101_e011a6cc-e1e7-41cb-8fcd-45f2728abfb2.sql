
-- 1. Add columns to offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS ball_side text NOT NULL DEFAULT 'farmer';
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS current_price numeric;
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS current_quantity numeric;
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

-- Constraints (drop & recreate to be idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_ball_side_check') THEN
    ALTER TABLE public.offers ADD CONSTRAINT offers_ball_side_check CHECK (ball_side IN ('farmer','buyer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_payment_status_check') THEN
    ALTER TABLE public.offers ADD CONSTRAINT offers_payment_status_check CHECK (payment_status IN ('unpaid','pending','paid'));
  END IF;
END $$;

-- Backfill
UPDATE public.offers
   SET current_price = COALESCE(current_price, price_per_unit),
       current_quantity = COALESCE(current_quantity, quantity);

-- 2. offer_messages table
CREATE TABLE IF NOT EXISTS public.offer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('farmer','buyer')),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price numeric,
  quantity numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_messages_offer_idx ON public.offer_messages(offer_id, created_at);

GRANT SELECT, INSERT ON public.offer_messages TO authenticated;
GRANT ALL ON public.offer_messages TO service_role;

ALTER TABLE public.offer_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties can read offer messages" ON public.offer_messages;
CREATE POLICY "Parties can read offer messages" ON public.offer_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = offer_messages.offer_id
        AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Parties can insert their own messages" ON public.offer_messages;
CREATE POLICY "Parties can insert their own messages" ON public.offer_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = offer_messages.offer_id
        AND (
          (sender_role = 'buyer'  AND o.buyer_id  = auth.uid())
          OR
          (sender_role = 'farmer' AND o.farmer_id = auth.uid())
        )
    )
  );

-- 3. Update notification trigger bodies
CREATE OR REPLACE FUNCTION public.notify_offer_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  farmer uuid;
  buyer_name text;
  crop_name text;
  qty numeric;
  unit_name text;
  total numeric;
begin
  select farmer_id, crop, unit
    into farmer, crop_name, unit_name
    from listings where id = NEW.listing_id;
  select name into buyer_name from profiles where id = NEW.buyer_id;
  qty := NEW.quantity;
  total := NEW.quantity * NEW.price_per_unit;
  insert into notifications(user_id, type, title, body, related_id)
  values (
    farmer,
    'offer_received',
    'Yeni Teklif',
    '🌾 ' || coalesce(buyer_name, 'Alıcı') || ' ' || coalesce(crop_name, 'ürün') ||
      ' için ' || qty || coalesce(unit_name, '') || ' - ₺' || to_char(total, 'FM999G999G999D00') || ' teklif gönderdi',
    NEW.id
  );
  return NEW;
end;$function$;

CREATE OR REPLACE FUNCTION public.notify_offer_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  farmer_name text;
  unit_name text;
  qty numeric;
  price numeric;
begin
  select name into farmer_name from profiles where id = NEW.farmer_id;
  select unit into unit_name from listings where id = NEW.listing_id;
  qty := coalesce(NEW.current_quantity, NEW.quantity);
  price := coalesce(NEW.current_price, NEW.price_per_unit);

  if NEW.status = 'accepted' and (OLD.status is distinct from 'accepted') then
    insert into notifications(user_id, type, title, body, related_id)
    values (
      NEW.buyer_id,
      'offer_accepted',
      'Teklifiniz Kabul Edildi',
      '✅ ' || coalesce(farmer_name, 'Çiftçi') || ' teklifinizi kabul etti! Ödeme yaparak siparişi tamamlayın.',
      NEW.id
    );
  end if;
  if NEW.status = 'counter' and (OLD.status is distinct from 'counter' or OLD.current_price is distinct from NEW.current_price or OLD.current_quantity is distinct from NEW.current_quantity) then
    insert into notifications(user_id, type, title, body, related_id)
    values (
      case when NEW.ball_side = 'buyer' then NEW.buyer_id else NEW.farmer_id end,
      'offer_countered',
      'Karşı Teklif',
      '↩️ ' || coalesce(farmer_name, 'Karşı taraf') || ' teklifinize karşı teklif yaptı: ' || qty || coalesce(unit_name, '') || ' @ ₺' || to_char(price, 'FM999G999G999D00') || '/' || coalesce(unit_name, ''),
      NEW.id
    );
  end if;
  if NEW.status = 'rejected' and (OLD.status is distinct from 'rejected') then
    insert into notifications(user_id, type, title, body, related_id)
    values (
      NEW.buyer_id,
      'offer_rejected',
      'Teklif Reddedildi',
      '❌ ' || coalesce(farmer_name, 'Çiftçi') || ' teklifinizi reddetti.',
      NEW.id
    );
  end if;
  if NEW.payment_status = 'paid' and (OLD.payment_status is distinct from 'paid') then
    insert into notifications(user_id, type, title, body, related_id)
    values (
      NEW.farmer_id,
      'payment_received',
      'Ödeme Alındı',
      '💰 Alıcı ödemeyi tamamladı. Sipariş aktif.',
      NEW.id
    );
  end if;
  return NEW;
end;$function$;
