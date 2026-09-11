-- T4 production nutrition debt closure.
--
-- This migration deliberately does not write recipes.nutrition_source or coverage.  It supplies
-- sourced food references, exact aliases, measured-unit references and reviewed ingredient
-- corrections; the existing calculate_recipe_nutrition engine remains the only writer of the
-- materialized recipe nutrition columns.

create table public.ingredient_nutrition_reference (
  food_key text primary key check (food_key ~ '^[a-z0-9_]+$'),
  display_name text not null,
  reference_source text not null check (reference_source in ('tuber', 'usda', 'composite')),
  reference_source_id text not null,
  reference_version text not null,
  reference_url text not null,
  basis text not null default 'per_100g' check (basis = 'per_100g'),
  calories_kcal numeric not null check (calories_kcal >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  fiber_g numeric not null check (fiber_g >= 0),
  sodium_mg numeric check (sodium_mg is null or sodium_mg >= 0),
  potassium_mg numeric check (potassium_mg is null or potassium_mg >= 0),
  calcium_mg numeric check (calcium_mg is null or calcium_mg >= 0),
  iron_mg numeric check (iron_mg is null or iron_mg >= 0),
  vitamin_c_mg numeric check (vitamin_c_mg is null or vitamin_c_mg >= 0),
  vitamin_a_mcg_rae numeric check (vitamin_a_mcg_rae is null or vitamin_a_mcg_rae >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reference_source, reference_source_id, reference_version)
);

create trigger trg_ingredient_nutrition_reference_updated_at
  before update on public.ingredient_nutrition_reference
  for each row execute function public.set_updated_at();

alter table public.ingredient_nutrition_reference enable row level security;
revoke all on table public.ingredient_nutrition_reference from public, anon, authenticated;
grant all on table public.ingredient_nutrition_reference to service_role;

create or replace function public.fn_nutrition_normalize_text(p_value text)
returns text language sql immutable security invoker set search_path = ''
as $$
  select nullif(regexp_replace(replace(lower(btrim(coalesce(p_value, ''))), '_', ' '), '\s+', ' ', 'g'), '')
$$;

revoke execute on function public.fn_nutrition_normalize_text(text) from public, anon, authenticated;
grant execute on function public.fn_nutrition_normalize_text(text) to service_role;

create table public.ingredient_nutrition_alias (
  normalized_alias text primary key,
  target_kind text not null check (target_kind in ('food', 'crop')),
  target_key text not null,
  rationale text not null,
  created_at timestamptz not null default now(),
  check (normalized_alias = public.fn_nutrition_normalize_text(normalized_alias))
);

alter table public.ingredient_nutrition_alias enable row level security;
revoke all on table public.ingredient_nutrition_alias from public, anon, authenticated;
grant all on table public.ingredient_nutrition_alias to service_role;

create table public.ingredient_measure_reference (
  target_kind text not null check (target_kind in ('food', 'crop')),
  target_key text not null,
  normalized_unit text not null,
  grams_per_unit numeric not null check (grams_per_unit > 0),
  reference_source text not null,
  reference_source_id text not null,
  reference_version text not null,
  reference_url text not null,
  notes text,
  created_at timestamptz not null default now(),
  primary key (target_kind, target_key, normalized_unit),
  check (normalized_unit = public.fn_nutrition_normalize_text(normalized_unit))
);

alter table public.ingredient_measure_reference enable row level security;
revoke all on table public.ingredient_measure_reference from public, anon, authenticated;
grant all on table public.ingredient_measure_reference to service_role;

alter table public.recipe_ingredients
  add column nutrition_food_key text references public.ingredient_nutrition_reference(food_key),
  add column nutrition_exclusion_reason text,
  add constraint recipe_ingredients_nutrition_exclusion_reason_check check (
    nutrition_exclusion_reason is null or nutrition_exclusion_reason in (
      'serving_only_unquantified',
      'seasoning_to_taste_unquantified',
      'trace_flavoring_unquantified'
    )
  ),
  add constraint recipe_ingredients_nutrition_resolution_check check (
    not (nutrition_food_key is not null and nutrition_exclusion_reason is not null)
  );

create index recipe_ingredients_nutrition_food_key_idx
  on public.recipe_ingredients(nutrition_food_key) where nutrition_food_key is not null;

-- The live project grants INSERT/UPDATE at table scope to anon/authenticated. ADD COLUMN would
-- otherwise make both new server-controlled columns client-writable. Preserve SELECT/DELETE and
-- F7 saveDraft, but narrow writes to the exact pre-existing mobile payload columns.
revoke insert, update on table public.recipe_ingredients from anon, authenticated;
grant insert (recipe_id,sort_order,crop,free_text_name,quantity,unit,note,is_key_ingredient,ingredient_class)
  on public.recipe_ingredients to anon, authenticated;
grant update (sort_order,crop,free_text_name,quantity,unit,note,is_key_ingredient,ingredient_class)
  on public.recipe_ingredients to anon, authenticated;

-- Macro values are copied from the identified per-100g records.  Sparse micronutrients remain
-- NULL; calculate_recipe_nutrition below never turns an unknown micronutrient into zero.
insert into public.ingredient_nutrition_reference
  (food_key, display_name, reference_source, reference_source_id, reference_version, reference_url,
   calories_kcal, protein_g, carbs_g, fat_g, fiber_g, notes)
values
  ('whole_milk','Tam yağlı pastörize inek sütü','tuber','01.02.0009','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',61,3.32,5.09,3.04,0,'Yenilebilir 100 g; ürün kararı: tam yağlı.'),
  ('granulated_sugar','Beyaz toz şeker','tuber','10.02.0012','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',400,0,99.92,0,0,'Beyaz şeker.'),
  ('powdered_sugar','Pudra şekeri','usda','SR-Legacy-19335','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',389,0,99.77,0,0,'Sugars, powdered.'),
  ('salep_powder','Salep tozu, Maraş','tuber','12.02.0054','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/food-salep-toz-maras-477',234,5.31,23.67,0,58.80,'Kaynak enerji dengesi yağ katkısının 0 g olduğunu doğrular.'),
  ('chicken_drumstick_skin_raw','Tavuk baget, et ve deri, çiğ','usda','SR-Legacy-05071','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',161,18.08,0,9.20,0,'Tarifteki derili baget kararı.'),
  ('honey_flower','Çiçek balı','tuber','10.02.0001','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',325,0.13,81.23,0,0,'Belirsiz bal için açık ürün kararı: çiçek balı.'),
  ('table_salt','Sofra tuzu','usda','SR-Legacy-02047','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',0,0,0,0,0,'Makrolar gerçek sıfırdır; sodyum bilinmeyen değildir.'),
  ('black_pepper','Karabiber','tuber','12.02.0038','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',297,20.06,24.69,3.46,43.19,'Öğütülmüş karabiber.'),
  ('paprika','Kırmızı toz biber','usda','SR-Legacy-02028','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',282,14.14,53.99,12.89,34.9,'Spices, paprika; pul biber değildir.'),
  ('butter_salted','Tereyağı, tuzlu','usda','SR-Legacy-01145','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',717,0.85,0.06,81.11,0,'Butter, salted.'),
  ('rice_white_longgrain_raw','Pirinç, beyaz, uzun taneli, kuru','usda','SR-Legacy-02044','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',365,7.13,79.95,0.66,1.3,'Çeltik yerine yenilebilir kuru pirinç ürün kararı.'),
  ('white_pepper','Beyaz biber','usda','SR-Legacy-02032','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',296,10.40,68.61,2.12,26.2,'Spices, pepper, white.'),
  ('almond_raw','Badem, çiğ','usda','SR-Legacy-12061','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',579,21.15,21.55,49.93,12.5,'File badem için yağsız/tuzsuz çiğ badem kararı.'),
  ('red_pepper_paste','Kırmızı biber salçası','tuber','08.02.0043','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',112,2.44,23.43,0.44,2.49,'Biber salçası.'),
  ('pomegranate_molasses','Nar ekşisi, Hatay','tuber','12.02.0084','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',308,0,77,0,0.23,'Açık yöresel ürün kararı: Hatay kaydı.'),
  ('breadcrumbs_dry','Galeta unu, kuru','usda','SR-Legacy-18079','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',395,13.35,71.98,5.30,4.5,'Bread crumbs, dry, grated, seasoned değil.'),
  ('rocket_raw','Roka, çiğ','usda','SR-Legacy-11959','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',25,2.58,3.65,0.66,1.6,'Arugula, raw.'),
  ('white_cheese_full_fat','Beyaz peynir, tam yağlı','tuber','01.02.0004','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',309,16.01,8.21,23.55,0,'Tam yağlı beyaz peynir ürün kararı.'),
  ('wheat_flour_ap','Buğday unu','usda','SR-Legacy-20481','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',364,10.33,76.31,0.98,2.7,'Un olarak yazılmış buğday tanesi kaydının düzeltmesi.'),
  ('whole_wheat_flour','Tam buğday unu','usda','SR-Legacy-20080','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',340,13.21,72.00,2.50,10.7,'Whole-grain wheat flour.'),
  ('baking_powder','Kabartma tozu','usda','SR-Legacy-18369','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',53,0,27.70,0,0.2,'Baking powder, double-acting.'),
  ('vanilla_extract','Vanilya özütü','usda','SR-Legacy-02050','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',288,0.06,12.65,0.06,0,'Belirsiz bir adet vanilya yerine 1 çay kaşığı özüt kararı.'),
  ('sourdough_starter_100pct','Ekşi maya, %100 hidratasyon','composite','USDA-20080+14411-50:50','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',170,6.605,36.00,1.25,5.35,'50 g tam buğday unu + 50 g su; bileşim ve hidratasyon açık.'),
  ('water','İçme suyu','usda','SR-Legacy-14411','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',0,0,0,0,0,'Makrolar gerçek sıfırdır; eşleşmemiş satır değildir.'),
  ('cinnamon_ground','Tarçın, öğütülmüş','usda','SR-Legacy-02010','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',247,3.99,80.59,1.24,53.1,'Spices, cinnamon, ground.'),
  ('lemon_juice_raw','Limon suyu, çiğ','usda','SR-Legacy-09152','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',22,0.35,6.90,0.24,0.3,'Sıkılmış taze limon suyu.'),
  ('almond_milk_unsweetened','Badem sütü, şekersiz','usda','FDC-2257045','USDA-FDC-v15.0-2026-04','https://fdc.nal.usda.gov/fdc-app.html#/food-details/2257045/nutrients',19,0.70,0.70,1.60,0,'Belirsiz bitkisel süt yerine açık refrigerated ürün kararı.'),
  ('avocado_raw','Avokado, çiğ','usda','SR-Legacy-09038','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',160,2.00,8.53,14.66,6.7,'All commercial varieties.'),
  ('cucumber_raw','Salatalık, kabuklu, çiğ','usda','SR-Legacy-11205','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',15,0.65,3.63,0.11,0.5,'With peel.'),
  ('rosemary_fresh','Biberiye, taze','usda','SR-Legacy-02063','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',131,3.31,20.70,5.86,14.1,'Rosemary, fresh.'),
  ('beef_ground_80_20_raw','Dana kıyma, %20 yağ, çiğ','usda','SR-Legacy-23572','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',254,17.17,0,20.00,0,'Belirsiz kıyma için açık 80/20 dana ürünü kararı.'),
  ('yogurt_full_fat','Yoğurt, tam yağlı','tuber','01.02.0015','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',69,4.53,4.24,3.80,0,'Tam yağlı sade yoğurt.'),
  ('egg_whole_raw','Yumurta, bütün, çiğ','tuber','02.01.0007','TÜRKOMP-live-2026-09-10','https://turkomp.tarimorman.gov.tr/',140,13.13,0,9.69,0,'Bütün tavuk yumurtası.'),
  ('zucchini_raw','Sakız kabağı, çiğ','usda','SR-Legacy-11477','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/',17,1.21,3.11,0.32,1.0,'Summer squash, includes skin.')
on conflict (food_key) do nothing;

-- Known source values are stored; absent micronutrients remain NULL.
update public.ingredient_nutrition_reference
set sodium_mg=38758
where food_key='table_salt' and sodium_mg is null;

-- A crop row may only be added when the ingredient is exactly that crop.  Pul biber has its own
-- TÜRKOMP record; it is not proxied to paprika/dried pepper.
insert into public.crop_nutrition
  (crop, reference_source, reference_source_id, reference_version, basis,
   calories_kcal, protein_g, carbs_g, fat_g, fiber_g, notes)
values
  ('pul_biber','tuber','08.02.0042','TÜRKOMP-live-2026-09-10','per_100g',
   286,11.69,43.67,0,32.25,
   'Biber, kırmızı, acılı, pul. https://turkomp.tarimorman.gov.tr/food-biber-kirmizi-acili-pul-184')
on conflict (crop) do nothing;

do $$
begin
  if not exists (
    select 1 from public.crop_nutrition where crop='pul_biber' and reference_source='tuber'
      and reference_source_id='08.02.0042' and reference_version='TÜRKOMP-live-2026-09-10'
      and calories_kcal=286 and protein_g=11.69 and carbs_g=43.67 and fat_g=0 and fiber_g=32.25
  ) then
    raise exception 'pul_biber reference conflicts with reviewed TÜRKOMP 08.02.0042 row';
  end if;
end $$;

insert into public.ingredient_nutrition_alias(normalized_alias,target_kind,target_key,rationale) values
  ('süt','food','whole_milk','Tarif notu tam yağlı sütü doğruluyor.'),
  ('şeker','food','granulated_sugar','Standart beyaz şeker.'),
  ('toz şeker','food','granulated_sugar','Standart beyaz toz şeker.'),
  ('pudra şekeri','food','powdered_sugar','Birebir ürün.'),
  ('salep','food','salep_powder','Tarif notu gerçek salep diyor.'),
  ('tavuk baget','food','chicken_drumstick_skin_raw','Tarif notu derili baget diyor.'),
  ('bal','food','honey_flower','Backfill ürün kararı: çiçek balı.'),
  ('tuz','food','table_salt','Sofra tuzu.'),
  ('karabiber','food','black_pepper','Birebir baharat.'),
  ('toz kırmızı biber','food','paprika','Pul biberden ayrı kırmızı toz biber.'),
  ('tereyağı','food','butter_salted','Backfill ürün kararı: tuzlu tereyağı.'),
  ('beyaz biber','food','white_pepper','Birebir baharat.'),
  ('file badem','food','almond_raw','Şekil değişikliği besin referansını değiştirmez.'),
  ('kırmızı biber salçası','food','red_pepper_paste','Birebir TÜRKOMP ürünü.'),
  ('nar ekşisi','food','pomegranate_molasses','Backfill ürün kararı: Hatay kaydı.'),
  ('galeta unu','food','breadcrumbs_dry','Birebir kuru galeta unu.'),
  ('roka','food','rocket_raw','Birebir çiğ roka.'),
  ('beyaz peynir','food','white_cheese_full_fat','Backfill ürün kararı: tam yağlı.'),
  ('kabartma tozu','food','baking_powder','Birebir ürün.'),
  ('ekşi maya','food','sourdough_starter_100pct','Backfill kararı: %100 hidratasyon.'),
  ('su','food','water','İçme suyu; gerçek sıfır makrolar.'),
  ('tarçın','food','cinnamon_ground','Birebir öğütülmüş baharat.'),
  ('taze limon suyu','food','lemon_juice_raw','Birebir taze limon suyu.'),
  ('buz','food','water','Buz suyun katı hâlidir.'),
  ('avokado','food','avocado_raw','Birebir çiğ avokado.'),
  ('salatalık','food','cucumber_raw','Birebir çiğ kabuklu salatalık.'),
  ('taze biberiye','food','rosemary_fresh','Birebir taze biberiye.'),
  ('kıyma','food','beef_ground_80_20_raw','Backfill ürün kararı: çiğ dana 80/20.'),
  ('yoğurt','food','yogurt_full_fat','Backfill ürün kararı: tam yağlı sade.'),
  ('yumurta','food','egg_whole_raw','Birebir bütün yumurta.'),
  ('kabak','food','zucchini_raw','Tarif notu rendelenmiş orta boy sakız kabağı.'),
  ('patates','crop','patates','Birebir kontrollü crop.'),
  ('havuc','crop','havuç','ASCII yazım; birebir kontrollü crop.'),
  ('havuç','crop','havuç','Birebir kontrollü crop.'),
  ('sogan','crop','soğan','ASCII yazım; birebir kontrollü crop.'),
  ('sarimsak','crop','sarımsak','ASCII yazım; birebir kontrollü crop.'),
  ('zeytinyagi','crop','zeytinyağı','ASCII yazım; birebir kontrollü crop.'),
  ('zeytinyağı','crop','zeytinyağı','Birebir kontrollü crop.'),
  ('taze nane yaprağı','crop','nane','Birebir kontrollü crop.')
on conflict (normalized_alias) do nothing;

-- Portion weights use USDA FoodData Central household measures unless explicitly marked as an
-- editorial product decision.  Metric units never consult this table.
insert into public.ingredient_measure_reference
  (target_kind,target_key,normalized_unit,grams_per_unit,reference_source,reference_source_id,reference_version,reference_url,notes)
values
  ('crop','anason','tatlı kaşığı',4.2,'usda','SR-Legacy-02002-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','2 tsp equivalent.'),
  ('crop','ayva','adet',200,'editorial','T4-ayva-medium','2026-09-10-review-required','about:blank','Tarifin orta boy notuna bağlı karar.'),
  ('crop','patates','adet',300,'editorial','T4-potato-large','2026-09-10-review-required','about:blank','Yalnız büyük adet ifadesi için karar.'),
  ('crop','ceviz','yemek kaşığı',7,'usda','SR-Legacy-12155-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Chopped walnuts.'),
  ('crop','yulaf','su bardağı',80,'usda','SR-Legacy-08120-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Rolled oats; 200 ml Turkish cup decision.'),
  ('crop','havuç','adet',61,'usda','SR-Legacy-11124-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One medium carrot.'),
  ('crop','havuç','orta boy',61,'usda','SR-Legacy-11124-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One medium carrot.'),
  ('crop','soğan','adet',110,'usda','SR-Legacy-11282-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One medium onion.'),
  ('crop','sarımsak','diş',3,'usda','SR-Legacy-11215-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One clove.'),
  ('crop','nane','avuç',6,'editorial','T4-mint-handful','2026-09-10-review-required','about:blank','Servis avucu; açık porsiyon kararı.'),
  ('food','salep_powder','yemek kaşığı',8,'editorial','T4-salep-tablespoon','2026-09-10-review-required','about:blank','Silme yemek kaşığı kararı.'),
  ('food','chicken_drumstick_skin_raw','adet',95,'usda','SR-Legacy-05071-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Edible portion per drumstick.'),
  ('food','honey_flower','tatlı kaşığı',14,'usda','SR-Legacy-19296-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Two teaspoons.'),
  ('food','honey_flower','yemek kaşığı',21,'usda','SR-Legacy-19296-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One tablespoon.'),
  ('food','table_salt','tatlı kaşığı',12,'usda','SR-Legacy-02047-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Two teaspoons.'),
  ('food','table_salt','çay kaşığı',6,'usda','SR-Legacy-02047-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One teaspoon.'),
  ('food','table_salt','tutam',0.36,'editorial','T4-salt-pinch','2026-09-10-review-required','about:blank','1/16 teaspoon product decision.'),
  ('food','black_pepper','çay kaşığı',2.3,'usda','SR-Legacy-02030-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One teaspoon ground.'),
  ('food','paprika','çay kaşığı',2.3,'usda','SR-Legacy-02028-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One teaspoon.'),
  ('food','butter_salted','yemek kaşığı',14.2,'usda','SR-Legacy-01145-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One tablespoon.'),
  ('food','white_pepper','çay kaşığı',2.4,'usda','SR-Legacy-02032-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One teaspoon.'),
  ('food','almond_raw','yemek kaşığı',6,'usda','SR-Legacy-12061-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Sliced almonds.'),
  ('food','red_pepper_paste','yemek kaşığı',18,'editorial','T4-pepper-paste-tablespoon','2026-09-10-review-required','about:blank','Silme kaşık ürün kararı.'),
  ('food','pomegranate_molasses','yemek kaşığı',20,'editorial','T4-pomegranate-molasses-tablespoon','2026-09-10-review-required','about:blank','Ürün yoğunluğu kararı.'),
  ('food','breadcrumbs_dry','yemek kaşığı',7.5,'usda','SR-Legacy-18079-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Dry grated breadcrumbs.'),
  ('food','rocket_raw','demet',100,'editorial','T4-rocket-bunch','2026-09-10-review-required','about:blank','Mevcut iki tarif için açık demet kararı.'),
  ('food','granulated_sugar','bardak',200,'usda','SR-Legacy-19335-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One cup granulated sugar.'),
  ('food','powdered_sugar','yemek kaşığı',8,'usda','SR-Legacy-19335-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One tablespoon unsifted.'),
  ('food','baking_powder','çay kaşığı',4,'usda','SR-Legacy-18369-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One teaspoon.'),
  ('food','baking_powder','paket',10,'editorial','T4-baking-powder-packet','2026-09-10-review-required','about:blank','Türkiye standart küçük paket kararı.'),
  ('food','vanilla_extract','çay kaşığı',4.2,'usda','SR-Legacy-02050-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One teaspoon.'),
  ('food','water','bardak',200,'editorial','T4-turkish-water-cup','2026-09-10-review-required','about:blank','Tariflerdeki Türk su bardağı kararı.'),
  ('food','water','su bardağı',200,'editorial','T4-turkish-water-cup-underscore','2026-09-10-review-required','about:blank','Tariflerdeki Türk su bardağı kararı.'),
  ('food','water','küçük parça',15,'editorial','T4-small-ice-piece','2026-09-10-review-required','about:blank','Buz için açık parça ağırlığı kararı.'),
  ('food','cinnamon_ground','çay kaşığı',2.6,'usda','SR-Legacy-02010-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One teaspoon.'),
  ('food','lemon_juice_raw','tatlı kaşığı',10,'editorial','T4-dessertspoon','2026-09-10-review-required','about:blank','Two teaspoons.'),
  ('food','lemon_juice_raw','yemek kaşığı',15,'usda','SR-Legacy-09152-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One tablespoon.'),
  ('food','avocado_raw','adet',201,'usda','SR-Legacy-09038-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One fruit edible portion.'),
  ('food','cucumber_raw','adet',300,'editorial','T4-cucumber-each','2026-09-10-review-required','about:blank','Mevcut tarif için orta salatalık kararı.'),
  ('food','rosemary_fresh','dal',2,'editorial','T4-rosemary-sprig','2026-09-10-review-required','about:blank','Bir dal taze biberiye kararı.'),
  ('food','yogurt_full_fat','su bardağı',200,'editorial','T4-turkish-yogurt-cup','2026-09-10-review-required','about:blank','Türk su bardağı hacmiyle ürün kararı.'),
  ('food','egg_whole_raw','adet',50,'usda','SR-Legacy-01123-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One large egg edible portion.'),
  ('food','zucchini_raw','orta boy',196,'usda','SR-Legacy-11477-household','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','One medium squash.')
on conflict do nothing;

create or replace function public.fn_nutrition_normalize_unit(p_unit text)
returns text language sql immutable security invoker set search_path = ''
as $$
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
$$;

revoke execute on function public.fn_nutrition_normalize_unit(text) from public, anon, authenticated;
grant execute on function public.fn_nutrition_normalize_unit(text) to service_role;

create or replace function public.fn_recipe_ingredient_grams_v2(
  p_crop text, p_food_key text, p_free_text_name text, p_quantity numeric, p_unit text
) returns numeric language plpgsql stable security invoker set search_path = '' as $$
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
end $$;

revoke execute on function public.fn_recipe_ingredient_grams_v2(text,text,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.fn_recipe_ingredient_grams_v2(text,text,text,numeric,text) to service_role;

create or replace function public.fn_recipe_ingredient_grams(p_crop text,p_quantity numeric,p_unit text)
returns numeric language sql stable security invoker set search_path = ''
as $$ select public.fn_recipe_ingredient_grams_v2(p_crop,null,null,p_quantity,p_unit) $$;

revoke execute on function public.fn_recipe_ingredient_grams(text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.fn_recipe_ingredient_grams(text,numeric,text) to service_role;

create or replace function public.calculate_recipe_nutrition(p_recipe_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_servings numeric; v_total numeric := 0; v_matched numeric := 0;
  v_cal numeric := 0; v_pro numeric := 0; v_carb numeric := 0; v_fat numeric := 0; v_fiber numeric := 0;
  v_sodium numeric := 0; v_potassium numeric := 0; v_calcium numeric := 0; v_iron numeric := 0;
  v_vitc numeric := 0; v_vita numeric := 0; v_micro_complete boolean := true;
  v_unresolved boolean := false; v_grams numeric; v_coverage numeric; v_source text;
  v_versions text[] := '{}'; v_warnings text[] := '{}'; v_hash text; v_ref_version text; r record;
begin
  select servings into v_servings from public.recipes where id=p_recipe_id;
  if not found then raise exception 'calculate_recipe_nutrition: recipe % not found',p_recipe_id; end if;

  for r in
    select ri.id,ri.crop,ri.free_text_name,ri.quantity,ri.unit,ri.nutrition_food_key,ri.nutrition_exclusion_reason,
      coalesce(ri.nutrition_food_key,case when a.target_kind='food' then a.target_key end) food_key,
      coalesce(ri.crop,case when a.target_kind='crop' then a.target_key end) resolved_crop,
      coalesce(fr.calories_kcal,cn.calories_kcal) calories_kcal,
      coalesce(fr.protein_g,cn.protein_g) protein_g,coalesce(fr.carbs_g,cn.carbs_g) carbs_g,
      coalesce(fr.fat_g,cn.fat_g) fat_g,coalesce(fr.fiber_g,cn.fiber_g) fiber_g,
      coalesce(fr.sodium_mg,cn.sodium_mg) sodium_mg,coalesce(fr.potassium_mg,cn.potassium_mg) potassium_mg,
      coalesce(fr.calcium_mg,cn.calcium_mg) calcium_mg,coalesce(fr.iron_mg,cn.iron_mg) iron_mg,
      coalesce(fr.vitamin_c_mg,cn.vitamin_c_mg) vitamin_c_mg,
      coalesce(fr.vitamin_a_mcg_rae,cn.vitamin_a_mcg_rae) vitamin_a_mcg_rae,
      coalesce(fr.reference_version,cn.reference_version) reference_version
    from public.recipe_ingredients ri
    left join public.ingredient_nutrition_alias a on ri.crop is null and ri.nutrition_food_key is null
      and a.normalized_alias=public.fn_nutrition_normalize_text(ri.free_text_name)
    left join public.ingredient_nutrition_reference fr on fr.food_key=coalesce(ri.nutrition_food_key,case when a.target_kind='food' then a.target_key end)
    left join public.crop_nutrition cn on cn.crop=coalesce(ri.crop,case when a.target_kind='crop' then a.target_key end)
    where ri.recipe_id=p_recipe_id order by ri.sort_order,ri.id
  loop
    if r.nutrition_exclusion_reason is not null then
      v_warnings := array_append(v_warnings,'excluded_ingredient:'||r.nutrition_exclusion_reason);
      continue;
    end if;
    v_grams := public.fn_recipe_ingredient_grams_v2(r.resolved_crop,r.food_key,r.free_text_name,r.quantity,r.unit);
    if v_grams is null then v_unresolved:=true; continue; end if;
    v_total:=v_total+v_grams;
    if r.calories_kcal is null or r.protein_g is null or r.carbs_g is null or r.fat_g is null or r.fiber_g is null then
      v_unresolved:=true; continue;
    end if;
    v_matched:=v_matched+v_grams;
    v_cal:=v_cal+v_grams*r.calories_kcal/100; v_pro:=v_pro+v_grams*r.protein_g/100;
    v_carb:=v_carb+v_grams*r.carbs_g/100; v_fat:=v_fat+v_grams*r.fat_g/100;
    v_fiber:=v_fiber+v_grams*r.fiber_g/100;
    if r.sodium_mg is null or r.potassium_mg is null or r.calcium_mg is null or r.iron_mg is null
       or r.vitamin_c_mg is null or r.vitamin_a_mcg_rae is null then v_micro_complete:=false;
    else
      v_sodium:=v_sodium+v_grams*r.sodium_mg/100; v_potassium:=v_potassium+v_grams*r.potassium_mg/100;
      v_calcium:=v_calcium+v_grams*r.calcium_mg/100; v_iron:=v_iron+v_grams*r.iron_mg/100;
      v_vitc:=v_vitc+v_grams*r.vitamin_c_mg/100; v_vita:=v_vita+v_grams*r.vitamin_a_mcg_rae/100;
    end if;
    if r.reference_version is not null and not r.reference_version=any(v_versions) then v_versions:=v_versions||r.reference_version; end if;
  end loop;

  if v_unresolved then v_warnings:=array_append(v_warnings,'unmatched_ingredient'); end if;
  select array(select distinct x from unnest(v_warnings) x order by x) into v_warnings;
  if v_matched<=0 or v_servings is null or v_servings<=0 then
    update public.recipes set calories=null,protein_g=null,carbs_g=null,fat_g=null,fiber_g=null,micronutrients=null,
      nutrition_source=null,nutrition_coverage_pct=null,nutrition_calculated_at=null,nutrition_input_hash=null,
      nutrition_reference_version=null,nutrition_warnings=v_warnings where id=p_recipe_id; return;
  end if;
  v_coverage:=round(v_matched/nullif(v_total,0)*100,2);
  if v_unresolved then v_coverage:=least(v_coverage,99.99); end if;
  v_source:=case when not v_unresolved and v_coverage=100 then 'computed' else 'partial' end;
  v_ref_version:=array_to_string(v_versions,'+');
  select md5(p_recipe_id::text||'|t4-nutrition-v2|'||v_servings::text||'|'||coalesce(v_ref_version,'')||'|'||
    coalesce(string_agg(coalesce(ri.crop,'')||':'||coalesce(ri.free_text_name,'')||':'||coalesce(ri.nutrition_food_key,'')||':'||
      coalesce(ri.nutrition_exclusion_reason,'')||':'||coalesce(ri.quantity::text,'')||':'||coalesce(ri.unit,''),',' order by ri.sort_order,ri.id),''))
    into v_hash from public.recipe_ingredients ri where ri.recipe_id=p_recipe_id;
  update public.recipes set calories=round(v_cal/v_servings,2),protein_g=round(v_pro/v_servings,2),
    carbs_g=round(v_carb/v_servings,2),fat_g=round(v_fat/v_servings,2),fiber_g=round(v_fiber/v_servings,2),
    micronutrients=case when v_micro_complete then jsonb_build_object('schema_version',1,'basis','per_serving','values',jsonb_build_object(
      'sodium_mg',round(v_sodium/v_servings,2),'potassium_mg',round(v_potassium/v_servings,2),
      'calcium_mg',round(v_calcium/v_servings,2),'iron_mg',round(v_iron/v_servings,2),
      'vitamin_c_mg',round(v_vitc/v_servings,2),'vitamin_a_mcg_rae',round(v_vita/v_servings,2))) else null end,
    nutrition_source=v_source,nutrition_coverage_pct=v_coverage,nutrition_calculated_at=now(),nutrition_input_hash=v_hash,
    nutrition_reference_version=v_ref_version,nutrition_warnings=v_warnings where id=p_recipe_id;
end $$;

revoke execute on function public.calculate_recipe_nutrition(uuid) from public, anon, authenticated;
grant execute on function public.calculate_recipe_nutrition(uuid) to service_role;

create table public.recipe_ingredient_nutrition_backfill_audit (
  migration_key text not null,
  ingredient_id uuid not null,
  recipe_id uuid not null,
  before_row jsonb not null,
  after_row jsonb not null,
  rationale text not null,
  applied_at timestamptz not null default now(),
  primary key(migration_key,ingredient_id)
);
alter table public.recipe_ingredient_nutrition_backfill_audit enable row level security;
revoke all on table public.recipe_ingredient_nutrition_backfill_audit from public,anon,authenticated;
grant all on table public.recipe_ingredient_nutrition_backfill_audit to service_role;

-- No published recipe row is changed here.  The reviewed, guarded data correction and recalculation
-- live in supabase/backfills/t4_production_nutrition_debt_closure.sql and must be run separately.
