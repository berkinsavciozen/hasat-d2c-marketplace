-- DQ-2 — assertion suite for 20260924204804_dq2_recipe_quality_issues.sql.
--
-- Documents are built from one clean base document (dq2_doc) plus per-case overrides, using real
-- ingredient/step phrasings from the 2026-09-24 REF-DQ audit corpus. Each "yakalamalı" case
-- asserts its code fires; each "yakalamamalı" case asserts the specific false positive does not.

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

-- Clean base: every check passes on it (asserted first, below).
create or replace function pg_temp.dq2_doc(p_overrides jsonb default '{}'::jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'title', 'Temiz Tarif',
    'servings', 4,
    'prepMinutes', 10,
    'cookMinutes', 20,
    'restMinutes', 0,
    'calories', 300,
    'dietTags', jsonb_build_array(),
    'allergenLabels', jsonb_build_array(),
    'requiredEquipment', jsonb_build_array('ocak'),
    'coverPhotoUrl', 'https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/dq2-temiz-tarif-16x9.webp',
    'ingredients', jsonb_build_array(
      jsonb_build_object('id', 'i-domates', 'crop', 'domates', 'freeTextName', null, 'quantity', 4, 'unit', 'adet',
                         'note', null, 'ingredientClass', 'tarimsal', 'nutritionExclusionReason', null),
      jsonb_build_object('id', 'i-zeytinyagi', 'crop', 'zeytinyağı', 'freeTextName', null, 'quantity', 2, 'unit', 'yemek kaşığı',
                         'note', null, 'ingredientClass', 'tarimsal', 'nutritionExclusionReason', null)),
    'steps', jsonb_build_array(
      jsonb_build_object('stepNo', 1, 'instruction', 'Domatesleri yıkayıp küp küp doğrayın.', 'timerSeconds', null),
      jsonb_build_object('stepNo', 2, 'instruction', 'Tencerede zeytinyağını ısıtıp domatesleri ekleyin.', 'timerSeconds', 600),
      jsonb_build_object('stepNo', 3, 'instruction', 'Kısık ateşte on dakika daha pişirip servis edin.', 'timerSeconds', 600))
  ) || p_overrides;
$$;

-- Single ingredient helper (id 'i-x').
create or replace function pg_temp.ing(
  p_name text, p_crop text default null, p_note text default null,
  p_quantity numeric default 1, p_unit text default 'adet', p_class text default 'platform_disi',
  p_food_key text default null, p_exclusion text default null
)
returns jsonb
language sql
as $$
  select jsonb_build_object('id', 'i-' || coalesce(p_name, p_crop), 'crop', p_crop, 'freeTextName', p_name,
    'quantity', p_quantity, 'unit', p_unit, 'note', p_note, 'ingredientClass', p_class,
    'nutritionFoodKey', p_food_key, 'nutritionExclusionReason', p_exclusion);
$$;

create or replace function pg_temp.issues(p_doc jsonb)
returns jsonb
language sql
as $$ select public.fn_recipe_quality_issues(p_doc) $$;

create or replace function pg_temp.codes(p_doc jsonb)
returns text[]
language sql
as $$ select coalesce(array_agg(e->>'code'), '{}') from jsonb_array_elements(public.fn_recipe_quality_issues(p_doc)) e $$;

create or replace function pg_temp.has_issue(p_doc jsonb, p_code text, p_suggestion jsonb default null)
returns boolean
language sql
as $$
  select exists (
    select 1 from jsonb_array_elements(public.fn_recipe_quality_issues(p_doc)) e
    where e->>'code' = p_code and (p_suggestion is null or e->'suggestion' @> p_suggestion)
  )
$$;

-- -------------------------------------------------------------------------------------------------
-- Matcher unit checks
-- -------------------------------------------------------------------------------------------------
select pg_temp.assert(public.fn_rq_normalize('Tereyağı, 2 YK (eritilmiş)') = ' tereyağı yk eritilmiş ', 'normalize: lower + non-letters -> space + padding');
select pg_temp.assert(public.fn_rq_normalize('İNCİR') = ' incir ', 'normalize: Turkish capital İ');
select pg_temp.assert(public.fn_rq_matches(' unu ', 'un'), 'suffix: unu');
select pg_temp.assert(public.fn_rq_matches(' beyaz peyniri ', 'peynir'), 'suffix: peyniri');
select pg_temp.assert(public.fn_rq_matches(' tereyağında ', 'tereyağ'), 'suffix: tereyağında');
select pg_temp.assert(public.fn_rq_matches(' tavuğu ', 'tavuk'), 'softening: tavuğu');
select pg_temp.assert(public.fn_rq_matches(' bayat ekmeği ', 'ekmek'), 'softening: ekmeği');
select pg_temp.assert(not public.fn_rq_matches(' baldo pirinç ', 'bal'), 'baldo is not bal');
select pg_temp.assert(not public.fn_rq_matches(' karabiber ', 'biber'), 'karabiber is not biber (word start)');
select pg_temp.assert(not public.fn_rq_matches(' karabuğday ', 'buğday'), 'karabuğday is not buğday');
select pg_temp.assert(not public.fn_rq_matches(' arpacık soğan ', 'arpa'), 'arpacık is not arpa');
select pg_temp.assert(not public.fn_rq_matches(' tavuk baget ', 'tava', '{}', true), 'tavuk is not tava (prefix mode)');
select pg_temp.assert(public.fn_rq_matches(' badem sütü ve süt ', 'süt', array['badem sütü']), 'exclude removes only the excluded phrase');
select pg_temp.assert(not public.fn_rq_matches(' şekersiz badem sütü ', 'süt', array['badem sütü']), 'badem sütü excluded from süt');

