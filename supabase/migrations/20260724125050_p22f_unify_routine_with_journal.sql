-- P22-F: Rutin Bakım'ı günlükle (harvest_entries) birleştir — Berkin kararı:
-- "rutin bakım daki işler, günlükdeki işlerle aynı olmalı"

-- 1) journal_entry_types: mevcut 9 iş-tipi taksonomisine (journal-meta.ts WorkTypeKey) eşleme
alter table public.journal_entry_types
  add column work_type_key text not null default 'gozlem'
  check (work_type_key in ('sulama','gubreleme','dikim','budama','ilaclama','hasat','kurutma','distilasyon','gozlem'));

update public.journal_entry_types set work_type_key = 'sulama' where name = 'Sulama Yap';
update public.journal_entry_types set work_type_key = 'gubreleme' where name in ('Gübre Ver', 'Yaprak Gübresi Uygula');
update public.journal_entry_types set work_type_key = 'ilaclama' where name = 'İlaçlama Yap';
update public.journal_entry_types set work_type_key = 'budama' where name = 'Budama Yap';
update public.journal_entry_types set work_type_key = 'kurutma' where name = 'Kurutma/İşleme Takibi';
-- geri kalanlar (Toprak Nemi Kontrolü, Zararlı Gözlemi, Mantar Hastalığı Kontrolü, Yabani Ot Temizliği,
-- Toprak Kazıma/Çapalama, Hasat Öncesi Son Kontrol, Ayıklama/Sınıflandırma) default 'gozlem' olarak kalır.

-- 2) harvest_entries: hangi rutin bakım eyleminden (varsa) oluştuğunu işaretle
alter table public.harvest_entries
  add column journal_entry_type_id uuid references public.journal_entry_types(id) on delete set null;

create index harvest_entries_journal_entry_type_idx on public.harvest_entries(journal_entry_type_id);

-- 3) care_journal_entries artık gereksiz — hiç gerçek veri yok, kaldırılıyor.
drop trigger if exists care_journal_entries_set_updated_at on public.care_journal_entries;
drop table if exists public.care_journal_entries;
