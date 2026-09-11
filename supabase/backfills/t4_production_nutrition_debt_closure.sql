-- MANUAL BACKFILL — do not place in the automatic migration chain.
-- Run only after the migration and the rollback-only dry run have passed.
\set ON_ERROR_STOP on

-- A production commit is impossible until Berkin explicitly approves every decision listed in
-- docs/T4_PRODUCTION_NUTRITION_DEBT_CLOSURE.md. Dry-run mode is deliberately exempt because it
-- always rolls the transaction back.
\if :{?T4_ROLLBACK}
\else
  \if :{?BERKIN_T4_NUTRITION_DECISIONS_APPROVED}
    \if :BERKIN_T4_NUTRITION_DECISIONS_APPROVED
    \else
      \echo 'ERROR: Berkin approval gate is false; refusing T4 production backfill.'
      do $$ begin raise exception 'Berkin approval gate is false; refusing T4 production backfill'; end $$;
    \endif
  \else
    \echo 'ERROR: Berkin approval is required. Set BERKIN_T4_NUTRITION_DECISIONS_APPROVED=1 only after explicit approval.'
    do $$ begin raise exception 'Berkin approval is required before T4 production backfill'; end $$;
  \endif
\endif

begin;

create temporary table t4_nutrition_corrections(
  slug text,sort_order integer,expected_crop text,expected_name text,new_crop text,new_name text,
  new_quantity numeric,new_unit text,new_food_key text,new_exclusion text,rationale text
) on commit drop;

insert into t4_nutrition_corrections values
 ('celtik-pilavi-geleneksel-ve-luks-sunum',1,'çeltik',null,null,'pirinç, beyaz, uzun taneli, kuru',277.5,'g','rice_white_longgrain_raw',null,'Çeltik yenilebilir pirinç değildir; 1,5 bardak kuru uzun taneli pirinç kararı.'),
 ('celtik-pilavi-geleneksel-ve-luks-sunum',4,null,'tavuk suyu veya su',null,'su',500,'g','water',null,'Seçenekli girdi keyfi tavuk suyuna map edilmedi; açık su kararı.'),
 ('elmali-serinletici-smoothie-bireysel-hidratasyon',3,null,'bitkisel süt (badem, yulaf veya soya sütü)',null,'şekersiz badem sütü',120,'ml','almond_milk_unsweetened',null,'Belirsiz bitkisel süt için açık şekersiz badem sütü kararı.'),
 ('findikli-mevsim-salatasi',2,null,'karışık mevsim yeşillikleri',null,'roka',100,'g','rocket_raw',null,'Bileşik yeşillik yerine açık roka ürün kararı; reviewer onayı gerekir.'),
 ('cevizli-kurabiye',2,'buğday',null,null,'buğday unu',250,'g','wheat_flour_ap',null,'Not un diyor; buğday tanesi referansı semantik olarak yanlıştı.'),
 ('eksi-mayali-tam-bugday-ekmegi',1,'buğday',null,null,'tam buğday unu',300,'g','whole_wheat_flour',null,'Not tam buğday unu diyor; tane referansı kaldırıldı.'),
 ('cevizli-kurabiye',6,null,'vanilya',null,'vanilya özütü',1,'çay kaşığı','vanilla_extract',null,'Belirsiz adet yerine açık 1 çay kaşığı özüt kararı.'),
 ('firinda-patlican-musakka',7,null,'kıyma',null,'dana kıyma, %20 yağ, çiğ',300,'g','beef_ground_80_20_raw',null,'Kıyma türü/yağı açık ürün kararına dönüştürüldü.'),
 ('horeca-ya-ozel-soguk-anasonlu-limonata',2,null,'limon',null,'taze limon suyu',192,'g','lemon_juice_raw',null,'Not suyu sıkılmış diyor; dört limon için açık yenilebilir su ağırlığı.'),
 ('ayvali-firin-tavuk-sonbahara-merhaba',8,'limon',null,null,'taze limon suyu',15,'g','lemon_juice_raw',null,'Yemek kaşığı limon ifadesi meyve değil limon suyudur.'),
 ('anasonlu-damla-sakizli-ev-yapimi-dondurma',4,null,'damla sakızı',null,'damla sakızı',2,'parça',null,'trace_flavoring_unquantified','Kaynaklı gram ve makro yok; iz aroma girdisi açıkça coverage dışı.'),
 ('horeca-ya-ozel-soguk-anasonlu-limonata',6,null,'buz',null,'buz',null,null,null,'serving_only_unquantified','Servis buzu miktarsızdır; su referansıyla sessizce eşitlenmedi.'),
 ('findikli-safranli-akdeniz-usulu-firin-patates',6,null,'Tuz',null,'Tuz',null,null,null,'seasoning_to_taste_unquantified','Miktarsız damak tadına göre tuz açıkça coverage dışı.'),
 ('findikli-safranli-akdeniz-usulu-firin-patates',7,null,'Karabiber',null,'Karabiber',null,null,null,'seasoning_to_taste_unquantified','Miktarsız baharat açıkça coverage dışı.');

