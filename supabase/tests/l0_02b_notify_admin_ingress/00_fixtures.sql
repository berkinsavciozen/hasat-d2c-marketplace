-- Local-only stand-ins for Supabase roles, Vault, pg_net and pg_cron. No network call is made.

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

create schema extensions;
create function extensions.hmac(value text, secret text, algorithm text)
returns bytea language sql immutable
as $$ select convert_to(md5(value || secret || algorithm), 'utf8') $$;

create schema vault;
create table vault.decrypted_secrets (
  name text not null,
  decrypted_secret text not null,
  created_at timestamptz not null default now()
);
insert into vault.decrypted_secrets(name, decrypted_secret)
values ('notify_admin_ingress_hmac', repeat('s', 48));

create schema net;
create table net.http_post_calls (
  id bigserial primary key,
  url text not null,
  body jsonb not null,
  params jsonb not null,
  headers jsonb not null,
  timeout_milliseconds integer not null,
  called_at timestamptz not null default now()
);
create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 1000
)
returns bigint language plpgsql
as $$
declare _id bigint;
begin
  insert into net.http_post_calls(url, body, params, headers, timeout_milliseconds)
  values (url, body, params, headers, timeout_milliseconds)
  returning id into _id;
  return _id;
end;
$$;

create schema cron;
create table cron.job (
  jobid bigserial primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null
);
create function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql
as $$
declare _id bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (job_name, schedule, command)
  returning jobid into _id;
  return _id;
end;
$$;
create function cron.unschedule(p_jobid bigint)
returns boolean language plpgsql
as $$
begin
  delete from cron.job where jobid = p_jobid;
  return found;
end;
$$;

create table public.profiles (
  id uuid primary key,
  name text
);
create table public.crop_config (
  crop text primary key,
  display_name text
);
create table public.crop_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id),
  crop_name_free_text text not null,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create table public.crop_type_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  crop_name text not null,
  suggested_category_group text,
  suggested_default_unit text,
  suggested_harvest_window_start_month integer,
  suggested_harvest_window_end_month integer,
  lifecycle_notes text,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.crop_requests enable row level security;
alter table public.crop_type_requests enable row level security;

-- Represents the live pre-migration public trigger function and trigger that the migration removes.
create function public.notify_new_crop_type_request()
returns trigger language plpgsql security definer set search_path to public
as $$ begin return new; end $$;
create trigger tg_crop_type_requests_notify
after insert on public.crop_type_requests
for each row execute function public.notify_new_crop_type_request();
