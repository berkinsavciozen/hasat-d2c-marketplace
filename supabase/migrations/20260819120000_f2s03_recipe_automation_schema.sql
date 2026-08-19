-- F2 Recipe Automation — Step 03: persistence model for the recipe generation pipeline.
--
-- Creates the tables the chained, short-lived Edge Function pipeline (planning -> drafting ->
-- qa_review -> safety_review -> image_generation -> publish_ready -> published) reads and writes.
-- Contracts/enums below are copied verbatim from
-- supabase/functions/_shared/recipe-automation/schemas.ts (F2 Step 02, merged in
-- hasat-d2c-marketplace#40) so the DB CHECK constraints and the Zod runtime validation never
-- drift apart independently.
--
-- Hard boundaries this migration deliberately respects:
--   * `recipes.status` is NEVER written by this pipeline. It only ever accepts
--     'draft' | 'published' (see recipes_status_check, confirmed live). The pipeline's own
--     stage/status vocabulary below is a completely separate value space.
--   * No allergen migration here. `recipes.allergen_labels` already exists live (F13) as a
--     nullable `text[]` with NO check constraint (confirmed via pg_constraint against project
--     efuqpiaavrzimvstpdpm on 2026-08-19 — no `recipes_allergen_labels_*` constraint exists).
--     `recipe_drafts.allergen_labels` below mirrors that exactly: nullable text[], no enum
--     restriction. Do not add one.
--   * `author_type` CHECK below is the live set — 'hasat' | 'ciftci' | 'sef' | 'kullanici'.
--     'hasat_ai' is NOT included (still Proposed per the Step 00 decision log). If it's approved
--     later, that is a separate, standalone migration — not smuggled in here.
--   * No public/client write (or read) access. All six tables are RLS-enabled with zero
--     anon/authenticated policies, so PostgREST denies both reads and writes for those roles by
--     default; only `service_role` (used exclusively by admin/pipeline Edge Functions) can touch
--     them. Explicit REVOKE/GRANT below makes that intent unambiguous, on top of RLS.

-- ---------------------------------------------------------------------------------------------
-- recipe_generation_batches
-- ---------------------------------------------------------------------------------------------

create table public.recipe_generation_batches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null,
  target_count int not null check (target_count > 0 and target_count <= 25),
  focus_crops text[],
  diet_focus text[] not null default '{}',
  locale text not null default 'tr',
  notes text,
  -- Free text on purpose (schemas.ts recipePlanBatchSchema.plannerModel) — not hard-coded to one
  -- provider/model id.
  planner_model text,
  planned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.recipe_generation_batches is
  'F2 Step 03. One row per RecipeBatchInput request. Never writes recipes.status.';

create trigger recipe_generation_batches_set_updated_at
  before update on public.recipe_generation_batches
  for each row execute function public.set_updated_at();

alter table public.recipe_generation_batches enable row level security;
revoke all on table public.recipe_generation_batches from anon, authenticated;
grant all on table public.recipe_generation_batches to service_role;

-- ---------------------------------------------------------------------------------------------
-- recipe_generation_jobs
-- ---------------------------------------------------------------------------------------------
-- One row per planned recipe (brief) as it moves through the pipeline. Briefs themselves
-- (recipeBriefSchema) are not persisted as a separate table — a job IS a brief promoted to a
-- trackable unit of work; brief-only fields (working_title/focus_crop/angle/target_difficulty/
-- diet_tags/locale) live directly on the job row.

create table public.recipe_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recipe_generation_batches(id) on delete cascade,
  -- "one generation job can map to at most one live recipe" — UNIQUE (not just a plain FK)
  -- so two jobs can never both claim the same published recipe row.
  recipe_id uuid references public.recipes(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,

  working_title text not null,
  -- Text crop slug, matching recipe_ingredients.crop. Never a crop_id — that column does not
  -- exist anywhere in this schema.
  focus_crop text references public.crop_config(crop) on update cascade on delete set null,
  angle text,
  target_difficulty text check (target_difficulty is null or target_difficulty = any (array['kolay','orta','zor'])),
  diet_tags text[] not null default '{}',
  locale text not null default 'tr',

  -- Pipeline stage/status — deliberately separate from recipes.status (draft|published only).
  stage text not null default 'planning' check (stage = any (array[
    'planning','drafting','qa_review','safety_review','image_generation','publish_ready','published'
  ])),
  status text not null default 'pending' check (status = any (array[
    'pending','in_progress','succeeded','failed','needs_human_review','cancelled'
  ])),

  revision_count int not null default 0 check (revision_count >= 0),
  attempt int not null default 1 check (attempt > 0),
  max_attempts int not null default 3 check (max_attempts > 0),
  next_attempt_at timestamptz,

  -- Shape-checked mirror of recipeErrorPayloadSchema (code/message/stage/retryable/occurredAt/
  -- details). Callers are responsible for redacting secrets/stack traces before writing here —
  -- this CHECK only enforces "it's a JSON object", not content safety.
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),

  -- Double-invocation protection: a stage-runner Edge Function claims a job by writing its own
  -- invocation id + a lease expiry before starting work, and clears all three on completion.
  locked_by text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  check (lock_expires_at is null or locked_at is not null),

  trace_id text,
  provider text,
  model text,
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),

  started_at timestamptz,
  finished_at timestamptz,
  check (finished_at is null or started_at is not null),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recipe_generation_jobs_recipe_id_key unique (recipe_id)
);

