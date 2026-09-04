-- B-1 — SQL test fixtures for the dispatch_push REVOKE migration.
--
-- Minimal stand-ins for what the migration references but does not create: the anon/
-- authenticated/service_role roles and a `net` schema stub for pg_net (same convention as
-- supabase/tests/f2_recipe_stage_dispatch/00_fixtures.sql — no extension beyond core Postgres is
-- required locally). On top of that this fixture recreates the *actual* production shape of
-- dispatch_push, dispatch_sms and notify_offer_received (bodies copied verbatim from the live
-- Hasat project, see PR description) plus the minimal tables/trigger they touch, so the suite
-- proves the REVOKE against the real call graph instead of a stand-in.
--
-- Deliberately does NOT revoke/grant anything on dispatch_push itself here: a bare
-- `CREATE FUNCTION` already grants EXECUTE to PUBLIC by default in PostgreSQL, which is exactly
-- the pre-migration production bug this fixture needs to reproduce.
--
-- Run via supabase/tests/b1_dispatch_push_revoke/run.sh — never run manually against a real
-- project.

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
-- Minimal schema: just enough of profiles/listings/offers/notifications/notif_prefs/device_tokens
-- for the real trigger chain (offers INSERT -> notify_offer_received -> dispatch_sms/dispatch_push)
-- to run end to end.
-- ===================================================================================================

create table public.profiles (
  id uuid primary key,
  name text
);

create table public.listings (
  id uuid primary key,
  farmer_id uuid not null references public.profiles(id),
  crop text,
  unit text
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  farmer_id uuid not null references public.profiles(id),
  listing_id uuid not null references public.listings(id),
  quantity numeric not null,
  price_per_unit numeric not null,
  status text not null default 'pending'
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
  new_offer_push boolean not null default false
);

create table public.device_tokens (
  user_id uuid not null,
  token text not null
);

grant select, insert, update, delete on public.profiles, public.listings, public.offers,
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
    when 'new_offer' then 'new_offer_sms'
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
    when 'new_offer' then 'new_offer_push'
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
  msg text;
begin
  select farmer_id, crop, unit
    into farmer, crop_name, unit_name
    from listings where id = NEW.listing_id;
  select name into buyer_name from profiles where id = NEW.buyer_id;
  qty := NEW.quantity;
  total := NEW.quantity * NEW.price_per_unit;
  msg := coalesce(buyer_name, 'Alıcı') || ' ' || coalesce(crop_name, 'ürün') ||
    ' için ' || qty || coalesce(unit_name, '') || ' teklif gönderdi';

  insert into notifications(user_id, type, title, body, related_id)
  values (farmer, 'offer_received', 'Yeni Teklif', msg, NEW.id);

  perform public.dispatch_sms(farmer, 'new_offer', 'Hasat: ' || msg);
  perform public.dispatch_push(farmer, 'new_offer', 'Yeni Teklif', msg);
  return NEW;
end;
$function$;

CREATE TRIGGER trg_offer_received AFTER INSERT ON public.offers
  FOR EACH ROW EXECUTE FUNCTION notify_offer_received();
