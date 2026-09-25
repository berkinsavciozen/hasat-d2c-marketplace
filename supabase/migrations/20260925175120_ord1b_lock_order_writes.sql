-- ORD-1 B — sipariş tablolarında doğrudan istemci yazımının kapatılması (AŞAMA B).
-- Spec: claude/ORD-1-Spec-2026-09-25.md. Önkoşul: 20260925172029_ord1a_order_rpcs_and_guard.sql (A) ve
-- web'in rpc_* fonksiyonlarına geçişi (Lovable) main'de. Canlıya uygulama web geçişi main'e girdikten sonra.
--
-- İçerik:
--   1. Yazma policy'leri kaldırılır (orders, order_timeline, disputes). SELECT policy'leri ve reviews
--      policy'leri aynen kalır.
--   2. Yazma grant'leri anon/authenticated'dan alınır. reviews: authenticated INSERT kalır (policy sipariş
--      durumuna bakıyor); UPDATE/DELETE/TRUNCATE (policy'si zaten yok) ve anon'un tüm yazımı alınır.
--      SELECT grant'leri ve service_role'e dokunulmaz. rpc_* / FIN-2 fonksiyonları SECURITY DEFINER
--      olduğu için etkilenmez.
--   3. fn_guard_order_transitions: A'daki yorumlu blok açılır — rpc bayrağı (hasat.order_transition)
--      olmadan ve servis rolü dışında status değişikliği ORDER_STATUS_CLIENT_WRITE_BLOCKED ile reddedilir.
--      Gövdenin geri kalanı 20260925172029 ile birebir.
--
-- Tekrar çalıştırılabilir: drop policy if exists, revoke idempotent, create or replace.

-- ---------------------------------------------------------------------------------------------
-- 1. Yazma policy'leri.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "System inserts orders" on public.orders;
drop policy if exists "Farmers insert orders on acceptance" on public.orders;
drop policy if exists "Order parties can update their orders" on public.orders;

drop policy if exists "Buyers insert order timeline" on public.order_timeline;
drop policy if exists "Farmers insert order timeline" on public.order_timeline;

drop policy if exists "Order parties can open disputes" on public.disputes;
drop policy if exists "Order parties can update own disputes" on public.disputes;

-- ---------------------------------------------------------------------------------------------
-- 2. Grant'ler.
-- ---------------------------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.orders, public.order_timeline, public.disputes from anon, authenticated;
revoke insert, update, delete, truncate on public.reviews from anon;
revoke update, delete, truncate on public.reviews from authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Guard trigger: istemciden bayraksız status yazımı reddedilir.
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
    -- AŞAMA B: istemciden bayraksız status yazımı reddedilir.
    if not v_via_rpc and not v_service then
      raise exception 'ORDER_STATUS_CLIENT_WRITE_BLOCKED: sipariş durumu yalnız rpc_* fonksiyonlarıyla değiştirilebilir';
    end if;

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
