-- F2 Recipe Automation — Step 04: reusable Postgres validation/query RPCs for recipe automation.
--
-- Eleven new, additive functions. Nothing here changes any existing function, table, trigger, or
-- RLS policy — this migration only adds new `public.*` functions so a later step (extract-recipe,
-- and the drafting/QA stages of the F2 pipeline) can call them instead of re-implementing the same
-- deterministic checks in application code. No Edge Function is wired to call these yet.
--
-- Conventions followed (verified live against project efuqpiaavrzimvstpdpm before writing this):
--   * SECURITY DEFINER + `SET search_path TO 'public'` on every function, matching every existing
--     function in this database (both DEFINER and INVOKER ones pin search_path; see
--     `fn_match_culinary_crop`, `get_price_history_series`, `set_updated_at`, etc). DEFINER is used
--     here (not just for consistency) because `recipes`/`recipe_ingredients`/`recipe_steps` carry
--     RLS that hides draft/private rows from anon/authenticated (`recipes anon read public
--     published`, `recipes auth read public or own`) — slug-uniqueness and duplicate-detection
--     checks must see ALL recipes regardless of caller, the same reasoning `get_price_history_series`
--     already relies on to aggregate across `price_history` for every farmer.
--   * No unrestricted dynamic SQL anywhere below (no `EXECUTE format(...)` over caller-controlled
--     text) — every query is a fixed, parameterized statement.
--   * `crop_config` is treated as the sole authoritative crop/seasonality source, per the Step 04
--     brief. Text crop slugs only — no `crop_id` anywhere, matching Step 02/03.
--   * Every function is granted to `service_role` only (`REVOKE ... FROM PUBLIC` +
--     `GRANT EXECUTE ... TO service_role`), mirroring the Step 03 tables' "no public/client access
--     yet" stance — this is pipeline plumbing, not a new public surface.
--   * The four `validate_recipe_*` functions return the same `{field, severity, message}` issue
--     shape as `recipeQAResultSchema.issues` (`schemas.ts`, Step 02) — `severity` is one of
--     'info' | 'warning' | 'blocking'; `valid` is true iff no issue has severity = 'blocking'. Any
--     extra context (brief index, step number, crop code, ...) is folded into `message` text rather
--     than added as extra keys, specifically so a caller can push these objects directly into a
--     `recipeQAResultSchema`-shaped `issues` array without transformation — that schema's issue
--     object is `.strict()` and would reject an unrecognized key.
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
set search_path to 'public'
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

-- =================================================================================================
-- 1. get_seasonal_crop_candidates — crop_config rows, flagged for whether a given month falls in
--    their harvest window (wrap-around aware, mirrors `isInHarvestWindow` in
--    src/lib/hasat/crop-config.ts exactly). Edible crops only (crop_culinary_meta.is_edible).
-- =================================================================================================

create or replace function public.get_seasonal_crop_candidates(
  p_month integer default null,
  p_category_group text default null,
  p_only_in_season boolean default false,
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
  default_photo_url text
)
language sql
stable
security definer
set search_path to 'public'
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
    cc.default_photo_url
  from public.crop_config cc
  cross join month
  where exists (
    select 1 from public.crop_culinary_meta m where m.crop = cc.crop and m.is_edible
  )
  and (p_category_group is null or cc.category_group = p_category_group)
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

