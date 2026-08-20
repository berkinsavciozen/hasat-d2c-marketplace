-- F2 Recipe Automation — Step 04: reusable Postgres validation/query RPCs for recipe automation.
--
-- Eleven new, additive functions (plus two `fn_` internal helpers). Nothing here changes any
-- existing function, table, trigger, or RLS policy — this migration only adds new `public.*`
-- functions so a later step (extract-recipe, and the drafting/QA stages of the F2 pipeline) can
-- call them instead of re-implementing the same deterministic checks in application code. No Edge
-- Function is wired to call these yet.
--
-- Step 03A reconciliation (2026-08-19/20): this migration was merged (PR #42) out of order, ahead
-- of the Step 03A foundation-reconciliation gate, and before either it or the Step 03 schema
-- migration had been applied to any Supabase environment (verified via `list_migrations`/
-- `list_branches` against project efuqpiaavrzimvstpdpm immediately before this revision — neither
-- migration timestamp appears applied anywhere, and no branches exist). Because both are unapplied
-- everywhere, this file is corrected IN PLACE — same filename/timestamp, same migration identity —
-- rather than superseded by a forward corrective migration. This revision:
--   1. Reconciles every `issues` array element with the rebuilt `recipeQAIssueSchema` (schemas.ts):
--      adds a stable `code` (SCREAMING_SNAKE_CASE, never renamed once shipped) and a nullable
--      `requiredChange` to every issue object emitted below, alongside the existing `field`/
--      `severity`/`message` keys, so a caller can push these objects directly into a
--      `RecipeQAResult.blockingIssues`/`nonBlockingSuggestions` array with zero transformation.
--   2. Fixes `get_seasonal_crop_candidates` silently narrowing the seasonal candidate universe: a
--      `crop_config` row with no matching `crop_culinary_meta` row was being dropped entirely
--      (INNER JOIN + is_edible filter baked into the base query) instead of surfaced as
--      "edibility unknown". Now a LEFT JOIN, with edibility filtering only applied when the new
--      `p_edible_only` parameter is explicitly requested, and a missing auxiliary row treated as
--      edible-by-default (`coalesce(is_edible, true)`) rather than silently excluded.
--   3. Switches every function from `SECURITY DEFINER` to `SECURITY INVOKER`. The DEFINER
--      rationale in the original header (RLS hides draft/private recipes from anon/authenticated,
--      so duplicate/uniqueness checks need to see every row) does not hold: EXECUTE is granted
--      ONLY to `service_role`, and `service_role` already has `rolbypassrls = true` on this
--      project (confirmed live: `select rolbypassrls from pg_roles where rolname='service_role'`
--      returns true) — it bypasses RLS on every table regardless of DEFINER/INVOKER, so DEFINER
--      here was a needless privilege escalation with no corresponding need. `set search_path`
--      is tightened from `'public'` to `''` (empty) for defense-in-depth against search_path
--      hijacking, safe because every table/function reference below was already fully qualified
--      with `public.` (built-ins like `unnest`/`jsonb_array_elements`/`generate_series` live in
--      `pg_catalog`, which Postgres always searches regardless of `search_path`).
--   4. Hardens JSON input handling that could previously raise an unhandled Postgres error (or, in
--      one case, silently corrupt data) instead of returning a structured issue:
--        - `normalize_recipe_units`: fixed a `jsonb_set` NULL-strict bug — when an ingredient's
--          unit normalizes to NULL (e.g. an empty-string unit), `to_jsonb(NULL::text)` is a SQL
--          NULL, and `jsonb_set(..., new_value := NULL, ...)` returns SQL NULL for the WHOLE
--          call, not just the `unit` key. That NULL then flowed into
--          `jsonb_build_array(v_ing)` as a literal JSON `null`, silently replacing the entire
--          ingredient object in the returned array. Fixed by coalescing to an explicit JSON
--          `null` literal (`coalesce(to_jsonb(v_canonical), 'null'::jsonb)`) before calling
--          `jsonb_set`, so only the `unit` key becomes JSON null — the ingredient object survives.
--        - `validate_recipe_structure`: `stepNo`/`timerSeconds` (and `servings`/`prepMinutes`/
--          `cookMinutes`/`restMinutes`) map to `int` live columns, but were cast straight to
--          `::integer` (or range-checked as `::numeric` without an integer check) — a fractional
--          JSON number (e.g. `stepNo: 2.5`) raised "invalid input syntax for type integer" and
--          aborted the whole validation call instead of producing a structured
--          `*_NOT_INTEGER` blocking issue. Every such field now stages through `::numeric`, checks
--          `v_num <> trunc(v_num)`, and only casts to `::integer` once confirmed whole.
--        - `validate_recipe_ingredient_coverage`: `isKeyIngredient` was cast straight to
--          `::boolean` — a non-boolean JSON value (e.g. a string or number) raised "invalid input
--          syntax for type boolean". Now type-checked first; a non-boolean value produces an
--          `INGREDIENT_IS_KEY_NOT_BOOLEAN` warning and is treated as `false` (the item is simply
--          excluded from the key-ingredient coverage check) instead of crashing the whole call.
--        - Dynamic regex construction (`'\m' || v_root`, `'\m' || crop display name`) could raise
--          "invalid regular expression" — or silently mismatch — if the interpolated text
--          contained a regex metacharacter (`.`, `(`, `[`, `+`, ...). Both sites now escape the
--          interpolated text through the new `fn_recipe_escape_regex` helper before building the
--          pattern.
--   5. Resolves severity/routing for duplicate plan titles: two briefs in the SAME
--      `RecipePlanBatch` sharing a `workingTitle` is upgraded from a silently-passable 'warning'
--      to 'blocking'. `validate_recipe_plan` gates job creation ("Planner output'u
--      validate_recipe_plan geçmeden job yaratılmaz", RecipeAutomation.md §5.1) — a same-batch
--      title collision is a planning-stage correctness defect the Planner should simply be forced
--      to fix before any job exists, not a soft suggestion that could silently reach drafting.
--      Unused-key-ingredient and step-references-unlisted-crop remain 'warning' — both are
--      documented, deliberately heuristic, substring-based checks with a real false-positive rate
--      (see `validate_recipe_ingredient_coverage`'s own header), and the Step 03A brief explicitly
--      allows "heuristic findings [to] carry confidence or warning semantics". What changes here
--      is that they now carry a stable `code` and land in `RecipeQAResult.nonBlockingSuggestions`
--      (schemas.ts) rather than a bare warning string, so QA routing always sees them instead of a
--      caller being able to silently drop untyped warning text.
--
-- Conventions preserved from the original migration (verified live against project
-- efuqpiaavrzimvstpdpm before writing this):
--   * No unrestricted dynamic SQL anywhere below (no `EXECUTE format(...)` over caller-controlled
--     text) — every query is a fixed, parameterized statement. `fn_recipe_escape_regex` (new)
--     builds a regex pattern from a runtime value, but only ever consumed by the fixed `~`
--     operator below — never fed to `EXECUTE`.
--   * `crop_config` is treated as the sole authoritative crop/seasonality source, per the Step 04
--     brief. Text crop slugs only — no `crop_id` anywhere, matching Step 02/03.
--   * Every function is granted to `service_role` only (`REVOKE ... FROM PUBLIC` +
--     `GRANT EXECUTE ... TO service_role`), mirroring the Step 03 tables' "no public/client access
--     yet" stance — this is pipeline plumbing, not a new public surface.
--   * The four `validate_recipe_*` functions return the same `{code, field, severity, message,
--     requiredChange}` issue shape as `recipeQAIssueSchema` (`schemas.ts`, Step 03A) — `severity`
--     is one of 'info' | 'warning' | 'blocking'; `valid` is true iff no issue has severity =
--     'blocking'.
--   * Draft/plan jsonb inputs mirror `recipeDraftPayloadSchema` / `recipePlanBatchSchema` /
--     `recipeIngredientDraftSchema` / `recipeStepDraftSchema` field names verbatim (camelCase:
--     `freeTextName`, `isKeyIngredient`, `ingredientClass`, `sortOrder`, `stepNo`, `timerSeconds`,
--     `workingTitle`, `focusCrop`, `targetDifficulty`, ...) — the same shape a pipeline stage
--     already holds in memory after Zod parsing, so no field-renaming glue is needed to call these.
--   * Ingredient/step "coverage" text matching (unused ingredient / step referencing an absent
--     ingredient) is substring-based, not true Turkish morphological analysis — Postgres has no
--     Turkish stemmer available here. This is a documented, deliberate heuristic: it only applies
--     to `is_key_ingredient = true` ingredients (optional/garnish ingredients are never flagged —
--     see "optional ingredient behavior" in the completion report's test list) and only to crops in
--     `crop_config` for the reverse check, to keep false positives bounded.
--   * `find_recipe_duplicates`'s word-overlap matching still has no `pg_trgm` dependency (checked
--     live: not installed) — deterministic word-overlap + exact slug/title, not fuzzy similarity.
--   * Live-tested season boundary (wrap-around harvest window) math is unchanged.
--   * No `extract-recipe` wiring — still not called from anywhere.

-- =================================================================================================
-- Internal helpers (fn_ prefix, matching fn_match_culinary_crop / fn_culinary_to_canonical)
-- =================================================================================================

-- Canonical spelling for a raw Turkish unit string. Unrecognized units pass through unchanged
-- (lowercased/trimmed) rather than being rejected — normalization is best-effort, not validation;
-- `validate_recipe_crop_values` is where an actually-invalid unit would be flagged, if ever needed.
create or replace function public.fn_recipe_canonical_unit(p_unit text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_unit, '')));
begin
  if v = '' then
    return null;
  end if;

  return case v
    when 'g' then 'g'
    when 'gr' then 'g'
    when 'gram' then 'g'
    when 'grams' then 'g'
    when 'kg' then 'kg'
    when 'kilo' then 'kg'
    when 'kilogram' then 'kg'
    when 'ml' then 'ml'
    when 'mililitre' then 'ml'
    when 'mililitre'  then 'ml'
    when 'l' then 'l'
    when 'lt' then 'l'
    when 'litre' then 'l'
    when 'lite' then 'l'
    when 'adet' then 'adet'
    when 'tane' then 'adet'
    when 'demet' then 'demet'
    when 'tutam' then 'tutam'
    when 'dal' then 'dal'
    when 'salkım' then 'salkim'
    when 'salkim' then 'salkim'
    when 'dilim' then 'dilim'
    when 'diş' then 'dis'
    when 'dis' then 'dis'
    when 'paket' then 'paket'
    when 'kutu' then 'kutu'
    when 'bardak' then 'bardak'
    when 'su bardağı' then 'su_bardagi'
    when 'su bardagi' then 'su_bardagi'
    when 'çay bardağı' then 'cay_bardagi'
    when 'cay bardagi' then 'cay_bardagi'
    when 'yemek kaşığı' then 'yemek_kasigi'
    when 'yemek kasigi' then 'yemek_kasigi'
    when 'yk' then 'yemek_kasigi'
    when 'tatlı kaşığı' then 'tatli_kasigi'
    when 'tatli kasigi' then 'tatli_kasigi'
    when 'çay kaşığı' then 'cay_kasigi'
    when 'cay kasigi' then 'cay_kasigi'
    when 'ck' then 'cay_kasigi'
    else v
  end;
end;
$$;

revoke all on function public.fn_recipe_canonical_unit(text) from public;
grant execute on function public.fn_recipe_canonical_unit(text) to service_role;

-- Step 03A (new): escapes ARE/regex metacharacters in dynamically-interpolated text before it is
-- spliced into a pattern used with `~`. Used by validate_recipe_ingredient_coverage, whose
-- word-boundary matching interpolates ingredient names / crop display names that are ordinary
-- user/config-authored Turkish text, not guaranteed metacharacter-free.
create or replace function public.fn_recipe_escape_regex(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_text, ''), '([.^$*+?()\[\]{}\\|])', '\\\1', 'g');
$$;