do $$
declare v_expected integer := 14; v_found integer; v_guarded integer;
begin
  select count(*) into v_found
  from t4_nutrition_corrections c join public.recipes r on r.slug=c.slug
  join public.recipe_ingredients ri on ri.recipe_id=r.id and ri.sort_order=c.sort_order;
  select count(*) into v_guarded
  from t4_nutrition_corrections c join public.recipes r on r.slug=c.slug
  join public.recipe_ingredients ri on ri.recipe_id=r.id and ri.sort_order=c.sort_order
  where (ri.crop is not distinct from c.expected_crop and ri.free_text_name is not distinct from c.expected_name)
     or exists(select 1 from public.recipe_ingredient_nutrition_backfill_audit a
       where a.migration_key='20260910120000_t4_production_nutrition_debt_closure' and a.ingredient_id=ri.id);
  if v_found<>v_expected or v_guarded<>v_expected then
    raise exception 'T4 backfill guard failed: expected %, found %, acceptable %',v_expected,v_found,v_guarded;
  end if;
end $$;

insert into public.recipe_ingredient_nutrition_backfill_audit
  (migration_key,ingredient_id,recipe_id,before_row,after_row,rationale)
select '20260910120000_t4_production_nutrition_debt_closure',ri.id,ri.recipe_id,
  jsonb_build_object('crop',ri.crop,'free_text_name',ri.free_text_name,'quantity',ri.quantity,'unit',ri.unit,
    'nutrition_food_key',ri.nutrition_food_key,'nutrition_exclusion_reason',ri.nutrition_exclusion_reason),
  jsonb_build_object('crop',c.new_crop,'free_text_name',c.new_name,'quantity',c.new_quantity,'unit',c.new_unit,
    'nutrition_food_key',c.new_food_key,'nutrition_exclusion_reason',c.new_exclusion),c.rationale
from t4_nutrition_corrections c join public.recipes r on r.slug=c.slug
join public.recipe_ingredients ri on ri.recipe_id=r.id and ri.sort_order=c.sort_order
where ri.crop is not distinct from c.expected_crop and ri.free_text_name is not distinct from c.expected_name
on conflict do nothing;

update public.recipe_ingredients ri
set crop=c.new_crop,free_text_name=c.new_name,quantity=c.new_quantity,unit=c.new_unit,
    nutrition_food_key=c.new_food_key,nutrition_exclusion_reason=c.new_exclusion
from t4_nutrition_corrections c join public.recipes r on r.slug=c.slug
where ri.recipe_id=r.id and ri.sort_order=c.sort_order
  and ri.crop is not distinct from c.expected_crop and ri.free_text_name is not distinct from c.expected_name;

-- Trigger wiring recalculates changed recipes. Recalculate all 34 once more so aliases/reference
-- additions also affect unchanged rows, and so the assertion observes one coherent snapshot.
select public.calculate_recipe_nutrition(r.id)
from public.recipes r where r.status='published' and r.visibility='public' order by r.id;

do $$
declare v_public integer; v_ready integer; v_bad text;
begin
  select count(*),count(*) filter(where nutrition_source='computed' and nutrition_coverage_pct=100)
    into v_public,v_ready from public.recipes where status='published' and visibility='public';
  select string_agg(slug,', ' order by slug) into v_bad from public.recipes
    where status='published' and visibility='public'
      and (nutrition_source is distinct from 'computed' or nutrition_coverage_pct is distinct from 100);
  if v_public<>34 or v_ready<>34 then
    raise exception 'T4 34/34 assertion failed: public=%, ready=%, bad=%',v_public,v_ready,v_bad;
  end if;
end $$;

\if :{?T4_ROLLBACK}
  rollback;
  \echo 'T4 dry run assertions passed; transaction rolled back.'
\else
  commit;
  \echo 'T4 backfill committed.'
\endif
