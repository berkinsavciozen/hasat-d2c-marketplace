-- Local-only stand-ins for Supabase roles, Vault, pg_net and the tables dispatch_sms reads.
-- No network call is made. pgcrypto is the REAL extension (installed into schema `extensions`, as
-- on Supabase), so the HMAC produced here is the real HMAC-SHA256 the Edge handler must accept.

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

create schema extensions;
create extension pgcrypto with schema extensions;

create schema vault;
create table vault.decrypted_secrets (
  name text not null,
  decrypted_secret text not null,
  created_at timestamptz not null default now()
);

-- Mirrors pg_net's net.http_post: the request body it queues (and sends) is
-- convert_to(body::text, 'UTF8'). We store exactly those bytes.
create schema net;
create table net.http_post_calls (
  id bigserial primary key,
  url text not null,
  body_bytes bytea not null,
  params jsonb not null,
  headers jsonb not null,
  timeout_milliseconds integer not null
);
create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint language plpgsql
as $$
declare _id bigint;
begin
  insert into net.http_post_calls(url, body_bytes, params, headers, timeout_milliseconds)
  values (url, convert_to(body::text, 'UTF8'), params, headers, timeout_milliseconds)
  returning id into _id;
  return _id;
end;
$$;

create table public.notif_prefs (
  user_id uuid primary key,
  new_offer_sms boolean,
  harvest_time_sms boolean,
  offer_accepted_sms boolean,
  offer_rejected_sms boolean,
  payment_confirmed_sms boolean,
  order_preparing_sms boolean,
  order_shipped_sms boolean,
  order_delivered_sms boolean,
  order_cancelled_sms boolean,
  order_completed_sms boolean,
  dispute_opened_sms boolean,
  crop_request_match_sms boolean,
  subscription_new_sms boolean,
  subscription_accepted_sms boolean,
  subscription_rejected_sms boolean
);
insert into public.notif_prefs(user_id, new_offer_sms) values
  ('11111111-1111-4111-8111-111111111111', true),
  ('22222222-2222-4222-8222-222222222222', false);

-- Pre-migration state: the baseline (anon-JWT) body, and — to prove the migration's revoke/assert —
-- execute grants to the client roles as if they had drifted back in.
create function public.dispatch_sms(_user_id uuid, _event text, _message text)
returns void language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
begin
  perform net.http_post(
    url := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer anon'),
    body := jsonb_build_object('userId', _user_id, 'message', _message, 'event', _event)
  );
end;
$function$;
grant execute on function public.dispatch_sms(uuid, text, text) to public, anon, authenticated, service_role;