comment on table public.recipe_generation_jobs is
  'F2 Step 03. Pipeline state machine, one row per planned recipe. stage/status are a separate '
  'value space from recipes.status and are never written to it.';

create trigger recipe_generation_jobs_set_updated_at
  before update on public.recipe_generation_jobs
  for each row execute function public.set_updated_at();

-- Batch progress (jobs per batch, broken down by status).
create index recipe_generation_jobs_batch_status_idx on public.recipe_generation_jobs(batch_id, status);
-- Stage/status scanning (dashboards, alerting).
create index recipe_generation_jobs_stage_status_idx on public.recipe_generation_jobs(stage, status);
-- Runnable jobs: pending work a worker can pick up right now.
create index recipe_generation_jobs_runnable_idx on public.recipe_generation_jobs(next_attempt_at)
  where status = 'pending';
-- Retry scanning: anything with a scheduled next attempt, regardless of current status.
create index recipe_generation_jobs_retry_idx on public.recipe_generation_jobs(status, next_attempt_at)
  where next_attempt_at is not null;
-- Stale-lock cleanup.
create index recipe_generation_jobs_locked_idx on public.recipe_generation_jobs(lock_expires_at)
  where locked_by is not null;

alter table public.recipe_generation_jobs enable row level security;
revoke all on table public.recipe_generation_jobs from anon, authenticated;
grant all on table public.recipe_generation_jobs to service_role;

-- ---------------------------------------------------------------------------------------------
-- recipe_drafts
-- ---------------------------------------------------------------------------------------------
-- Mirrors recipeDraftPayloadSchema. ingredients/steps are stored as validated JSON (the same
-- shape recipeIngredientDraftSchema/recipeStepDraftSchema produce) rather than normalized rows —
-- they are only promoted into recipe_ingredients/recipe_steps at publish time, once a draft has
-- cleared QA and safety review.

create table public.recipe_drafts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  version int not null check (version > 0),

  title text not null,
  description text,
  cover_photo_url text,
  servings int check (servings is null or servings > 0),
  prep_minutes int check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes int check (cook_minutes is null or cook_minutes >= 0),
  rest_minutes int check (rest_minutes is null or rest_minutes >= 0),
  difficulty text check (difficulty is null or difficulty = any (array['kolay','orta','zor'])),
  cuisine text,
  diet_tags text[] not null default '{}',
  -- Mirrors recipes.allergen_labels exactly: nullable text[], NO check constraint. Do not add one
  -- here — see file header.
  allergen_labels text[],
  required_equipment text[],
  source_type text not null default 'manual' check (source_type = any (array['manual','text','photo','url'])),
  -- 'hasat_ai' intentionally excluded — see file header.
  author_type text not null default 'hasat' check (author_type = any (array['hasat','ciftci','sef','kullanici'])),
  visibility text not null default 'private' check (visibility = any (array['public','private'])),
  owner_id uuid references public.profiles(id) on delete set null,
  extraction_confidence numeric check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),

  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) >= 1),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) >= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recipe_drafts_job_id_version_key unique (job_id, version)
);