revoke all on function public.fn_recipe_escape_regex(text) from public;
grant execute on function public.fn_recipe_escape_regex(text) to service_role;

-- =================================================================================================
-- 1. get_seasonal_crop_candidates — crop_config rows, flagged for whether a given month falls in
--    their harvest window (wrap-around aware, mirrors `isInHarvestWindow` in
--    src/lib/hasat/crop-config.ts exactly). `crop_config` is always the full candidate universe;
--    `crop_culinary_meta` only narrows results when `p_edible_only` is explicitly requested, and a
--    crop with no `crop_culinary_meta` row is treated as edible-by-default (see file header §2).
-- =================================================================================================

create or replace function public.get_seasonal_crop_candidates(
  p_month integer default null,
  p_category_group text default null,
  p_only_in_season boolean default false,
  p_edible_only boolean default false,
  p_limit integer default 20
)
returns table (
  crop text,
  display_name text,
  category_group text,
  default_unit text,
  harvest_window_start_month integer,
  harvest_window_end_month integer,
  in_season boolean,
  is_edible boolean,
  default_photo_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with month as (
    select greatest(1, least(12, coalesce(p_month, extract(month from now())::int))) as m
  )
  select
    cc.crop,
    cc.display_name,
    cc.category_group,
    cc.default_unit,
    cc.harvest_window_start_month,
    cc.harvest_window_end_month,
    coalesce(
      case
        when cc.harvest_window_start_month is null or cc.harvest_window_end_month is null then false
        when cc.harvest_window_start_month <= cc.harvest_window_end_month
          then month.m between cc.harvest_window_start_month and cc.harvest_window_end_month
        else month.m >= cc.harvest_window_start_month or month.m <= cc.harvest_window_end_month
      end,
      false
    ) as in_season,
    -- A crop_config row with no crop_culinary_meta row is edibility-UNKNOWN, not inedible — it
    -- stays in the candidate universe by default (coalesce to true), never silently dropped.
    coalesce(m.is_edible, true) as is_edible,
    cc.default_photo_url
  from public.crop_config cc
  cross join month
  left join public.crop_culinary_meta m on m.crop = cc.crop
  where (p_category_group is null or cc.category_group = p_category_group)
    and (not coalesce(p_edible_only, false) or coalesce(m.is_edible, true))
    and (
      not coalesce(p_only_in_season, false)
      or coalesce(
        case
          when cc.harvest_window_start_month is null or cc.harvest_window_end_month is null then false
          when cc.harvest_window_start_month <= cc.harvest_window_end_month
            then month.m between cc.harvest_window_start_month and cc.harvest_window_end_month
          else month.m >= cc.harvest_window_start_month or month.m <= cc.harvest_window_end_month
        end,
        false
      )
    )
  order by in_season desc, cc.display_name asc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$$;

revoke all on function public.get_seasonal_crop_candidates(integer, text, boolean, boolean, integer) from public;
grant execute on function public.get_seasonal_crop_candidates(integer, text, boolean, boolean, integer) to service_role;

-- =================================================================================================
-- 2. get_crop_context — single-crop context blob for prompt building. Unknown crop returns
--    {"crop": p_crop, "found": false} rather than raising, matching get_price_history_series'
--    "unknown crop, safe empty shape" precedent.
-- =================================================================================================

create or replace function public.get_crop_context(
  p_crop text,
  p_month integer default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_month integer := greatest(1, least(12, coalesce(p_month, extract(month from now())::int)));
  v_row record;
  v_in_season boolean;
begin
  select cc.crop, cc.display_name, cc.default_unit, cc.category_group,
         cc.harvest_window_start_month, cc.harvest_window_end_month,
         coalesce(cm.is_edible, false) as is_edible,
         coalesce(cm.culinary_aliases, array[]::text[]) as culinary_aliases
    into v_row
    from public.crop_config cc
    left join public.crop_culinary_meta cm on cm.crop = cc.crop
    where cc.crop = p_crop;

  if not found then
    return jsonb_build_object('crop', p_crop, 'found', false);
  end if;

  v_in_season := case
    when v_row.harvest_window_start_month is null or v_row.harvest_window_end_month is null then false
    when v_row.harvest_window_start_month <= v_row.harvest_window_end_month
      then v_month between v_row.harvest_window_start_month and v_row.harvest_window_end_month
    else v_month >= v_row.harvest_window_start_month or v_month <= v_row.harvest_window_end_month
  end;

  return jsonb_build_object(
    'crop', v_row.crop,
    'found', true,
    'displayName', v_row.display_name,
    'defaultUnit', v_row.default_unit,
    'categoryGroup', v_row.category_group,
    'harvestWindowStartMonth', v_row.harvest_window_start_month,
    'harvestWindowEndMonth', v_row.harvest_window_end_month,
    'inSeason', v_in_season,
    'isEdible', v_row.is_edible,
    'culinaryAliases', to_jsonb(v_row.culinary_aliases)
  );
end;
$$;

revoke all on function public.get_crop_context(text, integer) from public;
grant execute on function public.get_crop_context(text, integer) to service_role;

-- =================================================================================================
-- 3. get_recent_recipe_mix — crop distribution of recently-created recipes' KEY ingredients, so a
--    planner can steer away from crops it has already covered a lot lately.
-- =================================================================================================

create or replace function public.get_recent_recipe_mix(
  p_days integer default 30,
  p_limit integer default 20
)
returns table (
  crop text,
  display_name text,
  recipe_count integer,
  last_created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ri.crop,
    cc.display_name,
    count(distinct r.id)::integer as recipe_count,
    max(r.created_at) as last_created_at
  from public.recipe_ingredients ri
  join public.recipes r on r.id = ri.recipe_id
  join public.crop_config cc on cc.crop = ri.crop
  where ri.is_key_ingredient
    and ri.crop is not null
    and r.created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  group by ri.crop, cc.display_name
  order by recipe_count desc, last_created_at desc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$$;

revoke all on function public.get_recent_recipe_mix(integer, integer) from public;
grant execute on function public.get_recent_recipe_mix(integer, integer) to service_role;

-- =================================================================================================
-- 4. search_existing_recipes — filtered lookup across ALL recipes (any status/visibility;
--    service_role already bypasses RLS regardless of DEFINER/INVOKER — see file header §3) for
--    duplicate-avoidance during planning.
-- =================================================================================================

create or replace function public.search_existing_recipes(
  p_query text default null,
  p_crop text default null,
  p_status text default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  slug text,
  title text,
  status text,
  visibility text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.slug, r.title, r.status, r.visibility, r.created_at
  from public.recipes r
  where (p_query is null or btrim(p_query) = '' or r.title ilike '%' || btrim(p_query) || '%')
    and (p_status is null or r.status = p_status)
    and (
      p_crop is null
      or exists (
        select 1 from public.recipe_ingredients ri
        where ri.recipe_id = r.id and ri.crop = p_crop
      )
    )
  order by r.created_at desc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$$;

revoke all on function public.search_existing_recipes(text, text, text, integer) from public;
grant execute on function public.search_existing_recipes(text, text, text, integer) to service_role;

-- =================================================================================================
-- 5. find_recipe_duplicates — likely-duplicate scan for a candidate title/slug/crop, ahead of
--    drafting. No pg_trgm in this project (checked live: not installed) — matching is deterministic
--    word-overlap + exact slug/title, not fuzzy similarity.
-- =================================================================================================

create or replace function public.find_recipe_duplicates(
  p_title text,
  p_crop text default null,
  p_slug text default null,
  p_limit integer default 5
)
returns table (
  id uuid,
  slug text,
  title text,
  match_reason text,
  status text,
  visibility text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidate_words as (
    select array_agg(distinct w) as words
    from unnest(regexp_split_to_array(btrim(lower(coalesce(p_title, ''))), '\s+')) as w
    where length(w) >= 4
  ),
  scored as (
    select
      r.id, r.slug, r.title, r.status, r.visibility,
      case
        when p_slug is not null and r.slug = p_slug then 'exact_slug'
        when lower(btrim(r.title)) = lower(btrim(coalesce(p_title, ''))) then 'exact_title'
        when (
          select count(*) from unnest(
            regexp_split_to_array(btrim(lower(r.title)), '\s+')
          ) as rw
          where length(rw) >= 4
            and rw = any (coalesce((select words from candidate_words), array[]::text[]))
        ) >= 2 then 'title_word_overlap'
        when p_crop is not null
          and exists (select 1 from public.recipe_ingredients ri where ri.recipe_id = r.id and ri.crop = p_crop)
          and (
            select count(*) from unnest(
              regexp_split_to_array(btrim(lower(r.title)), '\s+')
            ) as rw
            where length(rw) >= 4
              and rw = any (coalesce((select words from candidate_words), array[]::text[]))
          ) >= 1 then 'same_crop_and_title_word'
        else null
      end as match_reason
    from public.recipes r
  )
  select id, slug, title, match_reason, status, visibility
  from scored
  where match_reason is not null
  order by
    case match_reason
      when 'exact_slug' then 0
      when 'exact_title' then 1
      when 'title_word_overlap' then 2
      else 3
    end
  limit greatest(1, least(50, coalesce(p_limit, 5)));
$$;

revoke all on function public.find_recipe_duplicates(text, text, text, integer) from public;
grant execute on function public.find_recipe_duplicates(text, text, text, integer) to service_role;

-- =================================================================================================
-- 6. validate_recipe_slug — format + live uniqueness against `recipes.slug` (the unique index
--    already enforces this at insert time; this lets a caller check BEFORE attempting the insert).
-- =================================================================================================

create or replace function public.validate_recipe_slug(
  p_slug text,
  p_exclude_recipe_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_slug text := btrim(coalesce(p_slug, ''));
begin
  if v_slug = '' then
    v_issues := v_issues || jsonb_build_object(
      'code', 'SLUG_REQUIRED', 'field', 'slug', 'severity', 'blocking',
      'message', 'slug is required', 'requiredChange', 'Slug alanini doldurun.'
    );
  else
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'SLUG_INVALID_FORMAT', 'field', 'slug', 'severity', 'blocking',
        'message', 'slug must be lowercase alphanumeric segments separated by single hyphens (got "' || v_slug || '")',
        'requiredChange', 'Slug sadece kucuk harf/rakam icersin ve bolumler tek tire ile ayrilsin.'
      );
    end if;

    if exists (
      select 1 from public.recipes r
      where r.slug = v_slug
        and (p_exclude_recipe_id is null or r.id <> p_exclude_recipe_id)
    ) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'SLUG_ALREADY_USED', 'field', 'slug', 'severity', 'blocking',
        'message', 'slug "' || v_slug || '" is already used by an existing recipe',
        'requiredChange', 'Farkli, benzersiz bir slug secin.'
      );
    end if;
  end if;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues,
    'slug', v_slug
  );
end;
$$;

revoke all on function public.validate_recipe_slug(text, uuid) from public;
grant execute on function public.validate_recipe_slug(text, uuid) to service_role;

-- =================================================================================================
-- 7. validate_recipe_plan — deterministic checks over a recipePlanBatchSchema-shaped plan: each
--    brief's focusCrop must exist in crop_config, targetDifficulty must be a live enum value, and
--    (Step 03A) no two briefs in the same batch may share a workingTitle — promoted from a
--    'warning' to 'blocking' because this function gates job creation (see file header §5).
-- =================================================================================================

create or replace function public.validate_recipe_plan(p_plan jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_briefs jsonb;
  v_brief jsonb;
  v_idx integer := 0;
  v_working_title text;
  v_focus_crop text;
  v_difficulty text;
  v_seen_titles text[] := array[]::text[];
  v_norm_title text;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'PLAN_NOT_OBJECT', 'field', 'plan', 'severity', 'blocking',
        'message', 'plan must be a JSON object', 'requiredChange', 'Plani bir JSON nesnesi olarak gonderin.'
      )),
      'briefCount', 0
    );
  end if;

  v_briefs := p_plan->'briefs';
  if jsonb_typeof(v_briefs) is distinct from 'array' or jsonb_array_length(v_briefs) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'BRIEFS_EMPTY', 'field', 'briefs', 'severity', 'blocking',
      'message', 'briefs must be a non-empty array',
      'requiredChange', 'Plana en az bir brief ekleyin.'
    );
    v_briefs := '[]'::jsonb;
  end if;

  for v_brief in select * from jsonb_array_elements(v_briefs)
  loop
    v_working_title := btrim(coalesce(v_brief->>'workingTitle', ''));
    v_focus_crop := nullif(btrim(coalesce(v_brief->>'focusCrop', '')), '');
    v_difficulty := nullif(btrim(coalesce(v_brief->>'targetDifficulty', '')), '');

    if v_working_title = '' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'BRIEF_TITLE_MISSING', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'blocking',
        'message', format('brief #%s is missing a workingTitle', v_idx),
        'requiredChange', 'Brief icin bir workingTitle belirleyin.'
      );
    else
      v_norm_title := lower(v_working_title);
      if v_norm_title = any (v_seen_titles) then
        -- Step 03A: upgraded warning -> blocking. See file header §5 for why.
        v_issues := v_issues || jsonb_build_object(
          'code', 'BRIEF_TITLE_DUPLICATE', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'blocking',
          'message', format('brief #%s ("%s") repeats another brief''s workingTitle in the same batch', v_idx, v_working_title),
          'requiredChange', 'Bu brief icin farkli, benzersiz bir workingTitle secin.'
        );
      else
        v_seen_titles := v_seen_titles || v_norm_title;
      end if;
    end if;

    if v_focus_crop is not null and not exists (
      select 1 from public.crop_config cc where cc.crop = v_focus_crop
    ) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'BRIEF_CROP_UNKNOWN', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s references unknown crop "%s" (not in crop_config)', v_idx, v_focus_crop),
        'requiredChange', 'crop_config icinde tanimli gecerli bir crop secin.'
      );
    end if;

    if v_difficulty is not null and v_difficulty not in ('kolay', 'orta', 'zor') then
      v_issues := v_issues || jsonb_build_object(
        'code', 'BRIEF_DIFFICULTY_INVALID', 'field', format('briefs[%s].targetDifficulty', v_idx), 'severity', 'blocking',
        'message', format('brief #%s has invalid targetDifficulty "%s" (must be kolay|orta|zor)', v_idx, v_difficulty),
        'requiredChange', 'targetDifficulty degerini kolay, orta veya zor olarak ayarlayin.'
      );
    end if;

    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues,
    'briefCount', jsonb_array_length(v_briefs)
  );
