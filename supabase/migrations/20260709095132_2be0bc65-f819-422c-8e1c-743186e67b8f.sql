
-- 1. price_feed: revoke direct table access from clients
REVOKE SELECT ON public.price_feed FROM anon;
DROP POLICY IF EXISTS "Public read price feed" ON public.price_feed;

-- Farmer may still see their own history for the price alerts screen.
CREATE POLICY "Farmers read own price feed rows"
  ON public.price_feed FOR SELECT
  TO authenticated
  USING (recorded_by = auth.uid());

-- 2. Aggregate summary function (no per-row exposure)
CREATE OR REPLACE FUNCTION public.get_price_feed_summary(p_crop text)
RETURNS TABLE(
  crop_name text,
  avg_price numeric,
  stddev_price numeric,
  distinct_farmer_count integer,
  last_updated timestamptz,
  insufficient_data boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := lower(btrim(p_crop));
  v_count integer;
  v_avg numeric;
  v_stddev numeric;
  v_last timestamptz;
BEGIN
  SELECT
    COUNT(DISTINCT recorded_by),
    AVG(price_per_kg),
    STDDEV_SAMP(price_per_kg),
    MAX(recorded_at)
  INTO v_count, v_avg, v_stddev, v_last
  FROM public.price_feed
  WHERE lower(btrim(crop_name)) = v_key
    AND recorded_at >= now() - interval '30 days';

  IF COALESCE(v_count, 0) < 5 THEN
    RETURN QUERY SELECT
      v_key,
      NULL::numeric,
      NULL::numeric,
      COALESCE(v_count, 0),
      v_last,
      true;
  ELSE
    RETURN QUERY SELECT
      v_key,
      v_avg,
      COALESCE(v_stddev, 0),
      v_count,
      v_last,
      false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_price_feed_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_price_feed_summary(text) TO anon, authenticated;

-- 3. community_posts moderation flag
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false;
