-- ORD-1 A — SQL test fixtures for 20260925160000_ord1a_order_rpcs_and_guard.sql.
--
-- Reduced copies of the LIVE shapes in 20260917120000_baseline_consolidated_schema_2026-09-17.sql:
-- listings, harvest_entries, listing_harvest_entries, offers, offer_items, offer_messages, orders,
-- order_timeline, disputes, reviews, notifications (columns, enums, keys, checks, RLS policies,
-- Supabase-default table grants incl. anon), plus platform_settings (FIN-1). Baseline function bodies
-- are copied VERBATIM (extracted from the baseline file): get_my_role_for_offer,
-- enforce_offer_accept_turn, enforce_offer_transitions, enforce_offer_stock, rpc_create_offer,
-- generate_order_ref, notify_order_status, set_updated_at — with the baseline triggers, including
-- BOTH generate_order_ref triggers (the migration drops set_order_ref). dispatch_sms/dispatch_push
-- are stubs (they only log). run.sh then applies the real FIN-2, FIN-3 and FIN-3-S migrations before
-- the migration under test.
--
-- Run via supabase/tests/ord1_order_lifecycle/run.sh — never against a real project.

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

-- Supabase auth helpers, same definition as GoTrue's: request.jwt.claim.sub, else request.jwt.claims.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- Supabase's default privileges: new functions/tables in public are open to the API roles.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create type public.delivery_type as enum ('kargo-buyer', 'kargo-seller', 'elden');
create type public.listing_status as enum ('draft', 'active', 'sold', 'expired');
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'counter', 'completed', 'pending_farmer', 'pending_buyer');
create type public.order_status as enum ('preparing', 'shipped', 'delivered', 'disputed', 'completed', 'cancelled');
create type public.unit_type as enum ('g', 'kg', 'L');

CREATE SEQUENCE public.order_seq START WITH 1000 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807;

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
  source_recipe_id uuid,
  constraint offers_ball_side_check check ((ball_side = any (array['farmer'::text, 'buyer'::text]))),
  constraint offers_payment_status_check check ((payment_status = any (array['unpaid'::text, 'pending'::text, 'pending_transfer'::text, 'paid'::text])))
);

create table public.offer_items (
  id uuid default gen_random_uuid() not null primary key,
  offer_id uuid not null references public.offers(id) on delete cascade,
  listing_id uuid not null references public.listings(id),
  quantity numeric not null,
  price_per_unit numeric not null,
  created_at timestamptz default now() not null
);

create table public.offer_messages (
  id uuid default gen_random_uuid() not null primary key,
  offer_id uuid not null references public.offers(id) on delete cascade,
  sender_role text not null,
  sender_id uuid not null,
  price numeric,
  quantity numeric,
  note text,
  created_at timestamptz default now() not null,
  constraint offer_messages_sender_role_check check ((sender_role = any (array['farmer'::text, 'buyer'::text])))
);

create table public.orders (
  id uuid default gen_random_uuid() not null primary key,
  offer_id uuid not null references public.offers(id) on delete cascade,
  buyer_id uuid not null,
  farmer_id uuid not null,
  order_ref text not null,
  status public.order_status default 'preparing'::public.order_status not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  tracking_number text,
  carrier text,
  cancelled_at timestamptz,
  cancel_reason text,
  dispute_window_expires_at timestamptz,
  constraint orders_order_ref_key unique (order_ref)
);

create table public.order_timeline (
  id uuid default gen_random_uuid() not null primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  step text not null,
  label text not null,
  completed_at timestamptz,
  created_at timestamptz default now() not null
);

create table public.disputes (
  id uuid default gen_random_uuid() not null primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  opened_by uuid not null,
  reason text not null,
  evidence_photo_urls text[] default '{}'::text[] not null,
  status text default 'open'::text not null,
  resolution text,
  resolved_at timestamptz,
  window_expires_at timestamptz,
  created_at timestamptz default now() not null,
  constraint disputes_status_check check ((status = any (array['open'::text, 'resolved'::text])))
);

