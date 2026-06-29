
-- Lock down the trigger-only function from the previous migration
REVOKE EXECUTE ON FUNCTION public.enforce_offer_accept_turn() FROM PUBLIC, authenticated, anon;

-- B1. Cleanup orphans
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM auth.users);

-- Safety net: dedup remaining phone collisions (oldest wins)
DELETE FROM public.profiles
WHERE phone IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (phone) id FROM public.profiles
    WHERE phone IS NOT NULL
    ORDER BY phone, created_at ASC
  );

-- B2. Normalize phone format to 905XXXXXXXXX (no +, no whitespace)
UPDATE public.profiles
SET phone = REGEXP_REPLACE(REPLACE(phone, '+', ''), '\s+', '', 'g')
WHERE phone IS NOT NULL
  AND (phone LIKE '+%' OR phone ~ '\s');

-- Drop the placeholder garbage row if it survived (e.g. literal 'X')
UPDATE public.profiles SET phone = NULL WHERE phone !~ '^[0-9]+$';

-- B3. UNIQUE constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_unique;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);

-- B4. Replace handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(NEW.phone, ''), '+', ''), '\s+', '', 'g'), '');
  v_role  user_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('farmer','buyer')
    THEN (NEW.raw_user_meta_data->>'role')::user_role
    ELSE 'farmer'::user_role
  END;
BEGIN
  INSERT INTO public.profiles (id, role, phone)
  VALUES (NEW.id, v_role, v_phone)
  ON CONFLICT (phone) DO NOTHING;
  RETURN NEW;
END;
$$;
