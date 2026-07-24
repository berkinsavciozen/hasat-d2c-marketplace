-- P22-A (devamı, P22-B'nin ihtiyacı): çiftçinin hangi bakım eylemini takip ettiği + kendi sıklık tercihi

create table public.farmer_journal_prefs (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  entry_type_id uuid not null references public.journal_entry_types(id) on delete cascade,
  is_active boolean not null default true,
  frequency_days int,
  threshold_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farmer_id, entry_type_id)
);

create index farmer_journal_prefs_farmer_idx on public.farmer_journal_prefs(farmer_id);
create index farmer_journal_prefs_entry_type_idx on public.farmer_journal_prefs(entry_type_id);

alter table public.farmer_journal_prefs enable row level security;

create policy "Farmers CRUD own journal prefs"
  on public.farmer_journal_prefs for all
  to authenticated
  using (auth.uid() = farmer_id)
  with check (auth.uid() = farmer_id);

create trigger farmer_journal_prefs_set_updated_at
  before update on public.farmer_journal_prefs
  for each row execute function public.set_updated_at();