create table public.reviews (
  id uuid default gen_random_uuid() not null primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  reviewer_id uuid not null,
  reviewee_id uuid not null,
  reviewer_role text not null,
  rating integer not null,
  comment text,
  created_at timestamptz default now() not null,
  constraint reviews_order_id_reviewer_id_key unique (order_id, reviewer_id),
  constraint reviews_rating_check check (((rating >= 1) and (rating <= 5))),
  constraint reviews_reviewer_role_check check ((reviewer_role = any (array['farmer'::text, 'buyer'::text])))
);

create table public.notifications (
  id uuid default gen_random_uuid() not null primary key,
  user_id uuid,
  type text not null,
  title text not null,
  body text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- Stubs: the real dispatchers call pg_net; here they only log so tests can see they fired.
create table public.dispatch_log (user_id uuid, event text, created_at timestamptz default clock_timestamp());
create or replace function public.dispatch_sms(_user_id uuid, _event text, _message text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.dispatch_log (user_id, event) values (_user_id, 'sms:' || _event)
$$;
create or replace function public.dispatch_push(_user_id uuid, _event text, _title text, _message text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.dispatch_log (user_id, event) values (_user_id, 'push:' || _event)
$$;

-- ---- RLS policies, verbatim from the baseline ---------------------------------------------------
alter table public.offers enable row level security;
alter table public.offer_items enable row level security;
alter table public.offer_messages enable row level security;
alter table public.orders enable row level security;
alter table public.order_timeline enable row level security;
alter table public.disputes enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;

CREATE POLICY "Order parties can open disputes" ON public.disputes FOR INSERT TO authenticated WITH CHECK (((opened_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid())))))));
CREATE POLICY "Order parties can update own disputes" ON public.disputes FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Order parties can view own disputes" ON public.disputes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Buyer inserts own offer items" ON public.offer_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_items.offer_id) AND (o.buyer_id = auth.uid())))));
CREATE POLICY "Parties read offer items" ON public.offer_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_items.offer_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Parties can insert their own messages" ON public.offer_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_messages.offer_id) AND (((offer_messages.sender_role = 'buyer'::text) AND (o.buyer_id = auth.uid())) OR ((offer_messages.sender_role = 'farmer'::text) AND (o.farmer_id = auth.uid()))))))));
CREATE POLICY "Parties can read offer messages" ON public.offer_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_messages.offer_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Sender can delete own offer_messages" ON public.offer_messages FOR DELETE TO authenticated USING ((sender_id = auth.uid()));
CREATE POLICY "Both parties update offer" ON public.offers FOR UPDATE TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "Buyer reads own offers" ON public.offers FOR SELECT TO public USING ((auth.uid() = buyer_id));
CREATE POLICY "Buyers insert offers" ON public.offers FOR INSERT TO public WITH CHECK ((auth.uid() = buyer_id));
CREATE POLICY "Farmer reads received offers" ON public.offers FOR SELECT TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "Both parties read timeline" ON public.order_timeline FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_timeline.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Buyers insert order timeline" ON public.order_timeline FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_timeline.order_id) AND (o.buyer_id = auth.uid())))));
CREATE POLICY "Farmers insert order timeline" ON public.order_timeline FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = order_timeline.order_id) AND (orders.farmer_id = auth.uid())))));
CREATE POLICY "Both parties read their orders" ON public.orders FOR SELECT TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "Farmers insert orders on acceptance" ON public.orders FOR INSERT TO public WITH CHECK ((auth.uid() = farmer_id));
CREATE POLICY "Order parties can update their orders" ON public.orders FOR UPDATE TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id))) WITH CHECK (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "System inserts orders" ON public.orders FOR INSERT TO public WITH CHECK ((auth.uid() = buyer_id));
CREATE POLICY "Order parties can insert their review" ON public.reviews FOR INSERT TO authenticated WITH CHECK (((auth.uid() = reviewer_id) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = reviews.order_id) AND (o.status = ANY (ARRAY['delivered'::order_status, 'completed'::order_status])) AND (((reviews.reviewer_role = 'buyer'::text) AND (o.buyer_id = auth.uid()) AND (o.farmer_id = reviews.reviewee_id)) OR ((reviews.reviewer_role = 'farmer'::text) AND (o.farmer_id = auth.uid()) AND (o.buyer_id = reviews.reviewee_id))))))));
CREATE POLICY "Reviews are publicly readable" ON public.reviews FOR SELECT TO public USING (true);

