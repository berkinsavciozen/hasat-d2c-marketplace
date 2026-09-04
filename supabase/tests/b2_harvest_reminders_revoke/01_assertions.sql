-- B-2 — SQL test suite for the send_subscription_harvest_reminders REVOKE migration.

\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

-- ===================================================================================================
-- (a) Grants: anon/authenticated/PUBLIC denied EXECUTE after the migration; the function owner and
--     service_role remain unaffected.
-- ===================================================================================================

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.send_subscription_harvest_reminders()', 'execute'),
    'expected anon to be denied execute on send_subscription_harvest_reminders'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.send_subscription_harvest_reminders()', 'execute'),
    'expected authenticated to be denied execute on send_subscription_harvest_reminders'
  );
  perform pg_temp.assert(
    not has_function_privilege('public', 'public.send_subscription_harvest_reminders()', 'execute'),
    'expected public (pseudo-role) to be denied execute on send_subscription_harvest_reminders'
  );
end;
$$;

-- ===================================================================================================
-- (b) Negative test: anon/authenticated cannot call send_subscription_harvest_reminders directly
--     any more. This is the DB-level mechanism a PostgREST 401/403 rests on (PostgREST maps the
--     42501 insufficient_privilege error raised here straight to an HTTP error) -- see PR
--     description for the live curl proof of the pre-migration 204 (vulnerable) response against
--     the real project.
-- ===================================================================================================

do $$
declare
  v_raised boolean := false;
begin
  set role anon;
  begin
    perform public.send_subscription_harvest_reminders();
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected anon calling send_subscription_harvest_reminders directly to raise insufficient_privilege');
end;
$$;

do $$
declare
  v_raised boolean := false;
begin
  set role authenticated;
  begin
    perform public.send_subscription_harvest_reminders();
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected authenticated calling send_subscription_harvest_reminders directly to raise insufficient_privilege');
end;
$$;

-- ===================================================================================================
-- (c) Positive test: the pg_cron job (cron.job jobid=2, username=postgres) must keep working.
--     send_subscription_harvest_reminders is SECURITY DEFINER and owned by the same role that ran
--     this migration, so it executes as that owner -- who always implicitly retains EXECUTE on
--     their own function regardless of the REVOKE above. Simulated here the same way pg_cron
--     actually invokes it: as role postgres, direct SELECT, no RPC layer involved.
-- ===================================================================================================

do $$
declare
  v_farmer uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_sub_id uuid;
  v_farmer_notif record;
  v_buyer_notif record;
  v_sms_call net.http_post_calls%rowtype;
  v_push_call net.http_post_calls%rowtype;
begin
  insert into public.profiles(id, name) values (v_farmer, 'Test Çiftçi'), (v_buyer, 'Test Alıcı');
  insert into public.notif_prefs(user_id, harvest_time_sms, harvest_time_push) values (v_farmer, true, true);
  insert into public.device_tokens(user_id, token) values (v_farmer, 'device-token-1');

  insert into public.harvest_subscriptions(buyer_id, farmer_id, crop, status, next_harvest_date)
  values (v_buyer, v_farmer, 'Domates', 'active', current_date + 3)
  returning id into v_sub_id;

  set role postgres;
  perform public.send_subscription_harvest_reminders();
  reset role;

  select * into v_farmer_notif from public.notifications
    where related_id = v_sub_id and user_id = v_farmer and type = 'harvest_time';
  perform pg_temp.assert(v_farmer_notif.id is not null, 'expected a harvest_time notification row for the farmer');

  select * into v_buyer_notif from public.notifications
    where related_id = v_sub_id and user_id = v_buyer and type = 'harvest_time';
  perform pg_temp.assert(v_buyer_notif.id is not null, 'expected a harvest_time notification row for the buyer');

  select * into v_sms_call from net.http_post_calls
    where url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-sms'
    order by id desc limit 1;
  perform pg_temp.assert(v_sms_call.id is not null, 'expected dispatch_sms to still reach net.http_post for the farmer''s harvest_time SMS');
  perform pg_temp.assert(
    (v_sms_call.body ->> 'userId') = v_farmer::text,
    'expected the SMS payload to target the farmer'
  );

  select * into v_push_call from net.http_post_calls
    where url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-push'
    order by id desc limit 1;
  perform pg_temp.assert(v_push_call.id is not null, 'expected dispatch_push to still reach net.http_post for the farmer''s harvest_time push');

  -- deactivate so later blocks in this suite (which re-scan ALL active, matching subscriptions)
  -- don't re-process this row and pollute their own before/after counts.
  update public.harvest_subscriptions set status = 'completed' where id = v_sub_id;
end;
$$;

-- ===================================================================================================
-- (c2) Sanity: a buyer with no notif_prefs row (defaults false/false) must NOT trigger an SMS/push
--      call, and a subscription whose next_harvest_date does not match today+3 must be skipped
--      entirely (proves the REVOKE is privilege-only -- the selection/notification logic itself is
--      untouched).
-- ===================================================================================================

do $$
declare
  v_farmer uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_other_farmer uuid := gen_random_uuid();
  v_other_buyer uuid := gen_random_uuid();
  v_before bigint;
  v_after bigint;
  v_notif_before bigint;
  v_notif_after bigint;
begin
  insert into public.profiles(id, name)
    values (v_farmer, 'Test Çiftçi 2'), (v_buyer, 'Test Alıcı 2'),
           (v_other_farmer, 'Test Çiftçi 3'), (v_other_buyer, 'Test Alıcı 3');

  -- matches next_harvest_date but neither side has notif_prefs (defaults to false/false)
  insert into public.harvest_subscriptions(buyer_id, farmer_id, crop, status, next_harvest_date)
  values (v_buyer, v_farmer, 'Biber', 'active', current_date + 3);

  -- does not match next_harvest_date -> must be skipped entirely (no notification rows either)
  insert into public.harvest_subscriptions(buyer_id, farmer_id, crop, status, next_harvest_date)
  values (v_other_buyer, v_other_farmer, 'Salatalık', 'active', current_date + 10);

  select count(*) into v_before from net.http_post_calls;
  select count(*) into v_notif_before from public.notifications;

  set role postgres;
  perform public.send_subscription_harvest_reminders();
  reset role;

  select count(*) into v_after from net.http_post_calls;
  select count(*) into v_notif_after from public.notifications;

  perform pg_temp.assert(v_after = v_before, 'expected no SMS/push call when notif_prefs is absent (defaults disabled)');
  -- the matching subscription still gets its two notifications rows (farmer + buyer) even with SMS/push disabled
  perform pg_temp.assert(v_notif_after = v_notif_before + 2, 'expected exactly 2 new notification rows (farmer + buyer) for the one matching subscription, none for the non-matching one');
end;
$$;

\echo 'B-2 send_subscription_harvest_reminders REVOKE SQL test suite: ALL ASSERTIONS PASSED'
