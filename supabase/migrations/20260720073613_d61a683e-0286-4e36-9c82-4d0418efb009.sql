
ALTER TABLE public.notif_prefs
  ADD COLUMN IF NOT EXISTS offer_accepted_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_confirmed_sms boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.dispatch_sms(_user_id uuid, _event text, _message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  _col text;
  _enabled boolean;
  _sql text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-sms';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg';
begin
  if _user_id is null or _event is null then return; end if;
  _col := case _event
    when 'new_offer' then 'new_offer_sms'
    when 'price_alert' then 'price_alert_sms'
    when 'harvest_time' then 'harvest_time_sms'
    when 'offer_accepted' then 'offer_accepted_sms'
    when 'payment_confirmed' then 'payment_confirmed_sms'
    else null end;
  if _col is null then return; end if;

  _sql := format('select coalesce(%I, false) from public.notif_prefs where user_id = $1', _col);
  execute _sql into _enabled using _user_id;
  if not coalesce(_enabled, false) then return; end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon
    ),
    body := jsonb_build_object(
      'userId', _user_id,
      'message', _message,
      'event', _event
    )
  );
exception when others then
  raise log 'dispatch_sms failed: %', sqlerrm;
end;
$function$;

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
  total numeric;
begin
  select name into farmer_name from profiles where id = NEW.farmer_id;
  select unit into unit_name from listings where id = NEW.listing_id;
  qty := coalesce(NEW.current_quantity, NEW.quantity);
  price := coalesce(NEW.current_price, NEW.price_per_unit);
  total := qty * price;

  if NEW.status = 'accepted' and (OLD.status is distinct from 'accepted') then
    insert into notifications(user_id, type, title, body, related_id)
    values (
      NEW.buyer_id,
      'offer_accepted',
      'Teklifiniz Kabul Edildi',
      '✅ ' || coalesce(farmer_name, 'Çiftçi') || ' teklifinizi kabul etti! Ödeme yaparak siparişi tamamlayın.',
      NEW.id
    );
    perform public.dispatch_sms(
      NEW.buyer_id,
      'offer_accepted',
      'Hasat: ' || coalesce(farmer_name, 'Çiftçi') || ' teklifinizi kabul etti (' ||
        qty || coalesce(unit_name, '') || ' - TL' || to_char(total, 'FM999G999G999D00') ||
        '). Ödeme yaparak siparişi tamamlayın.'
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
    perform public.dispatch_sms(
      NEW.farmer_id,
      'payment_confirmed',
      'Hasat: Alıcı ödemeyi tamamladı (' || qty || coalesce(unit_name, '') ||
        ' - TL' || to_char(total, 'FM999G999G999D00') || '). Sipariş aktif.'
    );
  end if;
  return NEW;
end;
$function$;

-- Role-purity check for harvest_subscriptions.buyer_id
CREATE OR REPLACE FUNCTION public.enforce_subscription_buyer_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.user_role;
BEGIN
  SELECT role INTO r FROM public.profiles WHERE id = NEW.buyer_id;
  IF r IS DISTINCT FROM 'buyer'::public.user_role THEN
    RAISE EXCEPTION 'harvest_subscriptions.buyer_id must reference a profile with role=buyer';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_subscription_buyer_role ON public.harvest_subscriptions;
CREATE TRIGGER trg_enforce_subscription_buyer_role
BEFORE INSERT OR UPDATE OF buyer_id ON public.harvest_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_buyer_role();
