-- F2 Recipe Automation — Step 13: Weekly Portfolio Planner (recipe-stage-plan + batch plan review).
--
-- Implements PROMPT 13's plan/admin-review/fan-out layer, the first thing in this pipeline that
-- actually populates `recipe_generation_batches` and produces `recipe_generation_jobs` rows — every
-- earlier F2 step (03-12) built the write->...->publish machinery a job moves through, but nothing
-- before this migration ever created a batch or a job. PROMPT 13's own precondition ("Execute Step
-- 13 only after one recipe works end-to-end") is satisfied by a real production run: job
-- bf6d91ba-2abb-4005-b1da-b60bfd4cb8ce went write -> qa -> revise -> image -> finalize ->
-- awaiting_approval -> (admin approval, recipe_admin_reviews) -> publish, producing live recipe
-- 3d696430-e948-4665-bf8d-6b48f772ee7a (slug firinda-domates-soslu-sebze-yemegi, status=published)
-- — confirmed by direct SQL against the shared project immediately before this migration was
-- written, independent of this repo's own migration history.
--
-- NOT applied to any Supabase environment by this change — same convention as every other F2
-- migration's own "not applied" note (f2s12's header, f2s05's header, ...): this file only prepares
-- the schema/RPCs; applying it to the shared project is a separate, independently-verified step.
--
-- Hard boundaries this migration deliberately respects (PROMPT 13's "KESİNLİKLE YAPMA" list):
--   * The Planner itself (../functions/_shared/recipe-automation/plan/plan-stage.ts) is given ZERO
--     tools and no service-role client — every read below is performed by TRUSTED stage-runner
--     TypeScript code via the narrow RPCs this migration adds/reuses, never by the LLM agent
--     directly. Nothing here grants the Planner (or any other pipeline agent) a generic SQL/
--     service-role/publish/delete surface — every new function is EXECUTE-revoked from
--     public/anon/authenticated and granted only to service_role, matching every f2s04/f2s05/f2s11/
--     f2s12 function's own grant convention.
--   * Job fan-out is gated on `recipe_generation_batches.review_status = 'approved'` — an explicit,
--     separate admin action (never automatic, never triggered by the Planner's own output landing).
--   * Fan-out is idempotent: `fan_out_recipe_plan_batch` reuses the EXISTING
--     `recipe_generation_jobs_batch_id_brief_id_key` UNIQUE constraint (f2s03) via
--     `ON CONFLICT ... DO NOTHING` — a brief can never be promoted into two jobs, whether from a
--     genuinely concurrent fan-out call or a caller retrying after a partial dispatch failure.
--
-- Design note — why `recipe_generation_stage_runs` (f2s03's per-attempt telemetry table, `job_id`
-- NOT NULL) is NOT used for plan-stage telemetry: that table is one row per JOB stage-attempt, but
-- planning happens once per BATCH, before any job exists. Retrofitting it (dropping NOT NULL,
-- adding a batch_id-only FK) was considered and rejected as unnecessary blast radius on an
-- already-applied table for a need `recipe_generation_batches.plan_error`/`diversity_report` below
-- already covers at the right grain (one plan attempt's outcome, on the batch itself) without
-- touching that table at all.

-- =================================================================================================
-- 1. recipe_generation_batches — plan-review lifecycle columns.
-- =================================================================================================
-- Deliberately separate from the existing `status` column (active|completed|failed|cancelled,
-- f2s03) — that column tracks whether the batch's JOBS are still being worked, a downstream concern
-- this step does not otherwise touch. `review_status` is the new, narrower "has an admin looked at
-- this PLAN yet" gate PROMPT 13 requires before any job may exist at all.

alter table public.recipe_generation_batches
  add column review_status text not null default 'pending_review'
    check (review_status = any (array['pending_review', 'approved', 'rejected'])),
  -- Free-text operator identifier ONLY, same convention as recipe_admin_reviews.admin_actor
  -- (f2s11) — no `is_admin`/RLS/Lovable session identity model exists for this pipeline's admin
  -- surface (see that migration's header for why), so this is never a profiles FK.
  add column reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 200),
  add column reviewed_at timestamptz,
  add constraint recipe_generation_batches_reviewed_at_requires_decision
    check (reviewed_at is null or review_status <> 'pending_review'),
  -- Shape-checked mirror of recipe_generation_jobs.last_error's own "shape not content" CHECK
  -- (f2s03) — records why the most recent planning ATTEMPT failed, if it did. Not append-only
  -- history (recipe_generation_stage_runs would be, see file header) — just "what went wrong last".
  add column plan_error jsonb check (plan_error is null or jsonb_typeof(plan_error) = 'object'),
  -- The validate_recipe_plan_diversity() result (see below) for the plan actually stored, kept for
  -- admin plan-review UI/audit — "why did this plan pass/warn" without re-running the RPC.
  add column diversity_report jsonb check (diversity_report is null or jsonb_typeof(diversity_report) = 'object'),
  -- Set once by fan_out_recipe_plan_batch() on this batch's first successful fan-out call; a no-op
  -- on every call after (idempotency marker, mirrors recipe_generation_jobs.recipe_id's own role in
  -- publish_recipe_draft's idempotency check, f2s12).
  add column fanned_out_at timestamptz;

create index recipe_generation_batches_review_status_idx
  on public.recipe_generation_batches(review_status)
  where review_status = 'pending_review';

comment on column public.recipe_generation_batches.review_status is
  'F2 Step 13. Admin plan-review gate — job fan-out is refused (fan_out_recipe_plan_batch raises '
  'FANOUT_BATCH_NOT_APPROVED) unless this is ''approved''. Separate value space from `status` '
  '(job-progress lifecycle, f2s03).';

-- =================================================================================================
-- 2. recipe_plan_briefs — one row per planned RecipeBrief, pending/after admin decision.
-- =================================================================================================
-- Fills the gap the f2s03 migration's own header called out ("Briefs themselves ... are not
-- persisted as a separate table — a job IS a brief promoted to a trackable unit of work") — that
-- was true only because nothing before Step 13 needed a brief to exist BEFORE its job did. PROMPT
-- 13 requires exactly that: an admin must be able to view/edit/approve individual briefs before any
-- job (let alone a write-stage dispatch) exists for them. `job_id` is set the moment (and only the
-- moment) a brief is actually promoted by fan_out_recipe_plan_batch() — null before that, matching
-- recipe_generation_jobs' own "a job's brief_id is stable, generated by the Planner" identity
-- (f2s03's `brief_id` column comment).

create table public.recipe_plan_briefs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recipe_generation_batches(id) on delete cascade,
  -- Stable identity from recipeBriefSchema.briefId (schemas.ts) — never regenerated once planned,
  -- so an admin edit to e.g. workingTitle does not create a second, ambiguous brief identity.
  brief_id uuid not null,
  constraint recipe_plan_briefs_batch_brief_key unique (batch_id, brief_id),

  working_title text not null check (char_length(btrim(working_title)) > 0),
  -- PROMPT 13 starting rule: "primary crop'lar mutlaka crop_config'den gelmeli" — enforced here as
  -- a hard NOT NULL FK (stronger than recipeBriefSchema's own nullable `focusCrop`, and stronger
  -- than the deterministic RPC issue below: a direct SQL insert bypassing both the Zod layer and
  -- validate_recipe_plan_diversity still cannot create a plan brief with no crop, or a crop absent
  -- from crop_config, once it is actually PERSISTED for admin review).
  focus_crop text not null references public.crop_config(crop) on update cascade,
  angle text,
  target_difficulty text check (target_difficulty is null or target_difficulty = any (array['kolay', 'orta', 'zor'])),
  diet_tags text[] not null default '{}',
  locale text not null default 'tr',
  -- Mirrors recipeTargetAudienceSchema/recipeMealTypeSchema (schemas.ts) verbatim.
  audience text not null default 'bireysel' check (audience = any (array['bireysel', 'horeca'])),
  meal_type text check (meal_type is null or meal_type = any (array[
    'kahvalti', 'ana_yemek', 'aperatif_meze', 'corba', 'salata', 'tatli', 'icecek'
  ])),
  -- PROMPT 13: "her brief için bir seçim gerekçesi (selection reason) sakla" — required, never
  -- blank, mirrors recipeBriefSchema.selectionReason's own `.min(1)`.
  selection_reason text not null check (char_length(btrim(selection_reason)) > 0),

  -- An admin's "leave this brief out of the batch" decision — distinct from the batch-level
  -- review_status above: an admin may approve a PLAN while excluding one or two of its briefs
  -- (PROMPT 13: "planı görüntüleyip düzenleyip onaylayabilmeli" implies per-brief control, not only
  -- an all-or-nothing batch approve). fan_out_recipe_plan_batch() skips excluded briefs entirely —
  -- no job is ever created for one.
  excluded boolean not null default false,
  exclusion_reason text,
  check (exclusion_reason is null or excluded),

  -- Set exactly once, by fan_out_recipe_plan_batch() — never by an edit/exclude action. UNIQUE (not
  -- just a plain FK) so two fan-out calls can never both claim to have promoted the same brief into
  -- two different jobs; combined with recipe_generation_jobs_batch_id_brief_id_key (f2s03) this
  -- means the same (batch_id, brief_id) can never map to more than one live job by either path.
  job_id uuid references public.recipe_generation_jobs(id) on delete set null,
  constraint recipe_plan_briefs_job_id_key unique (job_id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.recipe_plan_briefs is
  'F2 Step 13. One row per planned RecipeBrief, editable/excludable by an admin BEFORE job '
  'fan-out. job_id is set exactly once, by fan_out_recipe_plan_batch(), never before.';

create trigger recipe_plan_briefs_set_updated_at
  before update on public.recipe_plan_briefs
  for each row execute function public.set_updated_at();

create index recipe_plan_briefs_batch_id_idx on public.recipe_plan_briefs(batch_id, created_at asc);

alter table public.recipe_plan_briefs enable row level security;
revoke all on table public.recipe_plan_briefs from anon, authenticated;
grant all on table public.recipe_plan_briefs to service_role;

-- =================================================================================================
-- 3. validate_recipe_plan_diversity — the plan-diversity gate PROMPT 13 requires be checked
--    "job fan-out'tan önce" (before job fan-out). In practice this pipeline checks it even earlier
--    — plan-stage.ts (the Planner's stage-runner) refuses to STORE a plan that fails this at all —
--    so nothing reaching admin review, let alone fan-out, has ever skipped it.
-- =================================================================================================
-- Deliberately a NEW, separate function from validate_recipe_plan (f2s04) rather than an edit to
-- it: f2s04 is already applied to the shared project (see this pipeline's own production evidence,
-- file header), so its file is immutable history now — a behavior change belongs in a new, additive
-- function, exactly like every other "extend, don't rewrite an applied migration" move in this
-- pipeline's history (f2s12's publish RPC extending rather than reopening f2s04, f2s11's own table
-- being new rather than reusing recipe_qa_results). validate_recipe_plan's own structural/format
-- checks (crop-exists-if-present, difficulty enum, same-batch title collision) are untouched and
-- still the first gate a Planner's output must clear; this function adds the DIVERSITY-specific
-- rules PROMPT 13's "Başlangıç kuralları" list.

create or replace function public.validate_recipe_plan_diversity(
  p_plan jsonb,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_briefs jsonb := coalesce(p_plan->'briefs', '[]'::jsonb);
  -- "istenmedikçe aynı primary crop'un tekrarından kaçın" — repeats are blocking BY DEFAULT; a
  -- caller may explicitly request the exception via p_options.allowCropRepeat.
  v_allow_repeat boolean := coalesce((p_options->>'allowCropRepeat')::boolean, false);
  v_brief jsonb;
  v_idx integer := 0;
  v_focus_crop text;
  v_working_title text;
  v_brief_count integer := jsonb_array_length(v_briefs);
  v_dup record;
  v_distinct_audiences integer;
  v_max_meal_share integer;
  v_max_difficulty_share integer;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DIVERSITY_PLAN_NOT_OBJECT', 'field', 'plan', 'severity', 'blocking',
        'message', 'plan must be a JSON object', 'requiredChange', 'Plani bir JSON nesnesi olarak gonderin.'
      )),
      'briefCount', 0
    );
  end if;

  if jsonb_typeof(v_briefs) is distinct from 'array' or v_brief_count = 0 then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DIVERSITY_BRIEFS_EMPTY', 'field', 'briefs', 'severity', 'blocking',
        'message', 'briefs must be a non-empty array', 'requiredChange', 'Plana en az bir brief ekleyin.'
      )),
      'briefCount', 0
    );
  end if;

  -- Soft-balance denominators, computed once (used only when v_brief_count is large enough for an
  -- imbalance to be meaningful — see the checks below).
  select count(distinct nullif(btrim(coalesce(b->>'audience', '')), ''))
    into v_distinct_audiences
    from jsonb_array_elements(v_briefs) b;

  select coalesce(max(cnt), 0) into v_max_meal_share
  from (
    select count(*) as cnt
    from jsonb_array_elements(v_briefs) b
    where nullif(btrim(coalesce(b->>'mealType', '')), '') is not null
    group by nullif(btrim(coalesce(b->>'mealType', '')), '')
  ) s;

  select coalesce(max(cnt), 0) into v_max_difficulty_share
  from (
    select count(*) as cnt
    from jsonb_array_elements(v_briefs) b
    where nullif(btrim(coalesce(b->>'targetDifficulty', '')), '') is not null
    group by nullif(btrim(coalesce(b->>'targetDifficulty', '')), '')
  ) s;

  for v_brief in select * from jsonb_array_elements(v_briefs)
  loop
    v_working_title := btrim(coalesce(v_brief->>'workingTitle', ''));
    v_focus_crop := nullif(btrim(coalesce(v_brief->>'focusCrop', '')), '');

    -- "primary crop'lar mutlaka crop_config'den gelmeli" — required AND must resolve live.
    if v_focus_crop is null then
      v_issues := v_issues || jsonb_build_object(
        'code', 'DIVERSITY_CROP_REQUIRED', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s has no focusCrop — a primary crop is required', v_idx),
        'requiredChange', 'Bu brief icin crop_config''dan bir primary crop secin.'
      );
    elsif not exists (select 1 from public.crop_config cc where cc.crop = v_focus_crop) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'DIVERSITY_CROP_NOT_IN_CONFIG', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s focusCrop "%s" is not in crop_config', v_idx, v_focus_crop),
        'requiredChange', 'crop_config icinde tanimli gecerli bir crop secin.'
      );
    elsif not v_allow_repeat and (
      select count(*) from jsonb_array_elements(v_briefs) bb
      where nullif(btrim(coalesce(bb->>'focusCrop', '')), '') = v_focus_crop
    ) > 1 then
      v_issues := v_issues || jsonb_build_object(
        'code', 'DIVERSITY_CROP_REPEATED', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s repeats primary crop "%s" elsewhere in the same plan', v_idx, v_focus_crop),
        'requiredChange', 'Farkli bir primary crop secin (veya tekrari p_options.allowCropRepeat ile acikca talep edin).'
      );
    end if;

    -- "yakın zamanlı tekrar eden (duplicate'e yakın) tarifleri önle" — reuses find_recipe_duplicates
    -- (f2s04) as-is; an exact match is blocking, a heuristic word-overlap/same-crop match is a
    -- warning (same "heuristic -> warning" convention f2s04's own header documents).
    for v_dup in
      select * from public.find_recipe_duplicates(v_working_title, v_focus_crop, null, 3)
    loop
      if v_dup.match_reason in ('exact_slug', 'exact_title') then
        v_issues := v_issues || jsonb_build_object(
          'code', 'DIVERSITY_EXACT_DUPLICATE', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'blocking',
          'message', format('brief #%s ("%s") exactly matches existing recipe "%s" (%s)', v_idx, v_working_title, v_dup.title, v_dup.match_reason),
          'requiredChange', 'Farkli, ayirt edici bir workingTitle secin.'
        );
      else
        v_issues := v_issues || jsonb_build_object(
          'code', 'DIVERSITY_NEAR_DUPLICATE', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'warning',
          'message', format('brief #%s ("%s") is a near-duplicate of existing recipe "%s" (%s)', v_idx, v_working_title, v_dup.title, v_dup.match_reason),
          'requiredChange', 'Baslik veya aciyi belirginlestirerek farklilastirin.'
        );
      end if;
    end loop;

    v_idx := v_idx + 1;
  end loop;

  -- Soft balance checks — heuristic distribution warnings, only meaningful once a batch is large
  -- enough for an imbalance to say anything ("başlangıç kuralları": difficulty/meal-type/audience
  -- balance are all phrased as "dengele"/"kapsa", not hard per-brief constraints).
  if v_brief_count >= 2 and v_distinct_audiences <= 1 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIVERSITY_AUDIENCE_NOT_COVERED', 'field', 'briefs', 'severity', 'warning',
      'message', 'plan does not cover both bireysel and horeca audiences',
      'requiredChange', 'En az bir brief HoReCa, en az bir brief bireysel hedef kitleye yonelik olsun.'
    );
  end if;

  if v_brief_count >= 3 and v_max_meal_share > ceil(v_brief_count * 0.6) then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIVERSITY_MEAL_TYPE_IMBALANCED', 'field', 'briefs', 'severity', 'warning',
      'message', 'plan is dominated by a single meal type',
      'requiredChange', 'Yemek turlerini (kahvalti/ana yemek/corba/salata/tatli...) dengeleyin.'
    );
  end if;

  if v_brief_count >= 3 and v_max_difficulty_share > ceil(v_brief_count * 0.7) then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIVERSITY_DIFFICULTY_IMBALANCED', 'field', 'briefs', 'severity', 'warning',
      'message', 'plan is dominated by a single difficulty level',
      'requiredChange', 'kolay/orta/zor zorluk seviyelerini dengeleyin.'
    );
  end if;

  return jsonb_build_object(
    'valid', not exists (select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'),
    'issues', v_issues,
    'briefCount', v_brief_count
  );
end;
$$;

comment on function public.validate_recipe_plan_diversity(jsonb, jsonb) is
  'F2 Step 13. Plan-diversity gate: primary-crop-from-crop_config + no-repeat (blocking), '
  'near/exact duplicate-avoidance via find_recipe_duplicates (blocking/warning), and '
  'audience/meal-type/difficulty balance (warning, heuristic). valid=false iff any blocking issue.';

revoke all on function public.validate_recipe_plan_diversity(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.validate_recipe_plan_diversity(jsonb, jsonb) to service_role;

-- =================================================================================================
-- 4. fan_out_recipe_plan_batch — transactional, idempotent job creation for an APPROVED batch.
-- =================================================================================================
-- Mirrors publish_recipe_draft's (f2s12) discipline: lock the parent row first, re-derive the one
-- precondition that actually gates this (review_status = 'approved') from first principles rather
-- than trusting the caller, then do every write inside the same transaction so a mid-loop failure
-- rolls back cleanly. Unlike publish_recipe_draft this function does NOT itself dispatch anything —
-- it only creates/links `recipe_generation_jobs` rows and returns their ids; the caller
-- (../functions/_shared/recipe-automation/admin/plan-review.ts) is what dispatches
-- `recipe-stage-write` for each with controlled concurrency (PROMPT 13: "write'ı kontrollü
-- concurrency ile dispatch et") — same "advance is one thing, dispatch is a separate, best-effort
-- later step" split ../infra/stage-dispatch.ts's own header documents for every other stage.

create or replace function public.fan_out_recipe_plan_batch(_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch record;
  v_brief record;
  v_job_id uuid;
  v_jobs jsonb := '[]'::jsonb;
begin
  -- Lock the batch row for the rest of this transaction — a second, concurrent fan-out call for the
  -- SAME batch blocks here until the first commits, then observes the already-linked
  -- recipe_plan_briefs.job_id values and takes the "already created" branch below for every brief,
  -- never attempting a second insert. This is the real no-duplicate guarantee; the
  -- recipe_generation_jobs_batch_id_brief_id_key UNIQUE constraint (f2s03) plus the
  -- ON CONFLICT DO NOTHING below is the backstop for a caller that races this function without ever
  -- taking the lock at all (impossible from this function's own callers, but defense in depth costs
  -- nothing here).
  select * into v_batch from public.recipe_generation_batches where id = _batch_id for update;
  if not found then
    raise exception 'FANOUT_BATCH_NOT_FOUND: batch % not found', _batch_id;
  end if;

  if v_batch.review_status <> 'approved' then
    raise exception 'FANOUT_BATCH_NOT_APPROVED: batch % is not approved (review_status=%)', _batch_id, v_batch.review_status;
  end if;

  for v_brief in
    select * from public.recipe_plan_briefs
    where batch_id = _batch_id and not excluded
    order by created_at asc
  loop
    if v_brief.job_id is not null then
      -- Already promoted by an earlier fan-out call for this batch — report it back to the caller
      -- (so it can still be (re)dispatched, which is always safe to repeat, see
      -- ../infra/stage-dispatch.ts's header) without attempting to insert again.
      v_jobs := v_jobs || jsonb_build_object(
        'briefId', v_brief.brief_id, 'jobId', v_brief.job_id,
        'workingTitle', v_brief.working_title, 'focusCrop', v_brief.focus_crop, 'created', false
      );
      continue;
    end if;

    v_job_id := null;
    insert into public.recipe_generation_jobs (
      batch_id, brief_id, working_title, focus_crop, angle, target_difficulty, diet_tags, locale,
      stage, status
    ) values (
      v_brief.batch_id, v_brief.brief_id, v_brief.working_title, v_brief.focus_crop, v_brief.angle,
      v_brief.target_difficulty, v_brief.diet_tags, v_brief.locale,
      -- Jobs are created already PAST 'plan' — planning happened at the batch level, not per-job;
      -- 'write' is the first stage a per-brief job actually runs (see recipe-stage-write's own
      -- claimJob(expectedStage='write')).
      'write', 'queued'
    )
    on conflict on constraint recipe_generation_jobs_batch_id_brief_id_key do nothing
    returning id into v_job_id;

    if v_job_id is null then
      -- Conflict path: a job for this exact (batch_id, brief_id) already exists (a genuinely
      -- concurrent caller that inserted between our lock and this statement is impossible given the
      -- FOR UPDATE lock above — this path is reached only by a caller that created the job through
      -- some other route entirely, e.g. a manual fix). Link to whatever already exists rather than
      -- erroring, so this function stays idempotent regardless of how that row got there.
      select id into v_job_id from public.recipe_generation_jobs
      where batch_id = v_brief.batch_id and brief_id = v_brief.brief_id;
    end if;

    update public.recipe_plan_briefs set job_id = v_job_id where id = v_brief.id;

    v_jobs := v_jobs || jsonb_build_object(
      'briefId', v_brief.brief_id, 'jobId', v_job_id,
      'workingTitle', v_brief.working_title, 'focusCrop', v_brief.focus_crop, 'created', true
    );
  end loop;

  update public.recipe_generation_batches
  set fanned_out_at = coalesce(fanned_out_at, now())
  where id = _batch_id;

  return jsonb_build_object('ok', true, 'batchId', _batch_id, 'jobs', v_jobs);
end;
$$;

comment on function public.fan_out_recipe_plan_batch(uuid) is
  'F2 Step 13. Transactional, idempotent job creation for every non-excluded brief in an APPROVED '
  'batch. Refuses (FANOUT_BATCH_NOT_APPROVED) unless recipe_generation_batches.review_status='
  '''approved''. Never dispatches recipe-stage-write itself — see plan/README.md.';

revoke all on function public.fan_out_recipe_plan_batch(uuid) from public, anon, authenticated;
grant execute on function public.fan_out_recipe_plan_batch(uuid) to service_role;