-- -------------------------------------------------------------------------------------------------
-- Clean base produces no kritik/uyari/bilgi at all
-- -------------------------------------------------------------------------------------------------
select pg_temp.assert(pg_temp.issues(pg_temp.dq2_doc()) = '[]'::jsonb,
  'clean base doc must produce no issues, got ' || pg_temp.issues(pg_temp.dq2_doc())::text);

-- =================================================================================================
-- YAKALAMALI
-- =================================================================================================

-- vegan + "beyaz peynir" -> DIET_CONFLICT_VEGAN (kritik, removeDietTag vegan, ingredientId set)
select pg_temp.assert(
  pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
    'dietTags', jsonb_build_array('vegan', 'vejetaryen'),
    'allergenLabels', jsonb_build_array('laktoz'),
    'ingredients', jsonb_build_array(pg_temp.ing('beyaz peynir', null, null, 100, 'g'))
  )), 'DIET_CONFLICT_VEGAN', '{"removeDietTag":"vegan"}'),
  'vegan + beyaz peynir -> DIET_CONFLICT_VEGAN');
select pg_temp.assert(
  (select e->>'severity' = 'kritik' and e->>'ingredientId' = 'i-beyaz peynir'
   from jsonb_array_elements(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
     'dietTags', jsonb_build_array('vegan', 'vejetaryen'), 'allergenLabels', jsonb_build_array('laktoz'),
     'ingredients', jsonb_build_array(pg_temp.ing('beyaz peynir', null, null, 100, 'g')))))) e
   where e->>'code' = 'DIET_CONFLICT_VEGAN'),
  'DIET_CONFLICT_VEGAN is kritik and carries ingredientId');

-- glutensiz + "galeta unu" -> DIET_CONFLICT_GLUTENSIZ
select pg_temp.assert(
  pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
    'dietTags', jsonb_build_array('vegan', 'vejetaryen', 'glutensiz'),
    'allergenLabels', jsonb_build_array('gluten', 'agac-kuruyemisi'),
    'ingredients', jsonb_build_array(pg_temp.ing('ceviz', 'ceviz', null, 100, 'g', 'tarimsal'),
                                     pg_temp.ing('galeta unu', null, null, 3, 'yemek kaşığı'))
  )), 'DIET_CONFLICT_GLUTENSIZ', '{"removeDietTag":"glutensiz"}'),
  'glutensiz + galeta unu -> DIET_CONFLICT_GLUTENSIZ');

-- glutensiz + gluten allergen checked (no gluten keyword) -> DIET_CONFLICT_GLUTENSIZ
select pg_temp.assert(
  pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
    'dietTags', jsonb_build_array('glutensiz'), 'allergenLabels', jsonb_build_array('gluten'))), 'DIET_CONFLICT_GLUTENSIZ'),
  'glutensiz + gluten allergen label -> DIET_CONFLICT_GLUTENSIZ');

-- "tahin", no susam label -> ALLERGEN_MISSING (addAllergen susam), kritik, Turkish message
select pg_temp.assert(
  pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
    'ingredients', jsonb_build_array(pg_temp.ing('tahin', null, null, 2, 'yemek kaşığı'))
  )), 'ALLERGEN_MISSING', '{"addAllergen":"susam"}'),
  'tahin without susam -> ALLERGEN_MISSING addAllergen=susam');
select pg_temp.assert(
  (select e->>'message' = 'Tahin var, susam alerjeni işaretli değil.' and e->>'severity' = 'kritik'
   from jsonb_array_elements(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
     'ingredients', jsonb_build_array(pg_temp.ing('tahin', null, null, 2, 'yemek kaşığı')))))) e
   where e->>'code' = 'ALLERGEN_MISSING'),
  'ALLERGEN_MISSING message/severity');

-- elma / buz / badem sütü / limon + gluten,soya -> exactly 2 x ALLERGEN_UNSUPPORTED
select pg_temp.assert(
  (select count(*) = 2
     and bool_and(e->'suggestion'->>'removeAllergen' in ('gluten', 'soya'))
   from jsonb_array_elements(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
     'servings', 1, 'calories', 103,
     'dietTags', jsonb_build_array('vegan', 'vejetaryen', 'glutensiz'),
     'allergenLabels', jsonb_build_array('gluten', 'soya', 'agac-kuruyemisi'),
     'requiredEquipment', jsonb_build_array('blender'),
     'ingredients', jsonb_build_array(
       pg_temp.ing(null, 'elma', null, 1, 'adet', 'tarimsal'),
       pg_temp.ing('buz', null, null, 1, 'su bardağı'),
       pg_temp.ing('badem sütü', null, null, 200, 'ml'),
       pg_temp.ing(null, 'limon', null, 1, 'adet', 'tarimsal')),
     'steps', jsonb_build_array(
       jsonb_build_object('stepNo', 1, 'instruction', 'Elmayı çekirdeklerinden ayırıp doğrayın.'),
       jsonb_build_object('stepNo', 2, 'instruction', 'Tüm malzemeleri blendera koyun.'),
       jsonb_build_object('stepNo', 3, 'instruction', 'Pürüzsüz olana kadar çekip servis edin.'))
   )))) e
   where e->>'code' = 'ALLERGEN_UNSUPPORTED'),
  'smoothie + gluten,soya -> 2 x ALLERGEN_UNSUPPORTED');

