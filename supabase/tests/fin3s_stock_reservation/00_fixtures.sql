-- FIN-3-S — SQL test fixtures for 20260925143009_fin3s_stock_reservation_agreed_quantity.sql.
--
-- Reduced copies of the LIVE shapes in 20260917120000_baseline_consolidated_schema_2026-09-17.sql:
-- listings, harvest_entries, listing_harvest_entries, offers, offer_items (columns, enums, keys, the
-- offers/offer_items RLS policies the SECURITY INVOKER rpc_create_offer runs under), plus
-- platform_settings from 20260921110000_fin1_platform_settings.sql. The baseline bodies of
-- enforce_offer_stock (+ trg_enforce_offer_stock) and rpc_create_offer are copied VERBATIM below so
-- the migration replaces exactly what is live. run.sh then applies the real FIN-3 migration
-- (20260921124738) before the migration under test.
--
-- Run via supabase/tests/fin3s_stock_reservation/run.sh — never against a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase auth helpers, driven by the same GUCs PostgREST sets.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

-- Supabase's default privileges: new functions in public are executable by the API roles.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create type public.delivery_type as enum ('kargo-buyer', 'kargo-seller', 'elden');
create type public.listing_status as enum ('draft', 'active', 'sold', 'expired');
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'counter', 'completed', 'pending_farmer', 'pending_buyer');
create type public.unit_type as enum ('g', 'kg', 'L');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  commission_rate_bps integer not null default 0,
  commercial_terms_version text not null default 'v1',
  payment_mode text not null default 'iban'
);
insert into public.platform_settings (id, commission_rate_bps, commercial_terms_version, payment_mode)
values (1, 0, 'v1', 'iban');

create table public.harvest_entries (
  id uuid default gen_random_uuid() not null primary key,
  farmer_id uuid not null,
  crop text not null,
  quantity numeric(10,2) not null,
  unit public.unit_type default 'g'::public.unit_type not null
);

create table public.listings (
  id uuid default gen_random_uuid() not null primary key,
  farmer_id uuid not null,
  crop text not null,
  quantity numeric(10,2) not null,
  unit public.unit_type default 'g'::public.unit_type not null,
  price_per_unit numeric(12,2) not null,
  min_order numeric(10,2) default 1 not null,
  status public.listing_status default 'active'::public.listing_status not null,
  batch_name text
);

