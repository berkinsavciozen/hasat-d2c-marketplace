-- DQ-2 — SQL test fixtures for 20260924120000_dq2_recipe_quality_issues.sql.
--
-- Self-contained: the tables below are reduced copies of the LIVE shapes captured in
-- 20260917120000_baseline_consolidated_schema_2026-09-17.sql (recipes, recipe_ingredients,
-- recipe_steps, recipe_drafts, crop_config, ingredient_measure_reference, the two
-- fn_nutrition_normalize_* helpers) plus a `storage.objects` stub. Only the columns/constraints
-- DQ-2 and the T10 migration it replaces objects from actually touch are reproduced.
--
-- crop_config (70 crop slugs), ingredient_measure_reference (104 rows), ingredient_nutrition_alias
-- (95 rows) and crop_culinary_meta (70 rows) are a read-only snapshot of the live tables
-- (2026-09-24), and fn_recipe_ingredient_grams_v2 is its live definition verbatim, so
-- CROP_UNLINKED/UNIT_UNKNOWN resolve exactly as calculate_recipe_nutrition does live.
--
-- Run via supabase/tests/dq2_recipe_quality_issues/run.sh — never against a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Stand-in for the live T3-A validator (only referenced by T10's admin_update_recipe_allergens).
create or replace function public.is_valid_recipe_allergen_labels(labels text[])
returns boolean
language sql
immutable
set search_path = ''
as $$ select true $$;

create table public.crop_config (
  crop text primary key,
  display_name text not null,
  default_unit text not null default 'kg'
);

insert into public.crop_config (crop, display_name) values
  ('adaçayı', 'adaçayı'),
  ('anason', 'anason'),
  ('antep_fıstığı', 'antep_fıstığı'),
  ('armut', 'armut'),
  ('arpa', 'arpa'),
  ('ayçiçeği', 'ayçiçeği'),
  ('ayva', 'ayva'),
  ('badem', 'badem'),
  ('bakla', 'bakla'),
  ('biber', 'biber'),
  ('buğday', 'buğday'),
  ('çavdar', 'çavdar'),
  ('çeltik', 'çeltik'),
  ('ceviz', 'ceviz'),
  ('çilek', 'çilek'),
  ('defne', 'defne'),
  ('domates', 'domates'),
  ('elma', 'elma'),
  ('erik', 'erik'),
  ('fındık', 'fındık'),
  ('greyfurt', 'greyfurt'),
  ('gül', 'gül'),
  ('havuç', 'havuç'),
  ('incir', 'incir'),
  ('ıhlamur', 'ıhlamur'),
  ('ıspanak', 'ıspanak'),
  ('kabak', 'kabak'),
  ('kanola', 'kanola'),
  ('karpuz', 'karpuz'),
  ('kavun', 'kavun'),
  ('kayısı', 'kayısı'),
  ('kekik', 'kekik'),
  ('kimyon', 'kimyon'),
  ('kiraz', 'kiraz'),
  ('kuru_fasulye', 'kuru_fasulye'),
  ('lahana', 'lahana'),
  ('lavanta', 'lavanta'),
  ('limon', 'limon'),
  ('mandalina', 'mandalina'),
  ('marul', 'marul'),
  ('mercimek', 'mercimek'),
  ('mısır', 'mısır'),
  ('muz', 'muz'),
  ('nane', 'nane'),
  ('nar', 'nar'),
  ('nohut', 'nohut'),
  ('pamuk', 'pamuk'),
  ('papatya', 'papatya'),
  ('patates', 'patates'),
  ('patlıcan', 'patlıcan'),
  ('portakal', 'portakal'),
  ('pul_biber', 'pul_biber'),
  ('rezene', 'rezene'),
  ('safran', 'safran'),
  ('safran_soğanı', 'safran_soğanı'),
  ('salatalık', 'salatalık'),
  ('sarımsak', 'sarımsak'),
  ('şeftali', 'şeftali'),
  ('şeker_pancarı', 'şeker_pancarı'),
  ('soğan', 'soğan'),
  ('sumak', 'sumak'),
  ('susam', 'susam'),
  ('tıbbi bitkiler', 'tıbbi bitkiler'),
  ('tütün', 'tütün'),
  ('üzüm', 'üzüm'),
  ('vişne', 'vişne'),
  ('yerfıstığı', 'yerfıstığı'),
  ('yulaf', 'yulaf'),
  ('zeytin', 'zeytin'),
  ('zeytinyağı', 'zeytinyağı');

create table public.ingredient_measure_reference (
  target_kind text not null,
  target_key text not null,
  normalized_unit text not null,
  grams_per_unit numeric not null,
  reference_source text not null,
  reference_source_id text not null,
  reference_version text not null,
  reference_url text not null,
  notes text,
  created_at timestamptz not null default now()
);

insert into public.ingredient_measure_reference
  (target_kind, target_key, normalized_unit, grams_per_unit, reference_source, reference_source_id, reference_version, reference_url, notes)
values
  ('crop', 'anason', 'tatlı kaşığı', 4.2, 'live snapshot', '-', '-', '-', null),
  ('crop', 'ayva', 'adet', 200, 'live snapshot', '-', '-', '-', null),
  ('crop', 'patates', 'adet', 300, 'live snapshot', '-', '-', '-', null),
  ('crop', 'ceviz', 'yemek kaşığı', 7, 'live snapshot', '-', '-', '-', null),
  ('crop', 'yulaf', 'su bardağı', 80, 'live snapshot', '-', '-', '-', null),
  ('crop', 'havuç', 'adet', 61, 'live snapshot', '-', '-', '-', null),
  ('crop', 'havuç', 'orta boy', 61, 'live snapshot', '-', '-', '-', null),
  ('crop', 'soğan', 'adet', 110, 'live snapshot', '-', '-', '-', null),
  ('crop', 'sarımsak', 'diş', 3, 'live snapshot', '-', '-', '-', null),
  ('crop', 'nane', 'avuç', 6, 'live snapshot', '-', '-', '-', null),
  ('food', 'salep_powder', 'yemek kaşığı', 8, 'live snapshot', '-', '-', '-', null),
  ('food', 'chicken_drumstick_skin_raw', 'adet', 95, 'live snapshot', '-', '-', '-', null),
  ('food', 'honey_flower', 'tatlı kaşığı', 14, 'live snapshot', '-', '-', '-', null),
  ('food', 'honey_flower', 'yemek kaşığı', 21, 'live snapshot', '-', '-', '-', null),
  ('food', 'table_salt', 'tatlı kaşığı', 12, 'live snapshot', '-', '-', '-', null),
  ('food', 'table_salt', 'çay kaşığı', 6, 'live snapshot', '-', '-', '-', null),
  ('food', 'table_salt', 'tutam', 0.36, 'live snapshot', '-', '-', '-', null),
  ('food', 'black_pepper', 'çay kaşığı', 2.3, 'live snapshot', '-', '-', '-', null),
  ('food', 'paprika', 'çay kaşığı', 2.3, 'live snapshot', '-', '-', '-', null),
  ('food', 'butter_salted', 'yemek kaşığı', 14.2, 'live snapshot', '-', '-', '-', null),
  ('food', 'white_pepper', 'çay kaşığı', 2.4, 'live snapshot', '-', '-', '-', null),
  ('food', 'almond_raw', 'yemek kaşığı', 6, 'live snapshot', '-', '-', '-', null),
  ('food', 'red_pepper_paste', 'yemek kaşığı', 18, 'live snapshot', '-', '-', '-', null),
  ('food', 'pomegranate_molasses', 'yemek kaşığı', 20, 'live snapshot', '-', '-', '-', null),
  ('food', 'breadcrumbs_dry', 'yemek kaşığı', 7.5, 'live snapshot', '-', '-', '-', null),
  ('food', 'rocket_raw', 'demet', 100, 'live snapshot', '-', '-', '-', null),
  ('food', 'granulated_sugar', 'bardak', 200, 'live snapshot', '-', '-', '-', null),
  ('food', 'powdered_sugar', 'yemek kaşığı', 8, 'live snapshot', '-', '-', '-', null),
  ('food', 'baking_powder', 'çay kaşığı', 4, 'live snapshot', '-', '-', '-', null),
  ('food', 'baking_powder', 'paket', 10, 'live snapshot', '-', '-', '-', null),
  ('food', 'vanilla_extract', 'çay kaşığı', 4.2, 'live snapshot', '-', '-', '-', null),
  ('food', 'water', 'bardak', 200, 'live snapshot', '-', '-', '-', null),
  ('food', 'water', 'su bardağı', 200, 'live snapshot', '-', '-', '-', null),
  ('food', 'water', 'küçük parça', 15, 'live snapshot', '-', '-', '-', null),
  ('food', 'cinnamon_ground', 'çay kaşığı', 2.6, 'live snapshot', '-', '-', '-', null),
  ('food', 'lemon_juice_raw', 'tatlı kaşığı', 10, 'live snapshot', '-', '-', '-', null),
  ('food', 'lemon_juice_raw', 'yemek kaşığı', 15, 'live snapshot', '-', '-', '-', null),
  ('food', 'avocado_raw', 'adet', 201, 'live snapshot', '-', '-', '-', null),
  ('food', 'cucumber_raw', 'adet', 300, 'live snapshot', '-', '-', '-', null),
  ('food', 'rosemary_fresh', 'dal', 2, 'live snapshot', '-', '-', '-', null),
  ('food', 'yogurt_full_fat', 'su bardağı', 200, 'live snapshot', '-', '-', '-', null),
  ('food', 'egg_whole_raw', 'adet', 50, 'live snapshot', '-', '-', '-', null),
  ('food', 'zucchini_raw', 'orta boy', 196, 'live snapshot', '-', '-', '-', null),
  ('food', 'zucchini_raw', 'adet', 196, 'live snapshot', '-', '-', '-', null),
  ('food', 'rice_white_longgrain_raw', 'su bardağı', 180, 'live snapshot', '-', '-', '-', null),
  ('food', 'rice_white_longgrain_raw', 'bardak', 180, 'live snapshot', '-', '-', '-', null),
  ('food', 'bulgur_dry', 'su bardağı', 170, 'live snapshot', '-', '-', '-', null),
  ('food', 'bulgur_dry', 'bardak', 170, 'live snapshot', '-', '-', '-', null),
  ('food', 'black_pepper', 'tatlı kaşığı', 4.6, 'live snapshot', '-', '-', '-', null),
  ('food', 'granulated_sugar', 'tatlı kaşığı', 8, 'live snapshot', '-', '-', '-', null),
  ('food', 'granulated_sugar', 'yemek kaşığı', 12.5, 'live snapshot', '-', '-', '-', null),
  ('food', 'lemon_juice_raw', 'adet', 48, 'live snapshot', '-', '-', '-', null),
  ('food', 'scallion_raw', 'dal', 15, 'live snapshot', '-', '-', '-', null),
  ('food', 'parsley_raw', 'demet', 50, 'live snapshot', '-', '-', '-', null),
  ('food', 'maple_syrup', 'yemek kaşığı', 20, 'live snapshot', '-', '-', '-', null),
  ('food', 'coconut_oil', 'yemek kaşığı', 13.6, 'live snapshot', '-', '-', '-', null),
  ('food', 'cocoa_powder_unsweetened', 'yemek kaşığı', 5.4, 'live snapshot', '-', '-', '-', null),
  ('food', 'green_peas_raw', 'su bardağı', 145, 'live snapshot', '-', '-', '-', null),
  ('food', 'chili_flakes_red', 'tatlı kaşığı', 3, 'live snapshot', '-', '-', '-', null),
  ('food', 'tomato_paste', 'yemek kaşığı', 16, 'live snapshot', '-', '-', '-', null),
  ('food', 'rocket_raw', 'avuc', 20, 'live snapshot', '-', '-', '-', null),
  ('food', 'wheat_flour_ap', 'bardak', 130, 'live snapshot', '-', '-', '-', null),
  ('crop', 'ceviz', 'cay bardagi', 35, 'live snapshot', '-', '-', '-', null),
  ('crop', 'nane', 'demet', 30, 'live snapshot', '-', '-', '-', null),
  ('crop', 'kekik', 'tatlı kaşığı', 2, 'live snapshot', '-', '-', '-', null),
  ('crop', 'sumak', 'yemek kaşığı', 8, 'live snapshot', '-', '-', '-', null),
  ('food', 'granulated_sugar', 'su bardağı', 200, 'live snapshot', '-', '-', '-', null),
  ('crop', 'ceviz', 'su bardağı', 100, 'live snapshot', '-', '-', '-', null),
  ('food', 'cinnamon_ground', 'adet', 2.6, 'live snapshot', '-', '-', '-', null),
  ('food', 'clove_whole', 'adet', 0.15, 'live snapshot', '-', '-', '-', null),
  ('food', 'brown_sugar', 'yemek kaşığı', 13, 'live snapshot', '-', '-', '-', null),
  ('food', 'sage_fresh', 'adet', 0.4, 'live snapshot', '-', '-', '-', null),
  ('food', 'tahini', 'yemek kaşığı', 15, 'live snapshot', '-', '-', '-', null),
  ('crop', 'nane', 'yemek kaşığı', 3, 'live snapshot', '-', '-', '-', null),
  ('crop', 'limon', 'adet', 58, 'live snapshot', '-', '-', '-', null),
  ('crop', 'limon', 'yemek kaşığı', 15, 'live snapshot', '-', '-', '-', null),
  ('crop', 'pul_biber', 'yemek kaşığı', 5.5, 'live snapshot', '-', '-', '-', null),
  ('crop', 'greyfurt', 'adet', 250, 'live snapshot', '-', '-', '-', null),
  ('food', 'muz', 'adet', 150, 'live snapshot', '-', '-', '-', null),
  ('food', 'badem ezmesi', 'tatlı kaşığı', 6, 'live snapshot', '-', '-', '-', null),
  ('crop', 'fındık', 'su bardağı', 120, 'live snapshot', '-', '-', '-', null),
  ('food', 'tavuk suyu', 'su bardağı', 200, 'live snapshot', '-', '-', '-', null),
  ('food', 'taze mikro yeşillik', 'tutam', 5, 'live snapshot', '-', '-', '-', null),
  ('food', 'baking_powder', 'tatlı kaşığı', 8, 'live snapshot', '-', '-', '-', null),
  ('food', 'cornstarch', 'yemek kaşığı', 8, 'live snapshot', '-', '-', '-', null),
  ('food', 'vanillin_sugar', 'tatlı kaşığı', 4, 'live snapshot', '-', '-', '-', null),
  ('food', 'wheat_flour_ap', 'yemek kaşığı', 8, 'live snapshot', '-', '-', '-', null),
  ('food', 'sunflower_oil', 'yemek kaşığı', 14, 'live snapshot', '-', '-', '-', null),
  ('crop', 'mandalina', 'adet', 75, 'live snapshot', '-', '-', '-', null),
  ('crop', 'yulaf', 'yemek kaşığı', 6, 'live snapshot', '-', '-', '-', null),
  ('food', 'yogurt_strained_greek', 'yemek kaşığı', 20, 'live snapshot', '-', '-', '-', null),
  ('crop', 'portakal', 'adet', 130, 'live snapshot', '-', '-', '-', null),
  ('food', 'dates_medjool', 'adet', 24, 'live snapshot', '-', '-', '-', null),
  ('crop', 'zeytinyağı', 'su bardağı', 184, 'live snapshot', '-', '-', '-', null),
  ('food', 'whole_wheat_flour', 'su bardağı', 110, 'live snapshot', '-', '-', '-', null),
  ('food', 'cinnamon_ground', 'tatlı kaşığı', 5, 'live snapshot', '-', '-', '-', null),
  ('food', 'ginger_root_raw', 'yemek kaşığı', 6, 'live snapshot', '-', '-', '-', null),
  ('food', 'cumin_ground', 'çay kaşığı', 2, 'live snapshot', '-', '-', '-', null),
  ('food', 'vegetable_broth', 'su bardağı', 200, 'live snapshot', '-', '-', '-', null),
  ('food', 'vanillin_sugar', 'paket', 5, 'live snapshot', '-', '-', '-', null),
  ('food', 'petit_beurre_biscuit', 'adet', 6, 'live snapshot', '-', '-', '-', null),
  ('food', 'egg_white_raw', 'adet', 33, 'live snapshot', '-', '-', '-', null),
  ('crop', 'ceviz', 'çay bardağı', 35, 'live snapshot', '-', '-', '-', null),
  ('food', 'rocket_raw', 'avuç', 20, 'live snapshot', '-', '-', '-', null);

create table public.ingredient_nutrition_alias (
  normalized_alias text primary key,
  target_kind text not null,
  target_key text not null,
  rationale text not null,
  created_at timestamptz not null default now()
);

insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale) values
  ('süt', 'food', 'whole_milk', 'live snapshot'),
  ('şeker', 'food', 'granulated_sugar', 'live snapshot'),
  ('toz şeker', 'food', 'granulated_sugar', 'live snapshot'),
  ('pudra şekeri', 'food', 'powdered_sugar', 'live snapshot'),
  ('salep', 'food', 'salep_powder', 'live snapshot'),
  ('tavuk baget', 'food', 'chicken_drumstick_skin_raw', 'live snapshot'),
  ('bal', 'food', 'honey_flower', 'live snapshot'),
  ('tuz', 'food', 'table_salt', 'live snapshot'),
  ('karabiber', 'food', 'black_pepper', 'live snapshot'),
  ('toz kırmızı biber', 'food', 'paprika', 'live snapshot'),
  ('tereyağı', 'food', 'butter_salted', 'live snapshot'),
  ('beyaz biber', 'food', 'white_pepper', 'live snapshot'),
  ('file badem', 'food', 'almond_raw', 'live snapshot'),
  ('kırmızı biber salçası', 'food', 'red_pepper_paste', 'live snapshot'),
  ('nar ekşisi', 'food', 'pomegranate_molasses', 'live snapshot'),
  ('galeta unu', 'food', 'breadcrumbs_dry', 'live snapshot'),
  ('roka', 'food', 'rocket_raw', 'live snapshot'),
  ('beyaz peynir', 'food', 'white_cheese_full_fat', 'live snapshot'),
  ('kabartma tozu', 'food', 'baking_powder', 'live snapshot'),
  ('ekşi maya', 'food', 'sourdough_starter_100pct', 'live snapshot'),
  ('su', 'food', 'water', 'live snapshot'),
  ('tarçın', 'food', 'cinnamon_ground', 'live snapshot'),
  ('taze limon suyu', 'food', 'lemon_juice_raw', 'live snapshot'),
  ('buz', 'food', 'water', 'live snapshot'),
  ('avokado', 'food', 'avocado_raw', 'live snapshot'),
  ('salatalık', 'food', 'cucumber_raw', 'live snapshot'),
  ('taze biberiye', 'food', 'rosemary_fresh', 'live snapshot'),
  ('kıyma', 'food', 'beef_ground_80_20_raw', 'live snapshot'),
  ('yoğurt', 'food', 'yogurt_full_fat', 'live snapshot'),
  ('yumurta', 'food', 'egg_whole_raw', 'live snapshot'),
  ('kabak', 'food', 'zucchini_raw', 'live snapshot'),
  ('patates', 'crop', 'patates', 'live snapshot'),
  ('havuc', 'crop', 'havuç', 'live snapshot'),
  ('havuç', 'crop', 'havuç', 'live snapshot'),
  ('sogan', 'crop', 'soğan', 'live snapshot'),
  ('sarimsak', 'crop', 'sarımsak', 'live snapshot'),
  ('zeytinyagi', 'crop', 'zeytinyağı', 'live snapshot'),
  ('zeytinyağı', 'crop', 'zeytinyağı', 'live snapshot'),
  ('taze nane yaprağı', 'crop', 'nane', 'live snapshot'),
  ('taze soğan', 'food', 'scallion_raw', 'live snapshot'),
  ('maydanoz', 'food', 'parsley_raw', 'live snapshot'),
  ('limon suyu', 'food', 'lemon_juice_raw', 'live snapshot'),
  ('un', 'food', 'wheat_flour_ap', 'live snapshot'),
  ('baldo pirinç', 'food', 'rice_white_longgrain_raw', 'live snapshot'),
  ('pirinç', 'food', 'rice_white_longgrain_raw', 'live snapshot'),
  ('sıcak su veya sebze suyu', 'food', 'water', 'live snapshot'),
  ('sıcak su', 'food', 'water', 'live snapshot'),
  ('bezelye (taze veya dondurulmuş)', 'food', 'green_peas_raw', 'live snapshot'),
  ('doğal akçaağaç şurubu', 'food', 'maple_syrup', 'live snapshot'),
  ('hindistan cevizi yağı', 'food', 'coconut_oil', 'live snapshot'),
  ('kakao tozu', 'food', 'cocoa_powder_unsweetened', 'live snapshot'),
  ('kakao', 'food', 'cocoa_powder_unsweetened', 'live snapshot'),
  ('ince bulgur', 'food', 'bulgur_dry', 'live snapshot'),
  ('pul biber', 'food', 'chili_flakes_red', 'live snapshot'),
  ('domates salçası', 'food', 'tomato_paste', 'live snapshot'),
  ('taze nane', 'crop', 'nane', 'live snapshot'),
  ('soğan', 'crop', 'soğan', 'live snapshot'),
  ('sarımsak', 'crop', 'sarımsak', 'live snapshot'),
  ('ceviz içi', 'crop', 'ceviz', 'live snapshot'),
  ('oda sıcaklığında tereyağı', 'food', 'butter_salted', 'live snapshot'),
  ('deniz tuzu', 'food', 'table_salt', 'live snapshot'),
  ('tarçın çubuğu', 'food', 'cinnamon_ground', 'live snapshot'),
  ('süzme yoğurt', 'food', 'yogurt_strained_greek', 'live snapshot'),
  ('kahverengi şeker', 'food', 'brown_sugar', 'live snapshot'),
  ('adaçayı yaprağı', 'food', 'sage_fresh', 'live snapshot'),
  ('karanfil', 'food', 'clove_whole', 'live snapshot'),
  ('tahin', 'food', 'tahini', 'live snapshot'),
  ('taze kekik', 'crop', 'kekik', 'live snapshot'),
  ('muz', 'food', 'muz', 'live snapshot'),
  ('badem ezmesi', 'food', 'badem ezmesi', 'live snapshot'),
  ('tavuk suyu veya su', 'food', 'tavuk suyu', 'live snapshot'),
  ('taze mikro yeşillik', 'food', 'taze mikro yeşillik', 'live snapshot'),
  ('ılık süt', 'food', 'whole_milk', 'live snapshot'),
  ('petibör bisküvi', 'food', 'petit_beurre_biscuit', 'live snapshot'),
  ('mısır nişastası', 'food', 'cornstarch', 'live snapshot'),
  ('vanilin', 'food', 'vanillin_sugar', 'live snapshot'),
  ('kırmızı soğan', 'crop', 'soğan', 'live snapshot'),
  ('taze kekik yaprağı', 'crop', 'kekik', 'live snapshot'),
  ('kavrulmuş badem', 'food', 'almond_raw', 'live snapshot'),
  ('rendelenmiş kaşar peyniri', 'food', 'kasar_cheese', 'live snapshot'),
  ('sıvı yağ', 'food', 'sunflower_oil', 'live snapshot'),
  ('yulaf ezmesi', 'crop', 'yulaf', 'live snapshot'),
  ('çekirdeksiz hurma', 'food', 'dates_medjool', 'live snapshot'),
  ('tam buğday unu', 'food', 'whole_wheat_flour', 'live snapshot'),
  ('tavuk göğsü fileto', 'food', 'chicken_breast_skinless_raw', 'live snapshot'),
  ('karışık mevsim yeşillikleri', 'food', 'mixed_salad_greens', 'live snapshot'),
  ('badem', 'food', 'almond_raw', 'live snapshot'),
  ('kök kereviz', 'food', 'celeriac_raw', 'live snapshot'),
  ('zencefil', 'food', 'ginger_root_raw', 'live snapshot'),
  ('sebze suyu', 'food', 'vegetable_broth', 'live snapshot'),
  ('kimyon', 'food', 'cumin_ground', 'live snapshot'),
  ('sebze suyu veya su', 'food', 'vegetable_broth', 'live snapshot'),
  ('dondurulmuş beyaz çikolata', 'food', 'white_chocolate', 'live snapshot'),
  ('yumurta akı', 'food', 'egg_white_raw', 'live snapshot'),
  ('kara biber', 'food', 'black_pepper', 'live snapshot');

