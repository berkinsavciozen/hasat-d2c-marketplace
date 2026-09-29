-- SEC-EDGE S1b: sign dispatch_sms -> send-sms with the L0-02B ingress HMAC.
--
-- Before: dispatch_sms called send-sms with a hardcoded public anon JWT, so anyone holding the
-- (public) anon key could call send-sms directly and send arbitrary SMS to any user.
-- After: send-sms is verify_jwt=false and accepts only requests signed with the Vault secret
-- `notify_admin_ingress_hmac` (Edge secret NOTIFY_ADMIN_INGRESS_SECRET — same value, no new secret).
--
-- Signed text: 'send-sms.' || timestamp || '.' || body_text. The "send-sms." domain prefix keeps a
-- send-sms signature from ever validating at notify-admin (which signs timestamp || '.' || body).
--
-- Raw-body equality (same approach as L0-02B): the jsonb body is built once; the signature is
-- computed over _body::text and the same jsonb value is passed to net.http_post, which queues
-- convert_to(body::text, 'UTF8') as the request body. jsonb::text is deterministic, so the bytes
-- pg_net sends are byte-for-byte the text that was signed
-- (proved in supabase/tests/sec_edge_dispatch_sms_hmac).
--
-- Signature, event -> notif_prefs column mapping and opt-in check are unchanged from the baseline.
-- Deploy order: send-sms (new, verify_jwt=false) first, then this migration.

create or replace function public.dispatch_sms(_user_id uuid, _event text, _message text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  _col text;
  _enabled boolean;
  _sql text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-sms';
  _secret text;
  _body jsonb;
  _timestamp text;
  _signature text;
begin
  if _user_id is null or _event is null then return; end if;
  _col := case _event
    when 'new_offer' then 'new_offer_sms'
    when 'harvest_time' then 'harvest_time_sms'
    when 'offer_accepted' then 'offer_accepted_sms'
    when 'offer_rejected' then 'offer_rejected_sms'
    when 'payment_confirmed' then 'payment_confirmed_sms'
    when 'order_preparing' then 'order_preparing_sms'
    when 'order_shipped' then 'order_shipped_sms'
    when 'order_delivered' then 'order_delivered_sms'
    when 'order_cancelled' then 'order_cancelled_sms'
    when 'order_completed' then 'order_completed_sms'
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

  select decrypted_secret
    into _secret
    from vault.decrypted_secrets
    where name = 'notify_admin_ingress_hmac'
    order by created_at desc
    limit 1;

  if _secret is null or octet_length(_secret) < 32 then
    raise log 'dispatch_sms skipped: Vault HMAC secret is not configured';
    return;
  end if;

  _body := jsonb_build_object(
    'userId', _user_id,
    'message', _message,
    'event', _event
  );
  _timestamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
  _signature := encode(
    extensions.hmac('send-sms.' || _timestamp || '.' || _body::text, _secret, 'sha256'),
    'hex'
  );

  perform net.http_post(
    url := _url,
    body := _body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Hasat-Timestamp', _timestamp,
      'X-Hasat-Signature', _signature
    )
  );
exception when others then
  raise log 'dispatch_sms failed: %', sqlerrm;
end;
$function$;

-- dispatch_sms is only ever reached from SECURITY DEFINER triggers/functions. It was revoked from
-- client roles in 20260720065648; restate it and fail the migration if a client role can execute it.
revoke all on function public.dispatch_sms(uuid, text, text) from public, anon, authenticated;

do $block$
declare
  _role text;
begin
  foreach _role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = _role)
       and has_function_privilege(_role, 'public.dispatch_sms(uuid, text, text)', 'execute') then
      raise exception 'SEC-EDGE: % can still execute public.dispatch_sms', _role;
    end if;
  end loop;
end;
$block$;
