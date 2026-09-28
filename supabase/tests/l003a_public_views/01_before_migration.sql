-- L0-03 (a) — pre-migration state: farmer B deletes their own account through the real
-- rpc_delete_own_account (as B, role authenticated, no active listing / open order); the baseline
-- views still leak B's parcel, certification and referral_code, and anon can WRITE through them
-- (default-privilege grants + auto-updatable view + BYPASSRLS owner). Then the view column lists and
-- grants are snapshotted for the post-migration comparison.

begin;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', true);
set local role authenticated;
select public.rpc_delete_own_account();
commit;

select public.l003a_assert(
  (select deleted_at is not null and name = 'Silinmiş Kullanıcı' and city is null
   from public.profiles where id = 'b0000000-0000-0000-0000-00000000000b'),
  'pre: rpc_delete_own_account marked and anonymized B');
select public.l003a_assert(
  (select count(*) = 2 from public.parcels) and (select count(*) = 2 from public.certifications),
  'pre: rpc_delete_own_account leaves parcels/certifications in place');

set role anon;
-- Why the views stay DEFINER: anon reading the RLS'd tables directly sees nothing.
select public.l003a_assert((select count(*) = 0 from public.parcels), 'pre: anon sees no parcels directly (RLS)');
select public.l003a_assert((select count(*) = 0 from public.certifications), 'pre: anon sees no certs directly (RLS)');
select public.l003a_assert((select count(*) = 0 from public.profiles), 'pre: anon sees no profiles directly (RLS)');
-- The leak this migration closes.
select public.l003a_assert(
  exists (select 1 from public.public_parcel_cards where farmer_id = 'b0000000-0000-0000-0000-00000000000b'),
  'pre: baseline public_parcel_cards leaks deleted farmer B');
select public.l003a_assert(
  exists (select 1 from public.public_certifications where farmer_id = 'b0000000-0000-0000-0000-00000000000b'),
  'pre: baseline public_certifications leaks deleted farmer B');
select public.l003a_assert(
  (select referral_code = 'HASAT-BBBB' from public.public_farmer_profiles where id = 'b0000000-0000-0000-0000-00000000000b'),
  'pre: baseline public_farmer_profiles leaks deleted farmer B referral_code');
reset role;

-- The write hole this migration closes: anon renames A's parcel through public_parcel_cards; RLS on
-- parcels does not apply because the view writes as its BYPASSRLS owner. Rolled back afterwards.
begin;
set local role anon;
do $$
declare n int;
begin
  perform public.l003a_assert(has_table_privilege('anon', 'public.public_parcel_cards', 'UPDATE'),
    'pre: anon holds UPDATE on public_parcel_cards (default privileges)');
  update public.public_parcel_cards set name = 'anon yazdı' where id = 'a1000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform public.l003a_assert(n = 1, 'pre: anon UPDATE through public_parcel_cards succeeds (the hole)');
end $$;
reset role;
select public.l003a_assert(
  (select name = 'anon yazdı' from public.parcels where id = 'a1000000-0000-0000-0000-00000000000a'),
  'pre: anon write reached the parcels table');
rollback;
select public.l003a_assert(
  (select name = 'A Parseli' from public.parcels where id = 'a1000000-0000-0000-0000-00000000000a'),
  'pre: anon write rolled back');

create table public.l003a_cols_before as
select table_name::text, column_name::text, ordinal_position::int, data_type::text, udt_name::text
from information_schema.columns
where table_schema = 'public'
  and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications');

create table public.l003a_grants_before as
select table_name::text, grantee::text, privilege_type::text
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications')
  and grantee in ('anon', 'authenticated', 'service_role');

create table public.l003a_owner_before as
select c.relname::text, c.relowner
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('public_farmer_profiles', 'public_parcel_cards', 'public_certifications');

select public.l003a_assert((select count(*) = 25 from public.l003a_cols_before), 'pre: 8 + 11 + 6 view columns snapshotted');
