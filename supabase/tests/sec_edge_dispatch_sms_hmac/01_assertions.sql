create function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

-- Grants / function shape.
select pg_temp.assert(not has_function_privilege('anon', 'public.dispatch_sms(uuid, text, text)', 'execute'), 'anon must not execute dispatch_sms');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.dispatch_sms(uuid, text, text)', 'execute'), 'authenticated must not execute dispatch_sms');
select pg_temp.assert(has_function_privilege('service_role', 'public.dispatch_sms(uuid, text, text)', 'execute'), 'service_role keeps execute');
select pg_temp.assert(
  (select prosecdef and proconfig = array['search_path=public, extensions']
     from pg_proc where oid = 'public.dispatch_sms(uuid, text, text)'::regprocedure),
  'dispatch_sms stays SECURITY DEFINER with the baseline search_path');
select pg_temp.assert(
  position('eyJ' in (select prosrc from pg_proc where oid = 'public.dispatch_sms(uuid, text, text)'::regprocedure)) = 0
  and position('Authorization' in (select prosrc from pg_proc where oid = 'public.dispatch_sms(uuid, text, text)'::regprocedure)) = 0,
  'no hardcoded JWT / Authorization header left in dispatch_sms');

-- 1) No Vault secret → no request, no error.
select public.dispatch_sms('11111111-1111-4111-8111-111111111111', 'new_offer', 'x');
select pg_temp.assert((select count(*) = 0 from net.http_post_calls), 'no request without a Vault secret');

-- 2) Short Vault secret → no request.
insert into vault.decrypted_secrets(name, decrypted_secret) values ('notify_admin_ingress_hmac', 'too-short');
select public.dispatch_sms('11111111-1111-4111-8111-111111111111', 'new_offer', 'x');
select pg_temp.assert((select count(*) = 0 from net.http_post_calls), 'no request with a short Vault secret');

-- Newest secret wins (order by created_at desc).
insert into vault.decrypted_secrets(name, decrypted_secret, created_at)
values ('notify_admin_ingress_hmac', :'secret', now() + interval '1 second');

-- 3) Opt-out, missing prefs row, unknown event, null user → no request.
select public.dispatch_sms('22222222-2222-4222-8222-222222222222', 'new_offer', 'x');
select public.dispatch_sms('33333333-3333-4333-8333-333333333333', 'new_offer', 'x');
select public.dispatch_sms('11111111-1111-4111-8111-111111111111', 'unknown_event', 'x');
select public.dispatch_sms(null, 'new_offer', 'x');
select pg_temp.assert((select count(*) = 0 from net.http_post_calls), 'opt-out / unknown event / null user never dispatch');

-- 4) Opt-in → exactly one signed request whose raw body bytes are exactly the signed text.
select public.dispatch_sms(
  '11111111-1111-4111-8111-111111111111',
  'new_offer',
  E'Hasat: Çiğdem "Şeftali" için teklif verdi 🍑\nüç kasa — ığüşöç'
);

select pg_temp.assert((select count(*) = 1 from net.http_post_calls), 'exactly one request for an opted-in user');
select pg_temp.assert(
  (select url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-sms' from net.http_post_calls),
  'request goes to send-sms');
select pg_temp.assert(
  (select headers ?& array['Content-Type', 'X-Hasat-Timestamp', 'X-Hasat-Signature']
          and not headers ? 'Authorization'
          and (select count(*) from jsonb_object_keys(headers)) = 3
     from net.http_post_calls),
  'headers are exactly Content-Type + X-Hasat-Timestamp + X-Hasat-Signature');
select pg_temp.assert(
  (select abs((headers->>'X-Hasat-Timestamp')::bigint - extract(epoch from clock_timestamp())::bigint) <= 5
     from net.http_post_calls),
  'timestamp is current epoch seconds');
select pg_temp.assert(
  (select headers->>'X-Hasat-Signature' = encode(
            extensions.hmac(
              convert_from(
                convert_to('send-sms.' || (headers->>'X-Hasat-Timestamp') || '.', 'UTF8') || body_bytes,
                'UTF8'),
              :'secret', 'sha256'),
            'hex')
     from net.http_post_calls),
  'signature = HMAC-SHA256(secret, "send-sms." || ts || "." || raw body bytes pg_net sends)');
select pg_temp.assert(
  (select convert_from(body_bytes, 'UTF8')::jsonb = jsonb_build_object(
            'userId', '11111111-1111-4111-8111-111111111111',
            'event', 'new_offer',
            'message', E'Hasat: Çiğdem "Şeftali" için teklif verdi 🍑\nüç kasa — ığüşöç')
     from net.http_post_calls),
  'body carries userId/event/message unchanged');

-- Export the captured request for the Deno end-to-end check against the real send-sms handler.
\t on
\a on
\o :export_path
select jsonb_build_object(
  'timestamp', headers->>'X-Hasat-Timestamp',
  'signature', headers->>'X-Hasat-Signature',
  'contentType', headers->>'Content-Type',
  'bodyBase64', encode(body_bytes, 'base64')
)::text
from net.http_post_calls;
\o
