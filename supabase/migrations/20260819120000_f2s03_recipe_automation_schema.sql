-- F2 Recipe Automation — Step 03: persistence model for the recipe generation pipeline.
--
-- Creates the tables the chained, short-lived Edge Function pipeline (plan -> write -> qa ->
-- revise? -> image -> finalize -> awaiting_approval -> publish) reads and writes. Contracts/enums
-- below are copied verbatim from supabase/functions/_shared/recipe-automation/schemas.ts, which
-- Step 03A (this revision) realigned to RecipeAutomation.md §3/§5.3's canonical vocabulary and QA
-- contract, so the DB CHECK constraints and the Zod runtime validation never drift apart
-- independently.
--
-- Step 03A reconciliation (2026-08-19/20): this migration was merged (PR #41) and this RPC
-- migration (PR #42) BEFORE either was applied to any Supabase environment (verified via
-- `list_migrations`/`list_branches` against project efuqpiaavrzimvstpdpm immediately before this
-- revision — neither `20260819120000_f2s03_recipe_automation_schema` nor
-- `20260819150000_f2s04_recipe_validation_rpcs` appears in the applied list, and no branches
-- exist). Because both are unapplied everywhere, this file is corrected IN PLACE — same filename/
-- timestamp, same migration identity — rather than superseded by a forward corrective migration.
-- Nothing below rewrites the history of an already-applied migration.
--
-- Step 03B correction (narrow, post-PR-#43): re-verified via the same `list_migrations`/
-- `list_branches` check (still unapplied everywhere, still no branches) immediately before this
-- revision, so this file is again corrected IN PLACE. Step 03A's `recipe_qa_results` accidentally
-- introduced `check (decision <> 'approved' or safety_approved is true)` — forcing a human safety
-- sign-off before an automated QA result could be marked 'approved', which contradicts §2.1/§9's
-- qa->image->finalize->awaiting_approval->publish order (human safety review is an
-- awaiting_approval/publish-stage gate, not a qa-stage one) and was never present in
-- schemas.ts's own `recipeQAResultSchema`. That one CHECK is removed below; nothing else in this
-- migration (state vocabulary, RecipePlanBatch/brief identity, composite relational integrity,
-- lock/lifecycle fields, asset audit metadata) is touched. See `recipe_qa_results` below for the
-- full rationale, kept in place of the removed CHECK.
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

  -- Step 03A: batch-level lifecycle, distinguishing an in-flight batch from one whose jobs have
  -- all finished (successfully or not) — RecipeAutomation.md §8's proposed batches table and the
  -- Step 03A brief both require this; the original migration had no status/lifecycle column at
  -- all. Deliberately coarser than a job's stage/status (see recipe_generation_jobs below) — a
  -- batch does not move through the pipeline itself, it just tracks whether its jobs are still
  -- being worked.
  status text not null default 'active' check (status = any (array['active','completed','failed','cancelled'])),
  started_at timestamptz,
  completed_at timestamptz,
  check (completed_at is null or started_at is not null),
  check (status = any (array['completed','failed','cancelled']) or completed_at is null),
  -- Shape-checked free-form summary of what went wrong across the batch's jobs, if status is
  -- 'failed'. Same "shape not content" convention as recipe_generation_jobs.last_error below.
  error_summary jsonb check (error_summary is null or jsonb_typeof(error_summary) = 'object'),

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
-- diet_tags/locale) live directly on the job row. `brief_id` (below) still captures the Planner's
-- own `RecipeBrief.briefId` value, so a job is traceable back to the exact planning-stage brief
-- it was promoted from without needing a separate briefs table (see Step 03A reconciliation note
-- on `brief_id`).

create table public.recipe_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recipe_generation_batches(id) on delete cascade,
  -- Step 03A: RecipePlanBatch's Step 02 shape carried a singular `jobId` even though one plan
  -- produces MANY briefs and only one job exists per approved brief — that field was removed from
  -- the Zod contract (see schemas.ts). What a job DOES need to keep is the stable identity of the
  -- specific brief it was promoted from (`RecipeBrief.briefId`, generated by the Planner) — not
  -- reconstructible from working_title/focus_crop/... alone once a title has gone through
  -- revision. UNIQUE(batch_id, brief_id) also makes accidental double-promotion of the same brief
  -- into two jobs a constraint violation, not just an application bug.
  brief_id uuid not null,
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

  -- Step 03A: pipeline stage/status, realigned to RecipeAutomation.md §3's canonical vocabulary
  -- verbatim (the Step 02/03 version used a paraphrase — planning/drafting/qa_review/
  -- safety_review/image_generation/publish_ready/published — that silently dropped the revise
  -- loop, finalize step and awaiting-approval gate as distinct, addressable states). Deliberately
  -- separate from recipes.status (draft|published only) — see file header.
  stage text not null default 'plan' check (stage = any (array[
    'plan','write','qa','revise','image','finalize','awaiting_approval','publish'
  ])),
  status text not null default 'queued' check (status = any (array[
    'queued','running','retryable','failed','awaiting_approval','approved','rejected','completed','cancelled'
  ])),

  revision_count int not null default 0 check (revision_count >= 0 and revision_count <= 2),
  attempt int not null default 1 check (attempt > 0),
  max_attempts int not null default 3 check (max_attempts > 0),
  next_attempt_at timestamptz,

  -- Shape-checked mirror of recipeErrorPayloadSchema (code/message/stage/retryable/occurredAt/
  -- details). Callers are responsible for redacting secrets/stack traces before writing here —
  -- this CHECK only enforces "it's a JSON object", not content safety.
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),

  -- Double-invocation protection: a stage-runner Edge Function claims a job by writing its own
  -- invocation id + a lease expiry before starting work, and clears all three on completion.
  -- Step 03A: the original CHECK only forbade lock_expires_at without locked_at, leaving
  -- locked_by-without-locked_at (or vice versa) representable — a genuinely partial lock state
  -- that no code path should ever produce. Replaced with an all-or-nothing CHECK: either all
  -- three lock columns are null (unclaimed) or all three are set (claimed). This is also the
  -- shape the Step 05 atomic-claim helper needs: a single
  -- `UPDATE ... WHERE locked_by IS NULL OR lock_expires_at < now() ...` can never leave the row in
  -- a half-claimed state, because half-claimed states are now unrepresentable.
  locked_by text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  check (
    (locked_by is null and locked_at is null and lock_expires_at is null)
    or (locked_by is not null and locked_at is not null and lock_expires_at is not null)
  ),

  trace_id text,
  provider text,
  model text,
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),

  started_at timestamptz,
  finished_at timestamptz,
  check (finished_at is null or started_at is not null),
  -- Step 03A: distinct from `finished_at` (the CURRENT attempt's finish time, mirroring
  -- recipeStageResultSchema.finishedAt) — `completed_at` marks the job AS A WHOLE reaching a
  -- terminal state (completed/failed/cancelled), not just the current attempt. Required by the
  -- Step 03A brief's "lifecycle fields ... including completion timestamps". 'rejected' is
  -- deliberately excluded from this terminal set — a human rejection routes back into the revise
  -- loop (still active work), it does not end the job.
  completed_at timestamptz,
  check (completed_at is null or status = any (array['completed','failed','cancelled'])),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recipe_generation_jobs_recipe_id_key unique (recipe_id),
  constraint recipe_generation_jobs_batch_id_brief_id_key unique (batch_id, brief_id),
  -- Composite-FK target for recipe_drafts/recipe_qa_results/recipe_assets below — lets those
  -- tables enforce "this draft/QA-result/asset's job_id really is the job that owns it" via a
  -- normal FK instead of only trusting application code.
  constraint recipe_generation_jobs_id_batch_id_key unique (id, batch_id)
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
  where status = 'queued';
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

  constraint recipe_drafts_job_id_version_key unique (job_id, version),
  -- Composite-FK targets for recipe_qa_results/recipe_assets below (Step 03A relational-integrity
  -- fix — see those tables' foreign keys for why both of these are needed).
  constraint recipe_drafts_job_id_id_key unique (job_id, id),
  constraint recipe_drafts_job_id_id_version_key unique (job_id, id, version)
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
-- Step 03A rebuild: mirrors the rebuilt recipeQAResultSchema (RecipeAutomation.md §5.3's real
-- decision/score/blocking-issue routing contract), not the Step 02/03 passed/issues/decision
-- three-vocabulary mismatch. `draft_id` + `draft_version` together identify the EXACT draft
-- reviewed, and are enforced (not just trusted) via the composite FK below.

create table public.recipe_qa_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  draft_id uuid not null,
  draft_version int not null check (draft_version > 0),
  recipe_id uuid references public.recipes(id) on delete set null,

  -- Step 03A relational-integrity fix: the Step 03 version had independent job_id -> jobs and
  -- draft_id -> drafts FKs with nothing stopping a draft_id from a DIFFERENT job being attached to
  -- this job_id. This composite FK requires the (job_id, draft_id, draft_version) triple to match
  -- an actual row of recipe_drafts owned by that exact job — a cross-job draft_id (or a
  -- draft_version that doesn't match the draft's real version) is now a foreign-key violation, not
  -- an application-trust bug. See the Step 03A SQL test suite's cross-job mismatch tests.
  constraint recipe_qa_results_draft_fk
    foreign key (job_id, draft_id, draft_version) references public.recipe_drafts(job_id, id, version)
    on delete cascade,

  decision text not null check (decision = any (array['approved','revision_required','manual_review_required'])),
  overall_score numeric not null check (overall_score >= 0 and overall_score <= 100),
  -- Shape-checked mirror of recipeQAResultSchema.scores (named groups: clarity/feasibility/
  -- ingredientConsistency/originality/hasatRelevance). Exact key set is Zod's job, not the DB's —
  -- same "shape not content" convention used elsewhere in this migration.
  scores jsonb not null check (jsonb_typeof(scores) = 'object'),
  blocking_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(blocking_issues) = 'array'),
  non_blocking_suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(non_blocking_suggestions) = 'array'),

  -- Shape-checked mirror of recipeSafetyReviewSchema (temperature/timing/allergens findings).
  safety_review jsonb not null check (jsonb_typeof(safety_review) = 'object'),
  safety_reviewed_by uuid references public.profiles(id) on delete set null,
  safety_reviewed_at timestamptz,
  -- requiresHumanReview is always true in the contract (z.literal(true)) — there is no automated
  -- path to `safety_approved = true`; a human must set reviewed_by/reviewed_at first.
  safety_approved boolean,
  check (safety_approved is not true or (safety_reviewed_by is not null and safety_reviewed_at is not null)),
  -- Step 03B: the Step 03A version of this migration additionally required
  -- `decision <> 'approved' or safety_approved is true` here — forcing a human safety sign-off
  -- before an AUTOMATED QA result could even be marked 'approved'. That contradicted both
  -- RecipeAutomation.md §2.1's canonical plan->write->qa->revise?->image->finalize->
  -- awaiting_approval->publish order (the human safety checklist is an awaiting_approval/publish
  -- precondition per §9, evaluated AFTER qa/image/finalize — not a qa-stage precondition) and
  -- schemas.ts's own recipeQAResultSchema, which never ties `decision` to `safetyReview.approved`
  -- in the first place. Removed outright, not reinterpreted: `decision='approved'` is now an
  -- ordinary automated QA-stage content/structure verdict, writable the moment QA finishes,
  -- independent of whether a human has reviewed temperature/timing/allergens yet. The human
  -- safety gate itself is unweakened — `safety_approved=true` still always requires
  -- `safety_reviewed_by`/`safety_reviewed_at` (the CHECK directly above, unchanged), and that
  -- gate remains mandatory before the LATER awaiting_approval/publish step (§9) — this migration
  -- just stops an automated QA decision from impersonating that later human action.
  --
  -- approved_for_imaging can never be true unless decision='approved' AND there are no blocking
  -- issues left — mirrors recipeQAResultSchema's refine at the DB layer too, so a direct SQL write
  -- (bypassing the Zod layer, e.g. a hand-run admin fix) cannot silently create an imaging-approved
  -- result with unresolved blocking issues. This gate is about QA content readiness for imaging,
  -- not human safety sign-off — the two remain independent, per the note above.
  approved_for_imaging boolean not null default false,
  check (not approved_for_imaging or (decision = 'approved' and jsonb_array_length(blocking_issues) = 0)),

  -- Which model/provider ran the automated QA pass. Free text on purpose.
  model text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.recipe_qa_results is
  'F2 Step 03/03B. One row per QA pass against an EXACT recipe_drafts (id, version) — enforced by '
  'the composite FK, not just trusted. decision is an automated verdict independent of human '
  'safety sign-off (safety_approved=true always requires a recorded reviewer, but is not required '
  'for decision=''approved''; the human safety gate applies later, at awaiting_approval/publish). '
  'approved_for_imaging can never be true with unresolved blocking issues.';

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
  draft_id uuid not null,
  recipe_id uuid references public.recipes(id) on delete set null,

  -- Step 03A relational-integrity fix — same reasoning as recipe_qa_results_draft_fk above, minus
  -- draft_version (RecipeImageSpec is not versioned per-draft-version; an asset belongs to a job's
  -- draft, generated once that draft has cleared QA).
  constraint recipe_assets_draft_fk
    foreign key (job_id, draft_id) references public.recipe_drafts(job_id, id)
    on delete cascade,

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
  -- Step 03A: image-stage audit data the Step 03 version omitted, needed by the time Step 09
  -- (image generation) actually writes rows here. Kept nullable/generic (not committing to a
  -- source resolution or WebP encoder — both remain open per RecipeAutomation.md §15/Step 09).
  quality int check (quality is null or (quality between 1 and 100)),
  -- The exact Gemini generation prompt used, for reproducibility/audit.
  prompt text,
  -- Shape-checked mirror of the processing side of recipeImageSpecSchema (chopFraction,
  -- cropAlignment, geometryEngine, webpEncoder, ...) — whatever the Image processor actually
  -- applied, not just what was requested.
  processing_params jsonb check (processing_params is null or jsonb_typeof(processing_params) = 'object'),
  -- Frame-suspicion / edge-band review outcome (RecipeAutomation.md §6 step 9: "Frame şüphesi
  -- varsa otomatik düzeltme yapma; human-review flag koy" — never silently auto-corrected).
  validation_status text check (validation_status is null or validation_status = any (array['pending','passed','failed','warning'])),
  validation_results jsonb check (validation_results is null or jsonb_typeof(validation_results) = 'object'),

  provider text default 'google-gemini',
  model text,
  trace_id text,

  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.recipe_assets is
  'F2 Step 03. Generated image outputs per job/draft. Partial unique indexes below prevent '
  'duplicate source/hero/square assets and duplicate per-step-photo assets; the composite FK '
  'above enforces that draft_id always belongs to job_id.';

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
-- a job lands in 'failed'/'awaiting_approval'-after-rejection after several failed attempts. The
-- shape mirrors recipeStageResultSchema — "the generic envelope every chained stage invocation
-- returns" — 1:1, so persisting it is a direct, not invented, mapping. It is also a second,
-- complementary double-invocation guard: UNIQUE(job_id, stage, attempt) lets a stage runner use
-- INSERT ... ON CONFLICT DO NOTHING as an idempotency check layered on top of the job's
-- locked_by/locked_at/lock_expires_at fields.

create table public.recipe_generation_stage_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  batch_id uuid not null references public.recipe_generation_batches(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,

  -- Step 03A: same job_id/batch_id relational-integrity fix applied to recipe_qa_results/
  -- recipe_assets above — a stage run's job_id must actually belong to its batch_id.
  constraint recipe_generation_stage_runs_job_fk
    foreign key (job_id, batch_id) references public.recipe_generation_jobs(id, batch_id)
    on delete cascade,

  stage text not null check (stage = any (array[
    'plan','write','qa','revise','image','finalize','awaiting_approval','publish'
  ])),
  status text not null check (status = any (array[
    'queued','running','retryable','failed','awaiting_approval','approved','rejected','completed','cancelled'
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
