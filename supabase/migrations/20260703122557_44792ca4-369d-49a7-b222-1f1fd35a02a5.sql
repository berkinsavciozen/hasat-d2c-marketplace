
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id);

UPDATE public.profiles SET referral_code = UPPER(LEFT(id::text, 6)) WHERE referral_code IS NULL;

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
  -- Generate a unique referral code, growing length on the rare collision.
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
  ON CONFLICT (phone) DO NOTHING;
  RETURN NEW;
END;
$function$;
