-- Admin cover regeneration — SQL test fixtures for 20260925120000_admin_set_recipe_cover.sql.
--
-- Reduced copies of the LIVE shapes in 20260917120000_baseline_consolidated_schema_2026-09-17.sql:
-- recipes, recipe_generation_batches, recipe_generation_jobs, recipe_drafts, recipe_assets — with
-- every NOT NULL / CHECK / UNIQUE / FK the RPC can hit (notably recipe_assets' NOT NULL
-- job_id/draft_id, its (job_id, draft_id, asset_type) partial unique index and the
-- recipe_generation_jobs.recipe_id unique key), plus the live BEFORE UPDATE OF recipe_id trigger
-- on recipe_generation_jobs as a tripwire (it must never fire for a synthetic job).
--
-- Run via supabase/tests/admin_set_recipe_cover/run.sh — never against a real project.

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  cover_photo_url text,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);
create trigger trg_recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_generation_batches (
  id uuid default gen_random_uuid() not null primary key,
  target_count integer not null check (target_count > 0 and target_count <= 25),
  diet_focus text[] default '{}'::text[] not null,
  notes text,
  status text default 'active' not null
    check (status = any (array['active', 'completed', 'failed', 'cancelled'])),
  started_at timestamptz,
  completed_at timestamptz,
  review_status text default 'pending_review' not null
    check (review_status = any (array['pending_review', 'approved', 'rejected'])),
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 200),
  reviewed_at timestamptz,
  fanned_out_at timestamptz,
  created_at timestamptz default now() not null,
  check (completed_at is null or started_at is not null),
  check (status = any (array['completed', 'failed', 'cancelled']) or completed_at is null),
  check (reviewed_at is null or review_status <> 'pending_review')
);

create table public.recipe_generation_jobs (
  id uuid default gen_random_uuid() not null primary key,
  batch_id uuid not null references public.recipe_generation_batches(id),
  brief_id uuid not null,
  recipe_id uuid unique references public.recipes(id),
  working_title text not null,
  stage text default 'plan' not null
    check (stage = any (array['plan', 'write', 'qa', 'revise', 'image', 'finalize', 'awaiting_approval', 'publish'])),
  status text default 'queued' not null
    check (status = any (array['queued', 'running', 'retryable', 'failed', 'awaiting_approval', 'approved', 'rejected', 'completed', 'cancelled'])),
  started_at timestamptz,
  finished_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  unique (batch_id, brief_id),
  check (finished_at is null or started_at is not null),
  check (completed_at is null or status = any (array['completed', 'failed', 'cancelled']))
);

create function public.tg_fixture_publish_tripwire()
returns trigger language plpgsql as $$
begin
  raise exception 'TRIPWIRE: recipe_jobs_finalize_recipe_facts must not fire';
end;
$$;
create trigger recipe_jobs_finalize_recipe_facts
  before update of recipe_id on public.recipe_generation_jobs
  for each row when (old.recipe_id is null and new.recipe_id is not null)
  execute function public.tg_fixture_publish_tripwire();

create table public.recipe_drafts (
  id uuid default gen_random_uuid() not null primary key,
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) >= 1),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) >= 1),
  unique (job_id, id),
  unique (job_id, version)
);

create table public.recipe_assets (
  id uuid default gen_random_uuid() not null primary key,
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  draft_id uuid not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  asset_type text not null check (asset_type = any (array['source', 'hero', 'square', 'step'])),
  step_no integer check (step_no is null or step_no > 0),
  storage_bucket text default 'crop-photos' not null check (storage_bucket = 'crop-photos'),
  storage_path text not null,
  content_type text default 'image/webp' not null,
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  source_width_px integer check (source_width_px is null or source_width_px > 0),
  source_height_px integer check (source_height_px is null or source_height_px > 0),
  quality integer check (quality is null or (quality >= 1 and quality <= 100)),
  prompt text,
  processing_params jsonb check (processing_params is null or jsonb_typeof(processing_params) = 'object'),
  validation_status text check (validation_status is null or validation_status = any (array['pending', 'passed', 'failed', 'warning'])),
  validation_results jsonb check (validation_results is null or jsonb_typeof(validation_results) = 'object'),
  provider text default 'google-gemini',
  model text,
  trace_id text,
  generated_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  check ((asset_type = 'step') = (step_no is not null)),
  foreign key (job_id, draft_id) references public.recipe_drafts(job_id, id) on delete cascade
);
create unique index recipe_assets_unique_non_step_idx on public.recipe_assets
  using btree (job_id, draft_id, asset_type) where (asset_type <> 'step');

grant all on public.recipes, public.recipe_generation_batches, public.recipe_generation_jobs,
  public.recipe_drafts, public.recipe_assets to service_role;
