-- L0-03 (a) — SQL test fixtures for 20260928095806_l003a_public_views_hide_deleted_farmers.sql.
--
-- Live shapes from 20260917120000_baseline_consolidated_schema_2026-09-17.sql: profiles, parcels and
-- certifications (columns verbatim, RLS enabled with the owner policies), plus the minimal tables
-- rpc_delete_own_account touches. Tables and views are owned by a NON-superuser BYPASSRLS role
-- (hasat_owner, like live `postgres`) so the SECURITY DEFINER views behave as live: they read and
-- write as the owner and bypass RLS, while anon reading the tables directly sees nothing. run.sh
-- then installs, extracted VERBATIM from the baseline file, the three pre-fix views (as hasat_owner),
-- their grants, protect_profile_deleted_at with its trigger, and rpc_delete_own_account, then
-- `grant all` on the three views to anon/authenticated (live Supabase default privileges).
--
-- Run via supabase/tests/l003a_public_views/run.sh — never against a real project.

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
  if not exists (select 1 from pg_roles where rolname = 'hasat_owner') then
    create role hasat_owner nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage, create on schema public to hasat_owner;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create type public.user_role as enum ('farmer', 'buyer');
create type public.user_tier as enum ('free', 'premium');
create type public.company_type as enum ('restoran', 'otel', 'organik_market', 'ihracatci', 'diger', 'bireysel');
create type public.certification_type as enum ('organik', 'iso', 'cografi', 'hasat', 'premium', 'yeni');

-- --- Live-shaped tables (columns verbatim from the baseline) -----------------------------------
create table public.profiles (
  id uuid not null primary key,
  role public.user_role not null,
  name text,
  phone text,
  city text,
  premium boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  tier public.user_tier default 'free'::public.user_tier not null,
  iban text,
  bank_account_name text,
  referral_code text,
  referred_by uuid,
  buyer_type public.company_type,
  premium_until timestamp with time zone,
  deleted_at timestamp with time zone
);

create table public.parcels (
  id uuid default gen_random_uuid() not null primary key,
  farm_id uuid not null,
  farmer_id uuid not null,
  name text not null,
  area numeric(6,1) not null,
  crops text[] default '{}'::text[] not null,
  location_label text,
  lat numeric(10,6),
  lng numeric(10,6),
  created_at timestamp with time zone default now() not null,
  parcel_photo_urls text[] default '{}'::text[] not null,
  production_method text default 'outdoor'::text,
  is_primary boolean default false
);

create table public.certifications (
  id uuid default gen_random_uuid() not null primary key,
  farmer_id uuid not null,
  type public.certification_type not null,
  verified_at timestamp with time zone,
  expires_at timestamp with time zone,
  document_url text,
  created_at timestamp with time zone default now() not null
);

alter table public.profiles enable row level security;
alter table public.parcels enable row level security;
alter table public.certifications enable row level security;
-- Owner policies verbatim from the baseline (the buyer/order-relation policies need tables this
-- suite does not model; none of them grant anon anything).
create policy "Users read own profile" on public.profiles for select to public using ((auth.uid() = id));
create policy "Users update own profile" on public.profiles for update to public using ((auth.uid() = id));
create policy "Farmers CRUD own parcels" on public.parcels for all to public using ((auth.uid() = farmer_id));
create policy "Farmers manage own certs" on public.certifications for all to public using ((auth.uid() = farmer_id));

-- --- Minimal tables rpc_delete_own_account touches ----------------------------------------------
create table auth.users (
  id uuid primary key,
  phone text, phone_confirmed_at timestamptz, phone_change text, phone_change_token text,
  email text, email_confirmed_at timestamptz, email_change text, email_change_token_new text,
  email_change_token_current text, encrypted_password text, confirmation_token text,
  recovery_token text, reauthentication_token text, raw_user_meta_data jsonb,
  banned_until timestamptz, updated_at timestamptz
);
create table public.listings (id uuid primary key default gen_random_uuid(), farmer_id uuid, status text);
create table public.orders (id uuid primary key default gen_random_uuid(), farmer_id uuid, status text);
create table public.buyer_addresses (id uuid primary key default gen_random_uuid(), buyer_id uuid);
create table public.buyer_profiles (user_id uuid primary key);
create table public.recipe_saves (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.recipes (id uuid primary key default gen_random_uuid(), owner_id uuid, author_type text);
create table public.device_tokens (user_id uuid, token text);
create table public.ai_usage_tracking (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.ai_chat_messages (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.mcp_tool_calls (id uuid primary key default gen_random_uuid(), user_id uuid);

-- Supabase-default table grants (RLS is the gate on the three tables above).
grant all on all tables in schema public to anon, authenticated, service_role;

alter table public.profiles owner to hasat_owner;
alter table public.parcels owner to hasat_owner;
alter table public.certifications owner to hasat_owner;

-- --- Seed: farmer A (stays), farmer B (deletes own account in 01_before_migration.sql) ---------
insert into auth.users (id, email, phone) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@fixture.invalid', '+900000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@fixture.invalid', '+900000000002');

insert into public.profiles (id, role, name, city, phone, iban, referral_code) values
  ('a0000000-0000-0000-0000-00000000000a', 'farmer', 'Çiftçi A', 'İzmir', '+900000000001', 'TR-fixture-A', 'HASAT-AAAA'),
  ('b0000000-0000-0000-0000-00000000000b', 'farmer', 'Çiftçi B', 'Aydın', '+900000000002', 'TR-fixture-B', 'HASAT-BBBB');

insert into public.parcels (id, farm_id, farmer_id, name, area, crops, location_label, parcel_photo_urls) values
  ('a1000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'a0000000-0000-0000-0000-00000000000a',
   'A Parseli', 12.5, '{domates}', 'Menderes', '{https://fixture.invalid/a.jpg}'),
  ('b1000000-0000-0000-0000-00000000000b', gen_random_uuid(), 'b0000000-0000-0000-0000-00000000000b',
   'B Parseli', 3.0, '{incir}', 'Germencik', '{https://fixture.invalid/b.jpg}');

insert into public.certifications (id, farmer_id, type, verified_at) values
  ('a2000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'organik', now()),
  ('b2000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'cografi', now());

-- Shared assertion helper (invoker; callable while `set role anon`).
create function public.l003a_assert(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'L003A: %', message; end if;
end $$;