revoke all on function public.get_seasonal_crop_candidates(integer, text, boolean, integer) from public;
grant execute on function public.get_seasonal_crop_candidates(integer, text, boolean, integer) to service_role;

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
security definer
set search_path to 'public'
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
security definer
set search_path to 'public'
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
-- 4. search_existing_recipes — filtered lookup across ALL recipes (any status/visibility; see file
--    header re: SECURITY DEFINER) for duplicate-avoidance during planning.
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
security definer
set search_path to 'public'
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
security definer
set search_path to 'public'
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
security definer
set search_path to 'public'
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_slug text := btrim(coalesce(p_slug, ''));
begin
  if v_slug = '' then
    v_issues := v_issues || jsonb_build_object(
      'field', 'slug', 'severity', 'blocking', 'message', 'slug is required'
    );
  else
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      v_issues := v_issues || jsonb_build_object(
        'field', 'slug', 'severity', 'blocking',
        'message', 'slug must be lowercase alphanumeric segments separated by single hyphens (got "' || v_slug || '")'
      );
    end if;

    if exists (
      select 1 from public.recipes r
      where r.slug = v_slug
        and (p_exclude_recipe_id is null or r.id <> p_exclude_recipe_id)
    ) then
      v_issues := v_issues || jsonb_build_object(
        'field', 'slug', 'severity', 'blocking',
        'message', 'slug "' || v_slug || '" is already used by an existing recipe'
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
--    brief's focusCrop must exist in crop_config, targetDifficulty must be a live enum value.
-- =================================================================================================

create or replace function public.validate_recipe_plan(p_plan jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
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
        'field', 'plan', 'severity', 'blocking', 'message', 'plan must be a JSON object'
      )),
      'briefCount', 0
    );
  end if;

  v_briefs := p_plan->'briefs';
  if jsonb_typeof(v_briefs) is distinct from 'array' or jsonb_array_length(v_briefs) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'field', 'briefs', 'severity', 'blocking', 'message', 'briefs must be a non-empty array'
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
        'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'blocking',
        'message', format('brief #%s is missing a workingTitle', v_idx)
      );
    else
      v_norm_title := lower(v_working_title);
      if v_norm_title = any (v_seen_titles) then
        v_issues := v_issues || jsonb_build_object(
          'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'warning',
          'message', format('brief #%s ("%s") repeats another brief''s workingTitle in the same batch', v_idx, v_working_title)
        );
      else
        v_seen_titles := v_seen_titles || v_norm_title;
      end if;
    end if;

    if v_focus_crop is not null and not exists (
      select 1 from public.crop_config cc where cc.crop = v_focus_crop
    ) then
      v_issues := v_issues || jsonb_build_object(
        'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s references unknown crop "%s" (not in crop_config)', v_idx, v_focus_crop)
      );
    end if;

    if v_difficulty is not null and v_difficulty not in ('kolay', 'orta', 'zor') then
      v_issues := v_issues || jsonb_build_object(
        'field', format('briefs[%s].targetDifficulty', v_idx), 'severity', 'blocking',
        'message', format('brief #%s has invalid targetDifficulty "%s" (must be kolay|orta|zor)', v_idx, v_difficulty)
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
-- =================================================================================================

create or replace function public.validate_recipe_structure(p_draft jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
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
        'field', 'draft', 'severity', 'blocking', 'message', 'draft must be a JSON object'
      ))
    );
  end if;

  if btrim(coalesce(p_draft->>'title', '')) = '' then
    v_issues := v_issues || jsonb_build_object(
      'field', 'title', 'severity', 'blocking', 'message', 'title is required'
    );
  end if;

  -- servings > 0, prepMinutes/cookMinutes/restMinutes >= 0 — mirrors the live recipes_* CHECK
  -- constraints exactly (recipes_servings_check, recipes_prep_minutes_check, ...).
  if p_draft ? 'servings' and jsonb_typeof(p_draft->'servings') is distinct from 'null' then
    if jsonb_typeof(p_draft->'servings') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'field', 'servings', 'severity', 'blocking', 'message', 'servings must be a number'
      );
    else
      v_num := (p_draft->>'servings')::numeric;
      if v_num <= 0 then
        v_issues := v_issues || jsonb_build_object(
          'field', 'servings', 'severity', 'blocking',
          'message', format('servings must be > 0 (got %s)', v_num)
        );
      end if;
    end if;
  end if;

  if p_draft ? 'prepMinutes' and jsonb_typeof(p_draft->'prepMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'prepMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object('field', 'prepMinutes', 'severity', 'blocking', 'message', 'prepMinutes must be a number');
    elsif (p_draft->>'prepMinutes')::numeric < 0 then
      v_issues := v_issues || jsonb_build_object('field', 'prepMinutes', 'severity', 'blocking', 'message', format('prepMinutes must be >= 0 (got %s)', p_draft->>'prepMinutes'));
    end if;
  end if;

  if p_draft ? 'cookMinutes' and jsonb_typeof(p_draft->'cookMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'cookMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object('field', 'cookMinutes', 'severity', 'blocking', 'message', 'cookMinutes must be a number');
    elsif (p_draft->>'cookMinutes')::numeric < 0 then
      v_issues := v_issues || jsonb_build_object('field', 'cookMinutes', 'severity', 'blocking', 'message', format('cookMinutes must be >= 0 (got %s)', p_draft->>'cookMinutes'));
    end if;
  end if;

  if p_draft ? 'restMinutes' and jsonb_typeof(p_draft->'restMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'restMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object('field', 'restMinutes', 'severity', 'blocking', 'message', 'restMinutes must be a number');
    elsif (p_draft->>'restMinutes')::numeric < 0 then
      v_issues := v_issues || jsonb_build_object('field', 'restMinutes', 'severity', 'blocking', 'message', format('restMinutes must be >= 0 (got %s)', p_draft->>'restMinutes'));
    end if;
  end if;

  -- difficulty — mirrors recipes_difficulty_check (`kolay`|`orta`|`zor`), same enum
  -- validate_recipe_plan checks for a brief's targetDifficulty.
  v_difficulty := nullif(btrim(coalesce(p_draft->>'difficulty', '')), '');
  if v_difficulty is not null and v_difficulty not in ('kolay', 'orta', 'zor') then
    v_issues := v_issues || jsonb_build_object(
      'field', 'difficulty', 'severity', 'blocking',
      'message', format('difficulty must be kolay|orta|zor (got "%s")', v_difficulty)
    );
  end if;

  v_ingredients := p_draft->'ingredients';
  if jsonb_typeof(v_ingredients) is distinct from 'array' or jsonb_array_length(v_ingredients) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'field', 'ingredients', 'severity', 'blocking', 'message', 'ingredients must be a non-empty array'
    );
  end if;

  v_steps := p_draft->'steps';
  if jsonb_typeof(v_steps) is distinct from 'array' or jsonb_array_length(v_steps) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'field', 'steps', 'severity', 'blocking', 'message', 'steps must be a non-empty array'
    );
  else
    for v_step in select * from jsonb_array_elements(v_steps)
    loop
      if btrim(coalesce(v_step->>'instruction', '')) = '' then
        v_issues := v_issues || jsonb_build_object(
          'field', format('steps[%s].instruction', coalesce(v_step->>'stepNo', '?')),
          'severity', 'blocking', 'message', 'step instruction is required'
        );
      end if;

      if jsonb_typeof(v_step->'stepNo') is distinct from 'number' then
        v_issues := v_issues || jsonb_build_object(
          'field', 'steps[].stepNo', 'severity', 'blocking', 'message', 'every step needs a numeric stepNo'
        );
      else
        v_step_nos := v_step_nos || (v_step->>'stepNo')::integer;
        if (v_step->>'stepNo')::integer <= 0 then
          v_issues := v_issues || jsonb_build_object(
            'field', format('steps[%s].stepNo', v_step->>'stepNo'), 'severity', 'blocking',
            'message', format('stepNo must be > 0 (got %s)', v_step->>'stepNo')
          );
        end if;
      end if;

      if v_step ? 'timerSeconds' and jsonb_typeof(v_step->'timerSeconds') is distinct from 'null' then
        if jsonb_typeof(v_step->'timerSeconds') is distinct from 'number' then
          v_issues := v_issues || jsonb_build_object(
            'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
            'message', 'timerSeconds must be a number'
          );
        elsif (v_step->>'timerSeconds')::numeric <= 0 then
          v_issues := v_issues || jsonb_build_object(
            'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
            'message', format('timerSeconds must be > 0 (got %s)', v_step->>'timerSeconds')
          );
        end if;
      end if;
    end loop;

    -- Sequential step_no starting at 1, no gaps/duplicates — mirrors the Zod refine in schemas.ts.
    if array_length(v_step_nos, 1) = jsonb_array_length(v_steps) then
      select array_agg(n order by n) into v_step_nos from unnest(v_step_nos) as n;
      select array_agg(g) into v_expected from generate_series(1, jsonb_array_length(v_steps)) as g;
      if v_step_nos is distinct from v_expected then
        v_issues := v_issues || jsonb_build_object(
          'field', 'steps', 'severity', 'blocking',
          'message', 'steps must have sequential stepNo starting at 1, with no gaps or duplicates'
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
security definer
set search_path to 'public'
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
        'field', 'ingredients', 'severity', 'blocking', 'message', 'ingredients must be an array'
      ))
    );
  end if;

  for v_ing in select * from jsonb_array_elements(v_ingredients)
  loop
    v_crop := nullif(btrim(coalesce(v_ing->>'crop', '')), '');
    v_free_text := nullif(btrim(coalesce(v_ing->>'freeTextName', '')), '');

    if v_crop is null and v_free_text is null then
      v_issues := v_issues || jsonb_build_object(
        'field', format('ingredients[%s]', v_idx), 'severity', 'blocking',
        'message', format('ingredient #%s needs either crop or freeTextName', v_idx)
      );
    end if;

    if v_crop is not null and not exists (select 1 from public.crop_config cc where cc.crop = v_crop) then
      v_issues := v_issues || jsonb_build_object(
        'field', format('ingredients[%s].crop', v_idx), 'severity', 'blocking',
        'message', format('ingredient #%s references unknown crop "%s" (not in crop_config)', v_idx, v_crop)
      );
    end if;

    if v_ing ? 'quantity' and jsonb_typeof(v_ing->'quantity') is distinct from 'null' then
      if jsonb_typeof(v_ing->'quantity') is distinct from 'number' then
        v_issues := v_issues || jsonb_build_object(
          'field', format('ingredients[%s].quantity', v_idx), 'severity', 'blocking',
          'message', format('ingredient #%s quantity must be a number', v_idx)
        );
      elsif (v_ing->>'quantity')::numeric <= 0 then
        v_issues := v_issues || jsonb_build_object(
          'field', format('ingredients[%s].quantity', v_idx), 'severity', 'blocking',
          'message', format('ingredient #%s quantity must be > 0 (got %s)', v_idx, v_ing->>'quantity')
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
--          author's call, not a hard DB rule). Non-key ingredients are never checked (optional /
--          garnish items are allowed to go unmentioned by name).
--       b) every step should not mention a crop_config crop, by name, that isn't one of this
--          draft's own ingredients -> 'warning' (likely a missing ingredient row, not necessarily
--          wrong — kept as warning, not blocking, since it's a heuristic).
-- =================================================================================================

