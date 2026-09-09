-- T4-A3 — migration: t4a3_crop_nutrition_seed_v1.sql
--
-- First real data for `crop_nutrition` (created empty by 20260904161000_t4a_crop_nutrition_
-- reference_table.sql, "out of scope: populating real reference data for ~70 crops"). Scope,
-- confirmed live against the Hasat project: `crop_config` holds 70 crops, but `recipe_ingredients`
-- today actually uses only 29 distinct crops (of 304 rows; the rest carry `free_text_name`,
-- off-platform ingredients that already go through the LLM-completion path instead). This migration
-- seeds 26 of those 29. The other 41 crop_config crops stay empty on purpose — a future recipe that
-- uses one of them will correctly show up as nutrition_source='partial' (or fully unavailable),
-- which is the calculation engine's designed behavior for an unseeded crop, not a bug.
--
-- Consciously left out of the 26 (real usage exists, but no reliable reference was found — not
-- fabricated):
--   * sumak    — USDA only has an unreliable/incomplete branded-food entry for it (most fields
--                empty). Left blank.
--   * çeltik   — unhulled/unprocessed rice, not a consumed food form; the `recipe_ingredients` row
--                that uses it likely has the wrong crop mapped (probably meant `pirinç`/`bulgur`).
--                Flagged for Berkin/F2 separately — this is another instance of the F2 crop-slug
--                finding, not something to silently "fix" by guessing a substitute crop here.
--   * pul_biber — Aleppo-style pepper flakes have no dedicated standard USDA entry; the closest
--                proxy (dried red pepper/paprika) was judged not reliable enough to stand in for it.
--                Left blank rather than publishing a guessed number.
--
-- Also flagged, not auto-"fixed": `buğday` below is seeded as whole wheat KERNEL (USDA hard red
-- winter wheat), because that is what `crop_config`/`crop_culinary_meta` name as the crop — but at
-- least one recipe (Görev bağlamındaki tarif) plausibly means bulgur or flour when it references
-- `buğday`. Same crop-slug-ambiguity family as `çeltik` above; not resolved here, left for F2/Berkin.
--
-- Values are USDA FoodData Central (SR Legacy) standard per-100g reference values, compiled this
-- round (2026-09-09) via WebSearch/WebFetch; two rows (safran, sumak) were additionally cross-
-- checked against a live source before sumak was ultimately dropped for reliability (see above).
-- This is a first-pass compilation, NOT yet field-by-field verified against TÜBER/USDA FDC IDs —
-- same "PROPOSED, NOT FINAL" discipline the crop_nutrition schema itself shipped under
-- (20260904161000's own header). reference_version is stamped 'v1-orchestrator-compiled-2026-09-09'
-- specifically so a later real TÜBER cross-check can tell which rows it has already reconciled.
--
-- CORRECTION vs. the dispatch's draft SQL: the draft used reference_source = 'usda_fdc' for every
-- row, which does not satisfy crop_nutrition's own
-- `check (reference_source = any (array['tuber','usda']))` constraint (20260904161000) and would
-- have made this entire migration fail to apply. Corrected to 'usda' below — no other value changed.

insert into public.crop_nutrition
  (crop, reference_source, reference_version, basis,
   calories_kcal, protein_g, carbs_g, fat_g, fiber_g,
   sodium_mg, potassium_mg, calcium_mg, iron_mg, vitamin_c_mg, vitamin_a_mcg_rae,
   notes)
values
  ('zeytinyağı','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 884,0,0,100,0, 2,1,1,0.56,0,0, 'Zeytinyağı, sıvı yağ — USDA SR Legacy standart.'),
  ('domates','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 18,0.88,3.89,0.2,1.2, 5,237,10,0.27,13.7,42, 'Domates, çiğ, olgun.'),
  ('biber','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 20,0.86,4.64,0.17,1.7, 3,175,10,0.34,80.4,18, 'Tatlı yeşil biber, çiğ — jenerik "biber" için temsili değer, kırmızı çeşit vitC bakımından daha yüksek olabilir.'),
  ('patlıcan','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 25,0.98,5.88,0.18,3, 2,229,9,0.23,2.2,1, 'Patlıcan, çiğ.'),
  ('ceviz','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 654,15.23,13.71,65.21,6.7, 2,441,98,2.91,1.3,1, 'Ceviz içi, çiğ.'),
  ('kekik','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 101,5.56,24.45,1.68,14, 9,609,405,17.45,160.1,238, 'Taze kekik. Kuru kekik değeri belirgin farklı (daha konsantre) — tarifler küçük miktar kullandığı için etkisi düşük ama not düşüldü.'),
  ('soğan','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 40,1.1,9.34,0.1,1.7, 4,146,23,0.21,7.4,0, 'Soğan, çiğ.'),
  ('fındık','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 628,14.95,16.7,60.75,9.7, 0,680,114,4.7,6.3,1, 'Fındık içi, çiğ.'),
  ('limon','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 29,1.1,9.32,0.3,2.8, 2,138,26,0.6,53,1, 'Limon, kabuksuz, çiğ.'),
  ('sarımsak','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 149,6.36,33.06,0.5,2.1, 17,401,181,1.7,31.2,0, 'Sarımsak, çiğ.'),
  ('safran','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 310,11.43,65.37,5.85,3.9, 148,1724,111,11.1,80.8,27, 'Safran baharatı — bu turda canlı kaynakla ayrıca çapraz kontrol edildi.'),
  ('incir','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 74,0.75,19.18,0.3,2.9, 1,232,35,0.37,2,7, 'İncir, çiğ.'),
  ('buğday','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 339,12.61,71.18,1.71,12.2, 2,431,34,3.6,0,0, 'Buğday tanesi (sert kırmızı kışlık) — tarifte bulgur/un kastediliyorsa ayrı bir crop_culinary_meta ayrımı gerekebilir, F2 crop-slug bulgusuyla aynı aile (bkz. dosya başlığı).'),
  ('nohut','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 378,20.47,62.95,6.04,12.2, 24,875,57,4.31,4,3, 'Nohut, kuru/çiğ tane — pişmiş/haşlanmış hâli daha düşük yoğunlukta, tarif adımı "haşlanmış nohut" diyorsa fonksiyon bunu bilmiyor, ileride pişirme-kaybı katsayısı eklenebilir.'),
  ('anason','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 337,17.6,50.02,15.9,14.6, 16,1441,646,36.96,21,3, 'Anason tohumu, baharat.'),
  ('üzüm','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 69,0.72,18.1,0.16,0.9, 2,191,10,0.36,3.2,3, 'Üzüm, çiğ.'),
  ('patates','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 77,2.05,17.49,0.09,2.2, 6,425,12,0.81,19.7,2, 'Patates, kabuklu, çiğ.'),
  ('elma','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 52,0.26,13.81,0.17,2.4, 1,107,6,0.12,4.6,3, 'Elma, kabuklu, çiğ.'),
  ('mercimek','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 353,24.63,63.35,1.06,10.7, 6,677,35,6.51,4.5,2, 'Mercimek, kuru/çiğ tane — nohut ile aynı pişirme-kaybı notu geçerli.'),
  ('nar','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 83,1.67,18.7,1.17,4, 3,236,10,0.3,10.2,0, 'Nar taneleri, çiğ.'),
  ('kimyon','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 375,17.81,44.24,22.27,10.5, 168,1788,931,66.36,7.7,64, 'Kimyon tohumu, baharat.'),
  ('yulaf','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 389,16.89,66.27,6.9,10.6, 2,429,54,4.72,0,0, 'Yulaf, kuru tane.'),
  ('ayva','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 57,0.4,15.3,0.1,1.9, 4,197,11,0.7,15,4, 'Ayva, çiğ.'),
  ('susam','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 573,17.73,23.45,49.67,11.8, 11,468,975,14.55,0,0, 'Susam tohumu, kabuklu, kuru.'),
  ('nane','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 44,3.29,8.41,0.73,6.8, 31,458,199,5.08,13.3,212, 'Taze nane yaprağı.'),
  ('havuç','usda','v1-orchestrator-compiled-2026-09-09','per_100g', 41,0.93,9.58,0.24,2.8, 69,320,33,0.3,5.9,835, 'Havuç, çiğ.')
on conflict (crop) do nothing;  -- zaten dolu bir satırın üzerine sessizce yazma
