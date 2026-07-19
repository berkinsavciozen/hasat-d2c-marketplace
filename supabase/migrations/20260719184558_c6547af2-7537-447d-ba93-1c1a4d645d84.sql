CREATE OR REPLACE FUNCTION public.can_send_ai_message(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tier public.user_tier;
  _pu timestamptz;
  _count integer;
  _month text := to_char(now(), 'YYYY-MM');
  _free_limit constant integer := 50;
  _premium_limit constant integer := 500;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
    IF _user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Cross-user access not allowed';
    END IF;
  END IF;

  SELECT tier, premium_until INTO _tier, _pu FROM public.profiles WHERE id = _user_id;
  IF _tier IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(message_count, 0) INTO _count
    FROM public.ai_usage_tracking WHERE user_id = _user_id AND month = _month;

  IF _tier = 'premium' AND (_pu IS NULL OR _pu > now()) THEN
    RETURN COALESCE(_count, 0) < _premium_limit;
  END IF;

  RETURN COALESCE(_count, 0) < _free_limit;
END;
$$;