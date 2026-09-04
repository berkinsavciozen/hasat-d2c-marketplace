-- B-1 — SQL test suite for the dispatch_push REVOKE migration.

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
-- (a) Grants: anon/authenticated/PUBLIC denied EXECUTE after the migration; the function owner
--     and service_role remain unaffected.
-- ===================================================================================================

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.dispatch_push(uuid,text,text,text)', 'execute'),
    'expected anon to be denied execute on dispatch_push'
  );
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.dispatch_push(uuid,text,text,text)', 'execute'),
    'expected authenticated to be denied execute on dispatch_push'
  );
  perform pg_temp.assert(
    not has_function_privilege('public', 'public.dispatch_push(uuid,text,text,text)', 'execute'),
    'expected public (pseudo-role) to be denied execute on dispatch_push'
  );
end;
$$;

-- ===================================================================================================
-- (b) Negative test: anon cannot call dispatch_push directly any more. This is the DB-level
--     mechanism a PostgREST 401/403 rests on (PostgREST maps the 42501 insufficient_privilege
--     error raised here straight to an HTTP error) -- see PR description for the live curl proof
--     of the pre-migration 204 (vulnerable) response against the real project.
-- ===================================================================================================

do $$
declare
  v_raised boolean := false;
begin
  set role anon;
  begin
    perform public.dispatch_push(gen_random_uuid(), 'new_offer', 'x', 'y');
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected anon calling dispatch_push directly to raise insufficient_privilege');
end;
$$;

do $$
declare
  v_raised boolean := false;
begin
  set role authenticated;
  begin
    perform public.dispatch_push(gen_random_uuid(), 'new_offer', 'x', 'y');
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  perform pg_temp.assert(v_raised, 'expected authenticated calling dispatch_push directly to raise insufficient_privilege');
end;
$$;

-- ===================================================================================================
-- (c) Positive test: the legitimate trigger-based push flow (INSERT on offers -> new_offer event)
--     must keep working. notify_offer_received and dispatch_push are both SECURITY DEFINER and
--     owned by the same role that ran this migration, so they execute as that owner -- who always
--     implicitly retains EXECUTE on their own functions regardless of the REVOKE above.
-- ===================================================================================================

do $$
declare
  v_farmer uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_offer_id uuid;
  v_notif record;
  v_push_call net.http_post_calls%rowtype;
begin
  insert into public.profiles(id, name) values (v_farmer, 'Test Çiftçi'), (v_buyer, 'Test Alıcı');
  insert into public.listings(id, farmer_id, crop, unit) values (v_listing, v_farmer, 'Domates', 'kg');
  insert into public.notif_prefs(user_id, new_offer_push) values (v_farmer, true);
  insert into public.device_tokens(user_id, token) values (v_farmer, 'device-token-1');

  insert into public.offers(buyer_id, farmer_id, listing_id, quantity, price_per_unit)
  values (v_buyer, v_farmer, v_listing, 10, 5)
  returning id into v_offer_id;

  select * into v_notif from public.notifications
    where related_id = v_offer_id and user_id = v_farmer and type = 'offer_received';
  perform pg_temp.assert(v_notif.id is not null, 'expected notify_offer_received to insert a notification row');

  select * into v_push_call from net.http_post_calls
    where url = 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-push'
    order by id desc limit 1;
  perform pg_temp.assert(v_push_call.id is not null, 'expected dispatch_push to still reach net.http_post for the farmer''s new_offer push');
  perform pg_temp.assert(
    (v_push_call.body ->> 'userId') = v_farmer::text,
    'expected the push payload to target the farmer'
  );
  perform pg_temp.assert(
    (v_push_call.body -> 'tokens') ? 'device-token-1',
    'expected the push payload to include the farmer''s device token'
  );
end;
$$;

-- ===================================================================================================
-- (c2) Sanity: a farmer with new_offer_push disabled must NOT get an additional push call (proves
--      the notif_prefs gate inside dispatch_push itself is untouched by this privilege-only change).
-- ===================================================================================================

do $$
declare
  v_farmer uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_before bigint;
  v_after bigint;
begin
  insert into public.profiles(id, name) values (v_farmer, 'Test Çiftçi 2'), (v_buyer, 'Test Alıcı 2');
  insert into public.listings(id, farmer_id, crop, unit) values (v_listing, v_farmer, 'Biber', 'kg');
  insert into public.notif_prefs(user_id, new_offer_push) values (v_farmer, false);
  insert into public.device_tokens(user_id, token) values (v_farmer, 'device-token-2');

  select count(*) into v_before from net.http_post_calls;
  insert into public.offers(buyer_id, farmer_id, listing_id, quantity, price_per_unit)
  values (v_buyer, v_farmer, v_listing, 3, 7);
  select count(*) into v_after from net.http_post_calls;

  perform pg_temp.assert(v_after = v_before, 'expected no push call when new_offer_push is disabled');
end;
$$;

\echo 'B-1 dispatch_push REVOKE SQL test suite: ALL ASSERTIONS PASSED'