-- servings=1, 1190 kcal -> KCAL_OUTLIER
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc('{"servings":1,"calories":1190}'), 'KCAL_OUTLIER'), 'servings=1 1190 kcal -> KCAL_OUTLIER');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc('{"servings":1,"calories":850}'), 'KCAL_OUTLIER'), 'servings=1 850 kcal -> KCAL_OUTLIER');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc('{"servings":4,"calories":1502}'), 'KCAL_OUTLIER'), '1502 kcal -> KCAL_OUTLIER');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc('{"servings":4,"calories":12}'), 'KCAL_OUTLIER'), '12 kcal -> KCAL_OUTLIER');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc('{"servings":4,"calories":850}'), 'KCAL_OUTLIER'), '850 kcal x4 is fine');

-- cover ...-1x1.webp -> COVER_NOT_HERO; missing cover; 16x9 name not in storage
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(
  '{"coverPhotoUrl":"https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/safranli-zerde-1x1.webp"}'), 'COVER_NOT_HERO'),
  '1x1 cover -> COVER_NOT_HERO');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc('{"coverPhotoUrl":null}'), 'COVER_NOT_HERO'), 'no cover -> COVER_NOT_HERO');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(
  '{"coverPhotoUrl":"https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/yok-16x9.webp"}'), 'COVER_NOT_HERO'),
  '16x9 cover missing from storage.objects -> COVER_NOT_HERO');

-- "salatalık" crop null -> CROP_UNLINKED setCrop salatalık (and underscore slugs too)
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('salatalık', null, null, 1, 'adet')))), 'CROP_UNLINKED', '{"setCrop":"salatalık"}'),
  'salatalık unlinked -> CROP_UNLINKED');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('Pul biber', null, null, 1, 'çay kaşığı')))), 'CROP_UNLINKED', '{"setCrop":"pul_biber"}'),
  'pul biber unlinked -> CROP_UNLINKED setCrop pul_biber');

-- ozel-ekipman-gerekmiyor + ocak -> EQUIPMENT_CONFLICT
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc('{"requiredEquipment":["ozel-ekipman-gerekmiyor","ocak"]}'), 'EQUIPMENT_CONFLICT'),
  'ozel-ekipman-gerekmiyor + ocak -> EQUIPMENT_CONFLICT');

-- "Bademleri tavada kavurun", equipment izgara -> EQUIPMENT_CONFLICT (ocak)
select pg_temp.assert(
  (select count(*) >= 1 from jsonb_array_elements(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
     'requiredEquipment', jsonb_build_array('izgara'),
     'steps', jsonb_build_array(
       jsonb_build_object('stepNo', 1, 'instruction', 'Bademleri tavada kavurun.'),
       jsonb_build_object('stepNo', 2, 'instruction', 'Sebzeleri ızgarada iki yüzlü pişirin.'),
       jsonb_build_object('stepNo', 3, 'instruction', 'Bademleri üzerine serpip servis edin.')))))) e
   where e->>'code' = 'EQUIPMENT_CONFLICT' and e->>'message' like '%"ocak"%'),
  'tavada kavurun + izgara -> EQUIPMENT_CONFLICT for ocak');

-- "yulaf ezmesi" without a note + glutensiz -> kritik
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('glutensiz'), 'allergenLabels', jsonb_build_array('gluten'),
  'ingredients', jsonb_build_array(pg_temp.ing('yulaf ezmesi', 'yulaf', null, 1, 'su bardağı', 'tarimsal')))), 'DIET_CONFLICT_GLUTENSIZ'),
  'yulaf ezmesi (no note) + glutensiz -> DIET_CONFLICT_GLUTENSIZ');

-- Remaining codes
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc('{"dietTags":["vegan"]}'), 'VEGAN_WITHOUT_VEJETARYEN', '{"addDietTag":"vejetaryen"}'),
  'vegan without vejetaryen -> VEGAN_WITHOUT_VEJETARYEN');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object('steps', jsonb_build_array(
  jsonb_build_object('stepNo', 1, 'instruction', 'Tencerede zeytinyağını ısıtın.', 'timerSeconds', 5400),
  jsonb_build_object('stepNo', 2, 'instruction', 'Domatesleri ekleyip karıştırın.'),
  jsonb_build_object('stepNo', 3, 'instruction', 'Kısık ateşte pişirip servis edin.')))), 'TIME_MISMATCH'),
  '90 dk timer vs 30 dk declared -> TIME_MISMATCH');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object('steps', jsonb_build_array(
  jsonb_build_object('stepNo', 1, 'instruction', 'Tencerede zeytinyağını ısıtın.'),
  jsonb_build_object('stepNo', 2, 'instruction', 'Domatesleri ekleyin.')))), 'STEPS_THIN'),
  '2 steps -> STEPS_THIN');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object('steps', jsonb_build_array(
  jsonb_build_object('stepNo', 1, 'instruction', 'Tencerede zeytinyağını ısıtın.'),
  jsonb_build_object('stepNo', 2, 'instruction', 'Karıştırın.'),
  jsonb_build_object('stepNo', 3, 'instruction', 'Kısık ateşte pişirip servis edin.')))), 'STEPS_THIN'),
  '<15 char step -> STEPS_THIN');
