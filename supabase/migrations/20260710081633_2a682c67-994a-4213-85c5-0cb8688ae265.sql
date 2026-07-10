
CREATE OR REPLACE FUNCTION public.enforce_offer_transitions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  uid uuid := auth.uid();
  econ_changed boolean;
  turn_holder uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF OLD.payment_status = 'unpaid'
       AND NEW.payment_status = 'pending_transfer'
       AND uid = NEW.buyer_id
       AND OLD.status = 'accepted' THEN
      NULL;
    ELSIF OLD.payment_status = 'pending_transfer'
       AND NEW.payment_status = 'paid'
       AND uid = NEW.farmer_id THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Gecersiz odeme durumu gecisi: % -> %',
        OLD.payment_status, NEW.payment_status;
    END IF;
  END IF;

  econ_changed :=
       NEW.price_per_unit    IS DISTINCT FROM OLD.price_per_unit
    OR NEW.quantity          IS DISTINCT FROM OLD.quantity
    OR NEW.current_price     IS DISTINCT FROM OLD.current_price
    OR NEW.current_quantity  IS DISTINCT FROM OLD.current_quantity;

  IF econ_changed THEN
    IF COALESCE(OLD.ball_side,'farmer') = 'farmer' THEN
      turn_holder := OLD.farmer_id;
    ELSE
      turn_holder := OLD.buyer_id;
    END IF;

    IF NEW.status <> 'counter'
       OR OLD.status NOT IN ('pending','counter')
       OR uid <> turn_holder
       OR COALESCE(NEW.ball_side,'farmer') = COALESCE(OLD.ball_side,'farmer')
       OR NEW.ball_side NOT IN ('farmer','buyer') THEN
      RAISE EXCEPTION 'Fiyat/miktar yalnizca karsi teklif sirasinda ve sira sizdeyken degistirilebilir';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'pending' AND NEW.status IN ('counter','accepted','rejected'))
      OR (OLD.status = 'counter' AND NEW.status IN ('counter','accepted','rejected'))
    ) THEN
      RAISE EXCEPTION 'Gecersiz teklif durum gecisi: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_offer_transitions_trg ON public.offers;
CREATE TRIGGER enforce_offer_transitions_trg
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_offer_transitions();

CREATE OR REPLACE FUNCTION public.enforce_community_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  s text;
  has_currency boolean;
  has_coord boolean;
BEGIN
  s := ' ' || lower(coalesce(NEW.content,'')) || ' ';
  has_currency := s LIKE '%₺%' OR s LIKE '% tl%' OR s LIKE '%$%';
  has_coord := s LIKE '%anlaşalım%'
            OR s LIKE '%birlikte%'
            OR s LIKE '%hepimiz%'
            OR s LIKE '%sabit fiyat%'
            OR s LIKE '%taban fiyat%';
  NEW.flagged_for_review := (has_currency AND has_coord);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_community_moderation_trg ON public.community_posts;
CREATE TRIGGER enforce_community_moderation_trg
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_community_moderation();

CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_restrictions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR uid <> NEW.id THEN
    RETURN NEW;
  END IF;

  NEW.role       := OLD.role;
  NEW.tier       := OLD.tier;
  NEW.premium    := OLD.premium;
  NEW.buyer_type := OLD.buyer_type;

  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    IF OLD.referred_by IS NOT NULL THEN
      NEW.referred_by := OLD.referred_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_profile_self_update_restrictions_trg ON public.profiles;
CREATE TRIGGER enforce_profile_self_update_restrictions_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update_restrictions();

CREATE OR REPLACE FUNCTION public.enforce_cert_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF uid = NEW.farmer_id THEN
    NEW.verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_cert_verification_trg ON public.certifications;
CREATE TRIGGER enforce_cert_verification_trg
  BEFORE INSERT OR UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cert_verification();
