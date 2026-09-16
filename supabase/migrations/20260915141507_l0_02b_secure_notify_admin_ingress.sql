-- L0-02B: close the public notify-admin SMS ingress.
--
-- Architecture:
--   authenticated client INSERT -> RLS-protected domain table -> SECURITY DEFINER trigger
--   -> private outbox -> pg_net request signed with a Vault-backed HMAC secret
--   -> notify-admin Edge Function -> allowlisted event rendering -> Twilio.
--
-- No credential value is stored in this migration. Before rollout, an operator must create the
-- same high-entropy value under both names documented in docs/security/notify-admin-ingress.md:
--   * Vault secret name: notify_admin_ingress_hmac
--   * Edge secret name:  NOTIFY_ADMIN_INGRESS_SECRET

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.admin_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (char_length(event_key) between 1 and 180),
  event_type text not null check (
    event_type in ('crop_type_request.created', 'crop_request.catalog_gap.created')
  ),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 2048
  ),
  status text not null default 'pending' check (
    status in ('pending', 'sending', 'sent', 'failed', 'dead', 'uncertain')
  ),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text check (
    provider_message_id is null or char_length(provider_message_id) <= 64
  ),
  last_error_code text check (
    last_error_code is null or char_length(last_error_code) <= 64
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.admin_sms_outbox enable row level security;
revoke all on table private.admin_sms_outbox from public, anon, authenticated;

create index admin_sms_outbox_retry_idx
  on private.admin_sms_outbox (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create index admin_sms_outbox_recent_attempt_idx
  on private.admin_sms_outbox (last_attempt_at)
  where last_attempt_at is not null;

-- Only the Edge runtime's service role may claim an event. The payload returned here is the
-- authoritative server-built payload; the HTTP caller cannot supply or override message text.
create or replace function public.claim_admin_sms_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  _event private.admin_sms_outbox%rowtype;
  _recent_attempts integer;
begin
  select *
    into _event
    from private.admin_sms_outbox
    where id = p_event_id
    for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if _event.status = 'sent' then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  -- A request that reached Twilio but did not record its result is deliberately never retried
  -- automatically: standard Twilio Message creation has no idempotency key, so retrying an
  -- uncertain POST could create a second paid SMS. Operators reconcile this state in Twilio logs.
  if _event.status in ('sending', 'uncertain') then
    return jsonb_build_object('outcome', 'in_progress_or_uncertain');
  end if;

  if _event.status = 'dead' or _event.attempt_count >= 3 then
    update private.admin_sms_outbox
      set status = 'dead', updated_at = clock_timestamp()
      where id = p_event_id;
    return jsonb_build_object('outcome', 'attempts_exhausted');
  end if;

  if _event.next_attempt_at > clock_timestamp() then
    return jsonb_build_object('outcome', 'retry_later');
  end if;

  select count(*)::integer
    into _recent_attempts
    from private.admin_sms_outbox
    where last_attempt_at >= clock_timestamp() - interval '1 minute';

  if _recent_attempts >= 5 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  update private.admin_sms_outbox
    set status = 'sending',
        attempt_count = attempt_count + 1,
        last_attempt_at = clock_timestamp(),
        last_error_code = null,
        updated_at = clock_timestamp()
    where id = p_event_id
    returning * into _event;

  return jsonb_build_object(
    'outcome', 'claimed',
    'eventType', _event.event_type,
    'payload', _event.payload,
    'attemptCount', _event.attempt_count
  );
end;
$function$;

revoke all on function public.claim_admin_sms_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_admin_sms_event(uuid) to service_role;

-- The Edge runtime records only an allowlisted outcome and an optional opaque Twilio SID. Raw
-- provider bodies/errors never enter the database or the client response.
create or replace function public.complete_admin_sms_event(
  p_event_id uuid,
  p_outcome text,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  _updated integer;
begin
  if p_outcome not in ('sent', 'retryable_failure', 'uncertain') then
    raise exception using errcode = '22023', message = 'unsupported admin SMS outcome';
  end if;

  update private.admin_sms_outbox
    set status = case
          when p_outcome = 'sent' then 'sent'
          when p_outcome = 'uncertain' then 'uncertain'
          when attempt_count >= 3 then 'dead'
          else 'failed'
        end,
        provider_message_id = case
          when p_outcome = 'sent' then left(p_provider_message_id, 64)
          else null
        end,
        last_error_code = case
          when p_outcome = 'retryable_failure' then 'provider_rejected'
          when p_outcome = 'uncertain' then 'provider_result_uncertain'
          else null
        end,
        next_attempt_at = case
          when p_outcome = 'retryable_failure' and attempt_count = 1
            then clock_timestamp() + interval '1 minute'
          when p_outcome = 'retryable_failure' and attempt_count = 2
            then clock_timestamp() + interval '5 minutes'
          else next_attempt_at
        end,
        sent_at = case when p_outcome = 'sent' then clock_timestamp() else null end,
        updated_at = clock_timestamp()
    where id = p_event_id and status = 'sending';

  get diagnostics _updated = row_count;
  return _updated = 1;
end;
$function$;

revoke all on function public.complete_admin_sms_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_admin_sms_event(uuid, text, text) to service_role;

-- Dispatches only an event identifier. The raw body is signed so any mutation is detected by the
-- Edge Function before the service-role claim or Twilio call.
create or replace function private.dispatch_admin_sms_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  _secret text;
  _timestamp text;
  _body jsonb;
  _signature text;
begin
  select decrypted_secret
    into _secret
    from vault.decrypted_secrets
    where name = 'notify_admin_ingress_hmac'
    order by created_at desc
    limit 1;

  if _secret is null or octet_length(_secret) < 32 then
    raise log 'notify-admin dispatch skipped: Vault HMAC secret is not configured';
    return;
  end if;

  _timestamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
  _body := jsonb_build_object('eventId', p_event_id::text);
  _signature := encode(
    extensions.hmac(_timestamp || '.' || _body::text, _secret, 'sha256'),
    'hex'
  );

  perform net.http_post(
    url := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/notify-admin',
    body := _body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Hasat-Timestamp', _timestamp,
      'X-Hasat-Signature', _signature
    ),
    timeout_milliseconds := 5000
  );
exception when others then
  raise log 'notify-admin dispatch failed [%]', sqlstate;
end;
$function$;

revoke all on function private.dispatch_admin_sms_event(uuid) from public, anon, authenticated;

drop trigger if exists tg_crop_type_requests_notify on public.crop_type_requests;
drop function if exists public.notify_new_crop_type_request();

create function private.notify_new_crop_type_request()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  _event_id uuid;
  _requester_name text;
  _note text;
begin
  select left(btrim(name), 80)
    into _requester_name
    from public.profiles
    where id = new.requested_by;

  _note := left(btrim(coalesce(nullif(new.note, ''), nullif(new.lifecycle_notes, ''), '')), 80);

  insert into private.admin_sms_outbox (event_key, event_type, payload)
  values (
    'crop_type_request:' || new.id::text,
    'crop_type_request.created',
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', new.id::text,
      'cropName', left(btrim(new.crop_name), 100),
      'unit', nullif(left(btrim(new.suggested_default_unit), 20), ''),
      'category', nullif(left(btrim(new.suggested_category_group), 40), ''),
      'harvestStartMonth', new.suggested_harvest_window_start_month,
      'harvestEndMonth', new.suggested_harvest_window_end_month,
      'requesterName', coalesce(nullif(_requester_name, ''), 'bir çiftçi'),
      'note', nullif(_note, '')
    ))
  )
  on conflict (event_key) do nothing
  returning id into _event_id;

  if _event_id is not null then
    perform private.dispatch_admin_sms_event(_event_id);
  end if;

  return new;
