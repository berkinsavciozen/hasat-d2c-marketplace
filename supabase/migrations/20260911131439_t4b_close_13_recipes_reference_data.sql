
-- T4-B: 13 tarifin gerçek coverage'ını kapatmak için gereken yeni besin/ölçü referansları.
-- Tüm değerler USDA FoodData Central'a yakın yaklaşık/tipik değerlerdir (bu oturumun eğitim
-- verisinden derlenmiştir, canlı FDC sorgusuyla doğrulanmamıştır) — review-required olarak
-- etiketlenmiştir, D15-D38 emsaliyle tutarlı.

insert into ingredient_nutrition_reference
  (food_key, display_name, reference_source, reference_source_id, reference_version, reference_url,
   calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, vitamin_c_mg, vitamin_a_mcg_rae, notes)
values
 ('scallion_raw','Taze soğan (yeşil soğan), çiğ','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   32,1.83,7.34,0.19,2.6,16,276,72,1.48,18.8,50,'Yaklaşık USDA değerleri, doğrulanmadı — T4-B. Kuru soğan (soğan crop) ürününden ayrı bir ürün kararı.'),
 ('parsley_raw','Maydanoz, çiğ','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   36,2.97,6.33,0.79,3.3,56,554,138,6.20,133,421,'Yaklaşık USDA değerleri, doğrulanmadı — T4-B.'),
 ('maple_syrup','Akçaağaç şurubu','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   260,0.04,67.04,0.06,0,12,212,102,0.11,0,0,'Yaklaşık USDA değerleri, doğrulanmadı — T4-B.'),
 ('coconut_oil','Hindistan cevizi yağı','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   862,0,0,100,0,0,0,0,0.04,0,0,'Yaklaşık USDA değerleri, doğrulanmadı — T4-B.'),
 ('cocoa_powder_unsweetened','Kakao tozu, şekersiz','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   228,19.6,57.9,13.7,37,21,1524,128,13.86,0,2,'Yaklaşık USDA değerleri, doğrulanmadı — T4-B.'),
 ('bulgur_dry','Bulgur, kuru','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   342,12.29,75.9,1.33,18.3,17,410,18,2.47,0,1,'Yaklaşık USDA değerleri, doğrulanmadı — T4-B.'),
 ('chili_flakes_red','Pul biber (kurutulmuş kırmızı biber)','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   318,12.01,56.63,17.27,27.2,30,2014,148,7.80,76.4,2081,'USDA "pepper, red or cayenne" yakınsaması, doğrulanmadı — T4-B.'),
 ('tomato_paste','Domates salçası','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   82,4.32,18.91,0.47,4.1,59,1014,36,2.98,21.8,76,'Tuzsuz USDA baz değeri; ev yapımı/ticari tuz içeriği değişebilir — T4-B.'),
 ('green_peas_raw','Bezelye, çiğ','editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/',
   81,5.42,14.45,0.4,5.7,5,244,25,1.47,40,38,'Taze/dondurulmuş bezelye için çiğ ürün kararı — T4-B.')
on conflict (food_key) do nothing;

insert into ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
values
 ('taze soğan','food','scallion_raw','T4-B: yeşil soğan, kuru soğan crop''ından farklı ürün.'),
 ('maydanoz','food','parsley_raw','T4-B: yeni eklenen maydanoz besin verisi.'),
 ('limon suyu','food','lemon_juice_raw','T4-B: mevcut lemon_juice_raw''a bağlanan ek serbest-metin varyantı ("taze limon suyu" değil).'),
 ('un','food','wheat_flour_ap','T4-B: belirsiz "un" için D05 emsaliyle tutarlı beyaz buğday unu kararı.'),
 ('baldo pirinç','food','rice_white_longgrain_raw','T4-B: D01 emsaliyle tutarlı, standart beyaz pirinç kararı.'),
 ('pirinç','food','rice_white_longgrain_raw','T4-B: standart beyaz pirinç kararı.'),
 ('sıcak su veya sebze suyu','food','water','T4-B: su ağırlıklı sıvı, sebze suyu ayrımı ihmal edilebilir kabul edildi.'),
 ('sıcak su','food','water','T4-B.'),
 ('bezelye (taze veya dondurulmuş)','food','green_peas_raw','T4-B: yeni eklenen bezelye besin verisi.'),
 ('doğal akçaağaç şurubu','food','maple_syrup','T4-B: yeni eklenen akçaağaç şurubu besin verisi.'),
 ('hindistan cevizi yağı','food','coconut_oil','T4-B: yeni eklenen hindistan cevizi yağı besin verisi.'),
 ('kakao tozu','food','cocoa_powder_unsweetened','T4-B.'),
 ('kakao','food','cocoa_powder_unsweetened','T4-B: "kakao tozu" ile aynı ürün, farklı serbest-metin.'),
 ('ince bulgur','food','bulgur_dry','T4-B: yeni eklenen bulgur besin verisi.'),
 ('pul biber','food','chili_flakes_red','T4-B: yeni eklenen pul biber besin verisi.'),
 ('domates salçası','food','tomato_paste','T4-B: yeni eklenen domates salçası besin verisi.'),
 ('taze nane','crop','nane','T4-B: mevcut "taze nane yaprağı" aliasından farklı serbest-metin, aynı crop.'),
 ('soğan','crop','soğan','T4-B: mevcut "sogan" (ascii) aliasının diyakritikli hâli eksikti.'),
 ('sarımsak','crop','sarımsak','T4-B: mevcut "sarimsak" (ascii) aliasının diyakritikli hâli eksikti.')
on conflict (normalized_alias) do nothing;

insert into ingredient_measure_reference
  (target_kind, target_key, normalized_unit, grams_per_unit, reference_source, reference_source_id, reference_version, reference_url, notes)
values
 ('food','zucchini_raw','adet',196,'usda','FDC-medium-zucchini','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','Orta boy kabak; mevcut "orta boy"=196g kaydıyla tutarlı.'),
 ('food','rice_white_longgrain_raw','su bardağı',180,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','200 ml Türk su bardağı için pirinç yoğunluk kararı.'),
 ('food','rice_white_longgrain_raw','bardak',180,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','"bardak" ve "su bardağı" ayrı normalized_unit anahtarları, aynı değer.'),
 ('food','bulgur_dry','su bardağı',170,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','200 ml bardak için kuru bulgur yoğunluk kararı.'),
 ('food','bulgur_dry','bardak',170,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','"bardak" ve "su bardağı" ayrı anahtarlar, aynı değer.'),
 ('food','black_pepper','tatlı kaşığı',4.6,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','Mevcut çay kaşığı=2.3g''nin 2 katı Türk mutfağı kararı.'),
 ('food','granulated_sugar','tatlı kaşığı',8,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','2 çay kaşığı hacmi kararı.'),
 ('food','granulated_sugar','yemek kaşığı',12.5,'usda','FDC-tbsp-sugar','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','1 yemek kaşığı toz şeker.'),
 ('food','lemon_juice_raw','adet',48,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','"1 adet limon suyu" = bir limonun sıkılmış suyu kararı.'),
 ('food','scallion_raw','dal',15,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','Bir dal taze soğan (temizlenmiş) kararı.'),
 ('food','parsley_raw','demet',50,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','Ev mutfağı maydanoz demeti kararı.'),
 ('food','maple_syrup','yemek kaşığı',20,'usda','FDC-tbsp-maple-syrup','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','1 yemek kaşığı akçaağaç şurubu.'),
 ('food','coconut_oil','yemek kaşığı',13.6,'usda','FDC-tbsp-coconut-oil','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','1 yemek kaşığı hindistan cevizi yağı.'),
 ('food','cocoa_powder_unsweetened','yemek kaşığı',5.4,'usda','FDC-tbsp-cocoa','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','1 yemek kaşığı şekersiz kakao tozu.'),
 ('food','green_peas_raw','su bardağı',145,'usda','FDC-cup-peas','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','1 su bardağı çiğ bezelye.'),
 ('food','chili_flakes_red','tatlı kaşığı',3,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','Pul biber pul yoğunluğu, toz baharattan hafif kararı.'),
 ('food','tomato_paste','yemek kaşığı',16,'usda','FDC-tbsp-tomato-paste','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','1 yemek kaşığı domates salçası.'),
 ('food','rocket_raw','avuc',20,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','Bir avuç roka. Not: fn_nutrition_normalize_unit "avuç" gibi diyakritikli birimleri ascii girdiden üretmiyor, bu yüzden kasıtlı olarak ascii "avuc" anahtarı kullanıldı.'),
 ('food','wheat_flour_ap','bardak',130,'usda','FDC-cup-ap-flour','USDA-SR-Legacy-2018-04','https://fdc.nal.usda.gov/','1 su bardağı (200 ml) elenmemiş un kararı.'),
 ('crop','ceviz','cay bardagi',35,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','Çay bardağı (~60 ml), su bardağından küçük. Not: normalize_unit bu birimi diyakritiğe çevirmediği için ascii "cay bardagi" anahtarı kasıtlı.'),
 ('crop','nane','demet',30,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','Nane demeti; mevcut "avuç"=6g''den büyük porsiyon kararı.'),
 ('crop','kekik','tatlı kaşığı',2,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','crop_culinary_meta.conversion_hints''te kekik için tatlı kaşığı eksikti; çay kaşığı=1g''in 2 katı kararı.'),
 ('crop','sumak','yemek kaşığı',8,'editorial','claude-t4b-estimate','2026-09-11-t4b-review-required','https://fdc.nal.usda.gov/','crop_culinary_meta''ta sumak için hiç conversion_hints yoktu; toz baharat yemek kaşığı kararı.')
on conflict (target_kind, target_key, normalized_unit) do nothing;

-- Malzeme satırı düzeltmeleri (D01-D14 emsaliyle tutarlı, birim/crop bağlantı düzeltmeleri):
update recipe_ingredients set unit = 'adet'
where id in ('1f4b2328-1b2b-4129-98e1-0725f9c17c2b','7b8fafb1-178d-42dc-b080-9ee39ead5ea4');

update recipe_ingredients set crop = 'kekik'
where id = 'c93f566e-06bf-4735-b629-3ccd7973ff87';

update recipe_ingredients set nutrition_exclusion_reason = 'seasoning_to_taste_unquantified'
where id in ('5b8fff0d-0c85-451c-a70a-df7671babf23','4c6d5e69-73ef-4d04-94c3-fe0267fce9bd','fa458a3f-29ee-4aa5-b09a-74c2ad3b3dbf');
