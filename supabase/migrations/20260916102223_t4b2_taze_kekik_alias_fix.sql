-- T4-B2 ek düzeltme (2026-09-16, aynı gün, dosya 2'den birkaç dakika sonra): "taze kekik" serbest
-- metni crop_culinary_meta.culinary_aliases'ta zaten vardı (dal=1.5g conversion hint dahil) ama
-- ingredient_nutrition_alias tablosunda karşılığı yoktu. Ayrıca refresh_draft_nutrition_preview
-- fonksiyonuna miktar+birim ikisi de null olan (damak zevkine göre eklenen) malzemeleri coverage
-- hesabından sessizce hariç tutan küçük bir düzeltme eklendi — bu düzeltme dosya 1'deki (f2s17)
-- fonksiyon gövdesine zaten dahil edildi (bkz. dosya 1'in başındaki not), burada tekrar
-- CREATE OR REPLACE yapmaya gerek yok.

insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
values
  ('taze kekik', 'crop', 'kekik', 'T4-B2 2026-09-16 (ek): crop_culinary_meta.culinary_aliases icinde zaten vardi (dal=1.5g conversion hint dahil) ama ingredient_nutrition_alias''ta karsiligi yoktu.')
on conflict do nothing;
