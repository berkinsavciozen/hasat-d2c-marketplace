-- T6 — AI-customize clone/save contract (migration + RPC half of the dispatch).
-- Backend contract: hasat-vault/Build/T6-Backend-Clone-Save-Contract.md (branch
-- claude/t6-backend-clone-save-contract-th755s). Dispatch: T6 Backend — Klonlama/Kaydetme Kod
-- Dispatch (2026-09-10), approved by Berkin. Scope: migration + `customize-recipe` edge function
-- only — no UI, no T4-A2 INSERT-grant closure, no mobile (contract §8 / dispatch §6).
--
-- =================================================================================================
-- DISCOVERY (re-confirmed live this turn, before writing any code below)
-- =================================================================================================
--
-- 1. `recipes_source_type_check` today is `CHECK (source_type = ANY (ARRAY['manual','text','photo',
--    'url']))` (live pg_constraint). `'ai_customize'` is not in it — Part 1 below adds it, keeping
--    all four existing values (dispatch constraint #2: "hiçbir şey kaldırmıyor").
--
-- 2. Dispatch constraint #1 asked this turn to confirm `validate_recipe_crop_values` /
--    `validate_recipe_units` / `validate_recipe_ingredient_coverage`. Live `pg_proc` has
--    `validate_recipe_crop_values(jsonb)` and `validate_recipe_ingredient_coverage(jsonb)` exactly as
--    the contract assumed, but there is NO `validate_recipe_units` function anywhere in `public` —
--    it does not exist under that name or any close variant. The nearest live equivalent covering
--    servings/prep/cook/rest-minutes/step-numbering validation is `validate_recipe_structure(jsonb)`
--    (added in f2s04_recipe_validation_rpcs, still live, same STABLE/`jsonb` in/out shape as the other
--    two). This migration and the `customize-recipe` edge function therefore call the three live
--    validators — `validate_recipe_structure`, `validate_recipe_crop_values`,
--    `validate_recipe_ingredient_coverage` — instead of the non-existent `validate_recipe_units`.
--    Flagged to Berkin in the delivery report as a contract/reality mismatch, not silently patched
--    over.
--
-- 3. `recipes`/`recipe_ingredients`/`recipe_steps` RLS (live `pg_policies`, re-confirmed): `recipes`
--    INSERT `with_check` is `(owner_id = auth.uid()) AND (visibility = 'private')`; both
--    `recipe_ingredients` and `recipe_steps` INSERT `with_check` are
--    `EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.owner_id = auth.uid())`. All three
--    already hold today, unchanged by this migration — the contract's Bulgu 3 (F7 pattern reusable
--    as-is) is confirmed live, not just asserted from the design round.
--
-- 4. `authenticated` still holds table-level INSERT on `recipes` including the locked nutrition/
--    allergen columns (contract §1 Bulgu 2, re-confirmed live via `information_schema.column_
--    privileges` this turn — T4-A2 only revoked table-wide UPDATE, never INSERT). This migration does
--    NOT touch that grant (dispatch §6: T4-A2's INSERT-closure is explicitly out of scope, separate
--    backlog item). The real defense, per contract §4, is that `rpc_create_ai_customized_recipe`
--    below never references any nutrition/allergen column in its `recipes` INSERT's column list —
--    verified by reading the column list in Part 3 below, not by relying on the grant.
--
-- 5. `recipe_ingredients` has a live `AFTER INSERT ... FOR EACH STATEMENT` trigger
--    (`trg_recipe_ingredients_recalc_nutrition_ins`, wired in 20260909130000_f024t4b) that calls
--    `fn_recalc_recipe_nutrition_ids` for every distinct `recipe_id` in the statement's `NEW TABLE`,
--    each call wrapped in its own `exception when others` (recalc failure never aborts the caller's
--    write). Part 3's ingredient insert below is one ordinary multi-row
--    `INSERT INTO recipe_ingredients (...) SELECT ... FROM jsonb_array_elements(...)` — a single
--    statement — so this trigger fires exactly once per save, satisfying contract §5/§8 without any
--    new invalidation code.
--
-- 6. `recipes.slug` has NO unique constraint at the DB level (live `pg_constraint`, only `recipes_
--    pkey` on `id`) — uniqueness is enforced at the application layer today via
--    `validate_recipe_slug(text, uuid)`, called from client/edge code before insert, not from a DB
--    constraint or trigger. Part 3 mirrors that: it derives a slug from the source recipe's own slug
--    plus a short suffix and appends a numeric counter on collision (checked inside the same
--    transaction), rather than assuming the DB will reject a duplicate.
--
-- =================================================================================================
-- DESIGN
-- =================================================================================================
--
-- Part 1: widen `recipes_source_type_check` to also allow `'ai_customize'`.
--
-- Part 2: new `ai_customize_requests` table — the idempotency/audit record from contract §6/§7.
--   RLS: a user can only see/write their own rows (`user_id = auth.uid()`). No DELETE policy is
--   added (contract has no use case for a user deleting their own request log; rows are small and
--   harmless to retain).
--
-- Part 3: `rpc_create_ai_customized_recipe(...)` — the single transactional write for Faz B (contract
--   §2 Faz B, §7). SECURITY INVOKER, not DEFINER: every write it performs (`recipes`,
--   `recipe_ingredients`, `recipe_steps`, `ai_customize_requests`) is already permitted to
--   `authenticated` by existing RLS/grants when `owner_id = auth.uid()` — there is no privilege gap to
--   bridge here (unlike F0-24/T4-B's nutrition trigger, which needed SECURITY DEFINER specifically
--   because `authenticated` cannot write `recipes.nutrition_*` — irrelevant here since this function
--   never touches those columns). Calling it as one `SELECT public.rpc_create_ai_customized_recipe(...)`
--   RPC gives the three inserts genuine single-transaction atomicity (dispatch §1.6/§7): a PostgREST
--   RPC call runs the whole function body in one transaction, so any exception (bad idempotency
--   state, a validator rejection re-checked server-side, an RLS violation) rolls back all of it —
--   no half-written recipe (recipe row with no ingredients/steps) can ever be observed.
--
--   Source-recipe authorization (dispatch §1.5) is re-checked INSIDE this function, not trusted from
--   the caller: `visibility = 'public' AND author_type <> 'kullanici'`, read fresh from `recipes`.
--   This is enforced twice in the full flow — once in the edge function's Faz A read (contract §2)
--   and again here in Faz B — because Faz B's caller only supplies `source_recipe_id`, and this
--   function must not assume the edge function's own check was actually exercised for this particular
--   call (e.g. a client that skips Faz A and calls Faz B's RPC directly with an arbitrary
--   `idempotency_key`/`source_recipe_id`/ingredient list it made up itself). Note this RPC does NOT
--   validate the ingredient/step content itself (crop/unit/structure validity) — the edge function's
--   Faz A already ran the three live validators (discovery #2) against the LLM's own proposal before
--   ever showing it to the user; re-validating arbitrary content here is out of this dispatch's scope
--   (the RPC's own job is transactionality + idempotency + the authorization re-check above, not
--   content validation) and is noted as an open risk in the delivery report.
--
--   Idempotency (contract §6/§9): if `ai_customize_requests.status = 'completed'` already exists for
--   this `idempotency_key`, return the existing `created_recipe_id` without inserting anything new.
--   Otherwise perform the 3 inserts, then update the request row to `status = 'completed'` with the
--   new `created_recipe_id`. There is deliberately no `status = 'failed'` write inside this function:
--   a raised exception rolls back everything this function itself did in this transaction, INCLUDING
--   any such write. The `customize-recipe` edge function marks the row `failed` in ITS OWN follow-up
--   call after this RPC's exception propagates back to it (contract §7). That follow-up UPDATE only
--   has a row to find in the normal Faz A -> Faz B flow, where Faz A already committed the `pending`
--   row in a separate, already-finished transaction before this RPC ever ran (so this RPC's rollback
--   cannot touch it). In the atypical case of a Faz B call with no prior Faz A row for that key, this
--   function's own "insert pending if missing" branch below is what created it — and if the function
--   then raises, that insert is rolled back too, leaving no row for the edge function's follow-up
--   UPDATE to find. This gap only affects that atypical direct-Faz-B path's audit trail, not
--   Faz B's correctness (idempotency and transactionality both still hold either way) — noted as an
--   open risk in the delivery report rather than solved with e.g. a dblink/autonomous-transaction
--   write, which this dispatch's scope does not call for.
--
-- Rollback: pure addition (one CHECK constraint widened, additively; one new table; one new
-- function). `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` back to the 4-value check, `DROP
-- TABLE public.ai_customize_requests`, `DROP FUNCTION public.rpc_create_ai_customized_recipe` fully
-- reverts this migration. No existing data is migrated or backfilled by this migration (dispatch §5:
-- "henüz hiçbir gerçek veri bu path'ten geçmediği için veri kaybı riski yok").

-- =================================================================================================
-- Part 1 — widen recipes_source_type_check.
-- =================================================================================================

alter table public.recipes
  drop constraint recipes_source_type_check;

alter table public.recipes
  add constraint recipes_source_type_check
  check (source_type = any (array['manual'::text, 'text'::text, 'photo'::text, 'url'::text, 'ai_customize'::text]));

-- =================================================================================================
-- Part 2 — ai_customize_requests (idempotency + audit log for the clone/save flow).
-- =================================================================================================

create table public.ai_customize_requests (
  idempotency_key uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_recipe_id uuid not null references public.recipes(id) on delete cascade,
  status text not null default 'pending',
  created_recipe_id uuid null references public.recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_customize_requests_status_check
    check (status = any (array['pending'::text, 'completed'::text, 'failed'::text]))
);

comment on table public.ai_customize_requests is
  'T6. One row per "AI ile özelleştir" attempt, keyed by a client-generated idempotency_key that '
  'spans Faz A (proposal, status=pending) through Faz B (save). Faz B is retry-safe: a repeat call '
  'with a completed key returns the existing created_recipe_id instead of cloning again. Also serves '
  'as the audit/rollback log for contract §7.';

create index ai_customize_requests_user_id_idx on public.ai_customize_requests(user_id);

alter table public.ai_customize_requests enable row level security;

create policy "ai_customize_requests own select"
  on public.ai_customize_requests for select
  to authenticated
  using (user_id = auth.uid());

create policy "ai_customize_requests own insert"
  on public.ai_customize_requests for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "ai_customize_requests own update"
  on public.ai_customize_requests for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.ai_customize_requests from anon;

-- =================================================================================================
-- Part 3 — rpc_create_ai_customized_recipe: the single transactional Faz B write.
-- =================================================================================================

create or replace function public.rpc_create_ai_customized_recipe(
  p_idempotency_key uuid,
  p_source_recipe_id uuid,
  p_title text,
  p_description text,
  p_servings integer,
  p_prep_minutes integer,
  p_cook_minutes integer,
  p_rest_minutes integer,
  p_difficulty text,
  p_ingredients jsonb,
  p_steps jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing record;
  v_source record;
  v_new_recipe_id uuid;
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- Idempotency: a completed prior attempt for this key returns its result unchanged, no new clone.
  select * into v_existing
  from public.ai_customize_requests
  where idempotency_key = p_idempotency_key;

  if v_existing.idempotency_key is not null then
    if v_existing.user_id <> auth.uid() then
      raise exception 'idempotency key belongs to a different user';
    end if;
    if v_existing.status = 'completed' and v_existing.created_recipe_id is not null then
      return v_existing.created_recipe_id;
    end if;
  else
    -- Faz A is expected to have already inserted a 'pending' row for this key (contract §6); a
    -- direct Faz B call without one (e.g. a client skipping Faz A) still gets one created here so
    -- the idempotency/audit trail is never missing an entry.
    insert into public.ai_customize_requests (idempotency_key, user_id, source_recipe_id, status)
    values (p_idempotency_key, auth.uid(), p_source_recipe_id, 'pending');
  end if;

  -- Re-check source-recipe authorization server-side (dispatch §1.5) — never trust the caller.
  select id, visibility, author_type into v_source
  from public.recipes
  where id = p_source_recipe_id;

  if v_source.id is null then
    raise exception 'source recipe not found';
  end if;
  if v_source.visibility <> 'public' or v_source.author_type = 'kullanici' then
    raise exception 'source recipe is not eligible for AI customization (must be public and not author_type=kullanici)';
  end if;

  -- Derive a slug from the source recipe's own slug + a short random suffix, checked for collision
  -- inside this transaction (recipes.slug has no DB-level unique constraint — discovery #6).
  select slug into v_base_slug from public.recipes where id = p_source_recipe_id;
  v_base_slug := coalesce(v_base_slug, 'tarif');

  loop
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := v_base_slug || '-ai-' || v_suffix || case when v_attempt = 0 then '' else '-' || v_attempt::text end;
    exit when not exists (select 1 from public.recipes where slug = v_slug);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not derive a unique slug after % attempts', v_attempt;
    end if;
  end loop;

  -- 1. recipes — allergen/nutrition columns are deliberately absent from this column list (contract
  --    §1 Bulgu 2 / §4): DB defaults apply (allergens_reviewed=false, nutrition_source=null, etc).
  insert into public.recipes (
    slug, title, description, servings, prep_minutes, cook_minutes, rest_minutes, difficulty,
    status, visibility, source_type, owner_id, author_type, cloned_from_recipe_id
  ) values (
    v_slug, p_title, p_description, p_servings, p_prep_minutes, p_cook_minutes, p_rest_minutes, p_difficulty,
    'draft', 'private', 'ai_customize', auth.uid(), 'kullanici', p_source_recipe_id
  )
  returning id into v_new_recipe_id;

  -- 2. recipe_ingredients — one multi-row INSERT (single statement, fires the recalc trigger once).
  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient
  )
  select
    v_new_recipe_id,
    coalesce((elem->>'sortOrder')::integer, ord - 1),
    nullif(elem->>'crop', ''),
    nullif(elem->>'freeTextName', ''),
    (elem->>'quantity')::numeric,
    nullif(elem->>'unit', ''),
    nullif(elem->>'note', ''),
    coalesce((elem->>'isKeyIngredient')::boolean, false)
  from jsonb_array_elements(p_ingredients) with ordinality as t(elem, ord);

  -- 3. recipe_steps.
  insert into public.recipe_steps (
    recipe_id, step_no, instruction, timer_seconds
  )
  select
    v_new_recipe_id,
    coalesce((elem->>'stepNo')::integer, ord),
    elem->>'instruction',
    (elem->>'timerSeconds')::integer
  from jsonb_array_elements(p_steps) with ordinality as t(elem, ord);

  update public.ai_customize_requests
  set status = 'completed', created_recipe_id = v_new_recipe_id, updated_at = now()
  where idempotency_key = p_idempotency_key;

  return v_new_recipe_id;
end;
$$;

comment on function public.rpc_create_ai_customized_recipe(uuid, uuid, text, text, integer, integer, integer, integer, text, jsonb, jsonb) is
  'T6 Faz B. Single-transaction clone/save: re-validates source-recipe eligibility, derives a unique '
  'slug, inserts recipes -> recipe_ingredients -> recipe_steps, and marks the ai_customize_requests '
  'idempotency row completed. SECURITY INVOKER — relies entirely on existing recipes/recipe_ingredients/'
  'recipe_steps/ai_customize_requests RLS for authorization, no privilege escalation. On any exception '
  'the whole transaction rolls back and the caller (customize-recipe edge function) is responsible for '
  'marking the ai_customize_requests row failed in a separate follow-up call.';

revoke all on function public.rpc_create_ai_customized_recipe(uuid, uuid, text, text, integer, integer, integer, integer, text, jsonb, jsonb) from public;
grant execute on function public.rpc_create_ai_customized_recipe(uuid, uuid, text, text, integer, integer, integer, integer, text, jsonb, jsonb) to authenticated;