end;
$$;

revoke all on function public.validate_recipe_plan(jsonb) from public;
grant execute on function public.validate_recipe_plan(jsonb) to service_role;

-- =================================================================================================
-- 8. validate_recipe_structure — top-level shape of a recipeDraftPayloadSchema-shaped draft:
--    title, numeric ranges, difficulty enum, ingredients/steps presence, sequential step_no.
--    Step 03A: every field that maps to a live `int` column (servings, prepMinutes, cookMinutes,
--    restMinutes, stepNo, timerSeconds) is now staged through `::numeric` first and checked for
--    whole-number-ness BEFORE any `::integer` cast, so a fractional JSON number produces a
--    structured `*_NOT_INTEGER` blocking issue instead of raising and aborting the whole call.
-- =================================================================================================

create or replace function public.validate_recipe_structure(p_draft jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_ingredients jsonb;
  v_steps jsonb;
  v_step jsonb;
  v_step_nos integer[] := array[]::integer[];
  v_expected integer[];
  v_difficulty text;
  v_num numeric;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DRAFT_NOT_OBJECT', 'field', 'draft', 'severity', 'blocking',
        'message', 'draft must be a JSON object', 'requiredChange', 'Taslagi bir JSON nesnesi olarak gonderin.'
      ))
    );
  end if;

  if btrim(coalesce(p_draft->>'title', '')) = '' then
    v_issues := v_issues || jsonb_build_object(
      'code', 'TITLE_MISSING', 'field', 'title', 'severity', 'blocking',
      'message', 'title is required', 'requiredChange', 'Baslik alanini doldurun.'
    );
  end if;

  -- servings > 0 and an integer; prepMinutes/cookMinutes/restMinutes >= 0 and integers — mirrors
  -- the live recipes_* CHECK constraints (recipes_servings_check, recipes_prep_minutes_check, ...)
  -- plus the column's actual `int` type, which the original numeric-only range check didn't.
  if p_draft ? 'servings' and jsonb_typeof(p_draft->'servings') is distinct from 'null' then
    if jsonb_typeof(p_draft->'servings') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'SERVINGS_NOT_NUMBER', 'field', 'servings', 'severity', 'blocking',
        'message', 'servings must be a number', 'requiredChange', 'servings alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'servings')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'SERVINGS_NOT_INTEGER', 'field', 'servings', 'severity', 'blocking',
          'message', format('servings must be a whole number (got %s)', v_num),
          'requiredChange', 'servings degerini tam sayi olarak girin.'
        );
      elsif v_num <= 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'SERVINGS_NOT_POSITIVE', 'field', 'servings', 'severity', 'blocking',
          'message', format('servings must be > 0 (got %s)', v_num),
          'requiredChange', 'servings degerini 0''dan buyuk yapin.'
        );
      end if;
    end if;
  end if;

  if p_draft ? 'prepMinutes' and jsonb_typeof(p_draft->'prepMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'prepMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'PREP_MINUTES_NOT_NUMBER', 'field', 'prepMinutes', 'severity', 'blocking',
        'message', 'prepMinutes must be a number', 'requiredChange', 'prepMinutes alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'prepMinutes')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'PREP_MINUTES_NOT_INTEGER', 'field', 'prepMinutes', 'severity', 'blocking',
          'message', format('prepMinutes must be a whole number (got %s)', v_num),
          'requiredChange', 'prepMinutes degerini tam sayi olarak girin.'
        );
      elsif v_num < 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'PREP_MINUTES_NEGATIVE', 'field', 'prepMinutes', 'severity', 'blocking',
          'message', format('prepMinutes must be >= 0 (got %s)', v_num),
          'requiredChange', 'prepMinutes degerini 0 veya daha buyuk yapin.'
        );
      end if;
    end if;
  end if;

  if p_draft ? 'cookMinutes' and jsonb_typeof(p_draft->'cookMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'cookMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'COOK_MINUTES_NOT_NUMBER', 'field', 'cookMinutes', 'severity', 'blocking',
        'message', 'cookMinutes must be a number', 'requiredChange', 'cookMinutes alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'cookMinutes')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'COOK_MINUTES_NOT_INTEGER', 'field', 'cookMinutes', 'severity', 'blocking',
          'message', format('cookMinutes must be a whole number (got %s)', v_num),
          'requiredChange', 'cookMinutes degerini tam sayi olarak girin.'
        );
      elsif v_num < 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'COOK_MINUTES_NEGATIVE', 'field', 'cookMinutes', 'severity', 'blocking',
          'message', format('cookMinutes must be >= 0 (got %s)', v_num),
          'requiredChange', 'cookMinutes degerini 0 veya daha buyuk yapin.'
        );
      end if;
    end if;
  end if;

  if p_draft ? 'restMinutes' and jsonb_typeof(p_draft->'restMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'restMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'REST_MINUTES_NOT_NUMBER', 'field', 'restMinutes', 'severity', 'blocking',
        'message', 'restMinutes must be a number', 'requiredChange', 'restMinutes alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'restMinutes')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'REST_MINUTES_NOT_INTEGER', 'field', 'restMinutes', 'severity', 'blocking',
          'message', format('restMinutes must be a whole number (got %s)', v_num),
          'requiredChange', 'restMinutes degerini tam sayi olarak girin.'
        );
      elsif v_num < 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'REST_MINUTES_NEGATIVE', 'field', 'restMinutes', 'severity', 'blocking',
          'message', format('restMinutes must be >= 0 (got %s)', v_num),
          'requiredChange', 'restMinutes degerini 0 veya daha buyuk yapin.'
        );
      end if;
    end if;
  end if;

  -- difficulty — mirrors recipes_difficulty_check (`kolay`|`orta`|`zor`), same enum
  -- validate_recipe_plan checks for a brief's targetDifficulty.
  v_difficulty := nullif(btrim(coalesce(p_draft->>'difficulty', '')), '');
  if v_difficulty is not null and v_difficulty not in ('kolay', 'orta', 'zor') then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIFFICULTY_INVALID', 'field', 'difficulty', 'severity', 'blocking',
      'message', format('difficulty must be kolay|orta|zor (got "%s")', v_difficulty),
      'requiredChange', 'difficulty degerini kolay, orta veya zor olarak ayarlayin.'
    );
  end if;

  v_ingredients := p_draft->'ingredients';
  if jsonb_typeof(v_ingredients) is distinct from 'array' or jsonb_array_length(v_ingredients) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'INGREDIENTS_EMPTY', 'field', 'ingredients', 'severity', 'blocking',
      'message', 'ingredients must be a non-empty array', 'requiredChange', 'En az bir malzeme ekleyin.'
    );
  end if;

  v_steps := p_draft->'steps';
  if jsonb_typeof(v_steps) is distinct from 'array' or jsonb_array_length(v_steps) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'STEPS_EMPTY', 'field', 'steps', 'severity', 'blocking',
      'message', 'steps must be a non-empty array', 'requiredChange', 'En az bir adim ekleyin.'
    );
  else
    for v_step in select * from jsonb_array_elements(v_steps)
    loop
      if btrim(coalesce(v_step->>'instruction', '')) = '' then
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEP_INSTRUCTION_MISSING',
          'field', format('steps[%s].instruction', coalesce(v_step->>'stepNo', '?')),
          'severity', 'blocking', 'message', 'step instruction is required',
          'requiredChange', 'Adim icin bir talimat metni girin.'
        );
      end if;

      if jsonb_typeof(v_step->'stepNo') is distinct from 'number' then
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEP_NO_NOT_NUMBER', 'field', 'steps[].stepNo', 'severity', 'blocking',
          'message', 'every step needs a numeric stepNo', 'requiredChange', 'Her adima sayisal bir stepNo verin.'
        );
      else
        v_num := (v_step->>'stepNo')::numeric;
        if v_num <> trunc(v_num) then
          v_issues := v_issues || jsonb_build_object(
            'code', 'STEP_NO_NOT_INTEGER', 'field', format('steps[%s].stepNo', v_step->>'stepNo'), 'severity', 'blocking',
            'message', format('stepNo must be a whole number (got %s)', v_num),
            'requiredChange', 'stepNo degerini tam sayi olarak girin.'
          );
        elsif v_num <= 0 then
          v_issues := v_issues || jsonb_build_object(
            'code', 'STEP_NO_NOT_POSITIVE', 'field', format('steps[%s].stepNo', v_step->>'stepNo'), 'severity', 'blocking',
            'message', format('stepNo must be > 0 (got %s)', v_num),
            'requiredChange', 'stepNo degerini 0''dan buyuk yapin.'
          );
        else
          v_step_nos := v_step_nos || v_num::integer;
        end if;
      end if;

      if v_step ? 'timerSeconds' and jsonb_typeof(v_step->'timerSeconds') is distinct from 'null' then
        if jsonb_typeof(v_step->'timerSeconds') is distinct from 'number' then
          v_issues := v_issues || jsonb_build_object(
            'code', 'STEP_TIMER_NOT_NUMBER', 'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
            'message', 'timerSeconds must be a number', 'requiredChange', 'timerSeconds alanina sayisal bir deger girin.'
          );
        else
          v_num := (v_step->>'timerSeconds')::numeric;
          if v_num <> trunc(v_num) then
            v_issues := v_issues || jsonb_build_object(
              'code', 'STEP_TIMER_NOT_INTEGER', 'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
              'message', format('timerSeconds must be a whole number (got %s)', v_num),
              'requiredChange', 'timerSeconds degerini tam sayi (saniye) olarak girin.'
            );
          elsif v_num <= 0 then
            v_issues := v_issues || jsonb_build_object(
              'code', 'STEP_TIMER_NOT_POSITIVE', 'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
              'message', format('timerSeconds must be > 0 (got %s)', v_num),
              'requiredChange', 'timerSeconds degerini 0''dan buyuk yapin.'
            );
          end if;
        end if;
      end if;
    end loop;

    -- Sequential step_no starting at 1, no gaps/duplicates — mirrors the Zod refine in schemas.ts.
    -- Only evaluated once every step contributed a valid (integer, positive) stepNo to
    -- v_step_nos above; an invalid stepNo already produced its own blocking issue, so skipping
    -- this check for that case (rather than double-reporting) is deliberate.
    if array_length(v_step_nos, 1) = jsonb_array_length(v_steps) then
      select array_agg(n order by n) into v_step_nos from unnest(v_step_nos) as n;
      select array_agg(g) into v_expected from generate_series(1, jsonb_array_length(v_steps)) as g;
      if v_step_nos is distinct from v_expected then
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEPS_NOT_SEQUENTIAL', 'field', 'steps', 'severity', 'blocking',
          'message', 'steps must have sequential stepNo starting at 1, with no gaps or duplicates',
          'requiredChange', 'Adimlari 1''den baslayarak, bosluksuz ve tekrarsiz sirala.'
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues
  );