-- UNIT_UNKNOWN = exactly "calculate_recipe_nutrition cannot turn this row into grams"
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('bilinmeyen baharat karışımı', null, null, 3, 'fincan')))), 'UNIT_UNKNOWN'),
  '3 fincan + unknown ingredient -> UNIT_UNKNOWN');
select pg_temp.assert(
  (select e->>'ingredientId' = 'i-tahin' from jsonb_array_elements(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
     'allergenLabels', jsonb_build_array('susam'),
     'ingredients', jsonb_build_array(pg_temp.ing('tahin', null, null, 1, 'fincan')))))) e
   where e->>'code' = 'UNIT_UNKNOWN'),
  'known ingredient (alias tahin -> tahini) with an unconvertible unit -> UNIT_UNKNOWN on that row');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('bilinmeyen sos', null, null, 2, null)))), 'UNIT_UNKNOWN'),
  'quantity without a unit -> UNIT_UNKNOWN');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('Oil, olive', null, null, 1, 'yemek kaşığı')))), 'NAME_FORMAT'),
  'USDA-style name -> NAME_FORMAT');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('sarimsak', null, null, 2, 'diş')))), 'NAME_FORMAT'),
  'ASCII Turkish sarimsak -> NAME_FORMAT');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('tuz', null, null, 1, 'tutam', null)))), 'CLASS_NULL'),
  'null ingredientClass -> CLASS_NULL');

-- Output ordering: kritik before uyari before bilgi
select pg_temp.assert(
  (select array_agg(e->>'severity' order by ord) = array['kritik', 'uyari', 'bilgi']
   from jsonb_array_elements(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
     'dietTags', jsonb_build_array('vejetaryen'),
     'ingredients', jsonb_build_array(pg_temp.ing('Tahin', null, null, 2, 'salkım')))))) with ordinality as x(e, ord)),
  'issues sorted kritik -> uyari -> bilgi');

-- =================================================================================================
-- YAKALAMAMALI
-- =================================================================================================

-- "baldo pirinç" vegan -> clean
select pg_temp.assert(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('vegan', 'vejetaryen', 'glutensiz'),
  'ingredients', jsonb_build_array(pg_temp.ing('baldo pirinç', null, null, 2, 'su bardağı'))))) = '[]'::jsonb,
  'baldo pirinç vegan -> clean');

-- "hindistan cevizi yağı" -> no agac-kuruyemisi
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('hindistan cevizi yağı', null, null, 1, 'yemek kaşığı')))), 'ALLERGEN_MISSING'),
  'hindistan cevizi yağı -> no ALLERGEN_MISSING');

-- "şekersiz badem sütü" vegan -> no diet conflict / no laktoz, but agac-kuruyemisi is required
select pg_temp.assert(
  (select array_agg(e->>'code' || ':' || coalesce(e->'suggestion'->>'addAllergen', '')) = array['ALLERGEN_MISSING:agac-kuruyemisi']
   from jsonb_array_elements(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
     'dietTags', jsonb_build_array('vegan', 'vejetaryen'),
     'ingredients', jsonb_build_array(pg_temp.ing('şekersiz badem sütü', null, null, 200, 'ml')))))) e),
  'şekersiz badem sütü vegan -> only agac-kuruyemisi missing');
select pg_temp.assert(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('vegan', 'vejetaryen'), 'allergenLabels', jsonb_build_array('agac-kuruyemisi'),
  'ingredients', jsonb_build_array(pg_temp.ing('şekersiz badem sütü', null, null, 200, 'ml'))))) = '[]'::jsonb,
  'şekersiz badem sütü vegan + agac-kuruyemisi -> clean');

-- "mısır nişastası" glutensiz -> clean
select pg_temp.assert(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('glutensiz'),
  'ingredients', jsonb_build_array(pg_temp.ing('mısır nişastası', null, null, 1, 'yemek kaşığı'))))) = '[]'::jsonb,
  'mısır nişastası glutensiz -> clean');

-- "tavuk baget" + firin -> no ocak warning
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'requiredEquipment', jsonb_build_array('firin'),
  'ingredients', jsonb_build_array(pg_temp.ing('tavuk baget', null, null, 8, 'adet')),
  'steps', jsonb_build_array(
    jsonb_build_object('stepNo', 1, 'instruction', 'Tavuk bagetleri baharatlarla ovun.'),
    jsonb_build_object('stepNo', 2, 'instruction', 'Tavukları fırın tepsisine dizin.'),
    jsonb_build_object('stepNo', 3, 'instruction', 'Önceden ısıtılmış fırında 40 dakika pişirin.')))), 'EQUIPMENT_CONFLICT'),
  'tavuk baget + firin -> no EQUIPMENT_CONFLICT');

-- "tel ızgarada soğutun" + firin -> no izgara warning
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'requiredEquipment', jsonb_build_array('firin'),
  'steps', jsonb_build_array(
    jsonb_build_object('stepNo', 1, 'instruction', 'Hamuru kalıba döküp düzeltin.'),
    jsonb_build_object('stepNo', 2, 'instruction', 'Fırında 35 dakika pişirin.'),
    jsonb_build_object('stepNo', 3, 'instruction', 'Keki tel ızgarada soğutun.')))), 'EQUIPMENT_CONFLICT'),
  'tel ızgarada soğutun + firin -> no EQUIPMENT_CONFLICT');

