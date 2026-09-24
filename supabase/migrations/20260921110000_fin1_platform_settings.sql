-- FIN-1: Pilot ticari gerçeklik tekilleştirme.
-- Tüm platform için tek satırlık global "ticari mod" konfigürasyonu.
-- orders/offers şemasına dokunulmaz (Berkin'in 2026-09-21 tarihli seçimi:
-- "Tek satırlık global config tablosu (Önerilen)"). Bu değerler ileride FIN-3'te
-- sipariş bazlı immutable snapshot ihtiyacı doğarsa ayrı bir migration ile
-- offers/orders'a taşınabilir; bu tablo pilot süresince tek kaynak-of-truth'tur.

create table public.platform_settings (
  id smallint primary key default 1,
  payment_mode text not null default 'direct_transfer',
  commission_rate_bps integer not null default 0,
  platform_collects_payment boolean not null default false,
  seller_payout_mode text not null default 'direct',
  commercial_terms_version text not null default 'pilot-v1',
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton check (id = 1),
  constraint platform_settings_commission_rate_bps_range check (commission_rate_bps >= 0 and commission_rate_bps <= 10000)
);

comment on table public.platform_settings is
  'FIN-1: pilot süresince tüm platform için geçerli tek satırlık ticari mod ayarları (komisyon, ödeme tahsilat modeli). Yazma yalnızca service_role; okuma herkese açık (frontend fiyat/komisyon metinlerini buradan türetebilir).';

insert into public.platform_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

create policy "Anyone can read platform settings"
  on public.platform_settings
  for select
  to public
  using (true);

-- Insert/update/delete için kasıtlı olarak public policy yok: yalnızca service_role
-- (RLS'yi bypass eder) bu satırı değiştirebilir. Bu, ticari şartların yalnızca
-- kontrollü bir backend/admin akışından değişebilmesini garanti eder.

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row
  execute function public.set_updated_at();
