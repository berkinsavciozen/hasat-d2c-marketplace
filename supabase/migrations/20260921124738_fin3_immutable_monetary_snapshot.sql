
-- FIN-3: immutable monetary snapshot on offers + offer_items.
-- Captures product identity (crop/unit) and commercial-terms version at the
-- moment of offer creation / acceptance, so later catalog edits (listings)
-- or platform_settings changes never retroactively alter what a buyer/farmer
-- see for an existing offer or order.

alter table public.offers
  add column if not exists snapshot_crop text,
  add column if not exists snapshot_unit text,
  add column if not exists snapshot_commission_rate_bps integer,
  add column if not exists snapshot_commercial_terms_version text,
  add column if not exists snapshot_payment_mode text,
  add column if not exists final_price_per_unit numeric,
  add column if not exists final_quantity numeric;

alter table public.offer_items
  add column if not exists snapshot_crop text,
  add column if not exists snapshot_unit text,
  add column if not exists snapshot_batch_name text;

-- Backfill existing rows (best-effort; see project doc for caveats: crop/unit
-- backfill uses CURRENT listings data since no historical value exists).
update public.offers o
set snapshot_crop = l.crop,
    snapshot_unit = l.unit::text
from public.listings l
where l.id = o.listing_id and o.snapshot_crop is null;

update public.offers o
set snapshot_commission_rate_bps = ps.commission_rate_bps,
    snapshot_commercial_terms_version = ps.commercial_terms_version,
    snapshot_payment_mode = ps.payment_mode
from public.platform_settings ps
where ps.id = 1 and o.snapshot_commission_rate_bps is null;

update public.offers
set final_price_per_unit = coalesce(current_price, price_per_unit),
    final_quantity = coalesce(current_quantity, quantity)
where status = 'accepted' and final_price_per_unit is null;

update public.offer_items oi
set snapshot_crop = l.crop,
    snapshot_unit = l.unit::text,
    snapshot_batch_name = l.batch_name
from public.listings l
where l.id = oi.listing_id and oi.snapshot_crop is null;

-- BEFORE INSERT: populate snapshot columns for every new offer.
create or replace function public.fn_snapshot_offer_on_insert()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_crop text;
  v_unit text;
  v_ps record;
begin
  select crop, unit::text into v_crop, v_unit from public.listings where id = new.listing_id;
  new.snapshot_crop := v_crop;
  new.snapshot_unit := v_unit;

  select commission_rate_bps, commercial_terms_version, payment_mode into v_ps
    from public.platform_settings where id = 1;
  new.snapshot_commission_rate_bps := v_ps.commission_rate_bps;
  new.snapshot_commercial_terms_version := v_ps.commercial_terms_version;
  new.snapshot_payment_mode := v_ps.payment_mode;

  return new;
end;
$$;

drop trigger if exists snapshot_offer_on_insert on public.offers;
create trigger snapshot_offer_on_insert
  before insert on public.offers
  for each row execute function public.fn_snapshot_offer_on_insert();

-- BEFORE UPDATE: capture the final agreed price/quantity exactly once, at the
-- moment status transitions into 'accepted', then guard all snapshot columns
-- (including final_price_per_unit/final_quantity once set) from further change.
create or replace function public.fn_guard_offer_snapshot_columns()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and old.final_price_per_unit is null then
    new.final_price_per_unit := coalesce(new.current_price, new.price_per_unit);
    new.final_quantity := coalesce(new.current_quantity, new.quantity);
  end if;

  if new.snapshot_crop is distinct from old.snapshot_crop
     or new.snapshot_unit is distinct from old.snapshot_unit
     or new.snapshot_commission_rate_bps is distinct from old.snapshot_commission_rate_bps
     or new.snapshot_commercial_terms_version is distinct from old.snapshot_commercial_terms_version
     or new.snapshot_payment_mode is distinct from old.snapshot_payment_mode then
    raise exception 'OFFERS_SNAPSHOT_IMMUTABLE: snapshot_* kolonları oluşturulduktan sonra değiştirilemez';
  end if;

  if old.final_price_per_unit is not null and new.final_price_per_unit is distinct from old.final_price_per_unit then
    raise exception 'OFFERS_FINAL_PRICE_IMMUTABLE: final_price_per_unit kabul anında bir kez set edilir, sonra değiştirilemez';
  end if;

  if old.final_quantity is not null and new.final_quantity is distinct from old.final_quantity then
    raise exception 'OFFERS_FINAL_QUANTITY_IMMUTABLE: final_quantity kabul anında bir kez set edilir, sonra değiştirilemez';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_offer_snapshot_columns on public.offers;
create trigger guard_offer_snapshot_columns
  before update on public.offers
  for each row execute function public.fn_guard_offer_snapshot_columns();

-- BEFORE INSERT: populate offer_items snapshot columns too (offer_items has
-- no UPDATE RLS policy at all, so once inserted these are already immutable
-- to clients).
create or replace function public.fn_snapshot_offer_item_on_insert()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_crop text;
  v_unit text;
  v_batch text;
begin
  select crop, unit::text, batch_name into v_crop, v_unit, v_batch
    from public.listings where id = new.listing_id;
  new.snapshot_crop := v_crop;
  new.snapshot_unit := v_unit;
  new.snapshot_batch_name := v_batch;
  return new;
end;
$$;

drop trigger if exists snapshot_offer_item_on_insert on public.offer_items;
create trigger snapshot_offer_item_on_insert
  before insert on public.offer_items
  for each row execute function public.fn_snapshot_offer_item_on_insert();
