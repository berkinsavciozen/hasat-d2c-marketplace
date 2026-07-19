ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_until timestamptz;

CREATE TABLE IF NOT EXISTS public.referral_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  qualified_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_qualifications TO authenticated;
GRANT ALL ON public.referral_qualifications TO service_role;
ALTER TABLE public.referral_qualifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Referrer can see own qualifications" ON public.referral_qualifications;
CREATE POLICY "Referrer can see own qualifications"
  ON public.referral_qualifications FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id);
CREATE INDEX IF NOT EXISTS referral_qualifications_referrer_idx
  ON public.referral_qualifications(referrer_id);

CREATE OR REPLACE FUNCTION public.process_referral_qualification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  candidates uuid[] := ARRAY[NEW.buyer_id, NEW.farmer_id];
  candidate uuid;
  ref_by uuid;
  did_insert boolean;
  q_count int;
BEGIN
  IF NEW.payment_status <> 'paid' OR OLD.payment_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  FOREACH candidate IN ARRAY candidates LOOP
    IF candidate IS NULL THEN CONTINUE; END IF;
    SELECT referred_by INTO ref_by FROM public.profiles WHERE id = candidate;
    IF ref_by IS NULL OR ref_by = candidate THEN CONTINUE; END IF;

    did_insert := false;
    WITH ins AS (
      INSERT INTO public.referral_qualifications (referred_user_id, referrer_id)
      VALUES (candidate, ref_by)
      ON CONFLICT (referred_user_id) DO NOTHING
      RETURNING referrer_id
    )
    SELECT true INTO did_insert FROM ins;

    IF COALESCE(did_insert, false) THEN
      SELECT count(*) INTO q_count
        FROM public.referral_qualifications WHERE referrer_id = ref_by;
      IF q_count > 0 AND q_count % 3 = 0 THEN
        UPDATE public.profiles
           SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + interval '12 months',
               tier = 'premium'
         WHERE id = ref_by;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offers_referral_qualification ON public.offers;
CREATE TRIGGER trg_offers_referral_qualification
  AFTER UPDATE OF payment_status ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.process_referral_qualification();

CREATE OR REPLACE FUNCTION public.can_send_ai_message(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tier public.user_tier;
  _pu timestamptz;
  _count integer;
  _month text := to_char(now(), 'YYYY-MM');
  _free_limit constant integer := 50;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
    IF _user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Cross-user access not allowed';
    END IF;
  END IF;

  SELECT tier, premium_until INTO _tier, _pu FROM public.profiles WHERE id = _user_id;
  IF _tier IS NULL THEN RETURN false; END IF;
  IF _tier = 'premium' AND (_pu IS NULL OR _pu > now()) THEN RETURN true; END IF;

  SELECT COALESCE(message_count, 0) INTO _count
    FROM public.ai_usage_tracking WHERE user_id = _user_id AND month = _month;
  RETURN COALESCE(_count, 0) < _free_limit;
END;
$$;