-- "yulaf" + note "glutensiz sertifikalı yulaf kullanın" + glutensiz -> clean
select pg_temp.assert(pg_temp.issues(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('glutensiz'),
  'ingredients', jsonb_build_array(pg_temp.ing('yulaf', 'yulaf', 'glutensiz sertifikalı yulaf kullanın', 1, 'su bardağı', 'tarimsal'))))) = '[]'::jsonb,
  'certified yulaf + glutensiz -> clean');

-- units su_bardagi and su bardağı -> no UNIT_UNKNOWN
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('su', null, null, 2, 'su_bardagi'), pg_temp.ing('sıcak su', null, null, 1, 'su bardağı')))), 'UNIT_UNKNOWN'),
  'su_bardagi / su bardağı -> no UNIT_UNKNOWN');

-- üzüm "1 salkım" resolves through crop_culinary_meta.conversion_hints (500 g) -> no UNIT_UNKNOWN
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('üzüm', 'üzüm', null, 1, 'salkım', 'tarimsal')))), 'UNIT_UNKNOWN'),
  'üzüm / salkım -> no UNIT_UNKNOWN');

-- Row excluded from nutrition (damla sakızı "2 parça", trace_flavoring_unquantified) -> no UNIT_UNKNOWN
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('damla sakızı', null, 'ezilmiş', 2, 'parça', 'platform_disi', null, 'trace_flavoring_unquantified')))), 'UNIT_UNKNOWN'),
  'excluded row -> no UNIT_UNKNOWN');

-- Alias-only resolution paths calculate_recipe_nutrition uses must not become false positives
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('toz şeker', null, null, 2, 'yemek kaşığı')))), 'UNIT_UNKNOWN'),
  'ingredient_nutrition_alias -> food (toz şeker / yemek kaşığı) -> no UNIT_UNKNOWN');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('taze nane', null, null, 1, 'demet')))), 'UNIT_UNKNOWN'),
  'ingredient_nutrition_alias -> crop (taze nane / demet) -> no UNIT_UNKNOWN');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('kırmızı mercimek', null, null, 1, 'bardak')))), 'UNIT_UNKNOWN'),
  'crop_culinary_meta.culinary_aliases -> crop (kırmızı mercimek / bardak) -> no UNIT_UNKNOWN');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'ingredients', jsonb_build_array(pg_temp.ing('ev yapımı tahin', null, null, 2, 'yemek kaşığı', 'platform_disi', 'tahini')))), 'UNIT_UNKNOWN'),
  'explicit nutritionFoodKey -> no UNIT_UNKNOWN');

-- Extra false-positive guards from the corpus
select pg_temp.assert(not public.fn_rq_matches(' hindistan cevizi yağı ', 'hindi'), 'hindistan is not hindi');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('vegan', 'vejetaryen'),
  'ingredients', jsonb_build_array(pg_temp.ing('hindistan cevizi yağı', null, null, 1, 'yemek kaşığı')))), 'DIET_CONFLICT_VEGAN'),
  'hindistan cevizi yağı is vegan');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'requiredEquipment', jsonb_build_array('blender'),
  'steps', jsonb_build_array(
    jsonb_build_object('stepNo', 1, 'instruction', 'Fındıkları blender veya mutfak robotuna alın.'),
    jsonb_build_object('stepNo', 2, 'instruction', 'Püre kıvamına gelene kadar çekin.'),
    jsonb_build_object('stepNo', 3, 'instruction', 'Kavanoza alıp buzdolabında saklayın.')))), 'EQUIPMENT_CONFLICT'),
  'blender veya mutfak robotu + blender -> no EQUIPMENT_CONFLICT');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'requiredEquipment', jsonb_build_array('firin', 'mutfak-robotu'),
  'steps', jsonb_build_array(
    jsonb_build_object('stepNo', 1, 'instruction', 'Fındıkları 180 derece fırında kavurun.'),
    jsonb_build_object('stepNo', 2, 'instruction', 'Mutfak robotunda pürüzsüz olana kadar çekin.'),
    jsonb_build_object('stepNo', 3, 'instruction', 'Kavanoza alıp oda sıcaklığında saklayın.')))), 'EQUIPMENT_CONFLICT'),
  'fırında kavurun + firin -> no ocak EQUIPMENT_CONFLICT');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'prepMinutes', 35, 'cookMinutes', 15, 'restMinutes', 360,
  'steps', jsonb_build_array(
    jsonb_build_object('stepNo', 1, 'instruction', 'Tencerede sütü kaynama noktasına getirin.', 'timerSeconds', 480),
    jsonb_build_object('stepNo', 2, 'instruction', 'Ocaktan alıp 15 dakika soğumaya bırakın.', 'timerSeconds', 900),
    jsonb_build_object('stepNo', 3, 'instruction', 'Derin dondurucuda 6 saat dondurun.', 'timerSeconds', null)))), 'TIME_MISMATCH'),
  'partially timed steps (timers < declared) -> no TIME_MISMATCH');
select pg_temp.assert(pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'prepMinutes', 60, 'cookMinutes', 60, 'restMinutes', 0,
  'steps', jsonb_build_array(
    jsonb_build_object('stepNo', 1, 'instruction', 'Tencerede zeytinyağını ısıtın.', 'timerSeconds', 120),
    jsonb_build_object('stepNo', 2, 'instruction', 'Domatesleri ekleyip karıştırın.', 'timerSeconds', 300),
    jsonb_build_object('stepNo', 3, 'instruction', 'Kısık ateşte pişirip servis edin.', 'timerSeconds', 600)))), 'TIME_MISMATCH'),
  'every step timed, 17 dk vs 120 dk -> TIME_MISMATCH');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('vegan', 'vejetaryen'),
  'ingredients', jsonb_build_array(pg_temp.ing('bal kabağı', null, null, 500, 'g')))), 'DIET_CONFLICT_VEGAN'),
  'bal kabağı is vegan');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('vegan', 'vejetaryen'),
  'ingredients', jsonb_build_array(pg_temp.ing('fındık kreması', null, null, 3, 'yemek kaşığı')))), 'DIET_CONFLICT_VEGAN'),
  'fındık kreması is vegan');
