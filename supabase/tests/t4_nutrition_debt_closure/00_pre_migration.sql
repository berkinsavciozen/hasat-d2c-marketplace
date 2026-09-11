alter table public.recipes add column status text not null default 'draft';
alter table public.recipes add column visibility text not null default 'private';
alter table public.recipe_ingredients add column note text;

insert into public.crop_config(crop,display_name,default_unit) values
 ('pul_biber','Pul biber','kg'),('anason','Anason','kg'),('ayva','Ayva','kg'),
 ('patates','Patates','kg'),('ceviz','Ceviz','kg'),('buğday','Buğday','kg'),('çeltik','Çeltik','kg'),
 ('limon','Limon','kg'),('yulaf','Yulaf','kg'),('havuç','Havuç','kg'),
 ('soğan','Soğan','kg'),('sarımsak','Sarımsak','kg'),('nane','Nane','kg');

insert into public.crop_culinary_meta(crop,conversion_hints) values
 ('pul_biber','{}'),('anason','{}'),('ayva','{}'),('patates','{}'),
 ('ceviz','{"bardak":100}'),('buğday','{"bardak":120}'),('çeltik','{}'),('limon','{}'),
 ('yulaf','{}'),('havuç','{}'),('soğan','{}'),('sarımsak','{}'),('nane','{}');

set role service_role;
insert into public.crop_nutrition
 (crop,reference_source,reference_source_id,reference_version,calories_kcal,protein_g,carbs_g,fat_g,fiber_g)
values
 ('domates','usda','test-domates','test-crop-v1',20,1,4,0,1),
 ('patates','usda','test-patates','test-crop-v1',77,2.05,17.49,.09,2.2),
 ('ceviz','usda','test-ceviz','test-crop-v1',654,15.23,13.71,65.21,6.7),
 ('yulaf','usda','test-yulaf','test-crop-v1',389,16.89,66.27,6.9,10.6),
 ('havuç','usda','test-havuc','test-crop-v1',41,.93,9.58,.24,2.8),
 ('soğan','usda','test-sogan','test-crop-v1',40,1.1,9.34,.1,1.7),
 ('sarımsak','usda','test-sarimsak','test-crop-v1',149,6.36,33.06,.5,2.1),
 ('nane','usda','test-nane','test-crop-v1',44,3.29,8.41,.73,6.8);
reset role;

insert into public.recipes(slug,title,servings,status,visibility)
select 'ready-sentinel-'||g,'Ready sentinel '||g,1,'published','public' from generate_series(1,18) g;
insert into public.recipe_ingredients(recipe_id,sort_order,crop,quantity,unit)
select id,1,'domates',100,'g' from public.recipes where slug like 'ready-sentinel-%';

insert into public.recipes(slug,title,servings,status,visibility) values
 ('anasonlu-damla-sakizli-ev-yapimi-dondurma','Dondurma',6,'published','public'),
 ('ayvali-firin-tavuk-sonbahara-merhaba','Tavuk',4,'published','public'),
 ('celtik-pilavi-geleneksel-ve-luks-sunum','Pilav',4,'published','public'),
 ('cevizli-biber-ezmesi-muhammara','Muhammara',6,'published','public'),
 ('cevizli-elmali-salata','Elmalı salata',4,'published','public'),
 ('cevizli-kurabiye','Kurabiye',10,'published','public'),
 ('eksi-mayali-tam-bugday-ekmegi','Ekmek',1,'published','public'),
 ('elmali-incirli-hafif-tatli-firinda','Tatlı',4,'published','public'),
 ('elmali-serinletici-smoothie-bireysel-hidratasyon','Smoothie',1,'published','public'),
 ('findikli-mevsim-salatasi','Mevsim salata',4,'published','public'),
 ('findikli-safranli-akdeniz-usulu-firin-patates','Fırın patates',4,'published','public'),
 ('firinda-patlican-musakka','Musakka',4,'published','public'),
 ('glutensiz-yulafli-sebzeli-borek','Börek',6,'published','public'),
 ('horeca-ya-ozel-soguk-anasonlu-limonata','Limonata',6,'published','public'),
 ('mercimek-corbasi','Çorba',4,'published','public'),
 ('taze-uzum-cevizli-yesil-salata','Yeşil salata',4,'published','public');

-- Production-shaped blockers, including every guarded correction row.
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'süt',1,'l' from recipes where slug='anasonlu-damla-sakizli-ev-yapimi-dondurma';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,4,null,'damla sakızı',2,'parça' from recipes where slug='anasonlu-damla-sakizli-ev-yapimi-dondurma';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,8,'limon',null,1,'yemek_kasigi' from recipes where slug='ayvali-firin-tavuk-sonbahara-merhaba';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,'çeltik',null,1.5,'su_bardagi' from recipes where slug='celtik-pilavi-geleneksel-ve-luks-sunum';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,4,null,'tavuk suyu veya su',2.5,'su_bardagi' from recipes where slug='celtik-pilavi-geleneksel-ve-luks-sunum';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'kırmızı biber salçası',2,'yemek kaşığı' from recipes where slug='cevizli-biber-ezmesi-muhammara';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'roka',1,'demet' from recipes where slug='cevizli-elmali-salata';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,2,'buğday',null,2,'bardak' from recipes where slug='cevizli-kurabiye';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,6,null,'vanilya',1,'adet' from recipes where slug='cevizli-kurabiye';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,'buğday',null,2.5,'bardak' from recipes where slug='eksi-mayali-tam-bugday-ekmegi';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,2,null,'ekşi maya',100,'g' from recipes where slug='eksi-mayali-tam-bugday-ekmegi';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'tereyağı',1,'yemek_kasigi' from recipes where slug='elmali-incirli-hafif-tatli-firinda';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,3,null,'bitkisel süt (badem, yulaf veya soya sütü)',120,'ml' from recipes where slug='elmali-serinletici-smoothie-bireysel-hidratasyon';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,2,null,'karışık mevsim yeşillikleri',100,'g' from recipes where slug='findikli-mevsim-salatasi';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'Patates',800,'g' from recipes where slug='findikli-safranli-akdeniz-usulu-firin-patates';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,6,null,'Tuz',null,null from recipes where slug='findikli-safranli-akdeniz-usulu-firin-patates';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,7,null,'Karabiber',null,null from recipes where slug='findikli-safranli-akdeniz-usulu-firin-patates';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,7,null,'kıyma',300,'g' from recipes where slug='firinda-patlican-musakka';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'yoğurt',1,'su_bardagi' from recipes where slug='glutensiz-yulafli-sebzeli-borek';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,2,null,'limon',4,'adet' from recipes where slug='horeca-ya-ozel-soguk-anasonlu-limonata';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,4,null,'su',1.5,'l' from recipes where slug='horeca-ya-ozel-soguk-anasonlu-limonata';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,6,null,'buz',null,null from recipes where slug='horeca-ya-ozel-soguk-anasonlu-limonata';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'su',1.5,'litre' from recipes where slug='mercimek-corbasi';
insert into public.recipe_ingredients(recipe_id,sort_order,crop,free_text_name,quantity,unit)
select id,1,null,'beyaz peynir',80,'g' from recipes where slug='taze-uzum-cevizli-yesil-salata';
