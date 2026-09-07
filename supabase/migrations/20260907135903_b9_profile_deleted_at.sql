-- B-9: canonical, server-owned account deletion marker. Retain profile/FKs.
-- No automatic legacy backfill: scrubbed names/fields and bans are not unique
-- proof of account deletion. See supabase/tests/b9_profile_deleted_at/README.md.
begin;

alter table public.profiles add column deleted_at timestamptz;
comment on column public.profiles.deleted_at is
  'Account deletion timestamp; NULL means not marked deleted. Written by rpc_delete_own_account, never by clients.';

-- SECURITY INVOKER is intentional: current_user is the API role for a direct
-- write and the RPC owner inside the existing SECURITY DEFINER deletion RPC.
-- Do not use auth.uid(): it is also populated during legitimate RPC deletion.
create function public.protect_profile_deleted_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if TG_OP = 'INSERT' then
      if NEW.deleted_at is not null then
        raise exception 'Account deletion status is server-managed' using errcode = '42501';
      end if;
    elsif NEW.deleted_at is distinct from OLD.deleted_at then
      raise exception 'Account deletion status is server-managed' using errcode = '42501';
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function public.protect_profile_deleted_at() from public, anon, authenticated;
create trigger protect_profile_deleted_at
before insert or update on public.profiles
for each row execute function public.protect_profile_deleted_at();

create or replace function public.rpc_delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_has_active_listing boolean;
  v_has_open_order boolean;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profil bulunamadı';
  end if;

  if v_role = 'farmer' then
    select exists(
      select 1 from public.listings where farmer_id = v_uid and status = 'active'
    ) into v_has_active_listing;

    select exists(
      select 1 from public.orders
      where farmer_id = v_uid and status not in ('completed', 'cancelled')
    ) into v_has_open_order;

    if v_has_active_listing or v_has_open_order then
      raise exception 'Önce açık ilanlarınızı ve siparişlerinizi tamamlayın';
    end if;
  end if;

  -- Personal data: delete outright.
  delete from public.buyer_addresses where buyer_id = v_uid;
  delete from public.buyer_profiles where user_id = v_uid;
  delete from public.recipe_saves where user_id = v_uid;
  delete from public.recipes where owner_id = v_uid and author_type = 'kullanici';
  delete from public.device_tokens where user_id = v_uid;
  delete from public.ai_usage_tracking where user_id = v_uid;
  delete from public.ai_chat_messages where user_id = v_uid;
  delete from public.mcp_tool_calls where user_id = v_uid;

  -- profiles row stays (offers/orders/reviews/community_posts/etc. all
  -- CASCADE from it) but its personal fields are wiped/replaced.
  update public.profiles
  set deleted_at = coalesce(deleted_at, transaction_timestamp()),
      name = 'Silinmiş Kullanıcı',
      phone = null,
      city = null,
      iban = null,
      bank_account_name = null
  where id = v_uid;

  -- auth.users: scrub identity, block login, free the phone number.
  -- Row itself is NOT deleted (see header note re: CASCADE from
  -- offer_messages.sender_id / ai_usage_tracking / ai_chat_messages).
  update auth.users
  set phone = null,
      phone_confirmed_at = null,
      phone_change = null,
      phone_change_token = '',
      email = null,
      email_confirmed_at = null,
      email_change = null,
      email_change_token_new = '',
      email_change_token_current = '',
      encrypted_password = '',
      confirmation_token = '',
      recovery_token = '',
      reauthentication_token = '',
      raw_user_meta_data = '{}'::jsonb,
      banned_until = now() + interval '100 years',
      updated_at = now()
  where id = v_uid;
end;
$$;

-- Preserve the existing RPC's narrow executable surface explicitly.
revoke all on function public.rpc_delete_own_account() from public, anon;
grant execute on function public.rpc_delete_own_account() to authenticated;
commit;
