-- ORD-1 A — sipariş yetkisi ve durum geçişi sertleştirmesi, AŞAMA A (ekleyici).
-- Spec: claude/ORD-1-Spec-2026-09-25.md (K1–K5 Berkin onaylı, 2026-09-25).
--
-- Bu migration YALNIZ ekler; hiçbir policy/grant kapatmaz (Aşama B). İçerik:
--   0. orders: UNIQUE(offer_id) (orders_offer_id_key) + çift generate_order_ref trigger'ı temizliği.
--   1. fn_guard_order_transitions (BEFORE UPDATE on orders): kimlik kolonları değişmez, durum matrisi,
--      dispute_window_expires_at yalnız sunucudan. Bayraksız (istemci) status değişikliği Aşama A'da
--      HENÜZ reddedilmez — web bugün doğrudan yazıyor; matris yine uygulanır. B'de tek blok açılır.
--   2. RPC'ler (SECURITY DEFINER, search_path=''): rpc_accept_offer (K1), rpc_mark_order_shipped (K2),
--      rpc_confirm_order_delivered, rpc_cancel_order (K3), rpc_open_dispute (K4), rpc_withdraw_counter (K5).
--      Kilit sırası: önce offers, sonra orders (FOR UPDATE). İş kuralı reddi FIN-2 gibi {ok:false, reason};
--      oturumsuz / taraf olmayan çağrı exception.
--   3. enforce_offer_transitions: baseline gövdesi birebir + hasat.offer_withdraw bayrağına dar istisna (K5).
--   4. fn_listing_reserved_qty: siparişi 'cancelled' olan kabul edilmiş teklifleri saymaz (K3: iptal stoğu
--      serbest bırakır). enforce_offer_stock / rpc_create_offer / listing_stock_summary otomatik tutarlı.
--   5. Grant'ler.
--
-- Bilinen Aşama A etkisi: web useConfirmDelivery bugün dispute_window_expires_at'i istemciden yazıyor;
-- guard bunu ORDER_DISPUTE_WINDOW_SERVER_ONLY ile reddeder (spec §3b). Web rpc_confirm_order_delivered'a
-- geçene kadar teslim onayı web'de çalışmaz. Canlıda 0 sipariş var (spec §3e).
--
-- Tekrar çalıştırılabilir: constraint varsa eklenmez, create or replace, drop trigger if exists.

-- ---------------------------------------------------------------------------------------------
-- 0. Tekillik ve çift trigger.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_offer_id_key'
  ) then
    alter table public.orders add constraint orders_offer_id_key unique (offer_id);
  end if;
end;
$$;

