
-- 1) Rebuild enum to add 'pending' and 'paused'
ALTER TYPE public.subscription_status RENAME TO subscription_status_old;
CREATE TYPE public.subscription_status AS ENUM ('pending','active','paused','fulfilled','cancelled');
ALTER TABLE public.harvest_subscriptions
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.subscription_status USING status::text::public.subscription_status,
  ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE public.subscription_status_old;

-- 2) notif_prefs new toggles
ALTER TABLE public.notif_prefs
  ADD COLUMN IF NOT EXISTS subscription_new_sms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_accepted_sms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_rejected_sms boolean NOT NULL DEFAULT true;

-- 3) Extend dispatch_sms with subscription events
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
    when 'order_shipped' then 'order_shipped_sms'
    when 'order_delivered' then 'order_delivered_sms'
    when 'order_cancelled' then 'order_cancelled_sms'
    when 'dispute_opened' then 'dispute_opened_sms'
    when 'crop_request_match' then 'crop_request_match_sms'
    when 'subscription_new' then 'subscription_new_sms'
    when 'subscription_accepted' then 'subscription_accepted_sms'
    when 'subscription_rejected' then 'subscription_rejected_sms'
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

-- 4) Let farmer UPDATE their own subscription rows (status/date/qty only, enforced by trigger)
DROP POLICY IF EXISTS "Farmers respond to subscriptions" ON public.harvest_subscriptions;
CREATE POLICY "Farmers respond to subscriptions"
  ON public.harvest_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = farmer_id)
  WITH CHECK (auth.uid() = farmer_id);

-- 5) Column-level guard trigger for updates (buyer: only cancel; farmer: status/date/qty)
CREATE OR REPLACE FUNCTION public.enforce_subscription_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;

  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.farmer_id IS DISTINCT FROM OLD.farmer_id THEN
    RAISE EXCEPTION 'Abonelik sahipliği değiştirilemez';
  END IF;

  IF uid = OLD.buyer_id THEN
    IF NEW.volume_commitment IS DISTINCT FROM OLD.volume_commitment
       OR NEW.price_lock       IS DISTINCT FROM OLD.price_lock
       OR NEW.locked_price     IS DISTINCT FROM OLD.locked_price
       OR NEW.locked_at        IS DISTINCT FROM OLD.locked_at
       OR NEW.next_harvest_date IS DISTINCT FROM OLD.next_harvest_date
       OR NEW.estimated_qty    IS DISTINCT FROM OLD.estimated_qty THEN
      RAISE EXCEPTION 'Alıcı yalnızca aboneliği iptal edebilir';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Alıcı yalnızca cancelled durumuna geçebilir';
    END IF;
  ELSIF uid = OLD.farmer_id THEN
    IF NEW.volume_commitment IS DISTINCT FROM OLD.volume_commitment
       OR NEW.price_lock       IS DISTINCT FROM OLD.price_lock
       OR NEW.locked_price     IS DISTINCT FROM OLD.locked_price
       OR NEW.locked_at        IS DISTINCT FROM OLD.locked_at THEN
      RAISE EXCEPTION 'Ekonomik alanlar üretici tarafından değiştirilemez';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
           (OLD.status = 'pending' AND NEW.status IN ('active','cancelled'))
        OR (OLD.status = 'active'  AND NEW.status IN ('paused','fulfilled','cancelled'))
        OR (OLD.status = 'paused'  AND NEW.status IN ('active','cancelled'))
      ) THEN
        RAISE EXCEPTION 'Geçersiz abonelik durum geçişi: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_subscription_updates ON public.harvest_subscriptions;
CREATE TRIGGER trg_enforce_subscription_updates
BEFORE UPDATE ON public.harvest_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_updates();

-- 6) Notification trigger (in-app + SMS via dispatch_sms)
CREATE OR REPLACE FUNCTION public.notify_subscription_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  buyer_name text; farmer_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT name INTO buyer_name FROM public.profiles WHERE id = NEW.buyer_id;
    INSERT INTO public.notifications(user_id, type, title, body, related_id)
    VALUES (NEW.farmer_id, 'subscription_request', 'Yeni Abonelik Talebi',
      '📅 ' || coalesce(buyer_name,'Alıcı') || ' sizden düzenli tedarik talep etti.',
      NEW.id);
    PERFORM public.dispatch_sms(NEW.farmer_id, 'subscription_new',
      'Hasat: ' || coalesce(buyer_name,'Alıcı') || ' sizden abonelik talep etti. Uygulamada onaylayın.');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT name INTO farmer_name FROM public.profiles WHERE id = NEW.farmer_id;
    IF NEW.status = 'active' AND OLD.status = 'pending' THEN
      INSERT INTO public.notifications(user_id, type, title, body, related_id)
      VALUES (NEW.buyer_id, 'subscription_accepted', 'Aboneliğiniz Aktif',
        '✅ ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi kabul etti.',
        NEW.id);
      PERFORM public.dispatch_sms(NEW.buyer_id, 'subscription_accepted',
        'Hasat: ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi kabul etti.');
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' AND auth.uid() = NEW.farmer_id THEN
      INSERT INTO public.notifications(user_id, type, title, body, related_id)
      VALUES (NEW.buyer_id, 'subscription_rejected', 'Abonelik Reddedildi',
        '❌ ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi reddetti.',
        NEW.id);
      PERFORM public.dispatch_sms(NEW.buyer_id, 'subscription_rejected',
        'Hasat: ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi reddetti.');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_subscription_changes ON public.harvest_subscriptions;
CREATE TRIGGER trg_notify_subscription_changes
AFTER INSERT OR UPDATE ON public.harvest_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_subscription_changes();

-- 7) Fulfillment RPC (RLS-safe)
CREATE OR REPLACE FUNCTION public.get_subscription_fulfillment(_subscription_id uuid)
RETURNS TABLE(delivered_qty numeric, order_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
DECLARE ok boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.harvest_subscriptions
    WHERE id = _subscription_id
      AND (buyer_id = auth.uid() OR farmer_id = auth.uid())
  ) INTO ok;
  IF NOT ok THEN
    RETURN QUERY SELECT 0::numeric, 0;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT COALESCE(SUM(o.quantity), 0)::numeric, COUNT(*)::int
    FROM public.offers o
    WHERE o.subscription_id = _subscription_id
      AND o.payment_status = 'paid';
END $$;

REVOKE EXECUTE ON FUNCTION public.get_subscription_fulfillment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_fulfillment(uuid) TO authenticated;
