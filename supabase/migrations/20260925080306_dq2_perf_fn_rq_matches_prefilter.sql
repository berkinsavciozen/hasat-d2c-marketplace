-- DQ-2 perf hotfix (2026-09-25, Claude Cowork). admin_recipe_quality_overview took ~15 s for 49
-- recipes, so the admin-recipe-quality list hit PostgREST's 8 s statement_timeout (57014) and the
-- admin "Tarif Veri Kalitesi" screen failed to load. Cause: fn_rq_matches ran a regex for every
-- (ingredient x rule) pair (~42k per full scan) and ~116 distinct patterns thrash PostgreSQL's
-- 32-entry compiled-regex cache, so nearly every match recompiled its pattern.
-- Fix: a necessary-condition pre-check before any regex work. Every pattern fn_rq_pattern builds
-- starts with ' ' || (normalized keyword minus its last letter) — the last letter may be softened —
-- and exclusions only ever remove text, so a keyword whose stem is absent can never match.
-- Verified on live data before applying: identical issue output for all 49 published recipes,
-- full view scan 15.4 s -> 1.4 s.
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
  v_kw text := btrim(public.fn_rq_normalize(p_keyword));
  v_ex text;
begin
  -- Fast necessary-condition pre-check: every pattern fn_rq_pattern builds starts with
  -- ' ' || (keyword minus its last letter), and exclusions only ever remove text, so a keyword
  -- whose stem does not occur in the text can never match. Skips the regex (and PostgreSQL's
  -- 32-entry compiled-regex cache thrash across ~116 rule patterns) for the vast majority of pairs.
  if v_kw <> '' and position(' ' || left(v_kw, -1) in v_text) = 0 then
    return false;
  end if;
  foreach v_ex in array coalesce(p_excludes, '{}'::text[]) loop
    v_text := regexp_replace(v_text, public.fn_rq_pattern(v_ex, false), ' ', 'g');
  end loop;
  return v_text ~ public.fn_rq_pattern(p_keyword, p_prefix);
end;
$$;

revoke all on function public.fn_rq_matches(text, text, text[], boolean) from public, anon, authenticated;
grant execute on function public.fn_rq_matches(text, text, text[], boolean) to service_role;