-- set_order_ref her INSERT'te çalışıp orders_set_order_ref'in üstüne ikinci bir sıra numarası
-- yazıyordu. orders_set_order_ref (aynı fonksiyon, yalnız boş ref'te) kalır.
drop trigger if exists set_order_ref on public.orders;

-- ---------------------------------------------------------------------------------------------
-- 1. Guard trigger.
-- ---------------------------------------------------------------------------------------------
create or replace function public.fn_guard_order_transitions()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_via_rpc boolean := coalesce(current_setting('hasat.order_transition', true), 'off') = 'on';
  v_service boolean := auth.uid() is null;  -- servis rolü / cron (ORD-2) / admin SQL
begin
  if new.offer_id is distinct from old.offer_id
     or new.buyer_id is distinct from old.buyer_id
     or new.farmer_id is distinct from old.farmer_id
     or new.order_ref is distinct from old.order_ref
     or new.created_at is distinct from old.created_at then
    raise exception 'ORDER_IDENTITY_IMMUTABLE: offer_id, buyer_id, farmer_id, order_ref, created_at değiştirilemez';
  end if;

  if new.dispute_window_expires_at is distinct from old.dispute_window_expires_at
     and not v_service
     and not (v_via_rpc and old.status = 'shipped' and new.status = 'delivered') then
    raise exception 'ORDER_DISPUTE_WINDOW_SERVER_ONLY: dispute_window_expires_at yalnız teslim onayında sunucu tarafından yazılır';
  end if;

  if new.status is distinct from old.status then
    -- AŞAMA B: aşağıdaki blok açılacak (istemciden bayraksız status yazımı reddedilir).
    -- if not v_via_rpc and not v_service then
    --   raise exception 'ORDER_STATUS_CLIENT_WRITE_BLOCKED: sipariş durumu yalnız rpc_* fonksiyonlarıyla değiştirilebilir';
    -- end if;

    if not (
         (old.status = 'preparing' and new.status in ('shipped', 'cancelled'))
      or (old.status = 'shipped'   and new.status = 'delivered')
      or (old.status = 'delivered' and new.status = 'disputed')
      or (old.status = 'delivered' and new.status = 'completed' and v_service)
      or (old.status = 'disputed'  and new.status in ('completed', 'cancelled') and v_service)
    ) then
      raise exception 'ORDER_INVALID_TRANSITION: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_order_transitions on public.orders;
create trigger guard_order_transitions
  before update on public.orders
  for each row execute function public.fn_guard_order_transitions();

-- ---------------------------------------------------------------------------------------------
-- 2a. rpc_accept_offer (K1): kabul + sipariş + timeline, tek transaction.
--     Sıra (enforce_offer_accept_turn), geçiş (enforce_offer_transitions), final_* snapshot
--     (guard_offer_snapshot_columns) ve stok (trg_enforce_offer_stock) mevcut trigger'larla aynen
--     uygulanır: auth.uid() request.jwt.claims'ten okunduğu için SECURITY DEFINER içinde de çağıranı
--     döndürür. Trigger hataları ('Sırada karşı taraf var…', 'Stok yetersiz…') exception olarak
--     yükselir ve tüm transaction (sipariş dahil) geri alınır.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rpc_accept_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.offers;
  v_order_id uuid;
  v_already boolean;
begin
  if v_uid is null then
    raise exception 'ACCEPT_OFFER_UNAUTHENTICATED';
  end if;

  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_uid <> v_offer.buyer_id and v_uid <> v_offer.farmer_id then
    raise exception 'ACCEPT_OFFER_FORBIDDEN: caller is not a party to this offer';
  end if;

  v_already := v_offer.status = 'accepted';
  if not v_already then
    if v_offer.status not in ('pending', 'counter') then
      return jsonb_build_object('ok', false, 'reason', 'wrong_offer_status');
    end if;
    update public.offers set status = 'accepted', ball_side = 'buyer' where id = p_offer_id;
  end if;

  -- Zaten kabul edilmiş ama siparişi olmayan (ORD-1 öncesi) teklif için de sipariş oluşur.
  insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
  values (v_offer.id, v_offer.buyer_id, v_offer.farmer_id, 'preparing', '')
  on conflict (offer_id) do nothing
  returning id into v_order_id;

  if v_order_id is not null then
    insert into public.order_timeline (order_id, step, label, completed_at)
    values (v_order_id, 'submitted', 'Sipariş Alındı', now());
  else
    select id into v_order_id from public.orders where offer_id = p_offer_id;
  end if;

  if v_already then
    return jsonb_build_object('ok', true, 'orderId', v_order_id, 'alreadyAccepted', true);
  end if;
  return jsonb_build_object('ok', true, 'orderId', v_order_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2b. rpc_mark_order_shipped (K2): çiftçi; preparing -> shipped yalnız payment_status='paid'.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rpc_mark_order_shipped(p_order_id uuid, p_tracking_number text, p_carrier text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_offer_id uuid;
  v_offer public.offers;
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'MARK_ORDER_SHIPPED_UNAUTHENTICATED';
  end if;

  select offer_id into v_offer_id from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_offer from public.offers where id = v_offer_id for update;
  select * into v_order from public.orders where id = p_order_id for update;

  if v_uid <> v_order.farmer_id then
    raise exception 'MARK_ORDER_SHIPPED_FORBIDDEN: caller is not the farmer on this order';
  end if;
  if v_order.status <> 'preparing' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status');
  end if;
  if v_offer.payment_status <> 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'payment_not_confirmed');
  end if;
  if nullif(btrim(p_tracking_number), '') is null or nullif(btrim(p_carrier), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'tracking_required');
  end if;

  perform set_config('hasat.order_transition', 'on', true);
  update public.orders
     set status = 'shipped', tracking_number = btrim(p_tracking_number), carrier = btrim(p_carrier)
   where id = p_order_id;
  perform set_config('hasat.order_transition', 'off', true);

  insert into public.order_timeline (order_id, step, label, completed_at)
  values (p_order_id, 'shipped', 'Kargoya Verildi', now());

  return jsonb_build_object('ok', true, 'orderId', p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2c. rpc_confirm_order_delivered: alıcı; shipped -> delivered; itiraz penceresi sunucu saatiyle.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rpc_confirm_order_delivered(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_offer_id uuid;
  v_order public.orders;
  v_window timestamptz;
begin
  if v_uid is null then
    raise exception 'CONFIRM_ORDER_DELIVERED_UNAUTHENTICATED';
  end if;

  select offer_id into v_offer_id from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform 1 from public.offers where id = v_offer_id for update;
  select * into v_order from public.orders where id = p_order_id for update;

  if v_uid <> v_order.buyer_id then
    raise exception 'CONFIRM_ORDER_DELIVERED_FORBIDDEN: caller is not the buyer on this order';
  end if;
  if v_order.status <> 'shipped' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status');
  end if;

  v_window := now() + interval '24 hours';

  perform set_config('hasat.order_transition', 'on', true);
  update public.orders
     set status = 'delivered', dispute_window_expires_at = v_window
   where id = p_order_id;
  perform set_config('hasat.order_transition', 'off', true);

  insert into public.order_timeline (order_id, step, label, completed_at)
  values (p_order_id, 'delivered', 'Teslim Edildi', now());

  return jsonb_build_object('ok', true, 'orderId', p_order_id, 'disputeWindowExpiresAt', v_window);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2d. rpc_cancel_order (K3): taraf; yalnız preparing ve ödeme unpaid/pending_transfer iken.
--     'paid' sonrası iptal yalnız servis rolü (guard servis rolüne preparing -> cancelled'ı zaten açık
--     bırakır). İptal, fn_listing_reserved_qty üzerinden stoğu serbest bırakır.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rpc_cancel_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_offer_id uuid;
  v_offer public.offers;
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'CANCEL_ORDER_UNAUTHENTICATED';
  end if;

  select offer_id into v_offer_id from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_offer from public.offers where id = v_offer_id for update;
  select * into v_order from public.orders where id = p_order_id for update;

  if v_uid <> v_order.buyer_id and v_uid <> v_order.farmer_id then
    raise exception 'CANCEL_ORDER_FORBIDDEN: caller is not a party to this order';
  end if;
  if v_order.status <> 'preparing' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status');
  end if;
  if v_offer.payment_status not in ('unpaid', 'pending_transfer') then
    return jsonb_build_object('ok', false, 'reason', 'paid_admin_only');
  end if;

  perform set_config('hasat.order_transition', 'on', true);
  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(btrim(p_reason), '')
   where id = p_order_id;
  perform set_config('hasat.order_transition', 'off', true);

  insert into public.order_timeline (order_id, step, label, completed_at)
  values (p_order_id, 'cancelled', 'Sipariş İptal Edildi', now());

  return jsonb_build_object('ok', true, 'orderId', p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2e. rpc_open_dispute (K4): taraf; yalnız delivered ve now() < dispute_window_expires_at.
--     Kanıt yolları delivery-photos bucket'ındaki mevcut '<order_id>/' desenine uymalı.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rpc_open_dispute(p_order_id uuid, p_reason text, p_evidence_paths text[] default '{}'::text[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_offer_id uuid;
  v_order public.orders;
  v_paths text[] := coalesce(p_evidence_paths, '{}'::text[]);
  v_dispute_id uuid;
begin
  if v_uid is null then
    raise exception 'OPEN_DISPUTE_UNAUTHENTICATED';
  end if;

  select offer_id into v_offer_id from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform 1 from public.offers where id = v_offer_id for update;
  select * into v_order from public.orders where id = p_order_id for update;

  if v_uid <> v_order.buyer_id and v_uid <> v_order.farmer_id then
    raise exception 'OPEN_DISPUTE_FORBIDDEN: caller is not a party to this order';
  end if;
  if v_order.status <> 'delivered' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status');
  end if;
  if v_order.dispute_window_expires_at is null or now() >= v_order.dispute_window_expires_at then
    return jsonb_build_object('ok', false, 'reason', 'window_closed');
  end if;
  if nullif(btrim(p_reason), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;
  if exists (
    select 1 from unnest(v_paths) as p(path)
    where p.path is null
       or left(p.path, length(p_order_id::text) + 1) <> p_order_id::text || '/'
       or p.path ~ '(^|/)\.\.(/|$)'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_evidence_path');
  end if;

  insert into public.disputes (order_id, opened_by, reason, evidence_photo_urls, window_expires_at)
  values (p_order_id, v_uid, btrim(p_reason), v_paths, v_order.dispute_window_expires_at)
  returning id into v_dispute_id;

  perform set_config('hasat.order_transition', 'on', true);
  update public.orders set status = 'disputed' where id = p_order_id;
  perform set_config('hasat.order_transition', 'off', true);

  return jsonb_build_object('ok', true, 'orderId', p_order_id, 'disputeId', v_dispute_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. enforce_offer_transitions: baseline (20260917120000) gövdesi birebir; yalnız "ORD-1 K5"
--    satırları eklendi. hasat.offer_withdraw='on' (yalnız rpc_withdraw_counter set eder) iken
--    counter -> pending/counter geçişi ve current_* geri alınması serbest; price_per_unit/quantity
--    değişikliği bu istisnaya dahil değil. Ödeme ve diğer tüm kurallar aynen.
-- ---------------------------------------------------------------------------------------------
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
  withdraw_ok boolean;  -- ORD-1 K5
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- ORD-1 K5: rpc_withdraw_counter'ın dar istisnası.
  withdraw_ok := COALESCE(current_setting('hasat.offer_withdraw', true), 'off') = 'on'
    AND OLD.status = 'counter'
    AND NEW.status IN ('pending','counter')
    AND NEW.price_per_unit IS NOT DISTINCT FROM OLD.price_per_unit
    AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity;

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

  IF econ_changed AND NOT withdraw_ok THEN  -- ORD-1 K5: "AND NOT withdraw_ok"
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
      OR withdraw_ok  -- ORD-1 K5: counter -> pending
    ) THEN
      RAISE EXCEPTION 'Gecersiz teklif durum gecisi: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 2f. rpc_withdraw_counter (K5): son offer_messages satırını gönderen geri çeker, atomik.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rpc_withdraw_counter(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.offers;
  v_last public.offer_messages;
  v_prev public.offer_messages;
  v_role text;
  v_price numeric;
  v_qty numeric;
  v_status public.offer_status;
begin
  if v_uid is null then
    raise exception 'WITHDRAW_COUNTER_UNAUTHENTICATED';
  end if;

  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_uid <> v_offer.buyer_id and v_uid <> v_offer.farmer_id then
    raise exception 'WITHDRAW_COUNTER_FORBIDDEN: caller is not a party to this offer';
  end if;
  if v_offer.status <> 'counter' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_offer_status');
  end if;

  select * into v_last from public.offer_messages
   where offer_id = p_offer_id
   order by created_at desc, id desc
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_counter');
  end if;
  if v_last.sender_id <> v_uid then
    return jsonb_build_object('ok', false, 'reason', 'not_last_sender');
  end if;
  v_role := v_last.sender_role;

  delete from public.offer_messages where id = v_last.id;

  select * into v_prev from public.offer_messages
   where offer_id = p_offer_id
   order by created_at desc, id desc
   limit 1;

  if v_prev.id is not null then
    v_price := coalesce(v_prev.price, v_offer.initial_price_per_unit, v_offer.price_per_unit);
    v_qty := coalesce(v_prev.quantity, v_offer.initial_quantity, v_offer.quantity);
    v_status := 'counter';
  else
    v_price := coalesce(v_offer.initial_price_per_unit, v_offer.price_per_unit);
    v_qty := coalesce(v_offer.initial_quantity, v_offer.quantity);
    v_status := 'pending';
  end if;

  perform set_config('hasat.offer_withdraw', 'on', true);
  update public.offers
     set current_price = v_price,
         current_quantity = v_qty,
         ball_side = v_role,
         status = v_status,
         negotiation_history = case
           when jsonb_typeof(negotiation_history) = 'array' and jsonb_array_length(negotiation_history) > 0
             then negotiation_history - (-1)
           else negotiation_history
         end
   where id = p_offer_id;
  perform set_config('hasat.offer_withdraw', 'off', true);

  return jsonb_build_object('ok', true, 'offerId', p_offer_id, 'status', v_status,
                            'currentPrice', v_price, 'currentQuantity', v_qty, 'ballSide', v_role);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. fn_listing_reserved_qty: 20260925143009 gövdesi birebir + iptal edilmiş sipariş hariç.
-- ---------------------------------------------------------------------------------------------
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
    and not exists (select 1 from public.orders x where x.offer_id = o.id and x.status = 'cancelled')
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Grant'ler. Policy/grant kapatma bu migration'da YOK (Aşama B).
--    enforce_offer_transitions / fn_listing_reserved_qty mevcut grant'lerini korur (create or replace).
-- ---------------------------------------------------------------------------------------------
revoke all on function public.fn_guard_order_transitions() from public, anon, authenticated;
grant execute on function public.fn_guard_order_transitions() to service_role;

revoke all on function public.rpc_accept_offer(uuid) from public, anon;
grant execute on function public.rpc_accept_offer(uuid) to authenticated, service_role;

revoke all on function public.rpc_mark_order_shipped(uuid, text, text) from public, anon;
grant execute on function public.rpc_mark_order_shipped(uuid, text, text) to authenticated, service_role;

revoke all on function public.rpc_confirm_order_delivered(uuid) from public, anon;
grant execute on function public.rpc_confirm_order_delivered(uuid) to authenticated, service_role;

revoke all on function public.rpc_cancel_order(uuid, text) from public, anon;
grant execute on function public.rpc_cancel_order(uuid, text) to authenticated, service_role;

revoke all on function public.rpc_open_dispute(uuid, text, text[]) from public, anon;
grant execute on function public.rpc_open_dispute(uuid, text, text[]) to authenticated, service_role;

revoke all on function public.rpc_withdraw_counter(uuid) from public, anon;
grant execute on function public.rpc_withdraw_counter(uuid) to authenticated, service_role;
