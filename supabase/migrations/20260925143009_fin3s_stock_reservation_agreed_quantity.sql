-- FIN-3-S: stock reservation follows the AGREED quantity (Berkin decision: A).
--
-- Before this migration enforce_offer_stock had two blind paths:
--   * offer_items path: requested AND reserved came from offer_items.quantity, which a
--     counter-offer (web useCounterOffer, MCP respond_to_offer) never touches — so a
--     single-batch offer negotiated from 10 -> 12 still reserved 10;
--   * legacy path (no offer_items): reserved came from offers.quantity only.
--   The two paths never saw each other's reservations on the same listing.
--
-- After this migration there is ONE rule, public.fn_offer_effective_item_qty, used by
-- enforce_offer_stock (requested + reserved), rpc_create_offer (reserved) and
-- listing_stock_summary (reserved):
--   * 1 offer_items row   -> coalesce(final_quantity, current_quantity, quantity) on that row's listing
--   * 2+ offer_items rows -> sum(offer_items.quantity) for that listing (quantity is locked, see 5)
--   * 0 offer_items rows  -> coalesce(final_quantity, current_quantity, quantity) on offers.listing_id
--
-- Trigger order note: BEFORE UPDATE triggers on offers fire in name order.
-- guard_offer_snapshot_columns (sets final_quantity at acceptance) MUST fire before
-- trg_enforce_offer_stock (reads NEW.final_quantity). Neither trigger is renamed here;
-- supabase/tests/fin3s_stock_reservation pins the order.
--
-- Re-runnable: add column if not exists, create or replace, drop trigger if exists,
-- backfill only where null.

-- ---------------------------------------------------------------------------------------------
-- 1. offers.initial_price_per_unit / initial_quantity: what the buyer first asked for.
-- ---------------------------------------------------------------------------------------------
alter table public.offers
  add column if not exists initial_price_per_unit numeric,
  add column if not exists initial_quantity numeric;

-- Backfill. negotiation_history[0] is the snapshot useCounterOffer took of the row BEFORE the
-- first counter, i.e. the original ask; without history the current columns are still the
-- original ask (no counter ever happened). Non-numeric history values fall back per column.
update public.offers o
set initial_quantity = coalesce(
      case when (o.negotiation_history->0->>'quantity') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
           then (o.negotiation_history->0->>'quantity')::numeric end,
      o.quantity),
    initial_price_per_unit = coalesce(
      case when (o.negotiation_history->0->>'pricePerUnit') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
           then (o.negotiation_history->0->>'pricePerUnit')::numeric end,
      o.price_per_unit)
where o.initial_quantity is null or o.initial_price_per_unit is null;

-- BEFORE INSERT: FIN-3 body unchanged, plus initial_* from the inserted ask.
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

  new.initial_price_per_unit := new.price_per_unit;
  new.initial_quantity := new.quantity;

  return new;
end;
$$;

-- BEFORE UPDATE: FIN-3 body unchanged, plus initial_* immutability once set.
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

  if (old.initial_price_per_unit is not null and new.initial_price_per_unit is distinct from old.initial_price_per_unit)
     or (old.initial_quantity is not null and new.initial_quantity is distinct from old.initial_quantity) then
    raise exception 'OFFERS_INITIAL_IMMUTABLE: initial_price_per_unit/initial_quantity teklif oluşturulurken bir kez set edilir, sonra değiştirilemez';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Single source for "how much does this offer reserve from this listing".
-- ---------------------------------------------------------------------------------------------
-- Takes the offers ROW (not an id) so enforce_offer_stock can pass NEW — the table still holds
-- OLD while a BEFORE UPDATE trigger runs. offer_items are read from the table (offers updates
-- never change them).
create or replace function public.fn_offer_effective_item_qty(p_offer public.offers, p_listing_id uuid)
returns numeric
language sql
stable
set search_path to ''
as $$
  select case
    when c.item_rows = 0 then
      case when p_offer.listing_id = p_listing_id
           then coalesce(p_offer.final_quantity, p_offer.current_quantity, p_offer.quantity, 0)
           else 0 end
    when c.item_rows = 1 then
      case when c.single_listing_id = p_listing_id
           then coalesce(p_offer.final_quantity, p_offer.current_quantity, p_offer.quantity, 0)
           else 0 end
    else c.listing_item_qty
  end
  from (
    select count(*) as item_rows,
           min(oi.listing_id::text)::uuid as single_listing_id,
           coalesce(sum(oi.quantity) filter (where oi.listing_id = p_listing_id), 0) as listing_item_qty
    from public.offer_items oi
    where oi.offer_id = p_offer.id
  ) c
$$;

