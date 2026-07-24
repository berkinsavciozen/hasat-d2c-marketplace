-- P22-A: Care Journal schema (4 tables)
-- journal_themes, journal_entry_types, crop_journal_glossary, care_journal_entries

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create table public.journal_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  sort_order int not null default 0,
  crop text references public.crop_config(crop),
  created_at timestamptz not null default now()
);

create index journal_themes_crop_idx on public.journal_themes(crop);

alter table public.journal_themes enable row level security;

create policy "Public read journal_themes"
  on public.journal_themes for select
  to anon, authenticated
  using (true);


create table public.journal_entry_types (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.journal_themes(id) on delete cascade,
  farmer_id uuid references public.profiles(id) on delete cascade,
  crop text references public.crop_config(crop),
  name text not null,
  icon text,
  default_frequency_days int,
  is_preset boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint journal_entry_types_preset_farmer_chk
    check ((is_preset and farmer_id is null) or (not is_preset and farmer_id is not null))
);

create index journal_entry_types_theme_idx on public.journal_entry_types(theme_id);
create index journal_entry_types_farmer_idx on public.journal_entry_types(farmer_id);
create index journal_entry_types_crop_idx on public.journal_entry_types(crop);

alter table public.journal_entry_types enable row level security;

create policy "Public read preset entry types"
  on public.journal_entry_types for select
  to anon, authenticated
  using (is_preset = true);

create policy "Farmers read own entry types"
  on public.journal_entry_types for select
  to authenticated
  using (auth.uid() = farmer_id);

create policy "Farmers CRUD own entry types"
  on public.journal_entry_types for all
  to authenticated
  using (auth.uid() = farmer_id)
  with check (auth.uid() = farmer_id and is_preset = false);


create table public.crop_journal_glossary (
  id uuid primary key default gen_random_uuid(),
  crop text not null references public.crop_config(crop) on delete cascade,
  term text not null,
  explanation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crop, term)
);

create index crop_journal_glossary_crop_idx on public.crop_journal_glossary(crop);

alter table public.crop_journal_glossary enable row level security;

create policy "Public read crop_journal_glossary"
  on public.crop_journal_glossary for select
  to anon, authenticated
  using (true);

create trigger crop_journal_glossary_set_updated_at
  before update on public.crop_journal_glossary
  for each row execute function public.set_updated_at();


create table public.care_journal_entries (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  parcel_id uuid not null references public.parcels(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  entry_type_id uuid not null references public.journal_entry_types(id) on delete restrict,
  crop text not null references public.crop_config(crop),
  performed_at date not null default current_date,
  note text,
  photo_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index care_journal_entries_farmer_idx on public.care_journal_entries(farmer_id);
create index care_journal_entries_parcel_idx on public.care_journal_entries(parcel_id);
create index care_journal_entries_listing_idx on public.care_journal_entries(listing_id);
create index care_journal_entries_entry_type_idx on public.care_journal_entries(entry_type_id);
create index care_journal_entries_crop_idx on public.care_journal_entries(crop);

alter table public.care_journal_entries enable row level security;

create policy "Farmers CRUD own care journal entries"
  on public.care_journal_entries for all
  to authenticated
  using (auth.uid() = farmer_id)
  with check (auth.uid() = farmer_id);

create trigger care_journal_entries_set_updated_at
  before update on public.care_journal_entries
  for each row execute function public.set_updated_at();
