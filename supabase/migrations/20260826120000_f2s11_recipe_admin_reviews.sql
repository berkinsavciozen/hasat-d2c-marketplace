-- F2 Recipe Automation — Step 11: admin review audit trail.
--
-- PROMPT 11 requires the admin review surface's approval action to be MECHANICALLY impossible
-- until the human checklist (cooking temperatures / cooking-and-waiting times / allergens /
-- recipe content / both images, all "reviewed") is explicitly completed — "this is not a UI
-- constraint, the backend itself must refuse it." This table's own CHECK constraint below is that
-- backstop: a direct SQL insert bypassing the admin Edge Function's own Zod validation still
-- cannot record an `action = 'approve'` row with any checklist item left false.
--
-- Deliberately a NEW, separate table rather than writing to `recipe_qa_results.safety_approved` /
-- `safety_reviewed_by` / `safety_reviewed_at` (20260819120000_f2s03_recipe_automation_schema.sql).
-- Those columns are real and already documented as "the human safety gate applies later, at
-- awaiting_approval/publish" (see that migration's `recipe_qa_results` comment, and every one of
-- write-stage.ts/qa-stage.ts/revise-stage.ts/finalize-stage.ts's own "never touches
-- safety_approved" notes) — but `safety_reviewed_by` is `uuid references public.profiles(id)`,
-- and this admin surface's own hard constraint (F2-S11 task brief) is that it authenticates
-- ONLY via a timing-safe `x-admin-key` + service-role, with NO `is_admin`, NO RLS-based identity,
-- and NO normal Lovable user session — i.e. deliberately no authenticated `profiles.id` to
-- legitimately attribute that FK to. Inventing a placeholder profile row (or relaxing that FK) to
-- force a value through would either fabricate an identity or weaken a constraint three earlier,
-- already-merged stages depend on — both worse than the alternative taken here: record the human
-- sign-off in this pipeline's own new, purpose-built, mechanically-gated table instead, and leave
-- `recipe_qa_results.safety_approved` untouched (still NULL) pending a real admin-identity model.
-- See the Step 11 completion report for this decision and its recommendation for Step 12.

create table public.recipe_admin_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recipe_generation_jobs(id) on delete cascade,
  batch_id uuid not null references public.recipe_generation_batches(id) on delete cascade,
  -- Same relational-integrity discipline as recipe_qa_results/recipe_assets/
  -- recipe_generation_stage_runs in the Step 03 migration: job_id must really belong to batch_id.
  constraint recipe_admin_reviews_job_fk
    foreign key (job_id, batch_id) references public.recipe_generation_jobs(id, batch_id)
    on delete cascade,

  -- Nullable: 'retry_stage' targets a failed job that may or may not have a recipe_drafts row yet
  -- (e.g. a job that failed at the 'write' stage before ever producing one). When present, the
  -- triple must name a real recipe_drafts row owned by this exact job — same composite-FK pattern
  -- recipe_qa_results_draft_fk uses; MATCH SIMPLE (Postgres' default) skips this check whenever any
  -- of the three columns is NULL, so 'retry_stage' rows with no draft yet are unaffected.
  draft_id uuid,
  draft_version int check (draft_version is null or draft_version > 0),
  constraint recipe_admin_reviews_draft_fk
    foreign key (job_id, draft_id, draft_version) references public.recipe_drafts(job_id, id, version)
    on delete cascade,

  action text not null check (action = any (array['approve','reject','request_revision','retry_stage'])),

  -- The five-item human checklist PROMPT 11 requires (temperature / timing / allergens / recipe
  -- content / both images). Only meaningful for action='approve' — the CHECK below is the
  -- mechanical gate: an 'approve' row can never be inserted with any of these still false.
  temperature_reviewed boolean not null default false,
  timing_reviewed boolean not null default false,
  allergens_reviewed boolean not null default false,
  content_reviewed boolean not null default false,
  images_reviewed boolean not null default false,
  check (
    action <> 'approve'
    or (temperature_reviewed and timing_reviewed and allergens_reviewed and content_reviewed and images_reviewed)
  ),

  -- Full before/after transition, for audit — same stage/status vocabulary as
  -- recipe_generation_jobs (RECIPE_JOB_STAGE_VALUES / RECIPE_JOB_STATUS_VALUES in schemas.ts).
  from_stage text not null check (from_stage = any (array[
    'plan','write','qa','revise','image','finalize','awaiting_approval','publish'
  ])),
  from_status text not null check (from_status = any (array[
    'queued','running','retryable','failed','awaiting_approval','approved','rejected','completed','cancelled'
  ])),
  to_stage text not null check (to_stage = any (array[
    'plan','write','qa','revise','image','finalize','awaiting_approval','publish'
  ])),
  to_status text not null check (to_status = any (array[
    'queued','running','retryable','failed','awaiting_approval','approved','rejected','completed','cancelled'
  ])),

  notes text check (notes is null or char_length(notes) <= 4000),
  -- Free-text operator identifier ONLY (e.g. an admin's name/email, entered client-side) — never a
  -- profiles FK, never treated as an authenticated identity. See file header.
  admin_actor text check (admin_actor is null or char_length(admin_actor) <= 200),

  created_at timestamptz not null default now()
);

comment on table public.recipe_admin_reviews is
  'F2 Step 11. One row per admin review-surface action (approve/reject/request_revision/'
  'retry_stage) against a recipe_generation_jobs row. The CHECK on action=''approve'' is the '
  'mechanical backstop for PROMPT 11''s five-item human checklist — a direct SQL insert cannot '
  'bypass it. Intentionally separate from recipe_qa_results.safety_approved (see file header).';

create index recipe_admin_reviews_job_id_idx on public.recipe_admin_reviews(job_id, created_at desc);
create index recipe_admin_reviews_created_at_idx on public.recipe_admin_reviews(created_at desc);

alter table public.recipe_admin_reviews enable row level security;
revoke all on table public.recipe_admin_reviews from anon, authenticated;
grant all on table public.recipe_admin_reviews to service_role;
