-- DQ-2 perf — assertions for 20260925080306_dq2_perf_fn_rq_matches_prefilter.sql and
-- 20260925083452_dq2_perf_overview_single_eval.sql. Runs after 01_assertions.sql on the same DB.
--
--   1. fn_rq_matches pre-check: the "root not in text -> false" short-circuit must not change a
--      single answer (softening, excludes and prefix mode are the three ways a naive root check
--      could wrongly return false).
--   2. admin_recipe_quality_overview calls admin_recipe_quality_issues exactly once per row
--      (counted with track_functions while the view runs under EXPLAIN ANALYZE).
--   3. Performance regression: a full view scan over 150 synthetic recipes stays well below the
--      8 s statement_timeout.
--
-- Everything this file inserts is rolled back.

\set ON_ERROR_STOP on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------------------
-- 1. fn_rq_matches pre-check
-- -------------------------------------------------------------------------------------------------
select pg_temp.assert(not public.fn_rq_matches(' domates biber soğan ', 'peynir'),
  'pre-check: keyword root absent from text -> false');
select pg_temp.assert(not public.fn_rq_matches(' domates biber soğan ', 'kaynat', '{}', true),
  'pre-check: keyword root absent from text (prefix mode) -> false');
select pg_temp.assert(public.fn_rq_matches(' haşlanmış tavuğu didikleyin ', 'tavuk'),
  'pre-check: softening (tavuk -> tavuğu) still matches');
select pg_temp.assert(public.fn_rq_matches(' bayat ekmeği ', 'ekmek'),
  'pre-check: softening (ekmek -> ekmeği) still matches');
select pg_temp.assert(not public.fn_rq_matches(' şekersiz badem sütü ', 'süt', array['badem sütü']),
  'pre-check: match removed by exclude (badem sütü) -> false');
select pg_temp.assert(public.fn_rq_matches(' badem sütü ve süt ', 'süt', array['badem sütü']),
  'pre-check: exclude removes only the excluded phrase');
select pg_temp.assert(public.fn_rq_matches(' suyu kaynatın ', 'kaynat', '{}', true),
  'pre-check: prefix mode (kaynat -> kaynatın) -> true');
select pg_temp.assert(not public.fn_rq_matches(' karabiber ', 'biber'),
  'pre-check: root present only mid-word -> false');
select pg_temp.assert(not public.fn_rq_matches(null, 'un'), 'pre-check: null text -> false');

-- -------------------------------------------------------------------------------------------------
-- View definition unchanged apart from the fence
-- -------------------------------------------------------------------------------------------------
select pg_temp.assert(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.admin_recipe_quality_overview'::regclass),
  'view keeps security_invoker');
select pg_temp.assert(
  obj_description('public.admin_recipe_quality_overview'::regclass, 'pg_class') like 'T10 + DQ-2. Read-only data-quality overview%',
  'view keeps its comment');
select pg_temp.assert(
  pg_get_viewdef('public.admin_recipe_quality_overview'::regclass) ~* 'as issues\s+offset 0',
  'view: issues subquery is fenced with offset 0');

-- -------------------------------------------------------------------------------------------------
-- 150 synthetic published recipes (realistic size: 10 ingredients, 7 steps, mixed diet tags,
-- allergens and equipment so every rule family runs)
-- -------------------------------------------------------------------------------------------------
begin;

