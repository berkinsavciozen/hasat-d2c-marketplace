-- Pilot readiness: farmer invite enforcement, publish-time listing integrity,
-- demand-form integrity, and least-privilege public showcase views.
--
-- Existing draft listings are intentionally allowed to remain incomplete.
-- Existing active listings without photos are reported separately and are not
-- mutated by this migration; the NOT VALID photo constraint prevents any new
-- invalid active row while preserving the historical rows for manual review.

-- 1. Public showcase views intentionally remain security-definer projections:
-- their underlying tables contain private columns and cannot be granted to anon.
-- Minimize the exposed capability to SELECT and prevent unsafe predicate pushdown.
alter view public.public_farmer_profiles set (security_barrier = true);
alter view public.public_parcel_cards set (security_barrier = true);
alter view public.public_certifications set (security_barrier = true);

revoke all
  on public.public_farmer_profiles, public.public_parcel_cards, public.public_certifications
  from public, anon, authenticated;
grant select
  on public.public_farmer_profiles, public.public_parcel_cards, public.public_certifications
  to anon, authenticated;

comment on view public.public_farmer_profiles is
  'Minimal anon/authenticated farmer projection. SECURITY DEFINER is intentional because the source table contains private columns; security_barrier and SELECT-only grants are enforced.';
comment on view public.public_parcel_cards is
  'Minimal anon/authenticated parcel projection. SECURITY DEFINER is intentional because the source table contains private columns; security_barrier and SELECT-only grants are enforced.';
comment on view public.public_certifications is
  'Minimal anon/authenticated certification projection. SECURITY DEFINER is intentional because the source table contains private columns; security_barrier and SELECT-only grants are enforced.';

-- 2. New buyers remain open. A brand-new farmer account must present the
-- referral code of an active farmer. Existing users are unaffected because
-- this trigger runs only when auth.users receives a new row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text := nullif(
    regexp_replace(replace(coalesce(new.phone, ''), '+', ''), '\\s+', '', 'g'),
    ''
  );
  v_requested_role text := coalesce(new.raw_user_meta_data->>'role', 'buyer');
  v_role public.user_role :=
    case when v_requested_role = 'farmer'
      then 'farmer'::public.user_role
      else 'buyer'::public.user_role
    end;
  v_invite_code text := upper(btrim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_inviter uuid;
  v_code text;
  v_len int := 6;
  v_profile_count int;
  v_tier public.user_tier := 'free';
  v_premium_until timestamptz := null;
begin
  if v_role = 'farmer'::public.user_role then
    if v_invite_code = '' then
      raise exception using
        errcode = 'P0001',
        message = 'farmer_invite_required';
    end if;

    select p.id
      into v_inviter
      from public.profiles p
     where p.referral_code = v_invite_code
       and p.role = 'farmer'::public.user_role
       and p.deleted_at is null
     limit 1;

    if v_inviter is null then
      raise exception using
        errcode = 'P0001',
        message = 'farmer_invite_invalid';
    end if;
  end if;

  loop
    v_code := upper(left(replace(new.id::text, '-', ''), v_len));
    exit when not exists (
      select 1 from public.profiles p where p.referral_code = v_code
    );
    v_len := v_len + 2;
    if v_len > 32 then
      v_code := upper(replace(gen_random_uuid()::text, '-', ''));
      exit;
    end if;
  end loop;

  select count(*) into v_profile_count from public.profiles;
  if v_profile_count < 100 then
    v_tier := 'premium';
    v_premium_until := now() + interval '6 months';
  end if;

  insert into public.profiles (
    id, role, phone, referral_code, referred_by, tier, premium_until
  )
  values (
    new.id, v_role, v_phone, v_code, v_inviter, v_tier, v_premium_until
  )
  on conflict (id) do nothing;

  insert into public.notif_prefs (user_id, new_offer_sms)
  values (new.id, true)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. Draft listings may be incomplete; switching to active must satisfy the
-- complete pilot contract. NOT VALID avoids rewriting historical rows while
-- applying the checks to every new/updated row immediately.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_active_quantity_positive'
  ) then
    alter table public.listings
      add constraint listings_active_quantity_positive
      check (status <> 'active'::public.listing_status or quantity > 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_active_price_positive'
  ) then
    alter table public.listings
      add constraint listings_active_price_positive
      check (status <> 'active'::public.listing_status or price_per_unit > 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_active_min_order_valid'
  ) then
    alter table public.listings
      add constraint listings_active_min_order_valid
      check (
        status <> 'active'::public.listing_status
        or (min_order > 0 and min_order <= quantity)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_active_parcel_required'
  ) then
    alter table public.listings
      add constraint listings_active_parcel_required
      check (status <> 'active'::public.listing_status or parcel_id is not null)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_active_photo_required'
  ) then
    alter table public.listings
      add constraint listings_active_photo_required
      check (
        status <> 'active'::public.listing_status
        or (
          coalesce(cardinality(photo_urls), 0) > 0
          and array_position(photo_urls, '') is null
        )
      )
      not valid;
  end if;
end
$$;

-- 4. Demand requests use intentional paired quantity/unit input and sane dates.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crop_requests'::regclass
      and conname = 'crop_requests_quantity_unit_pair'
  ) then
    alter table public.crop_requests
      add constraint crop_requests_quantity_unit_pair
      check (
        (quantity is null and unit is null)
        or (
          quantity > 0
          and unit in ('g', 'kg', 'L', 'adet', 'bardak', 'tatli_kasigi', 'yemek kaşığı')
        )
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crop_requests'::regclass
      and conname = 'crop_requests_target_price_positive'
  ) then
    alter table public.crop_requests
      add constraint crop_requests_target_price_positive
      check (target_price is null or target_price > 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crop_requests'::regclass
      and conname = 'crop_requests_date_range_valid'
  ) then
    alter table public.crop_requests
      add constraint crop_requests_date_range_valid
      check (
        target_date_end is null
        or (
          target_date_start is not null
          and target_date_end >= target_date_start
        )
      )
      not valid;
  end if;
end
$$;
