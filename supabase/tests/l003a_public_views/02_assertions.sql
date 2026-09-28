-- L0-03 (a) — post-migration assertions (migration applied twice by run.sh).

-- Column lists: name, position and type identical to the baseline views.
select public.l003a_assert(
  not exists (
    (select table_name::text, column_name::text, ordinal_position::int, data_type::text, udt_name::text
     from information_schema.columns
     where table_schema = 'public'
       and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
     except select * from public.l003a_cols_before)
    union all
    (select * from public.l003a_cols_before
     except select table_name::text, column_name::text, ordinal_position::int, data_type::text, udt_name::text
     from information_schema.columns
     where table_schema = 'public'
       and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications'))
  ),
  'view column lists (ordinal_position + data_type) unchanged');

-- Writes through the views are closed (section 5). The explicit anon UPDATE on public_parcel_cards
-- runs first so the revoke mutation in run.sh fails exactly here.
begin;
set local role anon;
do $$
begin
  begin
    update public.public_parcel_cards set name = 'anon yazdı' where id = 'a1000000-0000-0000-0000-00000000000a';
    raise exception 'L003A: anon UPDATE public_parcel_cards -> 42501';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- INSERT / UPDATE / DELETE denied (42501) for anon and authenticated on all three views; SELECT works;
-- has_table_privilege: SELECT true, INSERT/UPDATE/DELETE/TRUNCATE false.
do $$
declare
  r text;
  v text;
  op text;
  stmt text;
  stmts jsonb := jsonb_build_object(
    'public_parcel_cards', jsonb_build_object(
      'INSERT', $q$insert into public.public_parcel_cards (farm_id, farmer_id, name, area) values (gen_random_uuid(), 'a0000000-0000-0000-0000-00000000000a', 'x', 1)$q$,
      'UPDATE', $q$update public.public_parcel_cards set name = 'x' where id = 'a1000000-0000-0000-0000-00000000000a'$q$,
      'DELETE', $q$delete from public.public_parcel_cards where id = 'a1000000-0000-0000-0000-00000000000a'$q$),
    'public_farmer_profiles', jsonb_build_object(
      'INSERT', $q$insert into public.public_farmer_profiles (id, role, name) values (gen_random_uuid(), 'farmer', 'x')$q$,
      'UPDATE', $q$update public.public_farmer_profiles set tier = 'premium', name = 'x' where id = 'a0000000-0000-0000-0000-00000000000a'$q$,
      'DELETE', $q$delete from public.public_farmer_profiles where id = 'a0000000-0000-0000-0000-00000000000a'$q$),
    'public_certifications', jsonb_build_object(
      'INSERT', $q$insert into public.public_certifications (farmer_id, type, verified_at) values ('a0000000-0000-0000-0000-00000000000a', 'organik', now())$q$,
      'UPDATE', $q$update public.public_certifications set verified_at = now() where id = 'a2000000-0000-0000-0000-00000000000a'$q$,
      'DELETE', $q$delete from public.public_certifications where id = 'a2000000-0000-0000-0000-00000000000a'$q$));
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach v in array array['public_parcel_cards', 'public_farmer_profiles', 'public_certifications'] loop
      perform public.l003a_assert(has_table_privilege(r, 'public.' || v, 'SELECT'), format('%s has SELECT on %s', r, v));
      foreach op in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        perform public.l003a_assert(not has_table_privilege(r, 'public.' || v, op), format('%s has no %s on %s', r, op, v));
      end loop;
      execute format('set local role %I', r);
      execute format('select count(*) from public.%I', v);
      foreach op in array array['INSERT', 'UPDATE', 'DELETE'] loop
        stmt := stmts -> v ->> op;
        begin
          execute stmt;
          raise exception 'L003A: % % % -> 42501', r, op, v;
        exception when insufficient_privilege then null;
        end;
      end loop;
      reset role;
    end loop;
  end loop;
end $$;

-- Data untouched by the denied writes.
select public.l003a_assert(
  (select count(*) = 2 from public.parcels) and (select count(*) = 2 from public.certifications)
  and (select count(*) = 2 from public.profiles)
  and (select name = 'A Parseli' from public.parcels where id = 'a1000000-0000-0000-0000-00000000000a')
  and (select name = 'Çiftçi A' and tier = 'free' from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a'),
  'denied writes changed nothing');

-- Grants: SELECT grants identical to before; no write grants left for PUBLIC/anon/authenticated;
-- service_role untouched. Owner unchanged; still DEFINER (no security_invoker); comments present.
select public.l003a_assert(
  not exists (
    (select table_name::text, grantee::text, privilege_type::text from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
       and grantee in ('anon', 'authenticated', 'service_role') and privilege_type = 'SELECT'
     except select * from public.l003a_grants_before where privilege_type = 'SELECT')
    union all
    (select * from public.l003a_grants_before where privilege_type = 'SELECT'
     except select table_name::text, grantee::text, privilege_type::text from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
       and grantee in ('anon', 'authenticated', 'service_role') and privilege_type = 'SELECT')
  ),
  'view SELECT grants unchanged');
select public.l003a_assert(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  'no write grants for PUBLIC/anon/authenticated');
select public.l003a_assert(
  (select count(*) = 3 * 4 from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
     and grantee = 'service_role' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  'service_role write grants untouched');
select public.l003a_assert(
  (select count(*) = 3 from public.l003a_owner_before b
   join pg_class c on c.relname = b.relname and c.relnamespace = 'public'::regnamespace
   where c.relowner = b.relowner),
  'view owner unchanged');
select public.l003a_assert(
  (select bool_and(coalesce(not (reloptions @> array['security_invoker=true']), true)
                   and coalesce(not (reloptions @> array['security_invoker=on']), true))
   from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')),
  'views stay SECURITY DEFINER (no security_invoker)');
select public.l003a_assert(
  (select count(*) = 3 from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
     and obj_description(oid, 'pg_class') like 'Anon vitrin projeksiyonu. Bilinçli SECURITY DEFINER%L0-03 (a), 2026-09-28.'),
  'COMMENT ON VIEW present on all three views');

-- anon: the storefront reads.
set role anon;

select public.l003a_assert(
  (select array_agg(id order by id) = array['a1000000-0000-0000-0000-00000000000a'::uuid] from public.public_parcel_cards),
  'public_parcel_cards: yalnız A''nın parseli');
select public.l003a_assert(
  (select array_agg(id order by id) = array['a2000000-0000-0000-0000-00000000000a'::uuid] from public.public_certifications),
  'public_certifications: yalnız A''nınki');

select public.l003a_assert(
  (select count(*) = 2 from public.public_farmer_profiles
   where id in ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')),
  'public_farmer_profiles: A ve B ikisi de var');
select public.l003a_assert(
  (select name = 'Silinmiş Kullanıcı' and city is null and referral_code is null
   from public.public_farmer_profiles where id = 'b0000000-0000-0000-0000-00000000000b'),
  'public_farmer_profiles: B anonim, city null, referral_code null');
select public.l003a_assert(
  (select name = 'Çiftçi A' and city = 'İzmir' and referral_code = 'HASAT-AAAA'
   from public.public_farmer_profiles where id = 'a0000000-0000-0000-0000-00000000000a'),
  'public_farmer_profiles: A''nın referral_code''u dolu');

-- Invite-code lookup (queries.ts: .eq('referral_code', code)).
select public.l003a_assert(
  (select count(*) = 1 from public.public_farmer_profiles where referral_code = 'HASAT-AAAA'),
  'referral_code eq: A için 1 satır');
select public.l003a_assert(
  (select count(*) = 0 from public.public_farmer_profiles where referral_code = 'HASAT-BBBB'),
  'referral_code eq: B''nin eski koduyla 0 satır');

-- RLS'd tables are still closed to anon directly (the reason the views stay DEFINER).
select public.l003a_assert((select count(*) = 0 from public.parcels), 'anon sees no parcels directly (RLS)');

reset role;

-- A's own data is untouched and still readable through the views by authenticated users too.
set role authenticated;
select public.l003a_assert(
  (select count(*) = 1 from public.public_parcel_cards) and (select count(*) = 1 from public.public_certifications),
  'authenticated sees the same filtered rows');
reset role;

select 'l003a assertions: all passed' as result;