select pg_temp.assert(not pg_temp.has_issue(pg_temp.dq2_doc(jsonb_build_object(
  'dietTags', jsonb_build_array('glutensiz'),
  'ingredients', jsonb_build_array(pg_temp.ing('glutensiz yulaf ezmesi', 'yulaf', null, 1, 'su bardağı', 'tarimsal')))), 'DIET_CONFLICT_GLUTENSIZ'),
  'glutensiz yulaf ezmesi linked to crop yulaf is not a conflict');
select pg_temp.assert(pg_temp.issues('{}'::jsonb) is not null, 'empty document does not error');

-- =================================================================================================
-- Wrappers, view, fix RPCs
-- =================================================================================================

insert into public.recipes (id, slug, title, servings, prep_minutes, cook_minutes, rest_minutes, status, visibility,
                            diet_tags, allergen_labels, required_equipment, calories, cover_photo_url,
                            nutrition_source, nutrition_coverage_pct, allergens_reviewed, allergens_reviewed_at)
values
  ('00000000-0000-0000-0000-00000000d201', 'dq2-meze', 'Tahinli Meze', 4, 10, 0, 0, 'published', 'public',
   array['vegan', 'vejetaryen'], array[]::text[], array['ozel-ekipman-gerekmiyor'], 250,
   'https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/dq2-temiz-tarif-16x9.webp',
   'computed', 100, true, now()),
  ('00000000-0000-0000-0000-00000000d202', 'dq2-temiz', 'Temiz', 4, 10, 20, 0, 'published', 'public',
   array[]::text[], array[]::text[], array['ocak'], 300,
   'https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/dq2-temiz-tarif-16x9.webp',
   'computed', 100, true, now());

insert into public.recipe_ingredients (id, recipe_id, sort_order, crop, free_text_name, quantity, unit, ingredient_class)
values
  ('00000000-0000-0000-0000-00000000d211', '00000000-0000-0000-0000-00000000d201', 0, null, 'tahin', 3, 'yemek kaşığı', 'platform_disi'),
  ('00000000-0000-0000-0000-00000000d212', '00000000-0000-0000-0000-00000000d201', 1, null, 'salatalık', 1, 'adet', null),
  ('00000000-0000-0000-0000-00000000d221', '00000000-0000-0000-0000-00000000d202', 0, 'domates', null, 4, 'adet', 'tarimsal');

insert into public.recipe_steps (recipe_id, step_no, instruction)
select r, n, i from (values
  ('00000000-0000-0000-0000-00000000d201'::uuid, 1, 'Tahini limon suyuyla açın.'),
  ('00000000-0000-0000-0000-00000000d201'::uuid, 2, 'Salatalığı rendeleyip suyunu sıkın.'),
  ('00000000-0000-0000-0000-00000000d201'::uuid, 3, 'Hepsini karıştırıp servis edin.'),
  ('00000000-0000-0000-0000-00000000d202'::uuid, 1, 'Domatesleri yıkayıp doğrayın.'),
  ('00000000-0000-0000-0000-00000000d202'::uuid, 2, 'Tencerede on dakika pişirin.'),
  ('00000000-0000-0000-0000-00000000d202'::uuid, 3, 'Sıcak olarak servis edin.')
) v(r, n, i);

select pg_temp.assert(
  public.admin_recipe_quality_issues('00000000-0000-0000-0000-00000000d201') @> '[{"code":"ALLERGEN_MISSING","ingredientId":"00000000-0000-0000-0000-00000000d211"}]',
  'admin_recipe_quality_issues maps a stored recipe (ingredientId = recipe_ingredients.id)');
select pg_temp.assert(
  public.admin_recipe_quality_issues('00000000-0000-0000-0000-00000000d201') @> '[{"code":"CROP_UNLINKED","suggestion":{"setCrop":"salatalık"}}]',
  'admin_recipe_quality_issues: CROP_UNLINKED from stored rows');
select pg_temp.assert(public.admin_recipe_quality_issues('00000000-0000-0000-0000-00000000d202') = '[]'::jsonb,
  'clean stored recipe -> []');

-- nutrition_food_key / nutrition_exclusion_reason reach the checker from stored rows
insert into public.recipe_ingredients (id, recipe_id, sort_order, crop, free_text_name, quantity, unit, ingredient_class, nutrition_food_key, nutrition_exclusion_reason)
values
  ('00000000-0000-0000-0000-00000000d222', '00000000-0000-0000-0000-00000000d202', 1, null, 'ev yapımı tahin', 1, 'yemek kaşığı', 'platform_disi', 'tahini', null),
  ('00000000-0000-0000-0000-00000000d223', '00000000-0000-0000-0000-00000000d202', 2, null, 'damla sakızı', 2, 'parça', 'platform_disi', null, 'trace_flavoring_unquantified');
