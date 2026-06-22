
-- 1. tier enum + column on profiles
DO $$ BEGIN
  CREATE TYPE public.user_tier AS ENUM ('free','premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier public.user_tier NOT NULL DEFAULT 'free';

UPDATE public.profiles SET tier = 'premium' WHERE premium = true AND tier = 'free';

CREATE OR REPLACE FUNCTION public.profiles_sync_tier_premium()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tier = 'free' AND NEW.premium = true THEN
      NEW.tier := 'premium';
    ELSIF NEW.tier = 'premium' AND NEW.premium = false THEN
      NEW.premium := true;
    ELSIF NEW.tier = 'free' AND NEW.premium = false THEN
      NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.premium IS NOT DISTINCT FROM OLD.premium THEN
      NEW.premium := (NEW.tier = 'premium');
    ELSIF NEW.premium IS DISTINCT FROM OLD.premium AND NEW.tier IS NOT DISTINCT FROM OLD.tier THEN
      NEW.tier := CASE WHEN NEW.premium THEN 'premium'::public.user_tier ELSE 'free'::public.user_tier END;
    ELSIF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.premium IS DISTINCT FROM OLD.premium THEN
      -- both changed: trust tier as source of truth
      NEW.premium := (NEW.tier = 'premium');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_tier_premium ON public.profiles;
CREATE TRIGGER profiles_sync_tier_premium
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_tier_premium();

-- 2. ai_chat_messages
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  source text NOT NULL DEFAULT 'in_app' CHECK (source IN ('in_app','whatsapp')),
  page_context text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_messages_user_created_idx
  ON public.ai_chat_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_chat_messages_user_session_idx
  ON public.ai_chat_messages (user_id, session_id, created_at);

GRANT SELECT, INSERT ON public.ai_chat_messages TO authenticated;
GRANT ALL ON public.ai_chat_messages TO service_role;

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_chat_messages_select_own" ON public.ai_chat_messages;
CREATE POLICY "ai_chat_messages_select_own" ON public.ai_chat_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_chat_messages_insert_own" ON public.ai_chat_messages;
CREATE POLICY "ai_chat_messages_insert_own" ON public.ai_chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 3. ai_usage_tracking
CREATE TABLE IF NOT EXISTS public.ai_usage_tracking (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  message_count integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);

GRANT SELECT, INSERT, UPDATE ON public.ai_usage_tracking TO authenticated;
GRANT ALL ON public.ai_usage_tracking TO service_role;

ALTER TABLE public.ai_usage_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_select_own" ON public.ai_usage_tracking;
CREATE POLICY "ai_usage_select_own" ON public.ai_usage_tracking
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_usage_insert_own" ON public.ai_usage_tracking;
CREATE POLICY "ai_usage_insert_own" ON public.ai_usage_tracking
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_usage_update_own" ON public.ai_usage_tracking;
CREATE POLICY "ai_usage_update_own" ON public.ai_usage_tracking
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Helpers
CREATE OR REPLACE FUNCTION public.can_send_ai_message(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier public.user_tier;
  _count integer;
  _month text := to_char(now(), 'YYYY-MM');
  _free_limit constant integer := 50;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
    IF _user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Cross-user access not allowed';
    END IF;
  END IF;

  SELECT tier INTO _tier FROM public.profiles WHERE id = _user_id;
  IF _tier IS NULL THEN
    RETURN false;
  END IF;
  IF _tier = 'premium' THEN
    RETURN true;
  END IF;

  SELECT COALESCE(message_count, 0) INTO _count
  FROM public.ai_usage_tracking
  WHERE user_id = _user_id AND month = _month;

  RETURN COALESCE(_count, 0) < _free_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ai_usage(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month text := to_char(now(), 'YYYY-MM');
  _new_count integer;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
    IF _user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Cross-user access not allowed';
    END IF;
  END IF;

  INSERT INTO public.ai_usage_tracking (user_id, month, message_count, updated_at)
  VALUES (_user_id, _month, 1, now())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    message_count = public.ai_usage_tracking.message_count + 1,
    updated_at = now()
  RETURNING message_count INTO _new_count;

  RETURN _new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.can_send_ai_message(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_ai_message(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid) TO authenticated, service_role;
