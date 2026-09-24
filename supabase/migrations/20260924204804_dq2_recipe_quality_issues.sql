-- DQ-2 — Recipe data-quality CONSISTENCY checks (on top of T10's completeness-only overview).
--
-- Why: the 2026-09-24 REF-DQ-1 audit of the 49 published recipes found vegan-tagged salads with
-- beyaz peynir, a "glutensiz" muhammara with galeta unu, a tahini meze with no susam allergen, a
-- smoothie flagged gluten/soya with no ingredient to support it, a 1,502 kcal/porsiyon falafel,
-- a 1-serving bread, a square Zerde cover and 25 ingredients never linked to their Hal crop.
-- T10's admin_recipe_quality_overview surfaced none of them: it only checks 4 MISSING-field
-- conditions (has_equipment, nutrition_complete, allergens_reviewed, unresolved_ingredient_count)
-- and has no notion of fields that are present but contradict each other.
--
-- This migration adds:
--   1a. public.recipe_quality_keyword_rules — keyword -> allergen / diet-block rules (data, not
--       code, so a missed keyword is an INSERT, not a migration).
--   1b. public.fn_recipe_quality_issues(jsonb) — the core checker over ONE normalized document
--       (recipe fields + ingredients[] + steps[]), so published recipes and pipeline drafts go
--       through exactly the same logic.
--   1c. admin_recipe_quality_issues(recipe_id) / admin_recipe_draft_quality_issues(job_id) —
--       thin wrappers that build that document from recipes/* or the latest recipe_drafts row.
--   1d. admin_recipe_quality_overview gains quality_issues + critical/warning/issue counts
--       (existing columns unchanged, new ones appended).
--   1e. admin_update_recipe_meta (servings/prep/cook/rest — previously unfixable from the admin
--       screen) and admin_update_ingredient_nutrition gains p_note + ingredient_class auto-fill.
--
-- Keyword matching (fn_rq_*): text is lower-cased (Turkish-aware for İ/I/Ş/Ğ/Ü/Ö/Ç), every
-- non-letter becomes a single space and the result is padded with one space on each side. A
-- keyword matches only at a WORD START and may be followed only by a Turkish inflectional suffix
-- chain (unu, peyniri, tereyağında, tavuğu, ekmeği — final k/ç/t/p softening included), never by
-- arbitrary letters: "baldo pirinç" is not "bal", "karabuğday" is not "buğday", "tavuk" is not
-- "tava", "arpacık" is not "arpa". Equipment verbs in step text (kaynat/kavur/haşla...) use plain
-- word-start prefix matching instead, because verb conjugations are not noun suffixes.
-- Exclusions (badem sütü for süt, hindistan cevizi for ceviz, mısır unu for un, ...) are removed
-- from the text before the keyword is tested, so "badem sütü ve süt" still matches süt.
--
-- Security: every new function is SECURITY DEFINER / search_path='' and service_role-only; the
-- rules table has RLS on with no policies. Same posture as every T10 admin_* object.

-- =================================================================================================
-- 1a. Keyword rules
-- =================================================================================================

create table if not exists public.recipe_quality_keyword_rules (
  id bigint generated always as identity primary key,
  rule_kind text not null
    check (rule_kind in ('allergen', 'diet_block_vegan', 'diet_block_vejetaryen', 'diet_block_glutensiz')),
  keyword text not null check (btrim(keyword) <> ''),
  allergen_label text,
  exclude_keywords text[] not null default '{}',
  -- An ingredient whose own `note` contains any of these phrases is exempt from this rule
  -- (e.g. yulaf + "glutensiz sertifikalı yulaf kullanın"). Read from the ingredient row's note,
  -- per the DQ-2 dispatch; empty for every other rule.
  exempt_if_note_contains text[] not null default '{}',
  notes text,
  constraint recipe_quality_keyword_rules_allergen_label_check check (
    (rule_kind = 'allergen') = (allergen_label is not null)
  ),
  constraint recipe_quality_keyword_rules_unique unique (rule_kind, keyword, allergen_label)
);

comment on table public.recipe_quality_keyword_rules is
  'DQ-2. Keyword -> allergen / diet-block rules read by fn_recipe_quality_issues. Keywords match '
  'at a word start plus an optional Turkish suffix chain (see fn_rq_pattern). RLS on, no '
  'policies: only service_role / SECURITY DEFINER functions read it.';

alter table public.recipe_quality_keyword_rules enable row level security;
revoke all on public.recipe_quality_keyword_rules from public, anon, authenticated;
grant select, insert, update, delete on public.recipe_quality_keyword_rules to service_role;

-- Seed. `on conflict do nothing` keeps a re-run harmless.
insert into public.recipe_quality_keyword_rules (rule_kind, allergen_label, keyword, exclude_keywords, exempt_if_note_contains, notes)
values
  -- susam
  ('allergen', 'susam', 'tahin', '{}', '{}', null),
  ('allergen', 'susam', 'susam', '{}', '{}', null),
  -- laktoz
  ('allergen', 'laktoz', 'süt', array['badem sütü', 'yulaf sütü', 'hindistan cevizi sütü', 'soya sütü', 'pirinç sütü'], '{}', null),
  ('allergen', 'laktoz', 'yoğurt', '{}', '{}', null),
  ('allergen', 'laktoz', 'peynir', '{}', '{}', null),
  ('allergen', 'laktoz', 'tereyağ', '{}', '{}', 'tereyağ + suffix covers tereyağı/tereyağlı/tereyağında'),
  ('allergen', 'laktoz', 'kaşar', '{}', '{}', null),
  ('allergen', 'laktoz', 'krema', array['fındık kreması', 'hindistan cevizi kreması'], '{}', null),
  ('allergen', 'laktoz', 'labne', '{}', '{}', null),
  ('allergen', 'laktoz', 'lor', '{}', '{}', null),
  ('allergen', 'laktoz', 'ayran', '{}', '{}', null),
  ('allergen', 'laktoz', 'kefir', '{}', '{}', null),
  ('allergen', 'laktoz', 'beyaz çikolata', '{}', '{}', null),
  ('allergen', 'laktoz', 'süt tozu', '{}', '{}', null),
  -- yumurta
  ('allergen', 'yumurta', 'yumurta', '{}', '{}', null),
  -- ağaç kuruyemişi
  ('allergen', 'agac-kuruyemisi', 'ceviz', array['hindistan cevizi'], '{}', null),
  ('allergen', 'agac-kuruyemisi', 'badem', '{}', '{}', null),
  ('allergen', 'agac-kuruyemisi', 'kaju', '{}', '{}', null),
  ('allergen', 'agac-kuruyemisi', 'antep fıstık', '{}', '{}', 'antep fıstığı (k->ğ softening handled by the matcher)'),
  ('allergen', 'agac-kuruyemisi', 'pekan', '{}', '{}', null),
  ('allergen', 'agac-kuruyemisi', 'macadamia', '{}', '{}', null),
  -- fındık / yer fıstığı
  ('allergen', 'findik-yerfistigi', 'fındık', '{}', '{}', null),
  ('allergen', 'findik-yerfistigi', 'yer fıstık', '{}', '{}', null),
  ('allergen', 'findik-yerfistigi', 'yerfıstık', '{}', '{}', 'one-word spelling + crop slug yerfıstığı'),
  ('allergen', 'findik-yerfistigi', 'fıstık ezmesi', '{}', '{}', null),
  -- gluten
  ('allergen', 'gluten', 'un', array['mısır unu', 'pirinç unu', 'nohut unu', 'badem unu', 'glutensiz un'], '{}', null),
  ('allergen', 'gluten', 'buğday', '{}', '{}', null),
  ('allergen', 'gluten', 'bulgur', '{}', '{}', null),
  ('allergen', 'gluten', 'galeta', '{}', '{}', null),
  ('allergen', 'gluten', 'bisküvi', '{}', '{}', null),
  ('allergen', 'gluten', 'petibör', '{}', '{}', null),
  ('allergen', 'gluten', 'yufka', '{}', '{}', null),
  ('allergen', 'gluten', 'lavaş', '{}', '{}', null),
  ('allergen', 'gluten', 'ekmek', '{}', '{}', null),
  ('allergen', 'gluten', 'irmik', '{}', '{}', null),
  ('allergen', 'gluten', 'arpa', '{}', '{}', null),
  ('allergen', 'gluten', 'çavdar', '{}', '{}', null),
  ('allergen', 'gluten', 'kuskus', '{}', '{}', null),
  ('allergen', 'gluten', 'şehriye', '{}', '{}', null),
  ('allergen', 'gluten', 'erişte', '{}', '{}', null),
  ('allergen', 'gluten', 'makarna', '{}', '{}', null),
  ('allergen', 'gluten', 'yulaf', '{}', array['glutensiz sertifikalı'], 'exempt when the ingredient note says glutensiz sertifikalı'),
  -- kereviz / hardal / soya
  ('allergen', 'kereviz', 'kereviz', '{}', '{}', null),
  ('allergen', 'hardal', 'hardal', '{}', '{}', null),
  ('allergen', 'soya', 'soya', '{}', '{}', null),
  ('allergen', 'soya', 'soya sosu', '{}', '{}', null),
  ('allergen', 'soya', 'tofu', '{}', '{}', null),
  -- deniz ürünü (not in the dispatch's shortened seed; added so a fish/shellfish recipe without
  -- the deniz-urunu label is caught, and so a deniz-urunu label is only "unsupported" when truly
  -- unsupported)
  ('allergen', 'deniz-urunu', 'balık', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'ton balığ', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'somon', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'hamsi', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'levrek', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'çipura', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'karides', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'midye', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'kalamar', '{}', '{}', null),
  ('allergen', 'deniz-urunu', 'ahtapot', '{}', '{}', null),
  -- vegan blocks that are NOT in the laktoz list (the laktoz list is copied in below)
  ('diet_block_vegan', null, 'yumurta', '{}', '{}', null),
  ('diet_block_vegan', null, 'bal', array['bal kabak'], '{}', 'bal kabağı is a vegetable'),
  ('diet_block_vegan', null, 'et', '{}', '{}', null),
  ('diet_block_vegan', null, 'kıyma', '{}', '{}', null),
  ('diet_block_vegan', null, 'tavuk', '{}', '{}', null),
  ('diet_block_vegan', null, 'hindi', '{}', '{}', null),
  ('diet_block_vegan', null, 'balık', '{}', '{}', null),
  ('diet_block_vegan', null, 'ton', '{}', '{}', null),
  ('diet_block_vegan', null, 'somon', '{}', '{}', null),
  ('diet_block_vegan', null, 'hamsi', '{}', '{}', null),
  ('diet_block_vegan', null, 'karides', '{}', '{}', null),
  ('diet_block_vegan', null, 'jelatin', '{}', '{}', null),
  ('diet_block_vegan', null, 'et suyu', '{}', '{}', null),
  ('diet_block_vegan', null, 'tavuk suyu', '{}', '{}', null),
  ('diet_block_vegan', null, 'sucuk', '{}', '{}', null),
  ('diet_block_vegan', null, 'pastırma', '{}', '{}', null),
  -- vejetaryen blocks
  ('diet_block_vejetaryen', null, 'et', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'kıyma', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'tavuk', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'hindi', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'balık', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'ton', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'somon', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'karides', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'hamsi', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'jelatin', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'et suyu', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'tavuk suyu', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'sucuk', '{}', '{}', null),
  ('diet_block_vejetaryen', null, 'pastırma', '{}', '{}', null)
on conflict on constraint recipe_quality_keyword_rules_unique do nothing;

-- "glutensiz <x>" (glutensiz ekmek, glutensiz yulaf ezmesi, ...) is never a gluten source.
update public.recipe_quality_keyword_rules
set exclude_keywords = exclude_keywords || array['glutensiz ' || keyword]
where rule_kind = 'allergen' and allergen_label = 'gluten'
  and not (('glutensiz ' || keyword) = any (exclude_keywords));

-- diet_block_vegan: the whole laktoz list, same exclusions.
insert into public.recipe_quality_keyword_rules (rule_kind, allergen_label, keyword, exclude_keywords, exempt_if_note_contains, notes)
select 'diet_block_vegan', null, keyword, exclude_keywords, exempt_if_note_contains, 'copied from allergen/laktoz'
from public.recipe_quality_keyword_rules
where rule_kind = 'allergen' and allergen_label = 'laktoz'
on conflict on constraint recipe_quality_keyword_rules_unique do nothing;

-- diet_block_glutensiz: identical to the gluten allergen list, same exclusions and exemptions.
insert into public.recipe_quality_keyword_rules (rule_kind, allergen_label, keyword, exclude_keywords, exempt_if_note_contains, notes)
select 'diet_block_glutensiz', null, keyword, exclude_keywords, exempt_if_note_contains, 'copied from allergen/gluten'
from public.recipe_quality_keyword_rules
where rule_kind = 'allergen' and allergen_label = 'gluten'
on conflict on constraint recipe_quality_keyword_rules_unique do nothing;

-- =================================================================================================
-- Matching helpers
-- =================================================================================================

-- ' tereyağı ile unu karıştırın ' — lower-case (Turkish capitals mapped explicitly so the result
-- does not depend on the server's collation), every non-letter run -> one space, padded.
create or replace function public.fn_rq_normalize(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select ' ' || btrim(regexp_replace(
    lower(translate(coalesce(p_text, ''), 'İIŞĞÜÖÇÂÎÛ', 'iışğüöçâîû')),
    '[^a-zçğıöşüâîû]+', ' ', 'g'
  )) || ' ';
$$;

-- Regex for one keyword. p_prefix=false: word start + optional Turkish inflectional suffix chain
-- + word end. p_prefix=true: word start + any letters (used for verbs/equipment in step text).
-- The keyword's final k/ç/t/p may appear softened (tavuk -> tavuğu, ekmek -> ekmeği).
create or replace function public.fn_rq_pattern(p_keyword text, p_prefix boolean default false)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kw text := btrim(public.fn_rq_normalize(p_keyword));
  v_last text := right(v_kw, 1);
  v_soft text := case v_last when 'k' then 'ğ' when 'ç' then 'c' when 't' then 'd' when 'p' then 'b' end;
  v_body text;
begin
  if v_kw = '' then
    return null;
  end if;
  v_body := case when v_soft is null then v_kw else left(v_kw, -1) || '[' || v_last || v_soft || ']' end;
  return ' ' || v_body
    || case
         when p_prefix then '[a-zçğıöşüâîû]*'
         -- A buffer consonant (y/n/s) only ever precedes a vowel: "hindi" + "stan" must fail.
         else '(?:lar|ler)?(?:[yns]?[ıiuüae])?(?:n)?(?:ın|in|un|ün|nın|nin|nun|nün)?'
           || '(?:da|de|ta|te|dan|den|tan|ten|ya|ye|a|e|na|ne|nda|nde|ndan|nden|yla|yle|la|le)?'
           || '(?:lı|li|lu|lü|sız|siz|suz|süz)?'
       end
    || '(?= )';
end;
$$;

-- Does p_keyword occur in (already fn_rq_normalize'd) p_text once every p_excludes phrase has
-- been removed from it?
create or replace function public.fn_rq_matches(
  p_text text,
  p_keyword text,
  p_excludes text[] default '{}',
  p_prefix boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := coalesce(p_text, ' ');
  v_ex text;
begin
  foreach v_ex in array coalesce(p_excludes, '{}'::text[]) loop
    v_text := regexp_replace(v_text, public.fn_rq_pattern(v_ex, false), ' ', 'g');
  end loop;
  return v_text ~ public.fn_rq_pattern(p_keyword, p_prefix);
end;
$$;

revoke all on function public.fn_rq_normalize(text) from public, anon, authenticated;
revoke all on function public.fn_rq_pattern(text, boolean) from public, anon, authenticated;
revoke all on function public.fn_rq_matches(text, text, text[], boolean) from public, anon, authenticated;
grant execute on function public.fn_rq_normalize(text) to service_role;
grant execute on function public.fn_rq_pattern(text, boolean) to service_role;
grant execute on function public.fn_rq_matches(text, text, text[], boolean) to service_role;

-- =================================================================================================
-- 1b. Core checker
-- =================================================================================================
--
-- Input (one normalized document; published recipes and drafts both map onto it):
--   { title, servings, prepMinutes, cookMinutes, restMinutes, calories (per serving),
--     dietTags[], allergenLabels[], requiredEquipment[], coverPhotoUrl,
--     ingredients[]: { id?, crop, freeTextName, quantity, unit, note, ingredientClass,
--                      nutritionFoodKey, nutritionExclusionReason },
--     steps[]: { stepNo, instruction, timerSeconds } }
-- Output: [{ code, severity: kritik|uyari|bilgi, message, ingredientId?, suggestion? }], sorted
-- kritik -> uyari -> bilgi (stable within a severity).

create or replace function public.fn_recipe_quality_issues(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_diet text[];
  v_allergens text[];
  v_equipment text[];
  v_servings numeric;
  v_calories numeric;
  v_cover text;
  v_cover_match text[];
  v_cover_exists boolean;
  v_steps_text text;
  v_step_count int;
  v_short_steps int;
  v_timer_min numeric;
  v_declared_min numeric;
  v_all_timed boolean;
  v_tag text;
  v_rec record;
  v_ing record;
  v_alias_kind text;
  v_alias_key text;
  v_ccm_crop text;
  v_crop_hit text;
  v_ings jsonb;
  v_hits jsonb;
begin
  p := coalesce(p, '{}'::jsonb);

  v_diet := array(
    select lower(btrim(x)) from jsonb_array_elements_text(
      case when jsonb_typeof(p->'dietTags') = 'array' then p->'dietTags' else '[]'::jsonb end) x);
  v_allergens := array(
    select lower(btrim(x)) from jsonb_array_elements_text(
      case when jsonb_typeof(p->'allergenLabels') = 'array' then p->'allergenLabels' else '[]'::jsonb end) x);
  v_equipment := array(
    select lower(btrim(x)) from jsonb_array_elements_text(
      case when jsonb_typeof(p->'requiredEquipment') = 'array' then p->'requiredEquipment' else '[]'::jsonb end) x);
  v_servings := nullif(p->>'servings', '')::numeric;
  v_calories := nullif(p->>'calories', '')::numeric;

  -- Ingredients, normalized once. Matching text is freeTextName when present, else the crop slug
  -- (underscores -> spaces). The crop is NOT concatenated in: "glutensiz yulaf ezmesi" linked to
  -- crop yulaf must not re-match yulaf through the slug.
  v_ings := coalesce((
    select jsonb_agg(jsonb_build_object(
      'ord', t.ord,
      'id', nullif(t.e->>'id', ''),
      'display', coalesce(nullif(btrim(t.e->>'freeTextName'), ''), replace(nullif(btrim(t.e->>'crop'), ''), '_', ' '), '?'),
      'free_text_name', nullif(btrim(t.e->>'freeTextName'), ''),
      'crop', nullif(btrim(t.e->>'crop'), ''),
      'quantity', nullif(t.e->>'quantity', ''),
      'unit', nullif(btrim(t.e->>'unit'), ''),
      'ingredient_class', nullif(btrim(t.e->>'ingredientClass'), ''),
      'food_key', nullif(btrim(t.e->>'nutritionFoodKey'), ''),
      'exclusion_reason', nullif(btrim(t.e->>'nutritionExclusionReason'), ''),
      'txt', public.fn_rq_normalize(coalesce(nullif(btrim(t.e->>'freeTextName'), ''), replace(t.e->>'crop', '_', ' '))),
      'note_txt', public.fn_rq_normalize(t.e->>'note')
    ) order by t.ord)
    from jsonb_array_elements(
           case when jsonb_typeof(p->'ingredients') = 'array' then p->'ingredients' else '[]'::jsonb end
         ) with ordinality as t(e, ord)
    where jsonb_typeof(t.e) = 'object'
  ), '[]'::jsonb);

  -- Rule hits: (ingredient, rule) pairs, honoring exclusions and note exemptions.
  v_hits := coalesce((
    select jsonb_agg(distinct jsonb_build_object(
      'ord', i.ord, 'id', i.id, 'display', i.display,
      'rule_kind', r.rule_kind, 'allergen_label', r.allergen_label))
    from jsonb_to_recordset(v_ings) as i(ord int, id text, display text, txt text, note_txt text)
    join public.recipe_quality_keyword_rules r
      on public.fn_rq_matches(i.txt, r.keyword, r.exclude_keywords)
    where not exists (
      select 1 from unnest(r.exempt_if_note_contains) x
      where position(btrim(public.fn_rq_normalize(x)) in i.note_txt) > 0
    )
  ), '[]'::jsonb);

  -- ---- DIET_CONFLICT_* (kritik) -----------------------------------------------------------------
  foreach v_tag in array array['vegan', 'vejetaryen', 'glutensiz'] loop
    if v_tag = any (v_diet) then
      select string_agg(distinct h.display, ', ') as names,
             (array_agg(h.id order by h.ord))[1] as first_id
      into v_rec
      from jsonb_to_recordset(v_hits) as h(ord int, id text, display text, rule_kind text, allergen_label text)
      where h.rule_kind = 'diet_block_' || v_tag;

      if v_rec.names is not null then
        v_issues := v_issues || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'code', 'DIET_CONFLICT_' || upper(v_tag),
          'severity', 'kritik',
          'message', format('%s etiketli ama uygun olmayan malzeme var: %s.',
            case v_tag when 'vegan' then 'Vegan' when 'vejetaryen' then 'Vejetaryen' else 'Glutensiz' end,
            v_rec.names),
          'ingredientId', v_rec.first_id,
          'suggestion', jsonb_build_object('removeDietTag', v_tag))));
      elsif v_tag = 'glutensiz' and 'gluten' = any (v_allergens) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DIET_CONFLICT_GLUTENSIZ',
          'severity', 'kritik',
          'message', 'Glutensiz etiketli ama gluten alerjeni işaretli.',
          'suggestion', jsonb_build_object('removeDietTag', 'glutensiz')));
      end if;
    end if;
  end loop;

  -- ---- ALLERGEN_MISSING (kritik) ----------------------------------------------------------------
  for v_rec in
    select h.allergen_label,
           string_agg(distinct h.display, ', ') as names,
           (array_agg(h.id order by h.ord))[1] as first_id
    from jsonb_to_recordset(v_hits) as h(ord int, id text, display text, rule_kind text, allergen_label text)
    where h.rule_kind = 'allergen' and not (h.allergen_label = any (v_allergens))
    group by h.allergen_label
    order by h.allergen_label
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'code', 'ALLERGEN_MISSING',
      'severity', 'kritik',
      'message', format('%s var, %s alerjeni işaretli değil.',
        upper(translate(left(v_rec.names, 1), 'iı', 'İI')) || substr(v_rec.names, 2),
        v_rec.allergen_label),
      'ingredientId', v_rec.first_id,
      'suggestion', jsonb_build_object('addAllergen', v_rec.allergen_label))));
  end loop;

  -- ---- ALLERGEN_UNSUPPORTED (uyari) — only for labels the rule table knows about ---------------
  for v_rec in
    select a.label
    from unnest(v_allergens) with ordinality as a(label, ord)
    where exists (select 1 from public.recipe_quality_keyword_rules r
                  where r.rule_kind = 'allergen' and r.allergen_label = a.label)
      and not exists (select 1 from jsonb_to_recordset(v_hits) as h(ord int, id text, display text, rule_kind text, allergen_label text)
                      where h.rule_kind = 'allergen' and h.allergen_label = a.label)
    order by a.ord
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'ALLERGEN_UNSUPPORTED',
      'severity', 'uyari',
      'message', format('%s alerjeni işaretli ama hiçbir malzeme bunu gerektirmiyor.', v_rec.label),
      'suggestion', jsonb_build_object('removeAllergen', v_rec.label)));
  end loop;

  -- ---- VEGAN_WITHOUT_VEJETARYEN (uyari) ---------------------------------------------------------
  if 'vegan' = any (v_diet) and not ('vejetaryen' = any (v_diet)) then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'VEGAN_WITHOUT_VEJETARYEN',
      'severity', 'uyari',
      'message', 'Vegan etiketli ama vejetaryen etiketi yok.',
      'suggestion', jsonb_build_object('addDietTag', 'vejetaryen')));
  end if;

  -- ---- KCAL_OUTLIER (uyari) — recipes.calories is per serving -----------------------------------
  if v_calories is not null
     and (v_calories > 900 or v_calories < 30 or (v_servings = 1 and v_calories > 800)) then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'KCAL_OUTLIER',
      'severity', 'uyari',
      'message', format('Porsiyon başı %s kcal (porsiyon: %s) olağan dışı; porsiyon sayısını ve '
        'kızartma yağı gibi tamamı tüketilmeyen malzemeleri kontrol edin.',
        round(v_calories)::text, coalesce(v_servings::text, '?'))));
  end if;

  -- ---- EQUIPMENT_CONFLICT (uyari) ---------------------------------------------------------------
  if 'ozel-ekipman-gerekmiyor' = any (v_equipment) and cardinality(v_equipment) > 1 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'EQUIPMENT_CONFLICT',
      'severity', 'uyari',
      'message', '"Özel ekipman gerekmiyor" başka ekipmanlarla birlikte işaretli.'));
  end if;

  v_steps_text := public.fn_rq_normalize((
    select string_agg(s.e->>'instruction', ' ')
    from jsonb_array_elements(
      case when jsonb_typeof(p->'steps') = 'array' then p->'steps' else '[]'::jsonb end) as s(e)));

  -- Each step word names the equipment it implies and every slug that satisfies it: blender and
  -- mutfak-robotu are interchangeable for pureeing ("blender veya mutfak robotu"), "fırında
  -- kavurun" roasts in the oven, and a düdüklü tencere is a pot on the stove.
  for v_rec in
    select k.slug, string_agg(k.word, ', ' order by k.ord) as words
    from (values
      (1, 'fırın',   'firin',         array['firin'],                             array['mikrodalga fırın']),
      (2, 'ızgara',  'izgara',        array['izgara'],                            array['tel ızgara']),
      (3, 'blender', 'blender',       array['blender', 'mutfak-robotu'],          array[]::text[]),
      (4, 'robot',   'mutfak-robotu', array['mutfak-robotu', 'blender'],          array[]::text[]),
      (5, 'tava',    'ocak',          array['ocak'],                              array[]::text[]),
      (6, 'tencere', 'ocak',          array['ocak', 'duduklu-tencere'],           array[]::text[]),
      (7, 'kaynat',  'ocak',          array['ocak', 'duduklu-tencere'],           array[]::text[]),
      (8, 'kavur',   'ocak',          array['ocak', 'firin'],                     array[]::text[]),
      (9, 'haşla',   'ocak',          array['ocak', 'duduklu-tencere'],           array['haşlanmış'])
    ) as k(ord, word, slug, satisfied_by, excludes)
    where public.fn_rq_matches(v_steps_text, k.word, k.excludes, true)
      and not (k.satisfied_by && v_equipment)
    group by k.slug
    order by min(k.ord)
  loop
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'EQUIPMENT_CONFLICT',
      'severity', 'uyari',
      'message', format('Adımlarda "%s" geçiyor ama "%s" ekipmanı işaretli değil.', v_rec.words, v_rec.slug)));
  end loop;

  -- ---- COVER_NOT_HERO (uyari) -------------------------------------------------------------------
  v_cover := nullif(btrim(p->>'coverPhotoUrl'), '');
  if v_cover is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'COVER_NOT_HERO', 'severity', 'uyari', 'message', 'Kapak fotoğrafı yok.'));
  elsif v_cover !~ '-16x9\.webp$' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'COVER_NOT_HERO', 'severity', 'uyari',
      'message', 'Kapak fotoğrafı 16:9 hero görseli değil (-16x9.webp bekleniyor).'));
  else
    v_cover_match := regexp_match(v_cover, '/storage/v1/object/public/([^/?#]+)/([^?#]+)$');
    v_cover_exists := false;
    if v_cover_match is not null and to_regclass('storage.objects') is not null then
      execute 'select exists (select 1 from storage.objects where bucket_id = $1 and name = $2)'
        into v_cover_exists using v_cover_match[1], v_cover_match[2];
    end if;
    if not v_cover_exists then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'COVER_NOT_HERO', 'severity', 'uyari',
        'message', 'Kapak fotoğrafı depolamada bulunamadı.'));
    end if;
  end if;

  -- ---- CROP_UNLINKED (uyari) --------------------------------------------------------------------
  for v_ing in
    select * from jsonb_to_recordset(v_ings) as i(ord int, id text, display text, free_text_name text, crop text, quantity text, unit text, ingredient_class text, txt text)
    where i.crop is null and i.free_text_name is not null order by i.ord
  loop
    select c.crop into v_crop_hit
    from public.crop_config c
    where c.crop = lower(btrim(v_ing.free_text_name))
       or c.crop = replace(lower(btrim(v_ing.free_text_name)), ' ', '_')
    limit 1;
    if v_crop_hit is not null then
      v_issues := v_issues || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'code', 'CROP_UNLINKED', 'severity', 'uyari',
        'message', format('"%s" bir Hal ürünü ama crop bağlantısı yok.', v_ing.free_text_name),
        'ingredientId', v_ing.id,
        'suggestion', jsonb_build_object('setCrop', v_crop_hit))));
    end if;
  end loop;

  -- ---- TIME_MISMATCH (uyari) --------------------------------------------------------------------
  -- Timers usually cover only some steps (freezing/resting is rarely timed), so "timers < declared"
  -- is only a mismatch when EVERY step carries a timer; "timers > declared" always is.
  select coalesce(sum(nullif(s.e->>'timerSeconds', '')::numeric), 0) / 60.0,
         count(*) > 0 and bool_and(nullif(s.e->>'timerSeconds', '') is not null)
  into v_timer_min, v_all_timed
  from jsonb_array_elements(
    case when jsonb_typeof(p->'steps') = 'array' then p->'steps' else '[]'::jsonb end) as s(e);
  v_declared_min := coalesce(nullif(p->>'prepMinutes', '')::numeric, 0)
                  + coalesce(nullif(p->>'cookMinutes', '')::numeric, 0)
                  + coalesce(nullif(p->>'restMinutes', '')::numeric, 0);
  if v_timer_min > 0
     and abs(v_timer_min - v_declared_min) > 20
     and abs(v_timer_min - v_declared_min) > 0.5 * greatest(v_timer_min, v_declared_min)
     and (v_timer_min > v_declared_min or v_all_timed) then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'TIME_MISMATCH', 'severity', 'uyari',
      'message', format('Adım zamanlayıcıları toplamı %s dk, hazırlık+pişirme+dinlenme %s dk.',
        round(v_timer_min)::text, round(v_declared_min)::text)));
  end if;

  -- ---- STEPS_THIN (uyari) -----------------------------------------------------------------------
  select count(*), count(*) filter (where char_length(btrim(coalesce(s.e->>'instruction', ''))) < 15)
  into v_step_count, v_short_steps
  from jsonb_array_elements(
    case when jsonb_typeof(p->'steps') = 'array' then p->'steps' else '[]'::jsonb end) as s(e);
  if v_step_count < 3 or v_short_steps > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'STEPS_THIN', 'severity', 'uyari',
      'message', case when v_step_count < 3
        then format('Yalnız %s adım var (en az 3 beklenir).', v_step_count)
        else format('%s adım 15 karakterden kısa.', v_short_steps) end));
  end if;

  -- ---- per-ingredient: UNIT_UNKNOWN (uyari), NAME_FORMAT / CLASS_NULL (bilgi) -------------------
  for v_ing in
    select * from jsonb_to_recordset(v_ings) as i(ord int, id text, display text, free_text_name text, crop text,
      quantity text, unit text, ingredient_class text, food_key text, exclusion_reason text, txt text)
    order by i.ord
  loop
    -- UNIT_UNKNOWN asks exactly what calculate_recipe_nutrition asks: can this row be turned into
    -- grams? Same resolution order as its ingredient query (explicit food_key/crop, then
    -- ingredient_nutrition_alias, then crop_culinary_meta.culinary_aliases), then the same
    -- fn_recipe_ingredient_grams_v2. Rows excluded from nutrition are never flagged. Both unit
    -- spellings (su_bardagi / su bardağı) resolve there via fn_nutrition_normalize_unit.
    if v_ing.exclusion_reason is null and v_ing.quantity is not null then
      v_alias_kind := null;
      v_alias_key := null;
      v_ccm_crop := null;
      if v_ing.crop is null and v_ing.food_key is null then
        select a.target_kind, a.target_key into v_alias_kind, v_alias_key
        from public.ingredient_nutrition_alias a
        where a.normalized_alias = public.fn_nutrition_normalize_text(v_ing.free_text_name);
        if v_alias_kind is null then
          select c.crop into v_ccm_crop
          from public.crop_culinary_meta c
          where exists (
            select 1 from unnest(c.culinary_aliases) as alias
            where public.fn_nutrition_normalize_text(alias) = public.fn_nutrition_normalize_text(v_ing.free_text_name)
          )
          order by c.crop
          limit 1;
        end if;
      end if;

      if public.fn_recipe_ingredient_grams_v2(
           coalesce(v_ing.crop, case when v_alias_kind = 'crop' then v_alias_key end, v_ccm_crop),
           coalesce(v_ing.food_key, case when v_alias_kind = 'food' then v_alias_key end),
           v_ing.free_text_name,
           v_ing.quantity::numeric,
           v_ing.unit) is null then
        v_issues := v_issues || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'code', 'UNIT_UNKNOWN', 'severity', 'uyari',
          'message', case when v_ing.unit is null
            then format('"%s" için birim yok; miktar grama çevrilemiyor, besin hesabına girmiyor.', v_ing.display)
            else format('"%s" için "%s" birimi grama çevrilemiyor, besin hesabına girmiyor.', v_ing.display, v_ing.unit)
          end,
          'ingredientId', v_ing.id)));
      end if;
    end if;

    if v_ing.free_text_name is not null and (
         v_ing.free_text_name ~ '^[A-ZÇĞİÖŞÜÂÎÛ]'
         or position(',' in v_ing.free_text_name) > 0
         or public.fn_rq_matches(v_ing.txt, 'havuc', '{}', true)
         or public.fn_rq_matches(v_ing.txt, 'sogan', '{}', true)
         or public.fn_rq_matches(v_ing.txt, 'sarimsak', '{}', true)
         or public.fn_rq_matches(v_ing.txt, 'zeytinyagi', '{}', true)) then
      v_issues := v_issues || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'code', 'NAME_FORMAT', 'severity', 'bilgi',
        'message', format('"%s" adı biçim dışı (büyük harf, virgüllü USDA adı ya da ASCII Türkçe).', v_ing.free_text_name),
        'ingredientId', v_ing.id)));
    end if;

    if v_ing.ingredient_class is null then
      v_issues := v_issues || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'code', 'CLASS_NULL', 'severity', 'bilgi',
        'message', format('"%s" için malzeme sınıfı (tarımsal / platform dışı) boş.', v_ing.display),
        'ingredientId', v_ing.id)));
    end if;
  end loop;

  return coalesce((
    select jsonb_agg(x.e order by case x.e->>'severity' when 'kritik' then 0 when 'uyari' then 1 else 2 end, x.ord)
    from jsonb_array_elements(v_issues) with ordinality as x(e, ord)
  ), '[]'::jsonb);
end;
$$;

comment on function public.fn_recipe_quality_issues(jsonb) is
  'DQ-2. Consistency checker over one normalized recipe document (see migration header for the '
  'shape). Returns [{code, severity (kritik|uyari|bilgi), message, ingredientId?, suggestion?}]. '
  'SECURITY DEFINER, service_role-only.';

revoke all on function public.fn_recipe_quality_issues(jsonb) from public, anon, authenticated;
grant execute on function public.fn_recipe_quality_issues(jsonb) to service_role;

-- =================================================================================================
-- 1c. Wrappers
-- =================================================================================================

create or replace function public.admin_recipe_quality_issues(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc jsonb;
begin
  select jsonb_build_object(
    'title', r.title,
    'servings', r.servings,
    'prepMinutes', r.prep_minutes,
    'cookMinutes', r.cook_minutes,
    'restMinutes', r.rest_minutes,
    'calories', r.calories,
    'dietTags', to_jsonb(coalesce(r.diet_tags, '{}'::text[])),
    'allergenLabels', to_jsonb(coalesce(r.allergen_labels, '{}'::text[])),
    'requiredEquipment', to_jsonb(coalesce(r.required_equipment, '{}'::text[])),
    'coverPhotoUrl', r.cover_photo_url,
    'ingredients', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'crop', i.crop,
        'freeTextName', i.free_text_name,
        'quantity', i.quantity,
        'unit', i.unit,
        'note', i.note,
        'ingredientClass', i.ingredient_class,
        'nutritionFoodKey', i.nutrition_food_key,
        'nutritionExclusionReason', i.nutrition_exclusion_reason
      ) order by i.sort_order, i.id), '[]'::jsonb)
      from public.recipe_ingredients i where i.recipe_id = r.id),
    'steps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'stepNo', s.step_no,
        'instruction', s.instruction,
        'timerSeconds', s.timer_seconds
      ) order by s.step_no), '[]'::jsonb)
      from public.recipe_steps s where s.recipe_id = r.id)
  )
  into v_doc
  from public.recipes r
  where r.id = p_recipe_id;

  if v_doc is null then
    return null;
  end if;
  return public.fn_recipe_quality_issues(v_doc);
end;
$$;

comment on function public.admin_recipe_quality_issues(uuid) is
  'DQ-2. fn_recipe_quality_issues over a stored recipe (recipes + recipe_ingredients + '
  'recipe_steps). Null when the recipe does not exist. service_role-only.';

create or replace function public.admin_recipe_draft_quality_issues(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc jsonb;
begin
  -- Draft ingredient/step JSON already uses the document's camelCase keys (freeTextName,
  -- ingredientClass, stepNo, timerSeconds — recipeIngredientDraftSchema/recipeStepDraftSchema),
  -- so it is passed through. A draft ingredient carries no nutritionFoodKey /
  -- nutritionExclusionReason today, so both read as null (alias resolution still applies).
  -- Calories come from the per-serving nutrition_preview (f2s17).
  select jsonb_build_object(
    'title', d.title,
    'servings', d.servings,
    'prepMinutes', d.prep_minutes,
    'cookMinutes', d.cook_minutes,
    'restMinutes', d.rest_minutes,
    'calories', d.nutrition_preview->'calories',
    'dietTags', to_jsonb(coalesce(d.diet_tags, '{}'::text[])),
    'allergenLabels', to_jsonb(coalesce(d.allergen_labels, '{}'::text[])),
    'requiredEquipment', to_jsonb(coalesce(d.required_equipment, '{}'::text[])),
    'coverPhotoUrl', d.cover_photo_url,
    'ingredients', coalesce(d.ingredients, '[]'::jsonb),
    'steps', coalesce(d.steps, '[]'::jsonb)
  )
  into v_doc
  from public.recipe_drafts d
  where d.job_id = p_job_id
  order by d.version desc
  limit 1;

  if v_doc is null then
    return null;
  end if;
  return public.fn_recipe_quality_issues(v_doc);
end;
$$;

comment on function public.admin_recipe_draft_quality_issues(uuid) is
  'DQ-2. fn_recipe_quality_issues over the latest recipe_drafts version of a job. Null when the '
  'job has no draft. service_role-only.';

revoke all on function public.admin_recipe_quality_issues(uuid) from public, anon, authenticated;
revoke all on function public.admin_recipe_draft_quality_issues(uuid) from public, anon, authenticated;
grant execute on function public.admin_recipe_quality_issues(uuid) to service_role;
grant execute on function public.admin_recipe_draft_quality_issues(uuid) to service_role;

-- =================================================================================================
-- 1d. Overview view — existing T10 columns unchanged and in the same order, 4 appended.
-- =================================================================================================

create or replace view public.admin_recipe_quality_overview
with (security_invoker = true)
as
select
  r.id,
  r.slug,
  r.title,
  r.status,
  r.visibility,
  r.created_at,
  (r.required_equipment is not null and array_length(r.required_equipment, 1) > 0) as has_equipment,
  (r.nutrition_source = 'computed' and r.nutrition_coverage_pct = 100) as nutrition_complete,
  r.nutrition_source,
  r.nutrition_coverage_pct,
  r.nutrition_reference_version,
  (r.allergen_labels is not null) as allergens_reviewed_state,
  r.allergens_reviewed,
  r.allergen_labels,
  (select count(*) from public.recipe_ingredients ri where ri.recipe_id = r.id) as ingredient_count,
  (select count(*) from public.recipe_ingredients ri where ri.recipe_id = r.id
     and ri.crop is null and ri.free_text_name is not null and ri.nutrition_food_key is null
     and ri.nutrition_exclusion_reason is null) as unresolved_ingredient_count,
  q.quality_issues,
  q.critical_issue_count,
  q.warning_issue_count,
  q.critical_issue_count + q.warning_issue_count as issue_count
from public.recipes r
cross join lateral (
  select qi.issues as quality_issues,
         (select count(*)::int from jsonb_array_elements(qi.issues) e where e->>'severity' = 'kritik') as critical_issue_count,
         (select count(*)::int from jsonb_array_elements(qi.issues) e where e->>'severity' = 'uyari') as warning_issue_count
  from (select coalesce(public.admin_recipe_quality_issues(r.id), '[]'::jsonb) as issues) qi
) q
where r.status = 'published' and r.visibility = 'public';

comment on view public.admin_recipe_quality_overview is
  'T10 + DQ-2. Read-only data-quality overview of the published/public catalog: T10''s '
  'completeness columns plus DQ-2''s consistency issues (quality_issues, critical/warning counts; '
  'issue_count = kritik + uyari, bilgi not counted). security_invoker; service_role-only SELECT.';

revoke all on public.admin_recipe_quality_overview from public, anon, authenticated;
grant select on public.admin_recipe_quality_overview to service_role;

-- =================================================================================================
-- 1e. Fix RPCs
-- =================================================================================================

create or replace function public.admin_update_recipe_meta(
  p_recipe_id uuid,
  p_servings int,
  p_prep int,
  p_cook int,
  p_rest int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- servings > 0 / prep >= 0 / cook >= 0 are recipes' own CHECKs (recipes_servings_check,
  -- recipes_prep_minutes_check, recipes_cook_minutes_check) and are left to them. rest_minutes has
  -- no CHECK, and a null servings would silently drop the recipe's nutrition, so both are
  -- validated here.
  if p_servings is null then
    raise exception 'ADMIN_UPDATE_META_INVALID_SERVINGS: servings is required';
  end if;
  if p_rest is not null and p_rest < 0 then
    raise exception 'ADMIN_UPDATE_META_INVALID_REST: rest_minutes must be >= 0';
  end if;

  -- A servings change fires recipes' own trg_recipes_servings_recalc_nutrition (AFTER UPDATE,
  -- WHEN servings IS DISTINCT FROM), which recomputes per-serving nutrition.
  update public.recipes
  set servings = p_servings,
      prep_minutes = p_prep,
      cook_minutes = p_cook,
      rest_minutes = p_rest
  where id = p_recipe_id;

  if not found then
    raise exception 'ADMIN_UPDATE_META_NOT_FOUND: recipe % not found', p_recipe_id;
  end if;
end;
$$;

comment on function public.admin_update_recipe_meta(uuid, int, int, int, int) is
  'DQ-2. Admin-only servings/prep/cook/rest edit. SECURITY DEFINER, service_role-only. Servings '
  'changes recalculate nutrition via the existing recipes trigger.';

revoke all on function public.admin_update_recipe_meta(uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.admin_update_recipe_meta(uuid, int, int, int, int) to service_role;

-- admin_update_ingredient_nutrition: replace the 7-arg T10 signature with an 8-arg one whose new
-- trailing p_note defaults to null. The only caller (admin/quality.ts) uses named arguments, so a
-- 7-key call keeps resolving to the new function. p_note = null means "leave note unchanged" (so
-- a not-yet-redeployed 7-arg caller can never wipe notes); '' clears it.
drop function if exists public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text);

create or replace function public.admin_update_ingredient_nutrition(
  p_ingredient_id uuid,
  p_crop text,
  p_free_text_name text,
  p_quantity numeric,
  p_unit text,
  p_nutrition_food_key text,
  p_nutrition_exclusion_reason text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validation is still recipe_ingredients' own CHECK/FK constraints (see T10's comment).
  -- ingredient_class: a crop-linked row is always tarimsal; an unlinked row with no class yet
  -- becomes platform_disi; an unlinked row that already has a class keeps it.
  update public.recipe_ingredients
  set crop = p_crop,
      free_text_name = p_free_text_name,
      quantity = p_quantity,
      unit = p_unit,
      nutrition_food_key = p_nutrition_food_key,
      nutrition_exclusion_reason = p_nutrition_exclusion_reason,
      note = case when p_note is null then note else nullif(btrim(p_note), '') end,
      ingredient_class = case
        when p_crop is not null then 'tarimsal'
        when ingredient_class is null then 'platform_disi'
        else ingredient_class
      end
  where id = p_ingredient_id;

  if not found then
    raise exception 'ADMIN_UPDATE_INGREDIENT_NOT_FOUND: recipe_ingredients row % not found', p_ingredient_id;
  end if;
end;
$$;

comment on function public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text, text) is
  'T10 + DQ-2. Admin-only recipe_ingredients edit (crop/free_text_name/quantity/unit/'
  'nutrition_food_key/nutrition_exclusion_reason/note), auto-filling ingredient_class. p_note null '
  '= unchanged, '''' = clear. SECURITY DEFINER, service_role-only; validation via the table''s own '
  'CHECK/FK constraints; nutrition recalculated by the existing T4-B AFTER UPDATE trigger.';

revoke all on function public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_ingredient_nutrition(uuid, text, text, numeric, text, text, text, text) to service_role;
