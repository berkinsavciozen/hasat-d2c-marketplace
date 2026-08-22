-- F2 Recipe Automation — Step 05 SQL test fixtures for dispatch_recipe_stage.
--
-- Minimal stand-ins for what the migration references but does not create: the anon/
-- authenticated/service_role roles (mirrors supabase/tests/f2_recipe_automation/00_fixtures.sql),
-- and a `net` schema stub standing in for the pg_net extension (not installed in a bare local
-- PostgreSQL — this project's local test route has never depended on it; see that suite's README
-- for why no extension beyond core Postgres is required). The stub records every call it receives
-- into `net.http_post_calls` so assertions can inspect url/headers/body, and can be swapped for a
-- raising variant mid-suite to prove `dispatch_recipe_stage`'s exception isolation actually works
-- (see 01_assertions.sql, test 3).
--
-- Run via supabase/tests/f2_recipe_stage_dispatch/run.sh — never run manually against a real project.

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

create schema net;
grant usage on schema net to public;

create table net.http_post_calls (
  id bigserial primary key,
  url text not null,
  headers jsonb,
  body jsonb,
  called_at timestamptz not null default now()
);

-- Default stub: records the call and returns a fake request id, exactly like a real pg_net call
-- that was accepted for async delivery. Signature matches the subset of arguments
-- dispatch_recipe_stage actually passes (named params url/headers/body).
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
as $$
declare
  _id bigint;
begin
  insert into net.http_post_calls (url, headers, body) values (url, headers, body) returning id into _id;
  return _id;
end;
$$;
