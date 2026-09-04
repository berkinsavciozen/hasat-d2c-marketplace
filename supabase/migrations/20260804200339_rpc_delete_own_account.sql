-- rpc_delete_own_account: in-app account deletion (Apple 5.1.1(v) requirement)
--
-- Architecture (kural #106): shared by web + mobile, DB-only, no user_id param.
--
-- Key finding: public.profiles.id has NO foreign key to auth.users (only PK).
-- Deleting auth.users hard would CASCADE-wipe offer_messages/ai_usage_tracking
-- (they FK directly to auth.users), destroying data we're required to
-- anonymize, not delete. So auth.users is never deleted -- its identifying
-- columns are scrubbed in place (phone/email/password/tokens -> null/blank,
-- banned_until -> infinity). This blocks login, frees the phone number for
-- re-registration (UNIQUE allows multiple NULLs), and keeps auth.users.id
-- alive so FKs pointing at it (offer_messages.sender_id etc.) never fire
-- CASCADE.
--
-- public.profiles is likewise kept (not deleted) and anonymized in place --
-- every table that CASCADEs from profiles(id) (offers, orders, reviews,
-- community_posts, ...) stays valid and automatically displays as
-- "Silinmis Kullanici" through the existing join, satisfying "karsi tarafin
-- kaydi ve itibari korunmali" without touching those tables at all.
--
-- Farmer guard: an account with an active listing or a non-final order
-- cannot self-delete (traceability chain for buyers who bought from this
-- farmer must stay intact) -- raises so the client can show
-- "once acik ilan/siparislerinizi tamamlayin".

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
  set name = 'Silinmiş Kullanıcı',
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
      banned_until = 'infinity'::timestamptz,
      updated_at = now()
  where id = v_uid;
end;
$$;

revoke all on function public.rpc_delete_own_account() from public;
grant execute on function public.rpc_delete_own_account() to authenticated;
