-- B-3 — SQL test fixtures for the rpc_delete_own_account banned_until fix migration
-- (20260904200000_b3_delete_own_account_banned_until_fix.sql).
--
-- Same convention as supabase/tests/b2_harvest_reminders_revoke/00_fixtures.sql: minimal
-- stand-ins for the anon/authenticated/service_role roles, plus the *pre-fix* production shape of
-- rpc_delete_own_account (body copied verbatim from migration 20260804200339, banned_until =
-- 'infinity' bug included) and the minimal auth.users / public.* tables it touches, so the suite
-- proves the fix migration against the real call graph instead of a stand-in.
--
-- auth.uid() is stubbed as a plain SQL function reading a custom GUC
-- (request.jwt.claim.sub) so the assertions can impersonate a specific user the same way
-- PostgREST would, via `set local`.
--
-- Also seeds one auth.users row already stuck on banned_until = 'infinity' from *before* this
-- fix (simulating the 11 rows found on the live project), to exercise the migration's backfill
-- UPDATE, not just the function's new behavior going forward.
--
-- Run via supabase/tests/b3_delete_own_account_banned_until_fix/run.sh — never run manually
-- against a real project.

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
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Stand-in for auth.uid(): reads a custom GUC instead of a real JWT, exactly the same shape
-- PostgREST's own auth.uid() reads (current_setting('request.jwt.claim.sub', true)).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ===================================================================================================
-- Minimal auth.users stand-in: just the columns rpc_delete_own_account reads/writes.
-- ===================================================================================================

create table auth.users (
  id uuid primary key,
  phone text,
  phone_confirmed_at timestamptz,
  phone_change text,
  phone_change_token text,
  email text,
  email_confirmed_at timestamptz,
  email_change text,
  email_change_token_new text,
  email_change_token_current text,
  encrypted_password text,
  confirmation_token text,
  recovery_token text,
  reauthentication_token text,
  raw_user_meta_data jsonb,
  banned_until timestamptz,
  updated_at timestamptz
);

-- A user already scrubbed by the pre-fix function, still stuck on 'infinity' -- the target of
-- this migration's backfill UPDATE.
insert into auth.users (id, phone, email, raw_user_meta_data, banned_until, updated_at)
values (
  '00000000-0000-0000-0000-0000000000a1',
  null, null, '{}'::jsonb,
  'infinity'::timestamptz,
  now() - interval '1 day'
);

-- ===================================================================================================
-- Minimal public.* schema: just enough of profiles/listings/orders/etc. for the real function
-- body to run end to end for a 'buyer' account (no farmer guard branch needed for this suite --
-- that logic is untouched by this migration and already covered by its own tests/usage).
-- ===================================================================================================

create type public.user_role as enum ('farmer', 'buyer');

create table public.profiles (
  id uuid primary key,
  role public.user_role not null,
  name text,
  phone text,
  city text,
  iban text,
  bank_account_name text
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid,
  status text
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid,
  status text
);

create table public.buyer_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid
);

create table public.buyer_profiles (
  user_id uuid primary key
);

create table public.recipe_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  author_type text
);

create table public.device_tokens (
  user_id uuid,
  token text
);

create table public.ai_usage_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
);

create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
);

create table public.mcp_tool_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
);

grant select, insert, update, delete on
  public.profiles, public.listings, public.orders, public.buyer_addresses, public.buyer_profiles,
  public.recipe_saves, public.recipes, public.device_tokens, public.ai_usage_tracking,
  public.ai_chat_messages, public.mcp_tool_calls
  to anon, authenticated, service_role;

-- ===================================================================================================
-- Pre-fix rpc_delete_own_account, body copied verbatim from the live Hasat project's migration
-- 20260804200339 (see PR description for the pg_get_functiondef / schema_migrations.statements
-- proof) -- reproduces the 'infinity' bug this suite's migration under test must fix.
-- ===================================================================================================

create or replace function public.rpc_delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_has_active_listing boolean;
  v_has_open_order boolean;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profil bulunamadı';
  end if;

  if v_role = 'farmer' then
    select exists(
      select 1 from public.listings where farmer_id = v_uid and status = 'active'
    ) into v_has_active_listing;

    select exists(
      select 1 from public.orders
      where farmer_id = v_uid and status not in ('completed', 'cancelled')
    ) into v_has_open_order;

    if v_has_active_listing or v_has_open_order then
      raise exception 'Önce açık ilanlarınızı ve siparişlerinizi tamamlayın';
    end if;
  end if;

  delete from public.buyer_addresses where buyer_id = v_uid;
  delete from public.buyer_profiles where user_id = v_uid;
  delete from public.recipe_saves where user_id = v_uid;
  delete from public.recipes where owner_id = v_uid and author_type = 'kullanici';
  delete from public.device_tokens where user_id = v_uid;
  delete from public.ai_usage_tracking where user_id = v_uid;
  delete from public.ai_chat_messages where user_id = v_uid;
  delete from public.mcp_tool_calls where user_id = v_uid;

  update public.profiles
  set name = 'Silinmiş Kullanıcı',
      phone = null,
      city = null,
      iban = null,
      bank_account_name = null
  where id = v_uid;

  update auth.users
  set phone = null,
      phone_confirmed_at = null,
      phone_change = null,
      phone_change_token = '',
      email = null,
      email_confirmed_at = null,
      email_change = null,
      email_change_token_new = '',
      email_change_token_current = '',
      encrypted_password = '',
      confirmation_token = '',
      recovery_token = '',
      reauthentication_token = '',
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'::timestamptz,
      updated_at = now()
  where id = v_uid;
end;
$$;

revoke all on function public.rpc_delete_own_account() from public;
grant execute on function public.rpc_delete_own_account() to authenticated;
revoke execute on function public.rpc_delete_own_account() from anon;