end;
$$;

revoke all on function public.validate_recipe_structure(jsonb) from public;
grant execute on function public.validate_recipe_structure(jsonb) to service_role;

-- =================================================================================================
-- 9. validate_recipe_crop_values — per-ingredient crop/quantity validity: unknown crop, missing
--    name (neither crop nor freeTextName — mirrors recipe_ingredients_name_present), non-positive
--    quantity (mirrors recipe_ingredients_quantity_check).
-- =================================================================================================

create or replace function public.validate_recipe_crop_values(p_draft jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_ingredients jsonb;
  v_ing jsonb;
  v_idx integer := 0;
  v_crop text;
  v_free_text text;
begin
  v_ingredients := case when jsonb_typeof(p_draft) = 'object' then p_draft->'ingredients' else null end;
  if jsonb_typeof(v_ingredients) is distinct from 'array' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'INGREDIENTS_NOT_ARRAY', 'field', 'ingredients', 'severity', 'blocking',
        'message', 'ingredients must be an array', 'requiredChange', 'ingredients alanini bir dizi olarak gonderin.'
      ))
    );
  end if;

  for v_ing in select * from jsonb_array_elements(v_ingredients)
  loop
    v_crop := nullif(btrim(coalesce(v_ing->>'crop', '')), '');
    v_free_text := nullif(btrim(coalesce(v_ing->>'freeTextName', '')), '');

    if v_crop is null and v_free_text is null then
      v_issues := v_issues || jsonb_build_object(
        'code', 'INGREDIENT_NAME_MISSING', 'field', format('ingredients[%s]', v_idx), 'severity', 'blocking',
        'message', format('ingredient #%s needs either crop or freeTextName', v_idx),
        'requiredChange', 'Malzeme icin crop veya freeTextName degerlerinden birini belirtin.'
      );
    end if;

    if v_crop is not null and not exists (select 1 from public.crop_config cc where cc.crop = v_crop) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'INGREDIENT_CROP_UNKNOWN', 'field', format('ingredients[%s].crop', v_idx), 'severity', 'blocking',
        'message', format('ingredient #%s references unknown crop "%s" (not in crop_config)', v_idx, v_crop),
        'requiredChange', 'crop_config icinde tanimli gecerli bir crop secin.'
      );
    end if;

    if v_ing ? 'quantity' and jsonb_typeof(v_ing->'quantity') is distinct from 'null' then
      if jsonb_typeof(v_ing->'quantity') is distinct from 'number' then
        v_issues := v_issues || jsonb_build_object(
          'code', 'INGREDIENT_QUANTITY_NOT_NUMBER', 'field', format('ingredients[%s].quantity', v_idx), 'severity', 'blocking',
          'message', format('ingredient #%s quantity must be a number', v_idx),
          'requiredChange', 'quantity alanina sayisal bir deger girin.'
        );
      elsif (v_ing->>'quantity')::numeric <= 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'INGREDIENT_QUANTITY_NOT_POSITIVE', 'field', format('ingredients[%s].quantity', v_idx), 'severity', 'blocking',
          'message', format('ingredient #%s quantity must be > 0 (got %s)', v_idx, v_ing->>'quantity'),
          'requiredChange', 'quantity degerini 0''dan buyuk yapin.'
        );
      end if;
    end if;

    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues
  );
