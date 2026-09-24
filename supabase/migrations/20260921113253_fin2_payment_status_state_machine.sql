-- FIN-2 — Ödeme durum makinesi (master plan §4, "FIN-1 ile koordineli").
--
-- Bulgu: mevcut `useSimulatePayment`/`useMarkTransferSent`/`useConfirmTransferReceived`
-- (src/lib/hasat/queries.ts) doğrudan `supabase.from('offers').update({payment_status: ...})`
-- çağırıyor. RLS politikası "Both parties update offer" (auth.uid()=buyer_id OR farmer_id)
-- offers'ın HERHANGİ bir sütununu serbestçe güncellemeye izin veriyor — payment_status dahil,
-- hiçbir trigger koruması yok (offers_payment_status_check yalnızca değer kümesini sınırlıyor,
-- KİMİN yazabileceğini değil). Yani herhangi bir buyer, kendi teklifi için tarayıcı
-- konsolundan doğrudan `payment_status='paid'` yazabilir, gerçek bir havale olmadan siparişini
-- aktif hale getirebilir (useSimulatePayment butonu UI'da import.meta.env.DEV ile gizli olsa da,
-- bu yalnızca JSX'i kaldırır — PostgREST üzerinden doğrudan çağrıyı engellemez). Bu migration bu
-- gerçek, sömürülebilir boşluğu kapatıyor: payment_status'a yalnızca aşağıdaki iki SECURITY
-- DEFINER RPC'nin yazabilmesini bir BEFORE UPDATE trigger ile zorunlu kılıyor.

-- 1) audit tablosu — her geçiş kim/ne zaman/hangi rolde izlenir.
create table public.payment_status_transitions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('buyer', 'farmer')),
  created_at timestamptz not null default now()
);

alter table public.payment_status_transitions enable row level security;

create policy "Offer parties read payment transitions"
  on public.payment_status_transitions
  for select
  to public
  using (
    exists (
      select 1 from public.offers o
      where o.id = payment_status_transitions.offer_id
        and (o.buyer_id = auth.uid() or o.farmer_id = auth.uid())
    )
  );
-- Insert/update/delete için kasıtlı olarak public policy yok — yalnızca aşağıdaki RPC'ler
-- (table owner olarak RLS'yi bypass ederler) satır yazabilir.

-- 2) offers.payment_status'u client'tan tamamen kilitleyen trigger. Yalnızca aşağıdaki RPC'ler
-- işlem sırasında `hasat.payment_transition = 'on'` local ayarını set ediyor; başka her yol
-- (doğrudan .update(), başka bir RPC, vs.) reddedilir.
create or replace function public.fn_guard_offers_payment_status()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.payment_status is distinct from old.payment_status then
    if coalesce(current_setting('hasat.payment_transition', true), 'off') <> 'on' then
      raise exception 'OFFERS_PAYMENT_STATUS_CLIENT_WRITE_BLOCKED: payment_status yalnızca buyer_mark_transfer_sent / farmer_confirm_payment_received RPC''leri üzerinden değiştirilebilir';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_offers_payment_status
  before update on public.offers
  for each row
  execute function public.fn_guard_offers_payment_status();

-- 3) Buyer: "Havaleyi gönderdiğimi bildir".
create or replace function public.buyer_mark_transfer_sent(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_offer record;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if auth.uid() is null or auth.uid() <> v_offer.buyer_id then
    raise exception 'BUYER_MARK_TRANSFER_SENT_FORBIDDEN: caller is not the buyer on this offer';
  end if;
  if v_offer.status <> 'accepted' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_offer_status');
  end if;
  if v_offer.payment_status <> 'unpaid' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_payment_status');
  end if;

  perform set_config('hasat.payment_transition', 'on', true);
  update public.offers set payment_status = 'pending_transfer' where id = p_offer_id;
  perform set_config('hasat.payment_transition', 'off', true);

  insert into public.payment_status_transitions (offer_id, from_status, to_status, actor_id, actor_role)
  values (p_offer_id, 'unpaid', 'pending_transfer', auth.uid(), 'buyer');

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.buyer_mark_transfer_sent(uuid) from public;
grant execute on function public.buyer_mark_transfer_sent(uuid) to authenticated;

-- 4) Farmer: "Ödemeyi hesabımda gördüm" — payment_status=paid + (idempotent) order oluşturma.
create or replace function public.farmer_confirm_payment_received(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_offer record;
  v_order_id uuid;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if auth.uid() is null or auth.uid() <> v_offer.farmer_id then
    raise exception 'FARMER_CONFIRM_PAYMENT_RECEIVED_FORBIDDEN: caller is not the farmer on this offer';
  end if;
  if v_offer.payment_status <> 'pending_transfer' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_payment_status');
  end if;

  perform set_config('hasat.payment_transition', 'on', true);
  update public.offers set payment_status = 'paid' where id = p_offer_id;
  perform set_config('hasat.payment_transition', 'off', true);

  insert into public.payment_status_transitions (offer_id, from_status, to_status, actor_id, actor_role)
  values (p_offer_id, 'pending_transfer', 'paid', auth.uid(), 'farmer');

  select id into v_order_id from public.orders where offer_id = p_offer_id;
  if v_order_id is null then
    insert into public.orders (offer_id, buyer_id, farmer_id, status, order_ref)
    values (v_offer.id, v_offer.buyer_id, v_offer.farmer_id, 'preparing', '')
    returning id into v_order_id;

    insert into public.order_timeline (order_id, step, label, completed_at)
    values (v_order_id, 'submitted', 'Sipariş Alındı', now());
  end if;

  return jsonb_build_object('ok', true, 'orderId', v_order_id);
end;
$$;

revoke all on function public.farmer_confirm_payment_received(uuid) from public;
grant execute on function public.farmer_confirm_payment_received(uuid) to authenticated;