-- F2-S18 nutrition-resolve panelinde greyfurt için crop_nutrition satırı eksikti; hiçbir admin
-- resolution kind'i (add_measure/alias_to_existing/new_reference) crop-tipli malzemeler için bu
-- tabloyu yazamıyor (refresh_draft_nutrition_preview crop-tipli malzemelerde yalnızca
-- crop_nutrition'a bakıyor, alias/food-key yolu crop null değilse hiç devreye girmiyor). Bu satır
-- o kapsam dışı yolu iş 6d87bd50-1ad5-42c2-a700-df7f4a8766ad için geçici olarak kapatmak üzere
-- elle eklendi — USDA yaklaşık değerler, canlı kaynakla doğrulanmadı.
insert into public.crop_nutrition
  (crop, reference_source, reference_source_id, reference_version, basis,
   calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, potassium_mg, vitamin_c_mg, notes)
values
  ('greyfurt', 'usda', null, 'admin-manual-unverified-2026-09-21', 'per_100g',
   42, 0.77, 10.66, 0.14, 1.6, 0, 148, 31.2,
   'ADMIN GİRİŞİ — canlı kaynakla doğrulanmadı, 2026-09-21 — bkz. FIN-1-Borc-Sweep dokümanındaki not / Claude Cowork oturumu.')
on conflict (crop) do nothing;