end;
$$;

revoke all on function public.validate_recipe_crop_values(jsonb) from public;
grant execute on function public.validate_recipe_crop_values(jsonb) to service_role;

-- =================================================================================================
-- 10. validate_recipe_ingredient_coverage — substring-based text coverage between ingredients and
--     steps (see file header for the documented heuristic and its scope). Two checks:
--       a) every KEY ingredient (is_key_ingredient = true) should be mentioned somewhere in the
--          steps' combined instruction text -> 'warning' if not (never 'blocking': wording is the
--          author's call, not a hard DB rule; see file header §5 for why this stays a warning).
--          Non-key ingredients are never checked (optional/garnish items are allowed to go
--          unmentioned by name).
--       b) every step should not mention a crop_config crop, by name, that isn't one of this
--          draft's own ingredients -> 'warning' (likely a missing ingredient row, not necessarily
--          wrong — kept as warning, not blocking, since it's a heuristic).
--     Step 03A: `isKeyIngredient` is now type-checked before the `::boolean` cast (a non-boolean
--     value produces a warning instead of raising), and both dynamic regex sites now escape their
--     interpolated text through `fn_recipe_escape_regex` instead of splicing it in raw.
-- =================================================================================================

create or replace function public.validate_recipe_ingredient_coverage(p_draft jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_ingredients jsonb;
  v_steps jsonb;
  v_all_text text;
  v_ing jsonb;
  v_idx integer := 0;
  v_name text;
  v_root text;
  v_is_key boolean;
  v_draft_crops text[] := array[]::text[];
  v_step jsonb;
  v_step_text text;
  v_other record;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DRAFT_NOT_OBJECT', 'field', 'draft', 'severity', 'blocking',
        'message', 'draft must be a JSON object', 'requiredChange', 'Taslagi bir JSON nesnesi olarak gonderin.'
      ))
    );
  end if;

  v_ingredients := p_draft->'ingredients';
  v_steps := p_draft->'steps';
  if jsonb_typeof(v_ingredients) is distinct from 'array' or jsonb_typeof(v_steps) is distinct from 'array' then
    return jsonb_build_object(
      'valid', true,
      'issues', '[]'::jsonb
    );
  end if;

  select string_agg(lower(coalesce(s->>'instruction', '')), ' ') into v_all_text
  from jsonb_array_elements(v_steps) as s;
  v_all_text := coalesce(v_all_text, '');

  -- a) unused key ingredients.
  for v_ing in select * from jsonb_array_elements(v_ingredients)
  loop
    -- Step 03A: guard the isKeyIngredient cast — a non-boolean JSON value (string/number/array/
    -- object) used to raise "invalid input syntax for type boolean" and abort the whole call.
    if (v_ing ? 'isKeyIngredient') and jsonb_typeof(v_ing->'isKeyIngredient') not in ('boolean', 'null') then
      v_issues := v_issues || jsonb_build_object(
        'code', 'INGREDIENT_IS_KEY_NOT_BOOLEAN', 'field', format('ingredients[%s].isKeyIngredient', v_idx),
        'severity', 'warning', 'message', format('ingredient #%s isKeyIngredient must be a boolean; treated as false', v_idx),
        'requiredChange', 'isKeyIngredient alanini true veya false olarak ayarlayin.'
      );
      v_is_key := false;
    else
      v_is_key := coalesce((v_ing->>'isKeyIngredient')::boolean, false);
    end if;

    if v_is_key then
      v_name := coalesce(
        (select cc.display_name from public.crop_config cc where cc.crop = v_ing->>'crop'),
        nullif(btrim(coalesce(v_ing->>'freeTextName', '')), '')
      );
      if v_name is not null then
        v_root := lower(split_part(v_name, ' ', 1));
        -- Word-start anchored (`\m`), not a plain substring test — a bare `position()` check
        -- false-positived here during testing: "bakla" (fava bean) matched inside "kabaklarI"
        -- (kabak + -lari suffix) because "bakla" happens to appear mid-word there. `\m` requires
        -- the match to start at a word boundary, which "kabak" itself still satisfies (it's the
        -- literal prefix of "kabaklari"). `v_root` is escaped via fn_recipe_escape_regex before
        -- being spliced into the pattern — it comes from crop_config/freeTextName, which is
        -- ordinary Turkish food-name text, not guaranteed free of regex metacharacters.
        if length(v_root) >= 3 and v_all_text !~ ('\m' || public.fn_recipe_escape_regex(v_root)) then
          v_issues := v_issues || jsonb_build_object(
            'code', 'INGREDIENT_UNUSED', 'field', format('ingredients[%s]', v_idx), 'severity', 'warning',
            'message', format('key ingredient "%s" is never mentioned in any step instruction', v_name),
            'requiredChange', null
          );
        end if;
      end if;
    end if;
    if v_ing->>'crop' is not null then
      v_draft_crops := v_draft_crops || (v_ing->>'crop');
    end if;
    v_idx := v_idx + 1;
  end loop;

  -- b) steps mentioning a platform crop that isn't among this draft's own ingredients.
  for v_step in select * from jsonb_array_elements(v_steps)
  loop
    v_step_text := lower(coalesce(v_step->>'instruction', ''));
    if v_step_text <> '' then
      for v_other in
        select cc.crop, cc.display_name
        from public.crop_config cc
        where length(cc.display_name) >= 4
          and not (cc.crop = any (v_draft_crops))
          and v_step_text ~ ('\m' || public.fn_recipe_escape_regex(lower(split_part(cc.display_name, ' ', 1))))
      loop
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEP_UNKNOWN_CROP_MENTION', 'field', format('steps[%s]', coalesce(v_step->>'stepNo', '?')), 'severity', 'warning',
          'message', format(
            'step %s mentions "%s" (crop "%s"), which is not among this draft''s ingredients',
            coalesce(v_step->>'stepNo', '?'), v_other.display_name, v_other.crop
          ),
          'requiredChange', null
        );
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues
  );
