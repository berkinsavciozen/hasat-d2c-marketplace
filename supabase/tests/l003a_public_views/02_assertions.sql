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

-- Grants and owner unchanged; still DEFINER (no security_invoker); comments present.
select public.l003a_assert(
  not exists (
    (select table_name::text, grantee::text, privilege_type::text from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
       and grantee in ('anon', 'authenticated', 'service_role')
     except select * from public.l003a_grants_before)
    union all
    (select * from public.l003a_grants_before
     except select table_name::text, grantee::text, privilege_type::text from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
       and grantee in ('anon', 'authenticated', 'service_role'))
  ),
  'view grants unchanged');
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
