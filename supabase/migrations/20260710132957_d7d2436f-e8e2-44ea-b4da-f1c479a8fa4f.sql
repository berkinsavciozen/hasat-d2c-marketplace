-- 1) Remove blanket public read policies on parcels, profiles (farmer), certifications
DROP POLICY IF EXISTS "Public read parcels" ON public.parcels;
DROP POLICY IF EXISTS "Public read farmer profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone reads certs" ON public.certifications;

-- 2) Safe public browsing views (SECURITY DEFINER by default; expose ONLY non-sensitive columns)
CREATE OR REPLACE VIEW public.public_farmer_profiles AS
SELECT id, role, name, city, premium, tier, referral_code, created_at
FROM public.profiles
WHERE role = 'farmer';

CREATE OR REPLACE VIEW public.public_parcel_cards AS
SELECT id, farm_id, farmer_id, name, area, crops, location_label,
       parcel_photo_urls, production_method, is_primary, created_at
FROM public.parcels;

CREATE OR REPLACE VIEW public.public_certifications AS
SELECT id, farmer_id, type, verified_at, expires_at, created_at
FROM public.certifications;

GRANT SELECT ON public.public_farmer_profiles TO anon, authenticated;
GRANT SELECT ON public.public_parcel_cards TO anon, authenticated;
GRANT SELECT ON public.public_certifications TO anon, authenticated;

-- 3) Revoke anon/public EXECUTE from SECURITY DEFINER functions that must not be
--    directly callable from the Data API. Trigger functions are still fired by
--    Postgres itself regardless of EXECUTE privileges.
REVOKE ALL ON FUNCTION public.enforce_cert_verification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_community_moderation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_offer_transitions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_self_update_restrictions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_role_for_offer(public.offers) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_price_feed_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_price_feed_summary(text) TO authenticated;

-- 4) Tighten always-true INSERT policy on indoor_interest_leads with basic input constraints
DROP POLICY IF EXISTS "Anyone can submit indoor interest" ON public.indoor_interest_leads;
CREATE POLICY "Anyone can submit indoor interest"
  ON public.indoor_interest_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(btrim(name))  BETWEEN 1 AND 100
    AND char_length(btrim(phone)) BETWEEN 3 AND 30
    AND (city IS NULL OR char_length(city) <= 100)
    AND (interest_type IS NULL OR char_length(interest_type) <= 50)
    AND (note IS NULL OR char_length(note) <= 1000)
  );