-- ---- baseline functions, verbatim ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role_for_offer(offer_row offers)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() = offer_row.farmer_id THEN 'farmer'
    WHEN auth.uid() = offer_row.buyer_id THEN 'buyer'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_offer_accept_turn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_role text;
BEGIN
  -- Only guard transitions into 'accepted'
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    -- Skip enforcement for service_role / non-authenticated callers (admin paths)
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    my_role := public.get_my_role_for_offer(OLD);
    IF my_role IS NULL THEN
      RAISE EXCEPTION 'Bu teklif size ait değil';
    END IF;
    IF COALESCE(OLD.ball_side, 'farmer') <> my_role THEN
      RAISE EXCEPTION 'Sırada karşı taraf var, teklifi kabul edemezsiniz';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_offer_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  econ_changed boolean;
  turn_holder uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF OLD.payment_status = 'unpaid'
       AND NEW.payment_status = 'pending_transfer'
       AND uid = NEW.buyer_id
       AND OLD.status = 'accepted' THEN
      NULL;
    ELSIF OLD.payment_status = 'pending_transfer'
       AND NEW.payment_status = 'paid'
       AND uid = NEW.farmer_id THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Gecersiz odeme durumu gecisi: % -> %',
        OLD.payment_status, NEW.payment_status;
    END IF;
  END IF;

  econ_changed :=
       NEW.price_per_unit    IS DISTINCT FROM OLD.price_per_unit
    OR NEW.quantity          IS DISTINCT FROM OLD.quantity
    OR NEW.current_price     IS DISTINCT FROM OLD.current_price
    OR NEW.current_quantity  IS DISTINCT FROM OLD.current_quantity;

  IF econ_changed THEN
    IF COALESCE(OLD.ball_side,'farmer') = 'farmer' THEN
      turn_holder := OLD.farmer_id;
    ELSE
      turn_holder := OLD.buyer_id;
    END IF;

    IF NEW.status <> 'counter'
       OR OLD.status NOT IN ('pending','counter')
       OR uid <> turn_holder
       OR COALESCE(NEW.ball_side,'farmer') = COALESCE(OLD.ball_side,'farmer')
       OR NEW.ball_side NOT IN ('farmer','buyer') THEN
      RAISE EXCEPTION 'Fiyat/miktar yalnizca karsi teklif sirasinda ve sira sizdeyken degistirilebilir';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'pending' AND NEW.status IN ('counter','accepted','rejected'))
      OR (OLD.status = 'counter' AND NEW.status IN ('counter','accepted','rejected'))
    ) THEN
      RAISE EXCEPTION 'Gecersiz teklif durum gecisi: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.generate_order_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.order_ref := 'HT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_seq')::text, 4, '0');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  label text;
  body_text text;
  sms_event text;
  sms_message text;
