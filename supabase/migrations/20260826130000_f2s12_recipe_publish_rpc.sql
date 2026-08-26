-- F2 Recipe Automation — Step 12: transactional, idempotent publish RPC.
--
-- Implements PROMPT 12's transaction flow (create/update recipes as draft -> insert ingredients ->
-- insert steps -> map image fields -> final DB validation -> set published -> store live recipe_id
-- on job and mark completed) as ONE Postgres function body. A plpgsql function's writes are only
-- durable if the function returns normally; any `raise exception` — whether one of this function's
-- own explicit precondition checks below, or an ordinary constraint violation Postgres raises on
-- its own (a unique_violation on `recipes.slug`, a check_violation on `recipe_ingredients`/
-- `recipe_steps`) — aborts and rolls back EVERY write this invocation made, including the final
-- `recipe_generation_jobs` update. This is what "on failure, rollback all partial writes" (PROMPT
-- 12) actually means at the database layer: every precondition below is checked and raised BEFORE
-- the first write statement, so an ordinary precondition failure leaves nothing to roll back at
-- all, and the handful of writes that follow (recipe/ingredients/steps/assets/job) either all
-- commit together or none of them do.
--
-- Orchestrator note (F2-S12 prompt, responding to the Step 11 completion report's explicit
-- recommendation): PROMPT 12's "completed temperature/timing/allergen human checks" precondition is
-- satisfied by requiring a `recipe_admin_reviews` row with action='approve' for the EXACT
-- (job_id, draft_id, draft_version) triple being published — that table's own CHECK constraint
-- (20260826120000_f2s11_recipe_admin_reviews.sql) already guarantees such a row cannot exist unless
-- all five checklist items were true, so this function does not re-inspect the checklist columns
-- individually. `recipe_qa_results.safety_approved` is deliberately never read or written here — it
-- stays NULL, exactly as Step 11 left it (see that migration's header for why).
--
-- Load-bearing design gap this step fills (see Step 12 completion report for the full writeup):
-- nothing before this migration ever moves a job to `stage='publish'` — `approveJob()`
-- (admin/review-actions.ts, Step 11, locked for this step) deliberately stops at
-- `stage='awaiting_approval', status='approved'` and never dispatches to a stage-runner. So "job
-- approved and at publish" is interpreted here as "awaiting_approval/approved, ready to enter
-- publish" — ../publish/publish-stage.ts's own `enterPublishStage()` performs the
-- awaiting_approval+approved -> publish+queued transition itself (a plain CAS UPDATE, structurally
-- identical to review-actions.ts's own requestRevisionJob() transition, just not authored in that
-- locked file), immediately before calling the existing, UNMODIFIED `claimJob()`
-- (infra/job-lock.ts) with expectedStage='publish'. This function itself only ever runs against a
-- job already sitting at stage='publish', status='running', locked by the caller's own token —
-- claimJob already guarantees that by the time this RPC is invoked.
--
-- Concurrency: this function's very first statement is `select ... for update` on the job row,
-- held for the rest of the transaction. A second call racing for the SAME job_id simply blocks at
-- that same statement until the first commits or rolls back, then observes the already-updated
-- state (recipe_id set, stage/status moved to publish/completed) and takes the idempotent
-- "already published" return path below instead of ever attempting a second insert — this is the
-- actual no-duplicate guarantee, independent of (and stronger than) the claimJob-level CAS that
-- prevents wasted concurrent invocations in the common case.
--
-- Not applied to any Supabase environment in this step — see supabase/tests/f2_recipe_publish/ for
-- its local-only fresh-database test suite, following the same convention as
-- supabase/tests/f2_recipe_automation/ and supabase/tests/f2_recipe_stage_dispatch/. Live ground
-- truth for `recipes`/`recipe_ingredients`/`recipe_steps` (no migration source in this repo — they
-- predate it) was confirmed via read-only introspection (list_tables/execute_sql) against project
-- efuqpiaavrzimvstpdpm on 2026-08-26 immediately before writing this migration; column
-- names/types/CHECKs/UNIQUE indexes below match that live schema exactly (see completion report).

create or replace function public.publish_recipe_draft(
  _job_id uuid,
  _lock_token text,
  _slug text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job record;
  v_draft record;
  v_qa record;
  v_hero record;
  v_square record;
  v_admin_approved boolean;
  v_draft_json jsonb;
  v_structure jsonb;
  v_crop_values jsonb;
  v_recipe_id uuid;
  v_base_url text;
  v_cover_photo_url text;
  v_ingredient jsonb;
  v_step jsonb;
  v_ingredient_count integer;
  v_step_count integer;
  v_updated_job_id uuid;
  v_missing_assets text[];
begin
  -- ---------------------------------------------------------------------------------------------
  -- 0. Lock the job row for the rest of this transaction. Every later statement in this function
  --    (including the final job UPDATE) operates against a row only THIS transaction can see
  --    change — see the concurrency note above for why this is the real no-duplicate guarantee.
  -- ---------------------------------------------------------------------------------------------
  select * into v_job from public.recipe_generation_jobs where id = _job_id for update;
  if not found then
    raise exception 'PUBLISH_JOB_NOT_FOUND: job % not found', _job_id;
  end if;

  -- "job has not already produced another live recipe" + double-publish idempotency: a job's
  -- recipe_id is only ever set together with this same function's terminal job UPDATE below, so
  -- finding it already set here means an earlier call already did all the real work — return that
  -- same recipe rather than writing anything. Checked BEFORE the lock/stage/status assertion below
  -- on purpose: a job that finished publishing is no longer `status='running'` or locked by
  -- anyone, so a naive caller retrying a request whose response it never saw (or a genuinely
  -- repeated publish call, PROMPT 12's own "double publish" requirement) must still short-circuit
  -- here instead of being rejected as a lock mismatch.
  if v_job.recipe_id is not null then
    return jsonb_build_object(
      'ok', true,
      'recipeId', v_job.recipe_id,
      'slug', (select slug from public.recipes where id = v_job.recipe_id),
      'alreadyPublished', true
    );
  end if;

  -- Every other path below does real work and requires this call to be the one holding the job's
  -- lock at stage=publish/status=running (established by claimJob() before this RPC is ever
  -- invoked — see ../../functions/_shared/recipe-automation/publish/publish-stage.ts).
  if v_job.locked_by is distinct from _lock_token or v_job.stage <> 'publish' or v_job.status <> 'running' then
    raise exception 'PUBLISH_LOCK_LOST: job % is not held at stage=publish/status=running under the expected lock token', _job_id;
  end if;

  if _slug is null or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'PUBLISH_SLUG_INVALID_FORMAT: slug "%" is not lowercase alphanumeric segments separated by single hyphens', _slug;
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- Preconditions, continued. "exact approved draft version" — the CURRENT draft (highest version
  -- for this job) is the only one that can ever be published; every later lookup below matches its
  -- EXACT (job_id, id, version) triple, not "most recent QA/review regardless of version".
  -- ---------------------------------------------------------------------------------------------
  select * into v_draft
  from public.recipe_drafts
  where job_id = _job_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'PUBLISH_NO_DRAFT: job % has no recipe_drafts row', _job_id;
  end if;

  -- "matching QA result without blockers" — exact-triple match (the recipe_qa_results_job_draft_
  -- version_key UNIQUE constraint means at most one row can ever match this filter).
  select * into v_qa
  from public.recipe_qa_results
  where job_id = _job_id and draft_id = v_draft.id and draft_version = v_draft.version;

  if not found then
    raise exception 'PUBLISH_QA_RESULT_MISSING: no recipe_qa_results row for job %, draft %, version %', _job_id, v_draft.id, v_draft.version;
  end if;
  if v_qa.decision <> 'approved' or jsonb_array_length(v_qa.blocking_issues) > 0 then
    raise exception 'PUBLISH_QA_NOT_CLEAN: latest QA result for this exact draft version is not an approved, blocker-free decision';
  end if;

  -- "completed temperature/timing/allergen human checks" — see file header. Exact-triple match
  -- against recipe_admin_reviews; that table's own CHECK already guarantees a matching
  -- action='approve' row cannot exist with any checklist item false.
  select exists(
    select 1 from public.recipe_admin_reviews
    where job_id = _job_id and draft_id = v_draft.id and draft_version = v_draft.version and action = 'approve'
  ) into v_admin_approved;
  if not v_admin_approved then
    raise exception 'PUBLISH_SAFETY_CHECKLIST_INCOMPLETE: no recipe_admin_reviews approve row for job %, draft %, version %', _job_id, v_draft.id, v_draft.version;
  end if;

  -- "both crop-photos assets exist"
  select * into v_hero from public.recipe_assets
    where job_id = _job_id and draft_id = v_draft.id and asset_type = 'hero';
  select * into v_square from public.recipe_assets
    where job_id = _job_id and draft_id = v_draft.id and asset_type = 'square';
  if v_hero is null or v_square is null then
    v_missing_assets := array_remove(array[
      case when v_hero is null then 'hero' end,
      case when v_square is null then 'square' end
    ], null);
    raise exception 'PUBLISH_MISSING_ASSETS: job % is missing recipe_assets row(s): %', _job_id, array_to_string(v_missing_assets, ', ');
  end if;

  -- "crop values remain valid" + a final structural re-check — re-run the SAME Postgres RPCs
  -- write/qa/revise/finalize already use, against the CURRENT draft, never trusting that what
  -- passed earlier in the pipeline still holds (crop_config can change between stages).
  v_draft_json := jsonb_build_object(
    'title', v_draft.title,
    'servings', v_draft.servings,
    'prepMinutes', v_draft.prep_minutes,
    'cookMinutes', v_draft.cook_minutes,
    'restMinutes', v_draft.rest_minutes,
    'difficulty', v_draft.difficulty,
    'ingredients', v_draft.ingredients,
    'steps', v_draft.steps
  );
  v_structure := public.validate_recipe_structure(v_draft_json);
  if not (v_structure->>'valid')::boolean then
    raise exception 'PUBLISH_VALIDATION_FAILED: draft failed validate_recipe_structure: %', v_structure->'issues';
  end if;
  v_crop_values := public.validate_recipe_crop_values(v_draft_json);
  if not (v_crop_values->>'valid')::boolean then
    raise exception 'PUBLISH_VALIDATION_FAILED: draft failed validate_recipe_crop_values: %', v_crop_values->'issues';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- Every precondition passed — nothing has been written yet. From here on, any exception
  -- (including an ordinary constraint violation) rolls back everything below as one unit.
  -- ---------------------------------------------------------------------------------------------

  -- 1. Create recipes as draft (PROMPT 12 step 1). Slug uniqueness is enforced by recipes_slug_key
  --    (a live UNIQUE index) — caught below and translated into a stable error code rather than
  --    letting a raw unique_violation propagate.
  begin
    insert into public.recipes (
      slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
      difficulty, cuisine, diet_tags, status, visibility, source_type, owner_id, author_type,
      extraction_confidence, allergen_labels, required_equipment
    ) values (
      _slug, v_draft.title, v_draft.description, null, v_draft.servings, v_draft.prep_minutes,
      v_draft.cook_minutes, v_draft.rest_minutes, v_draft.difficulty, v_draft.cuisine, v_draft.diet_tags,
      'draft', v_draft.visibility, v_draft.source_type, v_draft.owner_id, v_draft.author_type,
      v_draft.extraction_confidence, v_draft.allergen_labels, v_draft.required_equipment
    )
    returning id into v_recipe_id;
  exception when unique_violation then
    raise exception 'PUBLISH_SLUG_ALREADY_USED: slug "%" is already used by an existing recipe', _slug;
  end;

  -- 2. Insert ingredients.
  v_ingredient_count := 0;
  for v_ingredient in select * from jsonb_array_elements(v_draft.ingredients)
  loop
    insert into public.recipe_ingredients (
      recipe_id, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class, sort_order
    ) values (
      v_recipe_id,
      nullif(v_ingredient->>'crop', ''),
      nullif(v_ingredient->>'freeTextName', ''),
      (v_ingredient->>'quantity')::numeric,
      v_ingredient->>'unit',
      v_ingredient->>'note',
      coalesce((v_ingredient->>'isKeyIngredient')::boolean, false),
      nullif(v_ingredient->>'ingredientClass', ''),
      coalesce((v_ingredient->>'sortOrder')::integer, 0)
    );
    v_ingredient_count := v_ingredient_count + 1;
  end loop;

  -- 3. Insert steps.
  v_step_count := 0;
  for v_step in select * from jsonb_array_elements(v_draft.steps)
  loop
    insert into public.recipe_steps (recipe_id, step_no, instruction, photo_url, timer_seconds)
    values (
      v_recipe_id,
      (v_step->>'stepNo')::integer,
      v_step->>'instruction',
      nullif(v_step->>'photoUrl', ''),
      nullif(v_step->>'timerSeconds', '')::integer
    );
    v_step_count := v_step_count + 1;
  end loop;

  -- 4. Map existing live image fields using stored asset paths. `recipes` has a single
  --    `cover_photo_url` column (confirmed live — no separate square/thumbnail column exists), so
  --    the 16:9 hero crop is what it holds; both hero and square recipe_assets rows are stamped
  --    with the new recipe_id so they remain discoverable from the live recipe either way.
  v_base_url := coalesce(current_setting('app.supabase_url', true), 'https://efuqpiaavrzimvstpdpm.supabase.co');
  v_cover_photo_url := v_base_url || '/storage/v1/object/public/' || v_hero.storage_bucket || '/' || v_hero.storage_path;
  update public.recipes set cover_photo_url = v_cover_photo_url where id = v_recipe_id;
  update public.recipe_assets set recipe_id = v_recipe_id where job_id = _job_id and draft_id = v_draft.id;

  -- 5. Final DB validation — re-derive from the rows actually written, not just the source JSON,
  --    catching a mapping bug in this function itself (a silently-dropped row) that individual
  --    column CHECKs would not.
  if (select count(*) from public.recipe_ingredients where recipe_id = v_recipe_id) <> v_ingredient_count then
    raise exception 'PUBLISH_FINAL_VALIDATION_FAILED: ingredient row count mismatch for recipe %', v_recipe_id;
  end if;
  if (select count(*) from public.recipe_steps where recipe_id = v_recipe_id) <> v_step_count then
    raise exception 'PUBLISH_FINAL_VALIDATION_FAILED: step row count mismatch for recipe %', v_recipe_id;
  end if;

  -- 6. Set recipes.status to published. The only F2 migration ever allowed to do this — see the
  --    Step 03 migration's own "recipes.status is NEVER written by this pipeline [elsewhere]" note.
  update public.recipes set status = 'published' where id = v_recipe_id;

  -- 7. Store the live recipe_id on the job and mark it completed. Guarded by the SAME lock CAS
  --    every other stage's advanceStage() uses; unreachable in practice given the row lock taken in
  --    step 0 above, kept as a defensive assertion rather than a real race window.
  -- `started_at = coalesce(started_at, now())` defends recipe_generation_jobs' own
  -- `check (finished_at is null or started_at is not null)` (20260819120000_f2s03_recipe_
  -- automation_schema.sql): nothing observed in this codebase ever sets a job's `started_at`
  -- (distinct from `recipe_generation_stage_runs.started_at`, which telemetry.ts's
  -- recordStageRun does write, per attempt) — this defends this function's own terminal write
  -- regardless of whether an earlier, not-yet-written stage (`plan`) is ever the one that should.
  update public.recipe_generation_jobs
  set recipe_id = v_recipe_id,
      status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      finished_at = now(),
      locked_by = null,
      locked_at = null,
      lock_expires_at = null
  where id = _job_id and locked_by = _lock_token and stage = 'publish' and status = 'running'
  returning id into v_updated_job_id;

  if v_updated_job_id is null then
    raise exception 'PUBLISH_LOCK_LOST_AT_COMMIT: lock was lost while publishing job %', _job_id;
  end if;

  return jsonb_build_object('ok', true, 'recipeId', v_recipe_id, 'slug', _slug, 'alreadyPublished', false);
end;
$$;

comment on function public.publish_recipe_draft(uuid, text, text) is
  'F2 Step 12. Transactional, idempotent publish: re-derives every PROMPT 12 precondition from '
  'first principles, then creates the live recipes/recipe_ingredients/recipe_steps rows, maps '
  'image fields, sets recipes.status=published, and marks the job completed — all in one '
  'transaction. Any failure (explicit or a raw constraint violation) rolls back every write. '
  'Caller (../publish/publish-stage.ts) must already hold the job''s lock at stage=publish/'
  'status=running via the existing, unmodified claimJob().';

revoke all on function public.publish_recipe_draft(uuid, text, text) from public, anon, authenticated;
grant execute on function public.publish_recipe_draft(uuid, text, text) to service_role;