create temp table perf_ing(n int, crop text, free_text_name text, quantity numeric, unit text, note text) on commit drop;
insert into perf_ing values
  (0, 'domates', null, 4, 'adet', null),
  (1, 'soğan', null, 1, 'adet', 'ince doğranmış'),
  (2, 'sarımsak', null, 2, 'diş', null),
  (3, null, 'zeytinyağı', 3, 'yemek kaşığı', null),
  (4, null, 'tuz', 1, 'çay kaşığı', null),
  (5, 'patlıcan', null, 2, 'adet', null),
  (6, null, 'beyaz peynir', 150, 'g', null),
  (7, null, 'un', 2, 'su bardağı', null),
  (8, null, 'tereyağı', 50, 'g', 'eritilmiş'),
  (9, null, 'tavuk göğsü', 400, 'g', null),
  (10, 'maydanoz', null, 1, 'demet', null),
  (11, null, 'tahin', 2, 'yemek kaşığı', null),
  (12, 'limon', null, 1, 'adet', 'suyu sıkılmış'),
  (13, null, 'yoğurt', 1, 'su bardağı', null),
  (14, 'havuç', null, 2, 'adet', null),
  (15, null, 'bulgur', 1, 'su bardağı', null),
  (16, null, 'ceviz içi', 50, 'g', null),
  (17, 'biber', null, 2, 'adet', null),
  (18, null, 'yumurta', 2, 'adet', null),
  (19, null, 'badem sütü', 1, 'su bardağı', null),
  (20, 'nohut', null, 200, 'g', null),
  (21, null, 'kırmızı mercimek', 1, 'su bardağı', null),
  (22, null, 'toz şeker', 2, 'yemek kaşığı', null),
  (23, null, 'yulaf ezmesi', 1, 'su bardağı', null),
  (24, null, 'pul biber', 1, 'çay kaşığı', null),
  (25, 'kabak', null, 2, 'adet', null),
  (26, null, 'galeta unu', 3, 'yemek kaşığı', null),
  (27, null, 'bal', 1, 'yemek kaşığı', null),
  (28, null, 'fındık', 30, 'g', null),
  (29, null, 'karabiber', 1, 'tutam', null);

create temp table perf_step(n int, instruction text) on commit drop;
insert into perf_step values
  (0, 'Sebzeleri yıkayıp küçük küpler halinde doğrayın.'),
  (1, 'Tavada zeytinyağını ısıtın ve soğanları pembeleşene kadar kavurun.'),
  (2, 'Tencereye suyu alıp kaynatın, ardından bulguru ekleyin.'),
  (3, 'Fırını 180 dereceye ısıtın ve tepsiyi yağlayın.'),
  (4, 'Tavuğu haşlayıp didikleyin, suyunu ayırın.'),
  (5, 'Tüm malzemeyi blenderdan geçirip pürüzsüz bir kıvam elde edin.'),
  (6, 'Karışımı fırında 25 dakika pişirin.'),
  (7, 'Izgarada her iki yüzünü de beşer dakika pişirin.'),
  (8, 'Cevizleri tavada hafifçe kavurun ve soğumaya bırakın.'),
  (9, 'Yoğurdu sarımsakla çırpıp üzerine gezdirin.'),
  (10, 'Ocağın altını kısıp 15 dakika demlenmeye bırakın.'),
  (11, 'Limon suyu ve tuzla tatlandırıp servis edin.');

insert into public.recipes (id, slug, title, servings, prep_minutes, cook_minutes, rest_minutes, status, visibility,
                            diet_tags, allergen_labels, required_equipment, calories, cover_photo_url,
                            nutrition_source, nutrition_coverage_pct, allergens_reviewed, allergens_reviewed_at)
select
  ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid,
  'dq2-perf-' || g,
  'Performans Tarifi ' || g,
  1 + g % 6,
  10 + g % 20,
  15 + g % 45,
  0,
  'published', 'public',
  case g % 5 when 0 then array['vegan', 'vejetaryen'] when 1 then array['glutensiz'] when 2 then array['vejetaryen'] else array[]::text[] end,
  case g % 4 when 0 then array['sut', 'gluten'] when 1 then array['susam'] when 2 then array[]::text[] else null end,
  case g % 4 when 0 then array['ocak'] when 1 then array['firin', 'ocak'] when 2 then array['izgara'] else array['blender', 'ocak'] end,
  200 + (g * 37) % 900,
  'https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/dq2-perf-' || g
    || case when g % 7 = 0 then '-1x1.webp' else '-16x9.webp' end,
  'computed', 100, true, now()