create table public.crop_culinary_meta (
  crop text primary key references public.crop_config(crop),
  is_edible boolean not null default true,
  culinary_aliases text[] not null default '{}',
  conversion_hints jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.crop_culinary_meta (crop, culinary_aliases, conversion_hints) values
  ('tıbbi bitkiler', '{}'::text[], '{}'::jsonb),
  ('zeytin', '{}'::text[], '{}'::jsonb),
  ('arpa', '{}'::text[], '{}'::jsonb),
  ('mısır', '{}'::text[], '{}'::jsonb),
  ('çeltik', '{}'::text[], '{}'::jsonb),
  ('yulaf', '{}'::text[], '{}'::jsonb),
  ('çavdar', '{}'::text[], '{}'::jsonb),
  ('kuru_fasulye', '{}'::text[], '{}'::jsonb),
  ('bakla', '{}'::text[], '{}'::jsonb),
  ('ayçiçeği', '{}'::text[], '{}'::jsonb),
  ('susam', '{}'::text[], '{}'::jsonb),
  ('kanola', '{}'::text[], '{}'::jsonb),
  ('yerfıstığı', '{}'::text[], '{}'::jsonb),
  ('tütün', '{}'::text[], '{}'::jsonb),
  ('şeker_pancarı', '{}'::text[], '{}'::jsonb),
  ('soğan', '{}'::text[], '{}'::jsonb),
  ('sarımsak', '{}'::text[], '{}'::jsonb),
  ('salatalık', '{}'::text[], '{}'::jsonb),
  ('kabak', '{}'::text[], '{}'::jsonb),
  ('havuç', '{}'::text[], '{}'::jsonb),
  ('lahana', '{}'::text[], '{}'::jsonb),
  ('ıspanak', '{}'::text[], '{}'::jsonb),
  ('marul', '{}'::text[], '{}'::jsonb),
  ('kavun', '{}'::text[], '{}'::jsonb),
  ('karpuz', '{}'::text[], '{}'::jsonb),
  ('armut', '{}'::text[], '{}'::jsonb),
  ('kayısı', '{}'::text[], '{}'::jsonb),
  ('şeftali', '{}'::text[], '{}'::jsonb),
  ('kiraz', '{}'::text[], '{}'::jsonb),
  ('vişne', '{}'::text[], '{}'::jsonb),
  ('erik', '{}'::text[], '{}'::jsonb),
  ('nar', '{}'::text[], '{}'::jsonb),
  ('muz', '{}'::text[], '{}'::jsonb),
  ('portakal', '{}'::text[], '{}'::jsonb),
  ('mandalina', '{}'::text[], '{}'::jsonb),
  ('limon', '{}'::text[], '{}'::jsonb),
  ('greyfurt', '{}'::text[], '{}'::jsonb),
  ('antep_fıstığı', '{}'::text[], '{}'::jsonb),
  ('badem', '{}'::text[], '{}'::jsonb),
  ('çilek', '{}'::text[], '{}'::jsonb),
  ('ayva', '{}'::text[], '{}'::jsonb),
  ('nane', '{}'::text[], '{}'::jsonb),
  ('adaçayı', '{}'::text[], '{}'::jsonb),
  ('kimyon', '{}'::text[], '{}'::jsonb),
  ('anason', '{}'::text[], '{}'::jsonb),
  ('rezene', '{}'::text[], '{}'::jsonb),
  ('defne', '{}'::text[], '{}'::jsonb),
  ('papatya', '{}'::text[], '{}'::jsonb),
  ('ıhlamur', '{}'::text[], '{}'::jsonb),
  ('pul_biber', '{}'::text[], '{}'::jsonb),
  ('sumak', '{}'::text[], '{}'::jsonb),
  ('lavanta', '{}'::text[], '{}'::jsonb),
  ('gül', '{}'::text[], '{}'::jsonb),
  ('patates', '{}'::text[], '{}'::jsonb),
  ('safran_soğanı', '{}'::text[], '{}'::jsonb),
  ('pamuk', '{}'::text[], '{}'::jsonb),
  ('zeytinyağı', '{"zeytinyağı","zeytin yağı","sızma zeytinyağı","natürel sızma zeytinyağı","olive oil"}'::text[], '{"bardak": 200, "yemek kaşığı": 15}'::jsonb),
  ('nohut', '{"nohut","kuru nohut","haşlanmış nohut","chickpea"}'::text[], '{"bardak": 200}'::jsonb),
  ('mercimek', '{"mercimek","kırmızı mercimek","yeşil mercimek","lentil"}'::text[], '{"bardak": 200}'::jsonb),
  ('kekik', '{"kekik","kuru kekik","taze kekik","izmir kekiği","thyme"}'::text[], '{"dal": 1.5, "demet": 25, "tutam": 0.4, "çay kaşığı": 1, "yemek kaşığı": 3}'::jsonb),
  ('fındık', '{"fındık","iç fındık","kavrulmuş fındık","hazelnut"}'::text[], '{"bardak": 130, "yemek kaşığı": 8}'::jsonb),
  ('ceviz', '{"ceviz","ceviz içi","iç ceviz","walnut"}'::text[], '{"adet": 5, "bardak": 100}'::jsonb),
  ('buğday', '{"buğday","buğday tanesi","kaynatılmış buğday","tam buğday","wheat berry"}'::text[], '{"bardak": 200}'::jsonb),
  ('domates', '{"domates","tomates","kırmızı domates","salçalık domates","cherry domates"}'::text[], '{"adet": 120, "bardak": 180, "çay kaşığı": 5, "yemek kaşığı": 15}'::jsonb),
  ('biber', '{"biber","çarliston biber","sivri biber","dolmalık biber","kırmızı biber","yeşil biber","pepper"}'::text[], '{"adet": 100}'::jsonb),
  ('patlıcan', '{"patlıcan","kemer patlıcan","aydın patlıcanı","eggplant","aubergine"}'::text[], '{"adet": 250}'::jsonb),
  ('üzüm', '{"üzüm","taze üzüm","kuru üzüm","çekirdeksiz üzüm","sultani üzüm","grape","raisin"}'::text[], '{"bardak": 90, "salkım": 500}'::jsonb),
  ('incir', '{"incir","taze incir","siyah incir","bursa siyahı incir","fig"}'::text[], '{"adet": 50}'::jsonb),
  ('elma', '{"elma","amasya elması","starking elma","golden elma","apple"}'::text[], '{"adet": 150}'::jsonb),
  ('safran', '{"safran","safran ipliği","saffron"}'::text[], '{"tutam": 0.1}'::jsonb);

-- Verbatim from the baseline snapshot.
CREATE OR REPLACE FUNCTION public.fn_nutrition_normalize_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(regexp_replace(replace(lower(btrim(coalesce(p_value, ''))), '_', ' '), '\s+', ' ', 'g'), '')
$function$;

CREATE OR REPLACE FUNCTION public.fn_nutrition_normalize_unit(p_unit text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case public.fn_nutrition_normalize_text(p_unit)
    when 'cay kasigi' then 'çay kaşığı'
    when 'çay kasigi' then 'çay kaşığı'
    when 'cay kaşığı' then 'çay kaşığı'
    when 'tatli kasigi' then 'tatlı kaşığı'
    when 'tatlı kasigi' then 'tatlı kaşığı'
    when 'yemek kasigi' then 'yemek kaşığı'
    when 'su bardagi' then 'su bardağı'
    when 'dis' then 'diş'
    else public.fn_nutrition_normalize_text(p_unit)
  end
$function$;

-- Live definition, verbatim (pg_get_functiondef, 2026-09-24).
CREATE OR REPLACE FUNCTION public.fn_recipe_ingredient_grams_v2(p_crop text, p_food_key text, p_free_text_name text, p_quantity numeric, p_unit text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_unit text := public.fn_nutrition_normalize_unit(p_unit);
  v_alias record;
  v_kind text;
  v_key text;
  v_hint numeric;
begin
  if p_quantity is null or v_unit is null then return null; end if;

  case v_unit
    when 'g' then return p_quantity;
    when 'gr' then return p_quantity;
    when 'gram' then return p_quantity;
    when 'kg' then return p_quantity * 1000;
    when 'ml' then return p_quantity;
    when 'l' then return p_quantity * 1000;
    when 'lt' then return p_quantity * 1000;
    when 'litre' then return p_quantity * 1000;
    else null;
  end case;

  if p_food_key is not null then
    v_kind := 'food'; v_key := p_food_key;
  elsif p_crop is not null then
    v_kind := 'crop'; v_key := p_crop;
  else
    select a.target_kind, a.target_key into v_alias
    from public.ingredient_nutrition_alias a
    where a.normalized_alias = public.fn_nutrition_normalize_text(p_free_text_name);
    v_kind := v_alias.target_kind; v_key := v_alias.target_key;
  end if;

  select m.grams_per_unit into v_hint
  from public.ingredient_measure_reference m
  where m.target_kind = v_kind and m.target_key = v_key and m.normalized_unit = v_unit;
  if v_hint is not null then return p_quantity * v_hint; end if;

  if v_kind = 'crop' then
    select case when jsonb_typeof(c.conversion_hints -> v_unit) = 'number'
                then (c.conversion_hints ->> v_unit)::numeric end
      into v_hint from public.crop_culinary_meta c where c.crop = v_key;
    if v_hint is not null then return p_quantity * v_hint; end if;
  end if;
  return null;
end $function$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  cover_photo_url text,
  servings integer check (servings is null or servings > 0),
  prep_minutes integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes integer check (cook_minutes is null or cook_minutes >= 0),
  rest_minutes integer,
  diet_tags text[] not null default '{}',
  status text not null default 'draft',
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  allergen_labels text[],
  required_equipment text[],
  calories numeric,
  nutrition_source text,
  nutrition_coverage_pct numeric(5,2),
  nutrition_reference_version text,
  allergens_reviewed boolean not null default false,
  allergens_reviewed_at timestamptz
);

create trigger trg_recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  crop text,
  free_text_name text,
  quantity numeric check (quantity is null or quantity > 0),
  unit text,
  note text,
  is_key_ingredient boolean not null default false,
  created_at timestamptz not null default now(),
  ingredient_class text check (ingredient_class = any (array['tarimsal', 'platform_disi'])),
  nutrition_food_key text,
  nutrition_exclusion_reason text,
  constraint recipe_ingredients_name_present check (crop is not null or free_text_name is not null)
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_no integer not null,
  instruction text not null,
  photo_url text,
  timer_seconds integer,
  created_at timestamptz not null default now()
);

create table public.recipe_drafts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  version integer not null,
  title text not null,
  cover_photo_url text,
  servings integer,
  prep_minutes integer,
  cook_minutes integer,
  rest_minutes integer,
  diet_tags text[] not null default '{}',
  allergen_labels text[],
  required_equipment text[],
  ingredients jsonb not null,
  steps jsonb not null,
  nutrition_preview jsonb,
  created_at timestamptz not null default now()
);

create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
insert into storage.objects (bucket_id, name) values
  ('crop-photos', 'dq2-temiz-tarif-16x9.webp');