begin
  if NEW.status <> OLD.status then
    case NEW.status
      when 'preparing' then
        label := 'Siparişiniz Hazırlanıyor';
        body_text := 'Siparişiniz hazırlanıyor, çok yakında kargoya verilecek.';
        sms_event := 'order_preparing';
        sms_message := 'Hasat: ' || body_text;
      when 'shipped' then
        label := 'Siparişiniz Kargoya Verildi';
        body_text := case
          when NEW.carrier is not null and NEW.tracking_number is not null
            then NEW.carrier || ' ile kargoya verildi. Takip no: ' || NEW.tracking_number
          when NEW.tracking_number is not null
            then 'Kargoya verildi. Takip no: ' || NEW.tracking_number
          else 'Siparişiniz kargoya verildi.'
        end;
        sms_event := 'order_shipped';
        sms_message := 'Hasat: ' || body_text;
      when 'delivered' then
        label := 'Siparişiniz Teslim Edildi';
        body_text := 'Siparişiniz teslim edildi. Bir sorun varsa itiraz penceresi içinde bildirebilirsiniz.';
        sms_event := 'order_delivered';
        sms_message := 'Hasat: Siparişiniz teslim edildi.';
      when 'cancelled' then
        label := 'Sipariş İptal Edildi';
        body_text := coalesce('İptal nedeni: ' || NEW.cancel_reason, 'Sipariş iptal edildi.');
        sms_event := 'order_cancelled';
        sms_message := 'Hasat: Siparişiniz iptal edildi.';
      when 'disputed' then
        label := 'Siparişte İhtilaf Açıldı';
        body_text := 'Bu sipariş için bir ihtilaf açıldı.';
        sms_event := 'dispute_opened';
        sms_message := 'Hasat: Siparişinizde bir ihtilaf açıldı.';
      when 'completed' then
        label := 'Sipariş Tamamlandı';
        body_text := 'Siparişiniz başarıyla tamamlandı. Bizi tercih ettiğiniz için teşekkürler.';
        sms_event := 'order_completed';
        sms_message := 'Hasat: ' || body_text;
      else
        label := 'Sipariş Durumu Güncellendi';
    end case;

    insert into notifications(user_id, type, title, body, related_id)
    values (NEW.buyer_id, 'order_status', label, body_text, NEW.id);

    -- İptal/ihtilaf her iki tarafı da ilgilendirir; çiftçiye de in-app bildirim gitsin.
    if NEW.status in ('cancelled', 'disputed') then
      insert into notifications(user_id, type, title, body, related_id)
      values (NEW.farmer_id, 'order_status', label, body_text, NEW.id);
    end if;

    if sms_event is not null then
      perform public.dispatch_sms(NEW.buyer_id, sms_event, sms_message);
      perform public.dispatch_push(NEW.buyer_id, sms_event, label, body_text);
      if NEW.status in ('cancelled', 'disputed') then
        perform public.dispatch_sms(NEW.farmer_id, sms_event, sms_message);
        perform public.dispatch_push(NEW.farmer_id, sms_event, label, body_text);
      end if;
    end if;
  end if;
  return NEW;
end;
$function$;

-- ---- baseline triggers, verbatim -------------------------------------------------------------
CREATE TRIGGER enforce_offer_accept_turn_trg BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION enforce_offer_accept_turn();
CREATE TRIGGER enforce_offer_transitions_trg BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION enforce_offer_transitions();
CREATE TRIGGER trg_enforce_offer_stock BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION enforce_offer_stock();
CREATE TRIGGER trg_offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_set_order_ref BEFORE INSERT ON public.orders FOR EACH ROW WHEN (((new.order_ref IS NULL) OR (new.order_ref = ''::text))) EXECUTE FUNCTION generate_order_ref();
CREATE TRIGGER set_order_ref BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION generate_order_ref();
CREATE TRIGGER trg_order_status AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION notify_order_status();

-- trg_offer_received / trg_offer_status / trg_offers_referral_qualification / trg_record_order_price_history
-- are AFTER triggers (notifications, referral, price history) that touch tables outside this fixture;
-- omitted. None of them writes offers/orders.

-- Baseline grant pattern for trigger functions (service_role only).
revoke all on function public.enforce_offer_accept_turn() from public, anon, authenticated;
revoke all on function public.enforce_offer_transitions() from public, anon, authenticated;
revoke all on function public.enforce_offer_stock() from public, anon, authenticated;
revoke all on function public.generate_order_ref() from public, anon, authenticated;
revoke all on function public.notify_order_status() from public, anon, authenticated;
grant execute on function public.enforce_offer_accept_turn(), public.enforce_offer_transitions(),
  public.enforce_offer_stock(), public.generate_order_ref(), public.notify_order_status() to service_role;
