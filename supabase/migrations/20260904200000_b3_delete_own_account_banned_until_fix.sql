-- B-3 (canlı denetim): rpc_delete_own_account() auth.users.banned_until'ı
-- 'infinity'::timestamptz olarak işaretliyordu (bkz. 20260804200339). Bu
-- özel Postgres sentinel değeri Go'nun time.Time tipinde temsil edilemiyor:
-- GoTrue (supabase/auth) User.BannedUntil alanını *time.Time olarak
-- tanımlıyor ve bağlantı için pgx kullanıyor (Pop ORM üzerinden), pgx ise
-- 'infinity'/'−infinity' değerlerini düz bir time.Time hedefine scan ederken
-- hata veriyor -- bu, pgx'te hâlâ opsiyonel olarak bile desteklenmiyor
-- (jackc/pgx#1574, ilgili düzeltme PR'ı #1615 merge edilmeden kapatıldı).
-- Sonuç: banned_until = 'infinity' olan bir kullanıcı için GoTrue'nun
-- /user (supabase.auth.getUser()) uç noktası satırı okurken hataya
-- düşüyor, PR #99'daki requireActiveProfile guard'ının beklediği temiz
-- "kullanıcı yok/banlı" sinyalini alamıyor ve session temizlenmiyor --
-- ChatGPT/Codex'in production'da gözlemlediği "silme sonrası
-- /buyer/discover hâlâ açılıyor" semptomunun kök nedeni bu.
--
-- Düzeltme: 'infinity' yerine somut, çok uzak bir gelecek tarih
-- (now() + 100 yıl). Supabase'in kendi admin ban_duration konvansiyonu da
-- "kalıcı ban" için sabit büyük bir süre öneriyor (resmî dokümantasyonda
-- örnek olarak 87600h/10 yıl geçiyor, resmî bir "sonsuz" anahtar kelime
-- yok); 100 yıl aynı fikirde ama daha bol bir pay bırakıyor. Bu değer
-- time.Time'ın temsil edebildiği aralığın (yıl ~292 milyar) fersah fersah
-- içinde kalır, GoTrue tarafında sorunsuz parse edilir.
--
-- Fonksiyonun geri kalanı (kişisel veri silme/anonimleştirme mantığı,
-- guard'lar, grant'lar) değişmedi -- yalnızca banned_until satırı.
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
      banned_until = now() + interval '100 years',
      updated_at = now()
  where id = v_uid;
end;
$$;

-- Backfill: bu düzeltmeden önce silinmiş hesaplar auth.users'da hâlâ
-- banned_until = 'infinity' ile işaretli kalmış olabilir (production'da bu
-- migration yazılırken 11 satır tespit edildi, hepsi deleted_at IS NULL --
-- yani rpc_delete_own_account tarafından scrub edilmiş ama hard-delete
-- edilmemiş hesaplar, bkz. PR açıklaması). Bu satırları da aynı, sorunsuz
-- parse edilen değere taşı.
update auth.users
set banned_until = now() + interval '100 years'
where banned_until = 'infinity'::timestamptz;