comment on table public.recipe_drafts is
  'F2 Step 03. Versioned draft payloads for a job (recipeDraftPayloadSchema). Not yet a live '
  'recipes row — promoted at publish time.';

create trigger recipe_drafts_set_updated_at
  before update on public.recipe_drafts
  for each row execute function public.set_updated_at();

alter table public.recipe_drafts enable row level security;
revoke all on table public.recipe_drafts from anon, authenticated;
grant all on table public.recipe_drafts to service_role;

-- ---------------------------------------------------------------------------------------------
-- recipe_qa_results
-- ---------------------------------------------------------------------------------------------
-- Mirrors recipeQAResultSchema. The nested safety review (temperature/timing/allergens) is
-- stored as a shape-checked JSON blob (recipeSafetyReviewSchema), with reviewed_by/reviewed_at/
-- approved pulled out as top-level columns so "what's waiting on a human" is directly indexable.

create table public.recipe_qa_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  draft_id uuid not null references public.recipe_drafts(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,

  passed boolean not null,
  -- Overall human/automated call on this QA pass — separate from `passed` (an automated QA
  -- verdict) because safety review can never be resolved by automation alone.
  decision text not null default 'pending' check (decision = any (array['pending','approved','needs_changes','rejected'])),
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),

  -- Shape-checked mirror of recipeSafetyReviewSchema (temperature/timing/allergens findings).
  safety_review jsonb not null check (jsonb_typeof(safety_review) = 'object'),
  safety_reviewed_by uuid references public.profiles(id) on delete set null,
  safety_reviewed_at timestamptz,
  -- requiresHumanReview is always true in the contract (z.literal(true)) — there is no automated
  -- path to `safety_approved = true`; a human must set reviewed_by/reviewed_at first.
  safety_approved boolean,
  check (safety_approved is not true or (safety_reviewed_by is not null and safety_reviewed_at is not null)),
  -- A QA result can never be marked 'approved' overall without the mandatory human safety
  -- sign-off — temperature/timing/allergen review always requires a human, enforced here, not
  -- just in application code.
  -- NB: `safety_approved is true` (not `= true`) is deliberate — with `= true`, a NULL
  -- safety_approved makes the whole OR evaluate to NULL, which Postgres treats as a passing
  -- CHECK, silently allowing decision='approved' with no safety sign-off at all.
  check (decision <> 'approved' or safety_approved is true),

  -- Which model/provider ran the automated QA pass. Free text on purpose.
  model text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.recipe_qa_results is
  'F2 Step 03. One row per QA pass against a recipe_drafts version. Safety review always '
  'requires a human sign-off — see the decision/safety_approved check constraints.';

create trigger recipe_qa_results_set_updated_at
  before update on public.recipe_qa_results
  for each row execute function public.set_updated_at();

create index recipe_qa_results_job_id_idx on public.recipe_qa_results(job_id);
create index recipe_qa_results_draft_id_idx on public.recipe_qa_results(draft_id);
-- Human safety-review queue: QA passes still waiting on a reviewer.
create index recipe_qa_results_pending_safety_idx on public.recipe_qa_results(checked_at)
  where safety_approved is null;

alter table public.recipe_qa_results enable row level security;
revoke all on table public.recipe_qa_results from anon, authenticated;
grant all on table public.recipe_qa_results to service_role;

-- ---------------------------------------------------------------------------------------------
-- recipe_assets
-- ---------------------------------------------------------------------------------------------
-- Generated image outputs (recipeImageSpecSchema results). 'source' = the raw Gemini output
-- before cropping, 'hero'/'square' = the 16:9 / 1:1 crops for a cover photo, 'step' = a
-- per-instruction photo (step_no required, matching recipe_steps.step_no once promoted).

