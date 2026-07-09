CREATE OR REPLACE FUNCTION public.get_price_feed_summary(p_crop text)
 RETURNS TABLE(crop_name text, avg_price numeric, stddev_price numeric, distinct_farmer_count integer, last_updated timestamp with time zone, insufficient_data boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := lower(btrim(p_crop));
  v_count integer;
  v_avg numeric;
  v_stddev numeric;
  v_last timestamptz;
BEGIN
  SELECT
    COUNT(DISTINCT pf.recorded_by),
    AVG(pf.price_per_kg),
    STDDEV_SAMP(pf.price_per_kg),
    MAX(pf.recorded_at)
  INTO v_count, v_avg, v_stddev, v_last
  FROM public.price_feed AS pf
  WHERE lower(btrim(pf.crop_name)) = v_key
    AND pf.recorded_at >= now() - interval '30 days';

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
$function$;