
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_sms(_user_id uuid, _event text, _message text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
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
$$;

revoke all on function public.dispatch_sms(uuid, text, text) from public, anon, authenticated;

create or replace function public.notify_offer_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  farmer uuid;
  buyer_name text;
  crop_name text;
  qty numeric;
  unit_name text;
  total numeric;
  msg text;
begin
  select farmer_id, crop, unit
    into farmer, crop_name, unit_name
    from listings where id = NEW.listing_id;
  select name into buyer_name from profiles where id = NEW.buyer_id;
  qty := NEW.quantity;
  total := NEW.quantity * NEW.price_per_unit;
  msg := '🌾 ' || coalesce(buyer_name, 'Alıcı') || ' ' || coalesce(crop_name, 'ürün') ||
    ' için ' || qty || coalesce(unit_name, '') || ' - ₺' || to_char(total, 'FM999G999G999D00') || ' teklif gönderdi';

  insert into notifications(user_id, type, title, body, related_id)
  values (farmer, 'offer_received', 'Yeni Teklif', msg, NEW.id);

  perform public.dispatch_sms(farmer, 'new_offer', 'Hasat: ' || msg);
  return NEW;
end;
$$;
