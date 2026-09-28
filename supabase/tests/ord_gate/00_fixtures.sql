-- ORD-GATE — gate-specific fixtures, applied by run.sh ON TOP OF supabase/tests/ord1_order_lifecycle/
-- 00_fixtures.sql (offers / offer_items / offer_messages / orders / platform_settings ... + baseline
-- function bodies verbatim) and before FIN-2 / FIN-3 / FIN-3-S / ORD-1 A+B / ORD-GATE.
--
-- Adds the remaining live shapes the gate touches, reduced from
-- 20260917120000_baseline_consolidated_schema_2026-09-17.sql: profiles (FK target of the new tables),
-- recipes (FK target + visibility), harvest_subscriptions (+ enforce_subscription_buyer_role /
-- enforce_subscription_updates verbatim, baseline triggers and RLS policies), crop_requests +
-- recipe_rfq_links (Talep Et, RLS policies verbatim), and the two ON DELETE SET NULL foreign keys on
-- offers (subscription_id, source_recipe_id). Supabase default privileges (anon/authenticated ALL) are
-- already in effect from the ORD-1 fixture file, so every table here gets them, as on the live project.
-- trg_notify_subscription_changes / tg_crop_requests_notify_catalog_gap are AFTER notification triggers
-- that touch tables outside this fixture; omitted.
--
-- Accounts:
--   NB c1 normal buyer      NF f1 normal farmer (same ids as the ORD-1 fixture's buyer / farmer)
--   AB c3 allowlist buyer   AF f3 allowlist farmer
--   X  d1 third party       anon
-- The allowlist rows are inserted by 01_assertions.sql AFTER the migration (the migration inserts none).

create type public.user_role as enum ('farmer', 'buyer');
create type public.subscription_status as enum ('pending', 'active', 'paused', 'fulfilled', 'cancelled');

create table public.profiles (
  id uuid primary key,
  role public.user_role not null,
  name text
);

insert into public.profiles (id, role, name) values
  ('c0000000-0000-0000-0000-000000000001', 'buyer',  'NB'),
  ('c0000000-0000-0000-0000-000000000002', 'buyer',  'NB2 (ORD-1 buyer2)'),
  ('f0000000-0000-0000-0000-000000000001', 'farmer', 'NF'),
  ('c0000000-0000-0000-0000-000000000003', 'buyer',  'AB'),
  ('f0000000-0000-0000-0000-000000000003', 'farmer', 'AF'),
  ('d0000000-0000-0000-0000-000000000001', 'buyer',  'X');

create table public.recipes (
  id uuid default gen_random_uuid() not null primary key,
  slug text not null,
  title text not null,
  visibility text default 'private'::text not null,
  owner_id uuid
);

insert into public.recipes (id, slug, title, visibility, owner_id) values
  ('e0000000-0000-0000-0000-000000000001', 'public-recipe', 'Public', 'public', 'd0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'private-recipe', 'Private', 'private', 'd0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000003', 'source-recipe', 'Source', 'public', 'd0000000-0000-0000-0000-000000000001');

create table public.harvest_subscriptions (
  id uuid default gen_random_uuid() not null primary key,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  next_harvest_date date,
  estimated_qty numeric(10,2),
  volume_commitment numeric(10,2),
  price_lock boolean default false not null,
  locked_price numeric(12,2),
  locked_at timestamptz,
  status public.subscription_status default 'pending'::public.subscription_status not null,
  created_at timestamptz default now() not null,
  crop text,
  note text
);

alter table public.offers
  add constraint offers_source_recipe_id_fkey foreign key (source_recipe_id) references public.recipes(id) on delete set null,
  add constraint offers_subscription_id_fkey foreign key (subscription_id) references public.harvest_subscriptions(id) on delete set null;

create table public.crop_requests (
  id uuid default gen_random_uuid() not null primary key,
  requested_by uuid references public.profiles(id) on delete set null,
  crop_name_free_text text not null,
  note text,
  status text default 'pending'::text not null,
  created_at timestamptz default now() not null,
  quantity numeric,
  unit text,
  region text,
  target_date_start date,
  target_date_end date,
  target_price numeric,
  ingredient_class text
);

create table public.recipe_rfq_links (
  id uuid default gen_random_uuid() not null primary key,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  crop_request_id uuid not null references public.crop_requests(id) on delete cascade,
  created_at timestamptz default now() not null,
  constraint recipe_rfq_links_recipe_request_key unique (recipe_id, crop_request_id)
);

-- ---- RLS policies, verbatim from the baseline ---------------------------------------------------
alter table public.harvest_subscriptions enable row level security;
alter table public.crop_requests enable row level security;
alter table public.recipe_rfq_links enable row level security;
alter table public.recipes enable row level security;

CREATE POLICY "Both parties read subscriptions" ON public.harvest_subscriptions FOR SELECT TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "Buyers manage own subscriptions" ON public.harvest_subscriptions FOR ALL TO public USING ((auth.uid() = buyer_id)) WITH CHECK ((auth.uid() = buyer_id));
CREATE POLICY "Farmers respond to subscriptions" ON public.harvest_subscriptions FOR UPDATE TO authenticated USING ((auth.uid() = farmer_id)) WITH CHECK ((auth.uid() = farmer_id));
CREATE POLICY "own insert" ON public.crop_requests FOR INSERT TO authenticated WITH CHECK ((requested_by = auth.uid()));
CREATE POLICY "own select" ON public.crop_requests FOR SELECT TO authenticated USING ((requested_by = auth.uid()));
CREATE POLICY "recipe_rfq_links auth insert own request" ON public.recipe_rfq_links FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM crop_requests cr
  WHERE ((cr.id = recipe_rfq_links.crop_request_id) AND (cr.requested_by = auth.uid())))));
