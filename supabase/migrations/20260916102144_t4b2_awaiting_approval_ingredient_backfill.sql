-- T4-B2 veri bakımı (2026-09-16): awaiting_approval'daki 6 gerçek job'u bloke eden eksik besin
-- referansı/alias/ölçü verisi. Tüm eklemeler ON CONFLICT DO NOTHING — hiçbir mevcut satır
-- değiştirilmedi/silinmedi. Değerler YAKLAŞIK/doğrulanmamış (notes alanında işaretli) — bkz.
-- proje dokümanı T4-Nutrition-Onay-Akisi-Bug-Teshis-ve-Spec-2026-09-16.md §8.

insert into public.ingredient_nutrition_reference
  (food_key, display_name, reference_source, reference_source_id, reference_version, reference_url,
   calories_kcal, protein_g, carbs_g, fat_g, fiber_g, notes)
values
  ('brown_sugar', 'Esmer şeker', 'usda', 'approx-2026-09-16', 'unverified',
   'https://fdc.nal.usda.gov/ (unverified - not queried live this turn)',
   380, 0, 98.09, 0, 0,
   'YAKLAŞIK DEĞER — canlı kaynak sorgusuyla doğrulanmadı, 2026-09-16-t4b2-review-required.'),
  ('clove_whole', 'Bütün karanfil', 'usda', 'approx-2026-09-16', 'unverified',
   'https://fdc.nal.usda.gov/ (unverified - not queried live this turn)',
   274, 5.97, 65.53, 13.0, 33.9,
   'YAKLAŞIK DEĞER — kuru/öğütülmüş karanfile yakın USDA değerleri, canlı kaynak sorgusuyla doğrulanmadı, 2026-09-16-t4b2-review-required.'),
  ('sage_fresh', 'Taze adaçayı yaprağı', 'usda', 'approx-2026-09-16', 'unverified',
   'https://fdc.nal.usda.gov/ (unverified - not queried live this turn)',
   40, 3.0, 7.0, 1.0, 4.0,
   'YAKLAŞIK DEĞER, DÜŞÜK GÜVEN — taze yapraklı baharat için genel bir tahmin (nane profiline yakın), canlı kaynak sorgusuyla doğrulanmadı, 2026-09-16-t4b2-review-required. Tarifte 6 yaprak (~2.4g) kullanıldığı için toplam besin etkisi ihmal edilebilir düzeyde.'),
  ('tahini', 'Tahin (susam ezmesi)', 'usda', 'approx-2026-09-16', 'unverified',
   'https://fdc.nal.usda.gov/ (unverified - not queried live this turn)',
   595, 17.0, 21.0, 53.76, 9.3,
   'YAKLAŞIK DEĞER — canlı kaynak sorgusuyla doğrulanmadı, 2026-09-16-t4b2-review-required.'),
  ('yogurt_strained_greek', 'Süzme yoğurt (Greek tipi)', 'usda', 'approx-2026-09-16', 'unverified',
   'https://fdc.nal.usda.gov/ (unverified - not queried live this turn)',
   97, 9.0, 3.6, 5.0, 0,
   'YAKLAŞIK DEĞER — canlı USDA/TÜRKOMP sorgusuyla doğrulanmadı, 2026-09-16-t4b2-review-required. Süzme yoğurt tam yağlı yoğurttan (yogurt_full_fat) belirgin farklı protein/karbonhidrat profili taşıdığı için ayrı satır olarak eklendi, alias''lanmadı.')
on conflict do nothing;

insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
values
  ('adaçayı yaprağı', 'food', 'sage_fresh', 'T4-B2 2026-09-16: yeni eklenen sage_fresh satirina baglandi.'),
  ('ceviz içi', 'crop', 'ceviz', 'T4-B2 2026-09-16: crop_culinary_meta.culinary_aliases icinde zaten vardi ama ingredient_nutrition_alias''ta karsiligi yoktu.'),
  ('deniz tuzu', 'food', 'table_salt', 'T4-B2 2026-09-16: deniz tuzu ve sofra tuzu besin degeri pratikte ayni.'),
  ('kahverengi şeker', 'food', 'brown_sugar', 'T4-B2 2026-09-16: yeni eklenen brown_sugar satirina baglandi.'),
  ('karanfil', 'food', 'clove_whole', 'T4-B2 2026-09-16: yeni eklenen clove_whole satirina baglandi.'),
  ('oda sıcaklığında tereyağı', 'food', 'butter_salted', 'T4-B2 2026-09-16: ayni urun, sicaklik notu eklenmis serbest metin varyasyonu.'),
  ('süzme yoğurt', 'food', 'yogurt_strained_greek', 'T4-B2 2026-09-16: yeni eklenen ayri besin satirina baglandi.'),
  ('tahin', 'food', 'tahini', 'T4-B2 2026-09-16: yeni eklenen tahini satirina baglandi.'),
  ('tarçın çubuğu', 'food', 'cinnamon_ground', 'T4-B2 2026-09-16: cubuk tarcin ile toz tarcinin besin degeri ~ayni.')
on conflict do nothing;

insert into public.ingredient_measure_reference
  (target_kind, target_key, normalized_unit, grams_per_unit, reference_source, reference_source_id, reference_version, notes)
values
  ('food', 'brown_sugar', 'yemek kaşığı', 13, 'usda', 'approx-2026-09-16', 'unverified', 'Sikistirilmis esmer seker 1 yemek kasigi ~13g, YAKLASIK DEGER.'),
  ('crop', 'ceviz', 'su bardağı', 100, 'usda', 'approx-2026-09-16', 'unverified', 'crop_culinary_meta.conversion_hints''teki "bardak"=100g ile tutarli.'),
  ('food', 'cinnamon_ground', 'adet', 2.6, 'usda', 'approx-2026-09-16', 'unverified', 'Bir adet tarcin cubugu ~2.6g, YAKLASIK DEGER.'),
  ('food', 'clove_whole', 'adet', 0.15, 'usda', 'approx-2026-09-16', 'unverified', 'Bir adet karanfil ~0.15g, YAKLASIK DEGER.'),
  ('food', 'granulated_sugar', 'su bardağı', 200, 'usda', 'approx-2026-09-16', 'unverified', 'Mevcut "bardak"=200g satiriyla tutarli, farkli normalize edilen birim adi icin tekrar eklendi.'),
  ('crop', 'limon', 'adet', 58, 'usda', 'approx-2026-09-16', 'unverified', 'USDA standart: kabuksuz 1 orta boy limon ~58g.'),
  ('crop', 'limon', 'yemek kaşığı', 15, 'usda', 'approx-2026-09-16', 'unverified', 'Mevcut lemon_juice_raw/"yemek kasigi"=15g ile tutarli.'),
  ('crop', 'nane', 'yemek kaşığı', 3, 'usda', 'approx-2026-09-16', 'unverified', 'Mevcut "avuç"=6g ile tutarli, 1 yemek kasigi dogranmis nane ~3g.'),
  ('crop', 'pul_biber', 'yemek kaşığı', 5.5, 'usda', 'approx-2026-09-16', 'unverified', 'Kirik pul kirmizi biber hafif bir baharat, 1 yemek kasigi ~5.5g, YAKLASIK DEGER.'),
  ('food', 'sage_fresh', 'adet', 0.4, 'usda', 'approx-2026-09-16', 'unverified', 'Bir taze adacayi yapragi ~0.4g, YAKLASIK DEGER.'),
  ('food', 'tahini', 'yemek kaşığı', 15, 'usda', 'approx-2026-09-16', 'unverified', 'Standart tahin 1 yemek kasigi ~15g.')
on conflict do nothing;