end;
$$;

revoke all on function public.validate_recipe_ingredient_coverage(jsonb) from public;
grant execute on function public.validate_recipe_ingredient_coverage(jsonb) to service_role;

-- =================================================================================================
-- 11. normalize_recipe_units — canonicalizes each ingredient's `unit` spelling in place (see
--     fn_recipe_canonical_unit above for the alias table). Returns the same ingredients array with
--     only `unit` rewritten; every other field/key is passed through untouched.
--     Step 03A: fixed a jsonb_set NULL-strict bug — see file header §4 for the full write-up.
-- =================================================================================================

create or replace function public.normalize_recipe_units(p_ingredients jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_ing jsonb;
  v_canonical text;
begin
  if jsonb_typeof(p_ingredients) is distinct from 'array' then
    return p_ingredients;
  end if;

  for v_ing in select * from jsonb_array_elements(p_ingredients)
  loop
    if v_ing ? 'unit' and jsonb_typeof(v_ing->'unit') = 'string' then
      v_canonical := public.fn_recipe_canonical_unit(v_ing->>'unit');
      -- `to_jsonb(v_canonical)` is a SQL NULL when v_canonical is NULL (e.g. an empty-string
      -- unit) — passing a SQL NULL as jsonb_set's new_value makes jsonb_set return SQL NULL for
      -- the ENTIRE call, not just the 'unit' key, which previously turned the whole ingredient
      -- object into a JSON null in the result array. coalesce(..., 'null'::jsonb) converts that
      -- SQL NULL into an actual JSON null VALUE first, so jsonb_set only nulls out the unit key.
      v_ing := jsonb_set(v_ing, '{unit}', coalesce(to_jsonb(v_canonical), 'null'::jsonb), true);
    end if;
    v_result := v_result || jsonb_build_array(v_ing);
  end loop;

  return v_result;
end;
$$;

revoke all on function public.normalize_recipe_units(jsonb) from public;
grant execute on function public.normalize_recipe_units(jsonb) to service_role;