select pg_temp.assert(
  not (public.admin_recipe_quality_issues('00000000-0000-0000-0000-00000000d202') @> '[{"code":"UNIT_UNKNOWN"}]'),
  'stored food key + stored exclusion -> no UNIT_UNKNOWN, got ' || public.admin_recipe_quality_issues('00000000-0000-0000-0000-00000000d202')::text);
select pg_temp.assert(
  public.admin_recipe_quality_issues('00000000-0000-0000-0000-00000000d202') @> '[{"code":"ALLERGEN_MISSING","suggestion":{"addAllergen":"susam"}}]',
  'stored ev yapımı tahin still needs susam');
delete from public.recipe_ingredients where id in ('00000000-0000-0000-0000-00000000d222', '00000000-0000-0000-0000-00000000d223');
select pg_temp.assert(public.admin_recipe_quality_issues('00000000-0000-0000-0000-0000000000ff') is null,
  'unknown recipe -> null');

-- View: T10 columns intact + new counts (bilgi not counted in issue_count)
select pg_temp.assert(
  (select array_agg(attname::text order by attnum) from pg_attribute
   where attrelid = 'public.admin_recipe_quality_overview'::regclass and attnum > 0 and not attisdropped)
  = array['id', 'slug', 'title', 'status', 'visibility', 'created_at', 'has_equipment', 'nutrition_complete',
          'nutrition_source', 'nutrition_coverage_pct', 'nutrition_reference_version', 'allergens_reviewed_state',
          'allergens_reviewed', 'allergen_labels', 'ingredient_count', 'unresolved_ingredient_count',
          'quality_issues', 'critical_issue_count', 'warning_issue_count', 'issue_count'],
  'view keeps T10 columns in order and appends the 4 DQ-2 columns');
select pg_temp.assert(
  (select critical_issue_count = 1 and warning_issue_count = 1 and issue_count = 2
     and jsonb_array_length(quality_issues) = 3
   from public.admin_recipe_quality_overview where slug = 'dq2-meze'),
  'dq2-meze: 1 kritik (susam) + 1 uyari (crop) + 1 bilgi (class) -> issue_count 2');
select pg_temp.assert(
  (select issue_count = 0 and quality_issues = '[]'::jsonb from public.admin_recipe_quality_overview where slug = 'dq2-temiz'),
  'dq2-temiz: issue_count 0');

-- Draft wrapper: latest version wins; nutrition_preview.calories used
insert into public.recipe_drafts (job_id, version, title, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
                                  diet_tags, allergen_labels, required_equipment, ingredients, steps, nutrition_preview)
values
  ('00000000-0000-0000-0000-00000000d301', 1, 'v1', null, 4, 10, 20, 0, array['vegan'], array[]::text[], array['ocak'],
   '[]'::jsonb, '[]'::jsonb, null),
  ('00000000-0000-0000-0000-00000000d301', 2, 'Falafel', null, 4, 20, 15, 0, array['vegan', 'vejetaryen'], array['gluten']::text[], array['ocak'],
   jsonb_build_array(
     jsonb_build_object('crop', 'nohut', 'freeTextName', null, 'quantity', 250, 'unit', 'g', 'note', null, 'isKeyIngredient', true, 'ingredientClass', 'tarimsal', 'sortOrder', 0),
     jsonb_build_object('crop', null, 'freeTextName', 'tahin', 'quantity', 2, 'unit', 'yemek_kasigi', 'note', null, 'isKeyIngredient', false, 'ingredientClass', 'platform_disi', 'sortOrder', 1)),
   jsonb_build_array(
     jsonb_build_object('stepNo', 1, 'instruction', 'Nohutları bir gece suda bekletin.', 'photoUrl', null, 'timerSeconds', null),
     jsonb_build_object('stepNo', 2, 'instruction', 'Mutfak robotunda baharatlarla çekin.', 'photoUrl', null, 'timerSeconds', null),
     jsonb_build_object('stepNo', 3, 'instruction', 'Tavada kızgın yağda kızartın.', 'photoUrl', null, 'timerSeconds', null)),
   '{"calories": 1502.4, "source": "computed"}');

select pg_temp.assert(
  (select array_agg(e->>'code' order by e->>'code') from jsonb_array_elements(public.admin_recipe_draft_quality_issues('00000000-0000-0000-0000-00000000d301')) e)
  = array['ALLERGEN_MISSING', 'ALLERGEN_UNSUPPORTED', 'COVER_NOT_HERO', 'EQUIPMENT_CONFLICT', 'KCAL_OUTLIER'],
  'draft wrapper: latest version, calories from nutrition_preview, draft keys mapped; got ' ||
  coalesce(public.admin_recipe_draft_quality_issues('00000000-0000-0000-0000-00000000d301')::text, 'null'));
select pg_temp.assert(public.admin_recipe_draft_quality_issues('00000000-0000-0000-0000-0000000000ff') is null,
  'job without draft -> null');

-- admin_update_recipe_meta
select public.admin_update_recipe_meta('00000000-0000-0000-0000-00000000d202', 6, 15, 25, 5);
select pg_temp.assert(
  (select servings = 6 and prep_minutes = 15 and cook_minutes = 25 and rest_minutes = 5
   from public.recipes where id = '00000000-0000-0000-0000-00000000d202'),
  'admin_update_recipe_meta writes all four fields');

