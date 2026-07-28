-- P22-G: Rutin bakım "son yapılma / sıradaki / gecikmiş mi" hesabı DB'ye taşınıyor (kural #106) —
-- web ve mobil aynı view'ı okuyacak, hesap iki client'ta ayrı ayrı yazılmayacak.
create or replace view public.v_routine_maintenance_status
with (security_invoker = true) as
with prefs as (
  select
    fjp.id as pref_id,
    fjp.farmer_id,
    fjp.entry_type_id,
    fjp.threshold_note,
    coalesce(fjp.frequency_days, jet.default_frequency_days) as frequency_days,
    jet.crop as entry_type_crop,
    jet.name as entry_type_name,
    jet.icon as entry_type_icon,
    jet.work_type_key
  from public.farmer_journal_prefs fjp
  join public.journal_entry_types jet on jet.id = fjp.entry_type_id
  where fjp.is_active = true
),
exploded as (
  select
    pr.pref_id, pr.farmer_id, pr.entry_type_id, pr.threshold_note, pr.frequency_days,
    pr.entry_type_name, pr.entry_type_icon, pr.work_type_key,
    p.id as parcel_id, p.name as parcel_name, pc.crop
  from prefs pr
  join public.parcels p on p.farmer_id = pr.farmer_id
  cross join lateral unnest(
    case when pr.entry_type_crop is not null then array[pr.entry_type_crop] else p.crops end
  ) as pc(crop)
  where pr.entry_type_crop is null
     or exists (select 1 from unnest(p.crops) as c(crop) where lower(c.crop) = lower(pr.entry_type_crop))
),
last_done as (
  select journal_entry_type_id, parcel_id, crop, max(harvest_date) as last_performed_date
  from public.harvest_entries
  where journal_entry_type_id is not null
  group by journal_entry_type_id, parcel_id, crop
)
select
  e.pref_id,
  e.farmer_id,
  e.parcel_id,
  e.parcel_name,
  e.crop,
  e.entry_type_id,
  e.entry_type_name,
  e.entry_type_icon,
  e.work_type_key,
  e.frequency_days,
  e.threshold_note,
  ld.last_performed_date,
  case
    when ld.last_performed_date is not null and e.frequency_days is not null
    then ld.last_performed_date + e.frequency_days
    else null
  end as next_due_date,
  (ld.last_performed_date is null) as never_performed,
  (e.frequency_days is null) as is_event_based,
  case
    when ld.last_performed_date is null then false
    when e.frequency_days is null then false
    else (ld.last_performed_date + e.frequency_days) < current_date
  end as is_overdue
from exploded e
left join last_done ld
  on ld.journal_entry_type_id = e.entry_type_id
 and ld.parcel_id = e.parcel_id
 and ld.crop = e.crop;

grant select on public.v_routine_maintenance_status to authenticated;