CREATE POLICY "recipe_rfq_links owner select" ON public.recipe_rfq_links FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM crop_requests cr
  WHERE ((cr.id = recipe_rfq_links.crop_request_id) AND (cr.requested_by = auth.uid())))));
-- recipes: reduced — public rows readable, owner manages own (enough for the FK/visibility checks).
CREATE POLICY "recipes public read" ON public.recipes FOR SELECT TO public USING ((visibility = 'public'::text) OR (owner_id = auth.uid()));
CREATE POLICY "recipes owner delete" ON public.recipes FOR DELETE TO authenticated USING ((owner_id = auth.uid()));

-- ---- baseline functions, verbatim ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_subscription_buyer_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.user_role;
BEGIN
  SELECT role INTO r FROM public.profiles WHERE id = NEW.buyer_id;
  IF r IS DISTINCT FROM 'buyer'::public.user_role THEN
    RAISE EXCEPTION 'harvest_subscriptions.buyer_id must reference a profile with role=buyer';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_subscription_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;

  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.farmer_id IS DISTINCT FROM OLD.farmer_id THEN
    RAISE EXCEPTION 'Abonelik sahipliği değiştirilemez';
  END IF;

  IF uid = OLD.buyer_id THEN
    IF NEW.volume_commitment IS DISTINCT FROM OLD.volume_commitment
       OR NEW.price_lock       IS DISTINCT FROM OLD.price_lock
       OR NEW.locked_price     IS DISTINCT FROM OLD.locked_price
       OR NEW.locked_at        IS DISTINCT FROM OLD.locked_at
       OR NEW.next_harvest_date IS DISTINCT FROM OLD.next_harvest_date
       OR NEW.estimated_qty    IS DISTINCT FROM OLD.estimated_qty THEN
      RAISE EXCEPTION 'Alıcı yalnızca aboneliği iptal edebilir';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Alıcı yalnızca cancelled durumuna geçebilir';
    END IF;
  ELSIF uid = OLD.farmer_id THEN
    IF NEW.volume_commitment IS DISTINCT FROM OLD.volume_commitment
       OR NEW.price_lock       IS DISTINCT FROM OLD.price_lock
       OR NEW.locked_price     IS DISTINCT FROM OLD.locked_price
       OR NEW.locked_at        IS DISTINCT FROM OLD.locked_at THEN
      RAISE EXCEPTION 'Ekonomik alanlar üretici tarafından değiştirilemez';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
           (OLD.status = 'pending' AND NEW.status IN ('active','cancelled'))
        OR (OLD.status = 'active'  AND NEW.status IN ('paused','fulfilled','cancelled'))
        OR (OLD.status = 'paused'  AND NEW.status IN ('active','cancelled'))
      ) THEN
        RAISE EXCEPTION 'Geçersiz abonelik durum geçişi: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ---- baseline triggers, verbatim -------------------------------------------------------------
CREATE TRIGGER trg_enforce_subscription_buyer_role BEFORE INSERT OR UPDATE OF buyer_id ON public.harvest_subscriptions FOR EACH ROW EXECUTE FUNCTION enforce_subscription_buyer_role();
CREATE TRIGGER trg_enforce_subscription_updates BEFORE UPDATE ON public.harvest_subscriptions FOR EACH ROW EXECUTE FUNCTION enforce_subscription_updates();