do $$
begin
  begin
    perform public.admin_update_recipe_meta('00000000-0000-0000-0000-00000000d202', 0, 1, 1, 1);
    raise exception 'expected servings CHECK violation';
  exception when check_violation then null;
  end;
  begin
    perform public.admin_update_recipe_meta('00000000-0000-0000-0000-00000000d202', 4, 1, 1, -1);
    raise exception 'expected ADMIN_UPDATE_META_INVALID_REST';
  exception when raise_exception then
    if sqlerrm not like 'ADMIN_UPDATE_META_INVALID_REST%' then raise; end if;
  end;
  begin
    perform public.admin_update_recipe_meta('00000000-0000-0000-0000-0000000000ff', 4, 1, 1, 1);
    raise exception 'expected ADMIN_UPDATE_META_NOT_FOUND';
  exception when raise_exception then
    if sqlerrm not like 'ADMIN_UPDATE_META_NOT_FOUND%' then raise; end if;
  end;
end;
$$;

-- admin_update_ingredient_nutrition: old 7-arg signature gone, new 8-arg one present
select pg_temp.assert(to_regprocedure('public.admin_update_ingredient_nutrition(uuid,text,text,numeric,text,text,text)') is null,
  'old 7-arg admin_update_ingredient_nutrition dropped');
select pg_temp.assert(to_regprocedure('public.admin_update_ingredient_nutrition(uuid,text,text,numeric,text,text,text,text)') is not null,
  'new 8-arg admin_update_ingredient_nutrition present');

-- Linking the crop -> tarimsal; note written
select public.admin_update_ingredient_nutrition('00000000-0000-0000-0000-00000000d212', 'salatalık', 'salatalık', 1, 'adet', null, null, 'rendelenmiş');
select pg_temp.assert(
  (select ingredient_class = 'tarimsal' and note = 'rendelenmiş' and crop = 'salatalık'
   from public.recipe_ingredients where id = '00000000-0000-0000-0000-00000000d212'),
  'crop set -> ingredient_class tarimsal, note written');

-- 7 named args (pre-redeploy caller) -> note untouched; crop null + existing class kept
select public.admin_update_ingredient_nutrition(
  p_ingredient_id => '00000000-0000-0000-0000-00000000d212', p_crop => null, p_free_text_name => 'salatalık',
  p_quantity => 1, p_unit => 'adet', p_nutrition_food_key => null, p_nutrition_exclusion_reason => null);
select pg_temp.assert(
  (select note = 'rendelenmiş' and ingredient_class = 'tarimsal' and crop is null
   from public.recipe_ingredients where id = '00000000-0000-0000-0000-00000000d212'),
  'p_note omitted -> note unchanged; crop null keeps existing class');

-- '' clears the note; crop null + null class -> platform_disi
update public.recipe_ingredients set ingredient_class = null where id = '00000000-0000-0000-0000-00000000d212';
select public.admin_update_ingredient_nutrition('00000000-0000-0000-0000-00000000d212', null, 'salatalık', 1, 'adet', null, null, '');
select pg_temp.assert(
  (select note is null and ingredient_class = 'platform_disi'
   from public.recipe_ingredients where id = '00000000-0000-0000-0000-00000000d212'),
  'empty note clears; crop null + null class -> platform_disi');

-- =================================================================================================
-- Grants
-- =================================================================================================
select pg_temp.assert(
  not has_function_privilege(r, f, 'execute'),
  format('%s must not execute %s', r, f))
from unnest(array['anon', 'authenticated']) r,
     unnest(array[
       'public.fn_recipe_quality_issues(jsonb)',
       'public.admin_recipe_quality_issues(uuid)',
       'public.admin_recipe_draft_quality_issues(uuid)',
       'public.admin_update_recipe_meta(uuid,int,int,int,int)',
       'public.admin_update_ingredient_nutrition(uuid,text,text,numeric,text,text,text,text)',
       'public.fn_rq_normalize(text)',
       'public.fn_rq_pattern(text,boolean)',
       'public.fn_rq_matches(text,text,text[],boolean)']) f;

select pg_temp.assert(
  has_function_privilege('service_role', f, 'execute'), format('service_role must execute %s', f))
from unnest(array[
  'public.fn_recipe_quality_issues(jsonb)',
  'public.admin_recipe_quality_issues(uuid)',
  'public.admin_recipe_draft_quality_issues(uuid)',
  'public.admin_update_recipe_meta(uuid,int,int,int,int)',
  'public.admin_update_ingredient_nutrition(uuid,text,text,numeric,text,text,text,text)']) f;

select pg_temp.assert(not has_table_privilege(r, 'public.recipe_quality_keyword_rules', 'select'),
  format('%s must not read recipe_quality_keyword_rules', r))
from unnest(array['anon', 'authenticated']) r;
select pg_temp.assert(not has_table_privilege(r, 'public.admin_recipe_quality_overview', 'select'),
  format('%s must not read admin_recipe_quality_overview', r))
from unnest(array['anon', 'authenticated']) r;
select pg_temp.assert(
  (select relrowsecurity from pg_class where oid = 'public.recipe_quality_keyword_rules'::regclass),
  'RLS enabled on recipe_quality_keyword_rules');
select pg_temp.assert(
  not exists (select 1 from pg_policies where tablename = 'recipe_quality_keyword_rules'),
  'no policies on recipe_quality_keyword_rules');

-- The view must also work inside a read-only transaction (PostgREST GETs run read-only).
begin read only;
select pg_temp.assert((select count(*) = 2 from public.admin_recipe_quality_overview), 'view readable in a read-only transaction');
commit;

\o
\echo 'DQ-2 assertions: all passed'