-- Sum of the rule above over every accepted offer touching the listing, optionally excluding
-- one offer (the one being accepted). One set-based query, no loop.
--
-- SECURITY DEFINER: rpc_create_offer is SECURITY INVOKER, and under the caller's RLS a buyer
-- only sees their OWN offers — the reservation must count every buyer's accepted offers.
-- It returns a single aggregate number, the same figure listing_stock_summary gives anon.
create or replace function public.fn_listing_reserved_qty(p_listing_id uuid, p_exclude_offer_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(sum(public.fn_offer_effective_item_qty(o, p_listing_id)), 0)
  from public.offers o
  where o.status = 'accepted'
    and (p_exclude_offer_id is null or o.id <> p_exclude_offer_id)
    and (o.listing_id = p_listing_id
         or exists (select 1 from public.offer_items oi
                    where oi.offer_id = o.id and oi.listing_id = p_listing_id))
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. enforce_offer_stock: requested and reserved both through fn_offer_effective_item_qty.
--    Error texts unchanged ('Stok yetersiz (batch)' with offer_items, 'Stok yetersiz' without);
--    the frontend maps them. Signature/owner/grants unchanged (create or replace).
-- ---------------------------------------------------------------------------------------------
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

    -- One iteration per listing this offer draws from: its offer_items listings, or
    -- offers.listing_id for a legacy offer without offer_items.
    FOR rec IN
      SELECT DISTINCT oi.listing_id FROM public.offer_items oi WHERE oi.offer_id = NEW.id
      UNION
      SELECT NEW.listing_id WHERE items_count = 0
    LOOP
      -- NEW.final_quantity is already set here: guard_offer_snapshot_columns fires first.
      requested := public.fn_offer_effective_item_qty(NEW, rec.listing_id);

      SELECT COALESCE(SUM(he.quantity), 0), MAX(l.quantity)
        INTO batch_total, listing_qty
        FROM public.listings l
        LEFT JOIN public.listing_harvest_entries lhe ON lhe.listing_id = l.id
        LEFT JOIN public.harvest_entries he ON he.id = lhe.harvest_entry_id
        WHERE l.id = rec.listing_id
        GROUP BY l.id;

      base_stock := CASE WHEN batch_total > 0 THEN batch_total ELSE COALESCE(listing_qty, 0) END;
      reserved := public.fn_listing_reserved_qty(rec.listing_id, NEW.id);
      available := base_stock - reserved;

      IF requested > available THEN
        IF items_count > 0 THEN
          RAISE EXCEPTION 'Stok yetersiz (batch)';
        ELSE
          RAISE EXCEPTION 'Stok yetersiz';
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 4. rpc_create_offer: baseline body verbatim; only the reserved computation now goes through
--    fn_listing_reserved_qty (counts legacy + negotiated accepted offers too).
-- ---------------------------------------------------------------------------------------------
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

    v_reserved := public.fn_listing_reserved_qty(v_listing_id, null);

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

-- ---------------------------------------------------------------------------------------------
-- 5. Multi-batch quantity lock. With 2+ offer_items the per-listing split lives in offer_items
--    and cannot be derived from a new total, so only the price is negotiable. Writing the SAME
--    quantity (the UI always sends it) is allowed.
-- ---------------------------------------------------------------------------------------------
create or replace function public.fn_offers_multi_item_quantity_lock()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (new.quantity is distinct from old.quantity
      or new.current_quantity is distinct from old.current_quantity)
     and (select count(*) from public.offer_items oi where oi.offer_id = new.id) >= 2 then
    raise exception 'OFFER_MULTI_ITEM_QUANTITY_LOCKED: çok partili tekliflerde miktar değiştirilemez, yalnız fiyat';
  end if;
  return new;
end;
$$;

drop trigger if exists offers_multi_item_quantity_lock on public.offers;
create trigger offers_multi_item_quantity_lock
  before update on public.offers
  for each row execute function public.fn_offers_multi_item_quantity_lock();

-- ---------------------------------------------------------------------------------------------
-- 6. Public stock summary for the listing page: totals only, never offer rows. Same base-stock
--    formula as enforce_offer_stock / rpc_create_offer, same reserved function as the trigger.
--    Rows only for active listings (what anon can already read) or the caller's own listing.
-- ---------------------------------------------------------------------------------------------
create or replace function public.listing_stock_summary(p_listing_id uuid)
returns table(base numeric, reserved numeric, available numeric, linked_count int, using_fallback boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with l as (
    select l.id, l.quantity,
           count(he.id)::int as linked_count,
           coalesce(sum(he.quantity), 0) as batch_total
    from public.listings l
    left join public.listing_harvest_entries lhe on lhe.listing_id = l.id
    left join public.harvest_entries he on he.id = lhe.harvest_entry_id
    where l.id = p_listing_id
      and (l.status = 'active' or l.farmer_id = auth.uid())
    group by l.id
  ), s as (
    select case when l.batch_total > 0 then l.batch_total else coalesce(l.quantity, 0) end as base,
           public.fn_listing_reserved_qty(l.id, null) as reserved,
           l.linked_count,
           not (l.batch_total > 0) as using_fallback
    from l
  )
  select s.base, s.reserved, greatest(0, s.base - s.reserved), s.linked_count, s.using_fallback
  from s
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Grants.
--    * fn_offer_effective_item_qty: internal only.
--    * fn_listing_reserved_qty: internal, EXCEPT authenticated keeps EXECUTE — rpc_create_offer is
--      SECURITY INVOKER and calls it as the buyer; revoking would break offer creation. It exposes
--      nothing listing_stock_summary does not already give anon.
--    * fn_offers_multi_item_quantity_lock: trigger function, baseline pattern of the other
--      enforce_* offer triggers (service_role only).
--    * listing_stock_summary: public listing page -> anon + authenticated.
--    enforce_offer_stock / rpc_create_offer / fn_snapshot_offer_on_insert /
--    fn_guard_offer_snapshot_columns keep their existing grants (create or replace).
-- ---------------------------------------------------------------------------------------------
revoke all on function public.fn_offer_effective_item_qty(public.offers, uuid) from public, anon, authenticated;
grant execute on function public.fn_offer_effective_item_qty(public.offers, uuid) to service_role;

revoke all on function public.fn_listing_reserved_qty(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_listing_reserved_qty(uuid, uuid) to authenticated, service_role;

revoke all on function public.fn_offers_multi_item_quantity_lock() from public, anon, authenticated;
grant execute on function public.fn_offers_multi_item_quantity_lock() to service_role;

revoke all on function public.listing_stock_summary(uuid) from public;
grant execute on function public.listing_stock_summary(uuid) to anon, authenticated, service_role;
