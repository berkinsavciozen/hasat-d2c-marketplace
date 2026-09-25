-- DQ-2 perf — admin_recipe_quality_overview evaluates admin_recipe_quality_issues ONCE per row.
--
-- Why: after DQ-2 went live the admin "Tarif Veri Kalitesi" list request failed with 57014
-- (statement_timeout). 20260925080306_dq2_perf_fn_rq_matches_prefilter cut the full-catalog
-- checker scan from ~15.4 s to ~1.4 s, but the list query still took ~2.4 s: the planner pulls up
-- the view's lateral subquery, so the `qi.issues` column is replaced by the function call itself
-- and admin_recipe_quality_issues(r.id) runs once per reference — quality_issues,
-- critical_issue_count and warning_issue_count (issue_count reuses the two counts).
--
-- Fix: `offset 0` on the innermost subquery is PostgreSQL's optimization fence. The subquery is no
-- longer pulled up, it is evaluated once per recipe row and the three columns read its output.
--
-- Nothing else changes: same columns in the same order, same expressions, security_invoker,
-- comment and grants (re-stated below so the migration is self-contained and re-runnable).

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
  from (select coalesce(public.admin_recipe_quality_issues(r.id), '[]'::jsonb) as issues offset 0) qi
) q
where r.status = 'published' and r.visibility = 'public';

comment on view public.admin_recipe_quality_overview is
  'T10 + DQ-2. Read-only data-quality overview of the published/public catalog: T10''s '
  'completeness columns plus DQ-2''s consistency issues (quality_issues, critical/warning counts; '
  'issue_count = kritik + uyari, bilgi not counted). security_invoker; service_role-only SELECT.';

revoke all on public.admin_recipe_quality_overview from public, anon, authenticated;
grant select on public.admin_recipe_quality_overview to service_role;
