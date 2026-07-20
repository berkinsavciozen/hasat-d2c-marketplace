CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text := NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(NEW.phone, ''), '+', ''), '\s+', '', 'g'), '');
  v_role  user_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('farmer','buyer')
    THEN (NEW.raw_user_meta_data->>'role')::user_role
    ELSE 'farmer'::user_role
  END;
  v_code text;
  v_len  int := 6;
  v_profile_count int;
  v_tier public.user_tier := 'free';
  v_premium_until timestamptz := NULL;
BEGIN
  LOOP
    v_code := UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), v_len));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code);
    v_len := v_len + 2;
    IF v_len > 32 THEN
      v_code := UPPER(REPLACE(gen_random_uuid()::text, '-', ''));
      EXIT;
    END IF;
  END LOOP;

  -- Early-adopter bonus: first 100 profiles get 6 months of premium.
  SELECT count(*) INTO v_profile_count FROM public.profiles;
  IF v_profile_count < 100 THEN
    v_tier := 'premium';
    v_premium_until := now() + interval '6 months';
  END IF;

  INSERT INTO public.profiles (id, role, phone, referral_code, tier, premium_until)
  VALUES (NEW.id, v_role, v_phone, v_code, v_tier, v_premium_until)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.notif_prefs (user_id, new_offer_sms)
  VALUES (NEW.id, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;