create table public.listing_harvest_entries (
  listing_id uuid not null references public.listings(id) on delete cascade,
  harvest_entry_id uuid not null references public.harvest_entries(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (listing_id, harvest_entry_id)
);

create table public.offers (
  id uuid default gen_random_uuid() not null primary key,
  buyer_id uuid not null,
  farmer_id uuid not null,
  listing_id uuid not null references public.listings(id) on delete cascade,
  quantity numeric(10,2) not null,
  price_per_unit numeric(12,2) not null,
  delivery public.delivery_type default 'kargo-buyer'::public.delivery_type not null,
  delivery_date date,
  note text,
  status public.offer_status default 'pending'::public.offer_status not null,
  counter_offer jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  negotiation_history jsonb default '[]'::jsonb not null,
  ball_side text default 'farmer'::text not null,
  current_price numeric,
  current_quantity numeric,
  payment_status text default 'unpaid'::text not null,
  subscription_id uuid,
  source_recipe_id uuid
);

create table public.offer_items (
  id uuid default gen_random_uuid() not null primary key,
  offer_id uuid not null references public.offers(id) on delete cascade,
  listing_id uuid not null references public.listings(id),
  quantity numeric not null,
  price_per_unit numeric not null,
  created_at timestamptz default now() not null
);

grant select on public.listings, public.harvest_entries, public.listing_harvest_entries, public.platform_settings to anon, authenticated;
grant select, insert, update, delete on public.offers, public.offer_items to anon, authenticated;
grant all on all tables in schema public to service_role;

alter table public.offers enable row level security;
alter table public.offer_items enable row level security;
create policy "Both parties update offer" on public.offers for update to public using (((auth.uid() = buyer_id) or (auth.uid() = farmer_id)));
create policy "Buyer reads own offers" on public.offers for select to public using ((auth.uid() = buyer_id));
create policy "Buyers insert offers" on public.offers for insert to public with check ((auth.uid() = buyer_id));
create policy "Farmer reads received offers" on public.offers for select to public using ((auth.uid() = farmer_id));
create policy "Buyer inserts own offer items" on public.offer_items for insert to authenticated with check ((exists ( select 1
   from offers o
  where ((o.id = offer_items.offer_id) and (o.buyer_id = auth.uid())))));
create policy "Parties read offer items" on public.offer_items for select to authenticated using ((exists ( select 1
   from offers o
  where ((o.id = offer_items.offer_id) and ((o.buyer_id = auth.uid()) or (o.farmer_id = auth.uid()))))));

create trigger trg_offers_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

-- ---- baseline enforce_offer_stock, verbatim ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_offer_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  items_count int;
  rec record;
  batch_total numeric;
  listing_qty numeric;
  base_stock numeric;
  reserved numeric;
  available numeric;
  requested numeric;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    SELECT count(*) INTO items_count FROM public.offer_items WHERE offer_id = NEW.id;

    IF items_count > 0 THEN
      -- Per-listing check across all offer_items rows (grouped by listing)
      FOR rec IN
        SELECT listing_id, SUM(quantity) AS requested_qty
        FROM public.offer_items
        WHERE offer_id = NEW.id
        GROUP BY listing_id
      LOOP
        SELECT COALESCE(SUM(he.quantity), 0), MAX(l.quantity)
          INTO batch_total, listing_qty
          FROM public.listings l
          LEFT JOIN public.listing_harvest_entries lhe ON lhe.listing_id = l.id
          LEFT JOIN public.harvest_entries he ON he.id = lhe.harvest_entry_id
          WHERE l.id = rec.listing_id
          GROUP BY l.id;

        base_stock := CASE WHEN batch_total > 0 THEN batch_total ELSE COALESCE(listing_qty, 0) END;

        SELECT COALESCE(SUM(oi.quantity), 0)
          INTO reserved
          FROM public.offer_items oi
          JOIN public.offers o ON o.id = oi.offer_id
          WHERE oi.listing_id = rec.listing_id
            AND o.status = 'accepted'
            AND o.id <> NEW.id;

        available := base_stock - reserved;
        IF rec.requested_qty > available THEN
          RAISE EXCEPTION 'Stok yetersiz (batch)';
        END IF;
      END LOOP;
    ELSE
      -- Legacy single-listing path (unchanged behaviour)
      SELECT COALESCE(SUM(he.quantity), 0), MAX(l.quantity)
        INTO batch_total, listing_qty
        FROM public.listings l
        LEFT JOIN public.listing_harvest_entries lhe ON lhe.listing_id = l.id
        LEFT JOIN public.harvest_entries he ON he.id = lhe.harvest_entry_id
        WHERE l.id = NEW.listing_id
        GROUP BY l.id;

      base_stock := CASE WHEN batch_total > 0 THEN batch_total ELSE COALESCE(listing_qty, 0) END;

      SELECT COALESCE(SUM(o.quantity), 0)
        INTO reserved
        FROM public.offers o
        WHERE o.listing_id = NEW.listing_id
          AND o.status = 'accepted'
          AND o.id <> NEW.id;

      requested := COALESCE(NEW.current_quantity, NEW.quantity);
      available := base_stock - reserved;

      IF requested > available THEN
        RAISE EXCEPTION 'Stok yetersiz';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_enforce_offer_stock BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION enforce_offer_stock();
revoke all on function public.enforce_offer_stock() from public, anon, authenticated;
grant execute on function public.enforce_offer_stock() to service_role;

-- ---- baseline rpc_create_offer, verbatim -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_offer(p_farmer_id uuid, p_items jsonb, p_delivery text DEFAULT 'kargo-buyer'::text, p_delivery_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_subscription_id uuid DEFAULT NULL::uuid, p_source_recipe_id uuid DEFAULT NULL::uuid)
 RETURNS offers
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_buyer_id uuid := auth.uid();
  v_offer public.offers;
  v_item jsonb;
  v_qty numeric;
  v_price numeric;
  v_listing_id uuid;
  v_total_qty numeric := 0;
  v_weighted_sum numeric := 0;
  v_primary_listing_id uuid;
  v_listing record;
  v_base_stock numeric;
  v_reserved numeric;
  v_available numeric;
begin
  if v_buyer_id is null then
    raise exception 'Oturum bulunamadı' using errcode = '28000';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'En az bir parti seçmelisiniz';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_listing_id := (v_item->>'listing_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price_per_unit')::numeric;

    if v_listing_id is null then
      raise exception 'listing_id zorunlu';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Miktar 0''dan büyük olmalı';
    end if;
    if v_price is null or v_price <= 0 then
      raise exception 'Fiyat 0''dan büyük olmalı';
    end if;

    select l.id, l.farmer_id, l.status, l.quantity, l.min_order,
      coalesce((
        select sum(he.quantity)
        from listing_harvest_entries lhe
        join harvest_entries he on he.id = lhe.harvest_entry_id
        where lhe.listing_id = l.id
      ), 0) as batch_total
    into v_listing
    from listings l
    where l.id = v_listing_id;

    if v_listing.id is null then
      raise exception 'İlan bulunamadı';
    end if;
    if v_listing.farmer_id <> p_farmer_id then
      raise exception 'İlan bu çiftçiye ait değil';
    end if;
    if v_listing.status <> 'active' then
      raise exception 'İlan artık aktif değil';
    end if;

    if v_qty < v_listing.min_order then
      raise exception 'Minimum sipariş miktarının altında (min: %)', v_listing.min_order;
    end if;

    v_base_stock := case when v_listing.batch_total > 0 then v_listing.batch_total else coalesce(v_listing.quantity, 0) end;

    select coalesce(sum(oi.quantity), 0) into v_reserved
    from offer_items oi
    join offers o on o.id = oi.offer_id
    where oi.listing_id = v_listing_id
      and o.status = 'accepted';

    v_available := v_base_stock - v_reserved;
    if v_qty > v_available then
      raise exception 'Stok yetersiz (batch)';
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_weighted_sum := v_weighted_sum + v_qty * v_price;
    if v_primary_listing_id is null then
      v_primary_listing_id := v_listing_id;
    end if;
  end loop;

  insert into public.offers (
    buyer_id, farmer_id, listing_id, quantity, price_per_unit,
    current_quantity, current_price, ball_side, payment_status,
    delivery, delivery_date, note, status, subscription_id, source_recipe_id
  ) values (
    v_buyer_id, p_farmer_id, v_primary_listing_id, v_total_qty, v_weighted_sum / v_total_qty,
    v_total_qty, v_weighted_sum / v_total_qty, 'farmer', 'unpaid',
    coalesce(p_delivery, 'kargo-buyer')::delivery_type, p_delivery_date, p_note, 'pending',
    p_subscription_id, p_source_recipe_id
  )
  returning * into v_offer;

  insert into public.offer_items (offer_id, listing_id, quantity, price_per_unit)
  select v_offer.id, (i->>'listing_id')::uuid, (i->>'quantity')::numeric, (i->>'price_per_unit')::numeric
  from jsonb_array_elements(p_items) i;

  return v_offer;
end;
$function$;