create or replace function public.validate_recipe_ingredient_coverage(p_draft jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
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
  v_draft_crops text[] := array[]::text[];
  v_step jsonb;
  v_step_text text;
  v_other record;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'field', 'draft', 'severity', 'blocking', 'message', 'draft must be a JSON object'
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
    if coalesce((v_ing->>'isKeyIngredient')::boolean, false) then
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
        -- literal prefix of "kabaklari"). Assumes crop/ingredient names carry no regex
        -- metacharacters, true for the natural-language Turkish food names this operates on.
        if length(v_root) >= 3 and v_all_text !~ ('\m' || v_root) then
          v_issues := v_issues || jsonb_build_object(
            'field', format('ingredients[%s]', v_idx), 'severity', 'warning',
            'message', format('key ingredient "%s" is never mentioned in any step instruction', v_name)
          );
        end if;
      end if;
      if v_ing->>'crop' is not null then
        v_draft_crops := v_draft_crops || (v_ing->>'crop');
      end if;
    else
      if v_ing->>'crop' is not null then
        v_draft_crops := v_draft_crops || (v_ing->>'crop');
      end if;
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
          and v_step_text ~ ('\m' || lower(split_part(cc.display_name, ' ', 1)))
      loop
        v_issues := v_issues || jsonb_build_object(
          'field', format('steps[%s]', coalesce(v_step->>'stepNo', '?')), 'severity', 'warning',
          'message', format(
            'step %s mentions "%s" (crop "%s"), which is not among this draft''s ingredients',
            coalesce(v_step->>'stepNo', '?'), v_other.display_name, v_other.crop
          )
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
-- =================================================================================================

create or replace function public.normalize_recipe_units(p_ingredients jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
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
      v_ing := jsonb_set(v_ing, '{unit}', to_jsonb(v_canonical), true);
    end if;
    v_result := v_result || jsonb_build_array(v_ing);
  end loop;

  return v_result;
end;
$$;

revoke all on function public.normalize_recipe_units(jsonb) from public;
grant execute on function public.normalize_recipe_units(jsonb) to service_role;
