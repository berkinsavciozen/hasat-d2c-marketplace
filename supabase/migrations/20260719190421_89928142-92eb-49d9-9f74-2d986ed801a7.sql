
-- 1) Update handle_new_user to also seed notif_prefs
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

  INSERT INTO public.profiles (id, role, phone, referral_code)
  VALUES (NEW.id, v_role, v_phone, v_code)
  ON CONFLICT (id) DO NOTHING;

  -- Seed notification preferences with new_offer_sms enabled by default.
  -- Other columns fall back to their table defaults.
  INSERT INTO public.notif_prefs (user_id, new_offer_sms)
  VALUES (NEW.id, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 2) Backfill existing profiles missing a notif_prefs row
INSERT INTO public.notif_prefs (user_id, new_offer_sms)
SELECT p.id, true
FROM public.profiles p
LEFT JOIN public.notif_prefs np ON np.user_id = p.id
WHERE np.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
