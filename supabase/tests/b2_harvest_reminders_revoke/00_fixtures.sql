-- B-2 — SQL test fixtures for the send_subscription_harvest_reminders REVOKE migration.
--
-- Same convention as supabase/tests/b1_dispatch_push_revoke/00_fixtures.sql: minimal
-- stand-ins for the anon/authenticated/service_role roles and a `net` schema stub for
-- pg_net (pg_net is not installed locally), plus the *actual* production shape of
-- send_subscription_harvest_reminders, dispatch_sms and dispatch_push (bodies copied
-- verbatim from the live Hasat project, see PR description) and the minimal tables they
-- touch, so the suite proves the REVOKE against the real call graph instead of a stand-in.
--
-- Deliberately does NOT revoke/grant anything on send_subscription_harvest_reminders
-- itself here: a bare `CREATE FUNCTION` already grants EXECUTE to PUBLIC by default in
-- PostgreSQL, which is exactly the pre-migration production bug this fixture needs to
-- reproduce.
--
-- Run via supabase/tests/b2_harvest_reminders_revoke/run.sh — never run manually against a
-- real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

create schema net;
grant usage on schema net to public;

create table net.http_post_calls (
  id bigserial primary key,
  url text not null,
  headers jsonb,
  body jsonb,
  called_at timestamptz not null default now()
);

create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
as $$
declare
  _id bigint;
begin
  insert into net.http_post_calls (url, headers, body) values (url, headers, body) returning id into _id;
  return _id;
end;
$$;

-- ===================================================================================================
-- Minimal schema: just enough of profiles/harvest_subscriptions/notifications/notif_prefs for the
-- real function body to run end to end.
-- ===================================================================================================

create table public.profiles (
  id uuid primary key,
  name text
);

create table public.harvest_subscriptions (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  farmer_id uuid not null references public.profiles(id),
  crop text,
  status text not null default 'active',
  next_harvest_date date not null
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  body text not null,
  related_id uuid,
  created_at timestamptz not null default now()
);

create table public.notif_prefs (
  user_id uuid primary key,
  harvest_time_sms boolean not null default false,
  harvest_time_push boolean not null default false
);

create table public.device_tokens (
  user_id uuid not null,
  token text not null
);

grant select, insert, update, delete on public.profiles, public.harvest_subscriptions,
  public.notifications, public.notif_prefs, public.device_tokens
  to anon, authenticated, service_role;

-- ===================================================================================================
-- Real function bodies, copied verbatim from the live Hasat project (efuqpiaavrzimvstpdpm) as
-- captured for this PR — see PR description for the `pg_get_functiondef` proof.
-- ===================================================================================================

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
  _anon text := 'test-anon-key';
begin
  if _user_id is null or _event is null then return; end if;
  _col := case _event
    when 'harvest_time' then 'harvest_time_sms'
    else null end;
  if _col is null then return; end if;

  _sql := format('select coalesce(%I, false) from public.notif_prefs where user_id = $1', _col);
  execute _sql into _enabled using _user_id;
  if not coalesce(_enabled, false) then return; end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _anon),
    body := jsonb_build_object('userId', _user_id, 'message', _message, 'event', _event)
  );
exception when others then
  raise log 'dispatch_sms failed: %', sqlerrm;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_push(_user_id uuid, _event text, _title text, _message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  _col text;
  _enabled boolean;
  _sql text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-push';
  _anon text := 'test-anon-key';
  _tokens text[];
begin
  if _user_id is null or _event is null then return; end if;

  _col := case _event
    when 'harvest_time' then 'harvest_time_push'
    else null end;
  if _col is null then return; end if;

  _sql := format('select coalesce(%I, false) from public.notif_prefs where user_id = $1', _col);
  execute _sql into _enabled using _user_id;
  if not coalesce(_enabled, false) then return; end if;

  select array_agg(token) into _tokens from public.device_tokens where user_id = _user_id;
  if _tokens is null or array_length(_tokens, 1) = 0 then return; end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _anon),
    body := jsonb_build_object(
      'tokens', to_jsonb(_tokens),
      'title', _title,
      'body', _message,
      'event', _event,
      'userId', _user_id
    )
  );
exception when others then
  raise log 'dispatch_push failed: %', sqlerrm;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_subscription_harvest_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  buyer_name text;
  farmer_name text;
BEGIN
  FOR rec IN
    SELECT hs.id, hs.buyer_id, hs.farmer_id, hs.crop, hs.next_harvest_date
    FROM public.harvest_subscriptions hs
    WHERE hs.status = 'active'
      AND hs.next_harvest_date = (CURRENT_DATE + 3)
  LOOP
    SELECT name INTO buyer_name FROM public.profiles WHERE id = rec.buyer_id;
    SELECT name INTO farmer_name FROM public.profiles WHERE id = rec.farmer_id;

    INSERT INTO public.notifications(user_id, type, title, body, related_id)
    VALUES (rec.farmer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(buyer_name,'Alıcınız') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || ').',
      rec.id);
    PERFORM public.dispatch_sms(rec.farmer_id, 'harvest_time',
      'Hasat: ' || coalesce(rec.crop,'Ürün') || ' aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || ').');
    PERFORM public.dispatch_push(rec.farmer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(buyer_name,'Alıcınız') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || ').');

    INSERT INTO public.notifications(user_id, type, title, body, related_id)
    VALUES (rec.buyer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(farmer_name,'Üreticiniz') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || '). Sipariş vermeyi unutmayın.',
      rec.id);
    PERFORM public.dispatch_sms(rec.buyer_id, 'harvest_time',
      'Hasat: ' || coalesce(rec.crop,'Ürün') || ' aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || '). Sipariş vermeyi unutmayın.');
    PERFORM public.dispatch_push(rec.buyer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(farmer_name,'Üreticiniz') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || '). Sipariş vermeyi unutmayın.');
  END LOOP;
END;
$function$;
