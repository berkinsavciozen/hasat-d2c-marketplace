
insert into crop_nutrition (crop, reference_source, reference_source_id, reference_version, basis,
  calories_kcal, protein_g, carbs_g, fat_g, fiber_g, notes)
values (
  'sumak','usda','claude-t4b-estimate','2026-09-11-t4b-review-required','per_100g',
  200,4,50,4,13,
  'DÜŞÜK GÜVEN / DOĞRULANMADI: Sumak (kurutulmuş, öğütülmüş baharat) için bu oturumda birincil kaynak (USDA FDC veya TÜRKOMP) canlı sorgulanamadı; bu tahmini bir değerdir (reference_source=usda etiketi yaklaşıklık niyetiyle kondu, gerçek FDC kaydına karşı doğrulanmadı). Tarifte kullanılan miktar (2 yemek kaşığı ≈ 16 g) toplam porsiyon besin değerine küçük bir katkı yapar ama bu satır review-required kabul edilmeli, reference_version=2026-09-11-t4b-review-required ile filtrelenip bir sonraki turda gerçek kaynakla doğrulanmalı — T4-B.'
)
on conflict (crop) do nothing;
