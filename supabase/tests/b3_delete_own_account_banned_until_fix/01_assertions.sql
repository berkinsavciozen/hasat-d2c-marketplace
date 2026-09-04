-- B-3 — SQL test suite for the rpc_delete_own_account banned_until fix migration.

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
-- (a) Backfill: the row already stuck on banned_until = 'infinity' before this migration (seeded in
--     fixtures, standing in for the 11 rows found on the live project) must be fixed by the
--     migration's UPDATE, with no RPC call involved.
-- ===================================================================================================

do $$
declare
  v_banned_until timestamptz;
begin
  select banned_until into v_banned_until
  from auth.users where id = '00000000-0000-0000-0000-0000000000a1';

  perform pg_temp.assert(v_banned_until is not null, 'expected the backfilled row to still have a banned_until value');
  perform pg_temp.assert(
    v_banned_until <> 'infinity'::timestamptz,
    'expected the migration backfill to clear banned_until = infinity on pre-existing rows'
  );
  perform pg_temp.assert(
    v_banned_until > now() + interval '50 years',
    'expected the backfilled banned_until to be a concrete far-future date, not a near one'
  );
end;
$$;

-- ===================================================================================================
-- (b) Going forward: a fresh call to rpc_delete_own_account() must also set a concrete far-future
--     banned_until, never 'infinity'. Simulated the same way PostgREST would authenticate the
--     caller: role authenticated + the auth.uid() GUC stub set via `set local`.
-- ===================================================================================================

do $$
declare
  v_uid uuid := '00000000-0000-0000-0000-0000000000b2';
  v_banned_until timestamptz;
  v_phone_before text := '+905551112233';
begin
  insert into public.profiles (id, role, name, phone)
  values (v_uid, 'buyer', 'Test Alıcı', v_phone_before);

  insert into auth.users (id, phone, email, raw_user_meta_data, banned_until, updated_at)
  values (v_uid, v_phone_before, 'buyer@example.com', '{}'::jsonb, null, now());

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform public.rpc_delete_own_account();
  reset role;

  select banned_until into v_banned_until from auth.users where id = v_uid;

  perform pg_temp.assert(v_banned_until is not null, 'expected banned_until to be set after account deletion');
  perform pg_temp.assert(
    v_banned_until <> 'infinity'::timestamptz,
    'expected rpc_delete_own_account to no longer write banned_until = infinity'
  );
  perform pg_temp.assert(
    v_banned_until > now() + interval '90 years' and v_banned_until < now() + interval '110 years',
    'expected banned_until to land ~100 years in the future'
  );

  -- Sanity: the rest of the function's scrub/anonymize behavior is untouched by this migration.
  perform pg_temp.assert(
    (select phone from auth.users where id = v_uid) is null,
    'expected phone to still be scrubbed on auth.users (unrelated behavior, must be unchanged)'
  );
  perform pg_temp.assert(
    (select name from public.profiles where id = v_uid) = 'Silinmiş Kullanıcı',
    'expected profile name to still be anonymized (unrelated behavior, must be unchanged)'
  );
end;
$$;

\echo 'B-3 rpc_delete_own_account banned_until fix SQL test suite: ALL ASSERTIONS PASSED'
