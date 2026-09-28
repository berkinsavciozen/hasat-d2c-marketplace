-- ORD-GATE — FIN-0 Karar B, vitrin modu: sunucu tarafı sipariş kapısı + order_intent_blocked olayı.
--
-- Kapı kapalıyken (platform_settings.orders_enabled = false, varsayılan) sipariş başlatan HER yazma yolu
-- 'ORDERS_DISABLED' (P0001, hint 'orders_disabled') ile reddedilir; yalnız İKİ tarafı da orders_allowlist'te
-- olan çiftler (pilot test hesapları) ve servis rolü geçer. Açma: update public.platform_settings
-- set orders_enabled = true where id = 1; (migration ya da mobil build gerekmez).
--
-- Kapsanan yollar (BEFORE trigger'lar; ORD-1 / FIN-2 fonksiyon gövdelerine DOKUNULMAZ):
--   offers INSERT            — rpc_create_offer (INVOKER), doğrudan insert, MCP create-offer
--   offers UPDATE            — karşı teklif, kabul (doğrudan ya da rpc_accept_offer), ödeme geçişleri
--                              (buyer_mark_transfer_sent / farmer_confirm_payment_received). İstisnalar:
--                              ret, rpc_withdraw_counter, yalnız FK'nin NULL'a çektiği subscription_id /
--                              source_recipe_id (tarif/abonelik silme — ON DELETE SET NULL) ve no-op update.
--   offer_messages INSERT    — karşı teklif mesajı
--   orders INSERT            — derinlemesine savunma (rpc_accept_offer, farmer_confirm_payment_received)
--   harvest_subscriptions    — INSERT ve 'active'e geçiş (iptal/duraklatma serbest)
-- Kapsam dışı: crop_requests / recipe_rfq_links (Talep Et), sipariş yaşam döngüsü RPC'leri
-- (kargo/teslim/iptal/itiraz), servis rolü.
--
-- Trigger adları 'a0_' ile başlar: PostgreSQL aynı olaydaki BEFORE trigger'ları ada göre sıralar;
-- kapı enforce_offer_* / guard_* / snapshot_* / trg_* trigger'larından önce çalışır ve kullanıcı tutarlı
-- olarak ORDERS_DISABLED görür.
--
-- Tasarım: allowlist platform_settings'te dizi değil, erişimi kapalı ayrı tablo (platform_settings
-- herkese okunabilir; test hesabı UUID'leri açığa çıkmasın). Bu migration allowlist'e satır EKLEMEZ.
--
-- L0-03: Supabase default privileges yeni tablo / view / sequence / fonksiyonlara anon ve authenticated'a
-- tüm yetkileri veriyor; aşağıda her yeni nesnede açıkça revoke edilir.
--
-- Tekrar çalıştırılabilir: if not exists / create or replace / drop trigger if exists. Geri alma:
-- supabase/tests/ord_gate/rollback.sql (canlıda çalıştırılmaz).

-- ---------------------------------------------------------------------------------------------
-- 1. Ayar ve allowlist.
-- ---------------------------------------------------------------------------------------------
alter table public.platform_settings add column if not exists orders_enabled boolean not null default false;

comment on column public.platform_settings.orders_enabled is
  'ORD-GATE: false iken (vitrin modu) teklif/sipariş başlatan yazmalar ORDERS_DISABLED ile reddedilir; yalnız iki tarafı da orders_allowlist''te olan çiftler geçer. Yazma yalnız service_role.';

create table if not exists public.orders_allowlist (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);

comment on table public.orders_allowlist is
  'ORD-GATE: kapı kapalıyken sipariş açabilen pilot hesaplar (iki taraf da listede olmalı). RLS açık, policy yok; yalnız service_role.';

alter table public.orders_allowlist enable row level security;
revoke all on table public.orders_allowlist from public, anon, authenticated;
grant select, insert, update, delete on table public.orders_allowlist to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Kapı fonksiyonları. Yalnız trigger'lar (SECURITY DEFINER, owner olarak) ve service_role çağırır.
-- ---------------------------------------------------------------------------------------------

-- Servis anahtarı ve doğrudan SQL (claims yok) = servis. PostgREST anon'u auth.role() = 'anon' olduğu için
-- servis SAYILMAZ.
create or replace function public.fn_orders_is_service()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is null
     and coalesce(auth.role(), 'service_role') = 'service_role'
$$;

-- platform_settings satırı yoksa kapalı (fail-closed). Kapalıyken İKİ taraf da allowlist'te olmalı.
create or replace function public.fn_orders_open_for(p_actor uuid, p_counterparty uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((select s.orders_enabled from public.platform_settings s where s.id = 1), false)
      or (p_actor is not null
          and p_counterparty is not null
          and exists (select 1 from public.orders_allowlist a where a.user_id = p_actor)
          and exists (select 1 from public.orders_allowlist a where a.user_id = p_counterparty))
$$;

create or replace function public.fn_assert_orders_open(p_actor uuid, p_counterparty uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if public.fn_orders_is_service() then
    return;
  end if;
  if not public.fn_orders_open_for(p_actor, p_counterparty) then
    raise exception 'ORDERS_DISABLED' using errcode = 'P0001', hint = 'orders_disabled';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Trigger'lar.
-- ---------------------------------------------------------------------------------------------

-- 3a. offers INSERT: aktör auth.uid() (RLS NEW.buyer_id = auth.uid()'yi zaten zorunlu kılıyor).
create or replace function public.fn_orders_gate_offers_ins()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.fn_assert_orders_open(auth.uid(), new.farmer_id);
  return new;
end;
$$;

drop trigger if exists a0_orders_gate_offers_ins on public.offers;
create trigger a0_orders_gate_offers_ins
  before insert on public.offers
  for each row execute function public.fn_orders_gate_offers_ins();

-- 3b. offers UPDATE: aşağıdaki istisnalar dışında her update kapıya takılır.
create or replace function public.fn_orders_gate_offers_upd()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_fk_cols text[] := array['subscription_id', 'source_recipe_id'];
begin
  -- Ret her zaman serbest.
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    return new;
  end if;

  -- Geri çekme (rpc_withdraw_counter, ORD-1 K5): yalnız bu RPC bayrağı set eder; geçiş
  -- enforce_offer_transitions'taki withdraw_ok ile aynı dar kapsamda.
  if coalesce(current_setting('hasat.offer_withdraw', true), 'off') = 'on'
     and old.status = 'counter'
     and new.status in ('pending', 'counter') then
    return new;
  end if;

  -- Tarif / abonelik silindiğinde ON DELETE SET NULL offers'ı günceller; tarif sahibi taraf olmayabilir.
  -- Yalnız bu iki kolon NULL'a çekiliyor (ya da hiçbir kolon değişmiyor) ise serbest.
  if (to_jsonb(new) - v_fk_cols) = (to_jsonb(old) - v_fk_cols)
     and (new.subscription_id is null or new.subscription_id = old.subscription_id)
     and (new.source_recipe_id is null or new.source_recipe_id = old.source_recipe_id) then
    return new;
  end if;

  perform public.fn_assert_orders_open(
    v_uid,
    case when v_uid = new.buyer_id then new.farmer_id else new.buyer_id end
  );
  return new;
end;
$$;

drop trigger if exists a0_orders_gate_offers_upd on public.offers;
create trigger a0_orders_gate_offers_upd
  before update on public.offers
  for each row execute function public.fn_orders_gate_offers_upd();

-- 3c. offer_messages INSERT: karşı taraf teklifin diğer tarafı.
create or replace function public.fn_orders_gate_offer_messages_ins()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_buyer uuid;
  v_farmer uuid;
begin
  select o.buyer_id, o.farmer_id into v_buyer, v_farmer from public.offers o where o.id = new.offer_id;
  perform public.fn_assert_orders_open(
    v_uid,
    case when v_uid = v_buyer then v_farmer else v_buyer end
  );
  return new;
end;
$$;

drop trigger if exists a0_orders_gate_offer_messages_ins on public.offer_messages;
create trigger a0_orders_gate_offer_messages_ins
  before insert on public.offer_messages
  for each row execute function public.fn_orders_gate_offer_messages_ins();

-- 3d. orders INSERT: derinlemesine savunma (rpc_accept_offer ve farmer_confirm_payment_received içinden).
create or replace function public.fn_orders_gate_orders_ins()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.fn_assert_orders_open(
    v_uid,
    case when v_uid = new.buyer_id then new.farmer_id else new.buyer_id end
  );
  return new;
end;
$$;

drop trigger if exists a0_orders_gate_orders_ins on public.orders;
create trigger a0_orders_gate_orders_ins
  before insert on public.orders
  for each row execute function public.fn_orders_gate_orders_ins();

-- 3e. harvest_subscriptions: INSERT ve 'active'e geçiş; iptal / duraklatma / diğer alanlar serbest.
create or replace function public.fn_orders_gate_subscriptions()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    perform public.fn_assert_orders_open(v_uid, new.farmer_id);
  elsif new.status = 'active' and old.status is distinct from 'active' then
    perform public.fn_assert_orders_open(
      v_uid,
      case when v_uid = new.buyer_id then new.farmer_id else new.buyer_id end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists a0_orders_gate_subscriptions on public.harvest_subscriptions;
create trigger a0_orders_gate_subscriptions
  before insert or update on public.harvest_subscriptions
  for each row execute function public.fn_orders_gate_subscriptions();

-- ---------------------------------------------------------------------------------------------
-- 4. İstemci için kapı durumu. Allowlist içeriğini ya da başka ID'leri döndürmez.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rpc_get_order_gate()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_enabled boolean := coalesce((select s.orders_enabled from public.platform_settings s where s.id = 1), false);
begin
  return jsonb_build_object(
    'ordersEnabled', v_enabled,
    'callerAllowed', v_enabled
                     or (v_uid is not null
                         and exists (select 1 from public.orders_allowlist a where a.user_id = v_uid))
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. order_intent_blocked olayı. Telefon, e-posta, serbest metin, token ya da finansal alan YOK.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.order_intent_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  surface text not null check (surface in ('recipe_product', 'discover', 'storefront', 'producer',
                                            'offer_route', 'subscription', 'mcp')),
  platform text not null check (platform in ('web', 'ios', 'android')),
  listing_id uuid references public.listings(id) on delete set null,
  crop text check (crop is null or char_length(crop) <= 40),
  recipe_id uuid references public.recipes(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null
);

comment on table public.order_intent_events is
  'ORD-GATE: vitrin modunda engellenen sipariş niyeti (order_intent_blocked). Yazma yalnız rpc_log_order_intent_blocked; okuma yalnız service_role (v_kpi_order_intent_blocked).';

create index if not exists order_intent_events_created_at_idx
  on public.order_intent_events (created_at);
create index if not exists order_intent_events_user_created_at_idx
  on public.order_intent_events (user_id, created_at);

alter table public.order_intent_events enable row level security;
revoke all on table public.order_intent_events from public, anon, authenticated;
grant select, insert, update, delete on table public.order_intent_events to service_role;

do $$
declare
  v_seq text := pg_get_serial_sequence('public.order_intent_events', 'id');
begin
  execute format('revoke all on sequence %s from public, anon, authenticated', v_seq);
end;
$$;

create or replace function public.rpc_log_order_intent_blocked(
  p_surface text,
  p_platform text,
  p_listing_id uuid default null,
  p_recipe_id uuid default null,
  p_crop text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_crop text;
  v_recipe_id uuid;
  v_since timestamptz := now() - interval '10 minutes';
begin
  if p_surface is null
     or p_surface not in ('recipe_product', 'discover', 'storefront', 'producer', 'offer_route',
                          'subscription', 'mcp')
     or p_platform is null
     or p_platform not in ('web', 'ios', 'android') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if p_listing_id is not null then
    -- crop listing'den alınır; p_crop yok sayılır.
    select l.crop into v_crop from public.listings l where l.id = p_listing_id;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;
    v_crop := nullif(btrim(v_crop), '');
    if char_length(v_crop) > 40 then
      v_crop := null;
    end if;
  elsif p_crop is not null then
    v_crop := btrim(p_crop);
    -- [[:alpha:]] C collation'da ASCII dışını kapsamaz; Türkçe harfler açıkça eklenir.
    if char_length(v_crop) not between 1 and 40
       or v_crop !~ '^[[:alpha:]çğıöşüâîûÇĞİÖŞÜÂÎÛ _-]+$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;
  end if;

  -- Yalnız herkese açık tarif saklanır; özel tarif kimliği olay tablosuna sızmaz (hata değil).
  if p_recipe_id is not null then
    select r.id into v_recipe_id from public.recipes r where r.id = p_recipe_id and r.visibility = 'public';
  end if;

  -- Sessiz rate limit.
  if v_uid is not null then
    if exists (
      select 1 from public.order_intent_events e
      where e.user_id = v_uid
        and e.surface = p_surface
        and e.listing_id is not distinct from p_listing_id
        and e.created_at > v_since
    ) then
      return jsonb_build_object('ok', true, 'logged', false);
    end if;
    if (select count(*) from public.order_intent_events e
        where e.user_id = v_uid and e.created_at > v_since) >= 20 then
      return jsonb_build_object('ok', true, 'logged', false);
    end if;
  else
    if (select count(*) from public.order_intent_events e
        where e.user_id is null and e.created_at > v_since) >= 500 then
      return jsonb_build_object('ok', true, 'logged', false);
    end if;
  end if;

  insert into public.order_intent_events (surface, platform, listing_id, crop, recipe_id, user_id)
  values (p_surface, p_platform, p_listing_id, v_crop, v_recipe_id, v_uid);

  return jsonb_build_object('ok', true, 'logged', true);
end;
$$;

-- Admin sayım görünümü (yalnız service_role: admin-kpi edge function).
create or replace view public.v_kpi_order_intent_blocked
with (security_invoker = true)
as
select date_trunc('day', e.created_at) as day,
       e.surface,
       e.platform,
       e.crop,
       count(*)::bigint as events,
       count(distinct e.user_id)::bigint as users
from public.order_intent_events e
group by 1, 2, 3, 4;

revoke all on table public.v_kpi_order_intent_blocked from public, anon, authenticated;
grant select on table public.v_kpi_order_intent_blocked to service_role;

-- ---------------------------------------------------------------------------------------------
-- 6. Fonksiyon yetkileri.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.fn_orders_is_service() from public, anon, authenticated;
revoke all on function public.fn_orders_open_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_assert_orders_open(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_orders_is_service(), public.fn_orders_open_for(uuid, uuid),
  public.fn_assert_orders_open(uuid, uuid) to service_role;

revoke all on function public.fn_orders_gate_offers_ins() from public, anon, authenticated;
revoke all on function public.fn_orders_gate_offers_upd() from public, anon, authenticated;
revoke all on function public.fn_orders_gate_offer_messages_ins() from public, anon, authenticated;
revoke all on function public.fn_orders_gate_orders_ins() from public, anon, authenticated;
revoke all on function public.fn_orders_gate_subscriptions() from public, anon, authenticated;
grant execute on function public.fn_orders_gate_offers_ins(), public.fn_orders_gate_offers_upd(),
  public.fn_orders_gate_offer_messages_ins(), public.fn_orders_gate_orders_ins(),
  public.fn_orders_gate_subscriptions() to service_role;

revoke all on function public.rpc_get_order_gate() from public;
grant execute on function public.rpc_get_order_gate() to anon, authenticated, service_role;

revoke all on function public.rpc_log_order_intent_blocked(text, text, uuid, uuid, text) from public;
grant execute on function public.rpc_log_order_intent_blocked(text, text, uuid, uuid, text)
  to anon, authenticated, service_role;
