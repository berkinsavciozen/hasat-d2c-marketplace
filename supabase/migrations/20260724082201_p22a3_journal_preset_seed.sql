-- P22-A devamı: crop-agnostic preset tema + bakım eylemi seed verisi (5 tema, 13 eylem)

with theme_sulama as (
  insert into journal_themes (name, icon, sort_order) values ('Sulama', '🚿', 1) returning id
),
theme_beslenme as (
  insert into journal_themes (name, icon, sort_order) values ('Beslenme', '🌱', 2) returning id
),
theme_hastalik as (
  insert into journal_themes (name, icon, sort_order) values ('Hastalık & Zararlı', '🪲', 3) returning id
),
theme_budama as (
  insert into journal_themes (name, icon, sort_order) values ('Budama & Bakım', '✂️', 4) returning id
),
theme_hasat as (
  insert into journal_themes (name, icon, sort_order) values ('Hasat Hazırlığı & Sonrası', '🌾', 5) returning id
)
insert into journal_entry_types (theme_id, farmer_id, crop, name, icon, default_frequency_days, is_preset, sort_order)
select id, null::uuid, null::text, 'Sulama Yap', '🚿', 3, true, 1 from theme_sulama
union all
select id, null::uuid, null::text, 'Toprak Nemi Kontrolü', '💧', 2, true, 2 from theme_sulama
union all
select id, null::uuid, null::text, 'Gübre Ver', '🌱', 14, true, 1 from theme_beslenme
union all
select id, null::uuid, null::text, 'Yaprak Gübresi Uygula', '🍃', 21, true, 2 from theme_beslenme
union all
select id, null::uuid, null::text, 'İlaçlama Yap', '🧴', null::int, true, 1 from theme_hastalik
union all
select id, null::uuid, null::text, 'Zararlı Gözlemi', '🔍', 7, true, 2 from theme_hastalik
union all
select id, null::uuid, null::text, 'Mantar Hastalığı Kontrolü', '🍄', 14, true, 3 from theme_hastalik
union all
select id, null::uuid, null::text, 'Budama Yap', '✂️', null::int, true, 1 from theme_budama
union all
select id, null::uuid, null::text, 'Yabani Ot Temizliği', '🌿', 14, true, 2 from theme_budama
union all
select id, null::uuid, null::text, 'Toprak Kazıma/Çapalama', '⛏️', 21, true, 3 from theme_budama
union all
select id, null::uuid, null::text, 'Hasat Öncesi Son Kontrol', '🔎', null::int, true, 1 from theme_hasat
union all
select id, null::uuid, null::text, 'Kurutma/İşleme Takibi', '🌬️', null::int, true, 2 from theme_hasat
union all
select id, null::uuid, null::text, 'Ayıklama/Sınıflandırma', '🗂️', null::int, true, 3 from theme_hasat;