from generate_series(1, 150) g;

insert into public.recipe_ingredients (recipe_id, sort_order, crop, free_text_name, quantity, unit, note)
select ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, k, i.crop, i.free_text_name, i.quantity, i.unit, i.note
from generate_series(1, 150) g
cross join generate_series(0, 9) k
join perf_ing i on i.n = (g * 7 + k * 3) % 30;

insert into public.recipe_steps (recipe_id, step_no, instruction, timer_seconds)
select ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, k + 1, s.instruction,
       case when k % 3 = 0 then 600 end
from generate_series(1, 150) g
cross join generate_series(0, 6) k
join perf_step s on s.n = (g * 5 + k) % 12;

analyze public.recipes;
analyze public.recipe_ingredients;
analyze public.recipe_steps;

-- -------------------------------------------------------------------------------------------------
-- 2. admin_recipe_quality_issues runs once per view row (EXPLAIN ANALYZE + function call counter)
-- -------------------------------------------------------------------------------------------------
set local track_functions = 'all';

do $$
declare
  v_plan json;
  v_rows bigint;
  v_calls bigint;
begin
  execute 'explain (analyze, verbose, format json) select * from public.admin_recipe_quality_overview'
    into v_plan;
  v_rows := (v_plan->0->'Plan'->>'Actual Rows')::bigint;
  select calls into v_calls
  from pg_stat_xact_user_functions
  where schemaname = 'public' and funcname = 'admin_recipe_quality_issues';
  perform pg_temp.assert(v_rows = 152, format('EXPLAIN ANALYZE returns 150 synthetic + 2 suite rows, got %s', v_rows));
  perform pg_temp.assert(v_calls = v_rows,
    format('admin_recipe_quality_issues calls (%s) = view rows (%s)', v_calls, v_rows));
  raise notice 'DQ-2 perf: EXPLAIN ANALYZE rows=%, admin_recipe_quality_issues calls=%', v_rows, v_calls;
end;
$$;

-- Sanity: the synthetic catalog actually exercises the checker (not 150 clean rows).
select pg_temp.assert(
  (select count(*) filter (where critical_issue_count > 0) > 0
      and count(*) filter (where warning_issue_count > 0) > 0
      and sum(jsonb_array_length(quality_issues)) > 150
   from public.admin_recipe_quality_overview where slug like 'dq2-perf-%'),
  'synthetic recipes produce kritik and uyari issues');

-- -------------------------------------------------------------------------------------------------
-- 3. Full view scan over 150 synthetic recipes: well under the 8 s statement_timeout
-- -------------------------------------------------------------------------------------------------
do $$
declare
  v_threshold interval := interval '3 seconds';
  v_best interval;
  v_t0 timestamptz;
  v_elapsed interval;
  v_rows bigint;
  v_digest text;
begin
  -- Warm-up pass (plan + reference tables in cache), then the best of 3 timed passes. Every
  -- column is materialized (whole-row cast), exactly like the edge function's list select.
  perform count(*) from public.admin_recipe_quality_overview v where v::text is not null;
  for i in 1..3 loop
    v_t0 := clock_timestamp();
    select count(*), md5(string_agg(v::text, '|' order by v.id))
      into v_rows, v_digest
    from public.admin_recipe_quality_overview v;
    v_elapsed := clock_timestamp() - v_t0;
    v_best := least(coalesce(v_best, v_elapsed), v_elapsed);
  end loop;
  raise notice 'DQ-2 perf: full view scan, % rows, best of 3 = % ms (threshold % ms)',
    v_rows, round(extract(epoch from v_best) * 1000), round(extract(epoch from v_threshold) * 1000);
  perform pg_temp.assert(v_best < v_threshold,
    format('full view scan over %s rows took %s, must be < %s', v_rows, v_best, v_threshold));
end;
$$;

rollback;

\o
\echo 'DQ-2 perf assertions: all passed'