exception when others then
  raise log 'notify_new_crop_type_request failed [%]', sqlstate;
  return new;
end;
$function$;

revoke all on function private.notify_new_crop_type_request() from public, anon, authenticated;

create trigger tg_crop_type_requests_notify
  after insert on public.crop_type_requests
  for each row execute function private.notify_new_crop_type_request();

-- Replaces the former browser-side notify-admin invocation. The user's existing authenticated,
-- owner-checked crop_requests INSERT remains the only client operation; the database decides
-- whether the product is actually absent from crop_config and builds the bounded event payload.
create or replace function private.notify_crop_request_catalog_gap()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  _event_id uuid;
  _note text;
begin
  if exists (
    select 1
      from public.crop_config as cc
      where lower(btrim(cc.crop)) = lower(btrim(new.crop_name_free_text))
         or lower(btrim(cc.display_name)) = lower(btrim(new.crop_name_free_text))
  ) then
    return new;
  end if;

  _note := left(btrim(coalesce(new.note, '')), 80);

  insert into private.admin_sms_outbox (event_key, event_type, payload)
  values (
    'crop_request_catalog_gap:' || new.id::text,
    'crop_request.catalog_gap.created',
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', new.id::text,
      'cropName', left(btrim(new.crop_name_free_text), 100),
      'note', nullif(_note, '')
    ))
  )
  on conflict (event_key) do nothing
  returning id into _event_id;

  if _event_id is not null then
    perform private.dispatch_admin_sms_event(_event_id);
  end if;

  return new;
exception when others then
  raise log 'notify_crop_request_catalog_gap failed [%]', sqlstate;
  return new;
end;
$function$;

revoke all on function private.notify_crop_request_catalog_gap() from public, anon, authenticated;

drop trigger if exists tg_crop_requests_notify_catalog_gap on public.crop_requests;
create trigger tg_crop_requests_notify_catalog_gap
  after insert on public.crop_requests
  for each row execute function private.notify_crop_request_catalog_gap();

-- Bounded retry producer. Each invocation queues at most five due events. The claim RPC is the
-- final rate gate and permits at most five Twilio attempts per rolling minute.
create or replace function private.retry_admin_sms_events()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  _event_id uuid;
begin
  for _event_id in
    select id
      from private.admin_sms_outbox
      where status in ('pending', 'failed')
        and attempt_count < 3
        and next_attempt_at <= clock_timestamp()
      order by next_attempt_at, created_at
      limit 5
  loop
    perform private.dispatch_admin_sms_event(_event_id);
  end loop;
end;
$function$;

revoke all on function private.retry_admin_sms_events() from public, anon, authenticated;

do $block$
declare
  _job_id bigint;
begin
  select jobid into _job_id from cron.job where jobname = 'notify-admin-outbox-retry';
  if _job_id is not null then
    perform cron.unschedule(_job_id);
  end if;
end;
$block$;

select cron.schedule(
  'notify-admin-outbox-retry',
  '* * * * *',
  'select private.retry_admin_sms_events();'
);