create table public.recipe_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  draft_id uuid not null references public.recipe_drafts(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,

  asset_type text not null check (asset_type = any (array['source','hero','square','step'])),
  step_no int check (step_no is null or step_no > 0),
  check ((asset_type = 'step') = (step_no is not null)),

  -- 'crop-photos' is the only bucket Step 01 validated for cover + step-fallback photos
  -- (schemas.ts IMAGE_STORAGE_BUCKET) — there is no separate 'recipe-photos' bucket.
  storage_bucket text not null default 'crop-photos' check (storage_bucket = 'crop-photos'),
  storage_path text not null,
  content_type text not null default 'image/webp',
  width_px int check (width_px is null or width_px > 0),
  height_px int check (height_px is null or height_px > 0),
  source_width_px int check (source_width_px is null or source_width_px > 0),
  source_height_px int check (source_height_px is null or source_height_px > 0),

  provider text default 'google-gemini',
  model text,
  trace_id text,

  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.recipe_assets is
  'F2 Step 03. Generated image outputs per job/draft. Partial unique indexes below prevent '
  'duplicate source/hero/square assets and duplicate per-step-photo assets.';

-- At most one source/hero/square asset per (job, draft) — step_no is always null for these
-- three types, so a plain UNIQUE(job_id, draft_id, asset_type, step_no) would NOT catch
-- duplicates (NULLs never compare equal). Two partial indexes instead.
create unique index recipe_assets_unique_non_step_idx on public.recipe_assets(job_id, draft_id, asset_type)
  where asset_type <> 'step';
create unique index recipe_assets_unique_step_idx on public.recipe_assets(job_id, draft_id, step_no)
  where asset_type = 'step';
create index recipe_assets_recipe_id_idx on public.recipe_assets(recipe_id) where recipe_id is not null;

alter table public.recipe_assets enable row level security;
revoke all on table public.recipe_assets from anon, authenticated;
grant all on table public.recipe_assets to service_role;

-- ---------------------------------------------------------------------------------------------
-- recipe_generation_stage_runs
-- ---------------------------------------------------------------------------------------------
-- INCLUDED. Justification (see completion report for the full writeup): recipe_generation_jobs
-- only carries the CURRENT attempt/last_error — once a retry starts, the previous attempt's
-- failure reason, provider, trace, and timing are overwritten and lost. Because this pipeline is
-- explicitly retrying, short-lived, stateless Edge Functions calling flaky LLM/image providers
-- (attempt/max_attempts/next_attempt_at exist on the job specifically because retries WILL
-- happen), losing prior-attempt history removes exactly the diagnostic trail a human needs when
-- a job lands in 'needs_human_review' after several failed attempts. The shape mirrors
-- recipeStageResultSchema — "the generic envelope every chained stage invocation returns" — 1:1,
-- so persisting it is a direct, not invented, mapping. It is also a second, complementary
-- double-invocation guard: UNIQUE(job_id, stage, attempt) lets a stage runner use
-- INSERT ... ON CONFLICT DO NOTHING as an idempotency check layered on top of the job's
-- locked_by/locked_at/lock_expires_at fields.

create table public.recipe_generation_stage_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  batch_id uuid not null references public.recipe_generation_batches(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,

  stage text not null check (stage = any (array[
    'planning','drafting','qa_review','safety_review','image_generation','publish_ready','published'
  ])),
  status text not null check (status = any (array[
    'pending','in_progress','succeeded','failed','needs_human_review','cancelled'
  ])),
  attempt int not null check (attempt > 0),

  started_at timestamptz not null,
  finished_at timestamptz,
  check (finished_at is null or finished_at >= started_at),

  output jsonb,
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),

  trace_id text,
  provider text,
  model text,
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),

  created_at timestamptz not null default now(),

  constraint recipe_generation_stage_runs_job_stage_attempt_key unique (job_id, stage, attempt)
);

comment on table public.recipe_generation_stage_runs is
  'F2 Step 03. One row per stage invocation attempt (recipeStageResultSchema), kept even after '
  'a job retries, for attempt-level observability. See migration header for inclusion rationale.';

create index recipe_generation_stage_runs_batch_id_idx on public.recipe_generation_stage_runs(batch_id);
create index recipe_generation_stage_runs_stage_status_idx on public.recipe_generation_stage_runs(stage, status);

alter table public.recipe_generation_stage_runs enable row level security;
revoke all on table public.recipe_generation_stage_runs from anon, authenticated;
grant all on table public.recipe_generation_stage_runs to service_role;
