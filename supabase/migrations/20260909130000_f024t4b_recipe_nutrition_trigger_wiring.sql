-- F0-24 / T4-B — Wire F7 (post-edit save of an owner's own recipe, mobile `import.tsx?recipeId=`
-- -> `saveDraft()`) to `calculate_recipe_nutrition`, via a DB trigger rather than an Edge Function.
--
-- Per 20260909120000_f024_recipe_nutrition_calc_engine.sql's own header ("TRIGGER WIRING
-- (report-only ... NOT implemented in this migration)"), F2 publish already got wired in T4-A4
-- (PR #117, via publish-stage.ts's invokeNutritionRecalc) because F2's only write path is a
-- service_role Edge Function that can call an RPC directly. F7's only write path is different: the
-- mobile client writes `recipes`/`recipe_ingredients`/`recipe_steps` directly, under RLS, as
-- `authenticated` — there is no server-side hop to attach an RPC call to. Hence a trigger.
--
-- =================================================================================================
-- DISCOVERY (dispatch-required, before any code below) — findings and their consequences
-- =================================================================================================
--
-- 1. Existing triggers on the two tables this migration touches (live `pg_trigger`, re-confirmed
--    for this PR):
--      - `recipe_ingredients`: `trg_recipe_ingredients_auto_match_crop` (BEFORE INSERT, FOR EACH
--        ROW, SECURITY INVOKER, default PUBLIC execute grant left in place -- harmless, see #4
--        below). Fires before ours; irrelevant to ours (it only fills in NEW.crop pre-insert, and
--        our AFTER trigger re-reads the row's final committed `crop` via `calculate_recipe_nutrition`
--        own query, not via NEW/OLD, so ordering does not matter).
--      - `recipes`: `trg_recipes_updated_at` (BEFORE UPDATE, `set_updated_at()`, SECURITY INVOKER).
--        Unrelated; keeps firing exactly as before, including on the UPDATE our new servings
--        trigger's own downstream `calculate_recipe_nutrition` call performs.
--    Neither existing trigger function is SECURITY DEFINER, so neither is precedent for #2 below --
--    the closest live precedent for a `postgres`-owned SECURITY DEFINER function used specifically
--    to bridge a privilege gap is `dispatch_push`'s legitimate callers (notify_offer_received etc,
--    see 20260904140000's own comment), which this migration's design mirrors.
--
-- 2. `invokeNutritionRecalc` (`publish-stage.ts` -> `../nutrition/recalc.ts`) calls
--    `client.rpc('calculate_recipe_nutrition', ...)` as `service_role`, AFTER the
--    `publish_recipe_draft` RPC (20260826130000_f2s12_recipe_publish_rpc.sql) has already committed
--    its own transaction. That RPC's own ingredient-insert step is a `for ... loop` issuing N
--    separate single-row `insert into recipe_ingredients (...)` statements (one per draft
--    ingredient, see lines ~220-238) -- NOT one multi-row insert. Consequence: this migration's new
--    AFTER INSERT trigger on `recipe_ingredients` (see part 2 below) WILL also fire during F2
--    publish, once per ingredient row/statement, in addition to the pre-existing post-publish
--    `invokeNutritionRecalc` call. This is a real, confirmed extra invocation, not a hypothetical --
--    but it is harmless, not a conflict: `calculate_recipe_nutrition` is a pure function of
--    `recipe_ingredients`/`crop_nutrition`/`recipes.servings` (re-confirmed by reading its body for
--    this PR -- it never reads its own previous output), so recomputing it N extra times in the same
--    transaction, then once more after commit, always converges on the identical result. The only
--    cost is redundant CPU/IO on an already-cheap read+aggregate+single-row-UPDATE, bounded by one
--    recipe's own ingredient count. This is the SAME kind of harmless-but-real duplication the F2
--    ingredient-insert loop already causes today for `trg_recipe_ingredients_auto_match_crop` (also
--    fires once per statement); not introduced by this migration, only newly shared by it. The loop
--    itself is `publish-stage.ts`/the f2s12 RPC's own concern and out of this dispatch's scope.
--
-- 3. `calculate_recipe_nutrition(p_recipe_id)` does NOT silently no-op for a nonexistent recipe --
--    re-reading its body for this PR shows `if not found then raise exception ...`. This differs
--    from what this dispatch's own text assumed. Consequence: on a cascade where `recipe_ingredients`
--    rows are deleted as part of deleting their parent `recipes` row (`recipe_ingredients_recipe_id_
--    fkey` is `ON DELETE CASCADE`, confirmed live), this migration's new AFTER DELETE trigger fires
--    with `OLD.recipe_id` pointing at a row that, by the time the trigger runs, no longer exists --
--    and `calculate_recipe_nutrition` raises. Part 1's `fn_recalc_recipe_nutrition_ids` below always
--    calls it inside a per-id `exception when others` block (dispatch requirement #4.2, needed
--    regardless), so this exception is caught and logged the same as any other recalc failure --
--    the net observable behavior (recipe deletion still succeeds, no error surfaces to the caller)
--    is exactly the "safe no-op" the dispatch asked for acceptance criterion #3, just reached via
--    an exception handler catching a real `raise exception`, not via a silent early-return inside
--    `calculate_recipe_nutrition` itself.
--
-- 4. Privilege model (why every new function below is SECURITY DEFINER, owned by `postgres`, and
--    NOT a change to `calculate_recipe_nutrition` itself):
--      - `calculate_recipe_nutrition`/`fn_recipe_ingredient_grams` are SECURITY INVOKER, EXECUTE
--        granted only to `service_role` (live-confirmed via `pg_proc.proacl`, unchanged by this
--        migration -- also re-confirmed anon/authenticated do NOT hold it even via Supabase's
--        default-ACL auto-grant, per 20260909123000_f024b's own fix).
--      - `crop_nutrition` has RLS enabled with NO anon/authenticated grant at all (table-level
--        `revoke all ... from anon, authenticated`, 20260904161000) -- `calculate_recipe_nutrition`
--        cannot even SELECT it as `authenticated`.
--      - `recipes`' nutrition_* columns have NO `authenticated`/`anon` column-level UPDATE grant
--        (20260904170000_t4a2, the column-lock migration) -- even with EXECUTE on
--        `calculate_recipe_nutrition`, its internal UPDATE would fail as `authenticated`.
--      - F7's actual writer is `authenticated` (RLS `owner_id = auth.uid()`), which holds none of
--        the above. A SECURITY INVOKER trigger would therefore silently fail every single F7 recalc
--        (caught and swallowed by the same exception handler that satisfies requirement #4.2,
--        which would make this entire migration a no-op for its one stated purpose).
--      - `postgres` owns `recipes`/`recipe_ingredients`/`crop_nutrition`/`crop_culinary_meta` and
--        `calculate_recipe_nutrition` itself (live-confirmed via `pg_class.relowner`/
--        `pg_proc.proowner`), and holds `bypassrls` (live-confirmed via `pg_roles`, though not
--        needed here since it is the owner of every table involved). Making the trigger functions
--        SECURITY DEFINER + owned by `postgres` (the CREATE FUNCTION default for this migration,
--        never reassigned via ALTER ... OWNER TO -- no such pattern exists anywhere else in this
--        repo's migrations) gives them exactly, and only, the same access
--        `calculate_recipe_nutrition`'s other existing `postgres`-owned SECURITY DEFINER callers
--        already have (`dispatch_push`'s legitimate callers). `calculate_recipe_nutrition`'s own
--        SECURITY INVOKER declaration and its `service_role`-only grant are untouched.
--      - B-1/B-2/T4-A2's shared lesson (re-confirmed live by 20260909123000_f024b, needed AGAIN for
--        this migration's own new function): Supabase's project-level default ACL auto-grants
--        EXECUTE on every newly created `public` function to `anon`/`authenticated`/`service_role`
--        in addition to whatever an explicit `grant`/`revoke ... from public` says -- a bare
--        `revoke all ... from public` does NOT touch those separately-held, auto-granted, per-role
--        entries. Every function below that is NOT itself a trigger (`fn_recalc_recipe_nutrition_ids`,
--        the one piece of this migration an ordinary `select public.fn_recalc_recipe_nutrition_ids(...)`
--        RPC call COULD reach if left open) gets an explicit `revoke execute ... from public, anon,
--        authenticated, service_role` on top of `revoke all from public`, so nothing beyond
--        `postgres` (the owner, whose access is implicit and independent of any grant/revoke, same
--        note already on record in 20260904140000/20260904150000) can call it. The trigger functions
--        themselves (return type `trigger`) are structurally uncallable via any direct SQL/RPC call
--        regardless of grants -- Postgres rejects `SELECT a_trigger_function()` outright -- but this
--        migration revokes PUBLIC/anon/authenticated/service_role EXECUTE on them too anyway, purely
--        as defense-in-depth/an explicit, auditable statement of intent, matching this dispatch's
--        request for a reviewer to be able to see the narrow surface without needing that Postgres
--        detail.
--
-- =================================================================================================
-- DESIGN
-- =================================================================================================
--
-- Part 1: `fn_recalc_recipe_nutrition_ids(uuid[])` -- the ONLY place that calls
--   `calculate_recipe_nutrition`. SECURITY INVOKER (it does not itself need to escalate -- by the
--   time any trigger below calls it, the acting role is already `postgres`, from that trigger's own
--   SECURITY DEFINER context). Its entire body is: dedupe the input array, and for each id, call
--   `calculate_recipe_nutrition` inside `exception when others` (dispatch requirement #4.2 -- the
--   caller's own INSERT/UPDATE/DELETE on recipe_ingredients/recipes must never fail because a
--   nutrition recalc failed). One bad id never stops the rest of the batch.
--
-- Part 2: `recipe_ingredients` -- three FOR EACH STATEMENT triggers (insert/update/delete), each
--   using a transition table (`REFERENCING NEW TABLE`/`OLD TABLE`) to collect every `recipe_id`
--   touched by that ONE statement and pass the deduplicated set to Part 1 once. This is dispatch
--   requirement #3 (no N-times-per-transaction repeat calls) for the case that matters most in
--   practice: a client bulk-writing a recipe's whole ingredient list in one multi-row
--   INSERT/UPDATE/DELETE call (exactly the shape a mobile "Kaydet" -> delete-then-reinsert-all-rows
--   flow, or a single `.insert([...])`, produces). It does NOT collapse calls across MULTIPLE
--   separate statements in the same transaction (see discovery #2's F2 loop) -- doing that safely
--   would need a transaction-scoped dirty-recipe queue shared across statements, which either needs
--   a real (non-temp) table two concurrent unrelated transactions could contend/deadlock on, or a
--   DEFERRABLE CONSTRAINT TRIGGER (which Postgres does not allow to use transition tables at all).
--   Given `calculate_recipe_nutrition` is cheap and provably idempotent (discovery #2), that
--   cross-statement case is left as documented, harmless, pre-existing-shape duplication rather than
--   adding either kind of complexity/risk for it.
--
-- Part 3: `recipes` -- one FOR EACH ROW trigger on UPDATE, `WHEN (OLD.servings IS DISTINCT FROM
--   NEW.servings)`. Row-level (not statement-level) because a WHEN condition needs OLD/NEW, which
--   only row-level triggers have. Dispatch requirement #4.1 (no infinite recursion): the WHEN clause
--   itself is what prevents it -- `calculate_recipe_nutrition`'s own UPDATE never assigns `servings`
--   (re-confirmed by reading its SET list), so `OLD.servings IS DISTINCT FROM NEW.servings` is always
--   false for that UPDATE, and this trigger never re-fires itself. The `recipe_ingredients` triggers
--   need no such guard: `calculate_recipe_nutrition` never writes to `recipe_ingredients` at all.
--
-- Rollback: pure addition. `DROP TRIGGER` x4 + `DROP FUNCTION` x5 fully reverts this migration and
-- changes no other existing behavior (see discovery #1 -- nothing here modifies an existing trigger
-- or function).

-- =================================================================================================
-- Part 1 — the only call site for calculate_recipe_nutrition.
-- =================================================================================================

create or replace function public.fn_recalc_recipe_nutrition_ids(p_recipe_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select distinct x from unnest(p_recipe_ids) as x where x is not null
  loop
    begin
      perform public.calculate_recipe_nutrition(v_id);
    exception when others then
      -- Never let a recalc failure (missing recipe mid-cascade, a bad crop_nutrition row, anything
      -- else) roll back or error out the caller's own recipe_ingredients/recipes write.
      raise warning 'f024t4b: nutrition recalc failed for recipe %: %', v_id, sqlerrm;
    end;
  end loop;
end;
$$;

comment on function public.fn_recalc_recipe_nutrition_ids(uuid[]) is
  'F0-24/T4-B. Deduplicates the given recipe ids and calls calculate_recipe_nutrition once per id, '
  'each call individually exception-guarded. Only ever invoked from this migration''s own SECURITY '
  'DEFINER trigger functions (which already run as postgres by the time they call this) -- SECURITY '
  'INVOKER is sufficient here and deliberately not escalated further. Not reachable via PostgREST '
  '/rpc by any role (see grants below).';

revoke all on function public.fn_recalc_recipe_nutrition_ids(uuid[]) from public;
revoke execute on function public.fn_recalc_recipe_nutrition_ids(uuid[]) from anon, authenticated, service_role;

-- =================================================================================================
-- Part 2 — recipe_ingredients: AFTER INSERT/UPDATE/DELETE, FOR EACH STATEMENT + transition tables.
-- =================================================================================================

create or replace function public.tg_recipe_ingredients_recalc_nutrition_ins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array(select recipe_id from new_rows));
  return null;
end;
$$;

create or replace function public.tg_recipe_ingredients_recalc_nutrition_upd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array(
    select recipe_id from new_rows
    union
    select recipe_id from old_rows
  ));
  return null;
end;
$$;

create or replace function public.tg_recipe_ingredients_recalc_nutrition_del()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array(select recipe_id from old_rows));
  return null;
end;
$$;

comment on function public.tg_recipe_ingredients_recalc_nutrition_ins() is
  'F0-24/T4-B. AFTER INSERT STATEMENT trigger on recipe_ingredients: recalculates nutrition once per '
  'distinct recipe_id touched by the statement (via NEW TABLE). SECURITY DEFINER/owned by postgres '
  'solely to reach calculate_recipe_nutrition (service_role-only) and recipes.nutrition_* (locked '
  'against authenticated/anon column UPDATE) on behalf of authenticated F7 writers -- see migration '
  'header discovery #4. Not reachable via PostgREST /rpc (return type trigger; also explicitly '
  'revoked below as defense-in-depth).';
comment on function public.tg_recipe_ingredients_recalc_nutrition_upd() is
  'F0-24/T4-B. Same as tg_recipe_ingredients_recalc_nutrition_ins, for AFTER UPDATE (NEW TABLE + OLD '
  'TABLE, in case recipe_id itself is ever reassigned).';
comment on function public.tg_recipe_ingredients_recalc_nutrition_del() is
  'F0-24/T4-B. Same as tg_recipe_ingredients_recalc_nutrition_ins, for AFTER DELETE (OLD TABLE).';

revoke all on function public.tg_recipe_ingredients_recalc_nutrition_ins() from public;
revoke execute on function public.tg_recipe_ingredients_recalc_nutrition_ins() from anon, authenticated, service_role;
revoke all on function public.tg_recipe_ingredients_recalc_nutrition_upd() from public;
revoke execute on function public.tg_recipe_ingredients_recalc_nutrition_upd() from anon, authenticated, service_role;
revoke all on function public.tg_recipe_ingredients_recalc_nutrition_del() from public;
revoke execute on function public.tg_recipe_ingredients_recalc_nutrition_del() from anon, authenticated, service_role;

drop trigger if exists trg_recipe_ingredients_recalc_nutrition_ins on public.recipe_ingredients;
create trigger trg_recipe_ingredients_recalc_nutrition_ins
  after insert on public.recipe_ingredients
  referencing new table as new_rows
  for each statement
  execute function public.tg_recipe_ingredients_recalc_nutrition_ins();

drop trigger if exists trg_recipe_ingredients_recalc_nutrition_upd on public.recipe_ingredients;
create trigger trg_recipe_ingredients_recalc_nutrition_upd
  after update on public.recipe_ingredients
  referencing new table as new_rows old table as old_rows
  for each statement
  execute function public.tg_recipe_ingredients_recalc_nutrition_upd();

drop trigger if exists trg_recipe_ingredients_recalc_nutrition_del on public.recipe_ingredients;
create trigger trg_recipe_ingredients_recalc_nutrition_del
  after delete on public.recipe_ingredients
  referencing old table as old_rows
  for each statement
  execute function public.tg_recipe_ingredients_recalc_nutrition_del();

-- =================================================================================================
-- Part 3 — recipes.servings: AFTER UPDATE, FOR EACH ROW, WHEN servings actually changed.
-- =================================================================================================

create or replace function public.tg_recipes_servings_recalc_nutrition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array[new.id]);
  return null;
end;
$$;

comment on function public.tg_recipes_servings_recalc_nutrition() is
  'F0-24/T4-B. AFTER UPDATE ROW trigger on recipes, WHEN (OLD.servings IS DISTINCT FROM NEW.servings) '
  '-- recalculates nutrition when an owner changes servings on their own recipe. The WHEN clause is '
  'what prevents this trigger from re-firing on calculate_recipe_nutrition''s own UPDATE (which never '
  'assigns servings) -- see migration header discovery/design notes. SECURITY DEFINER/owned by '
  'postgres for the same reason as the recipe_ingredients triggers.';

revoke all on function public.tg_recipes_servings_recalc_nutrition() from public;
revoke execute on function public.tg_recipes_servings_recalc_nutrition() from anon, authenticated, service_role;

drop trigger if exists trg_recipes_servings_recalc_nutrition on public.recipes;
create trigger trg_recipes_servings_recalc_nutrition
  after update on public.recipes
  for each row
  when (old.servings is distinct from new.servings)
  execute function public.tg_recipes_servings_recalc_nutrition();
