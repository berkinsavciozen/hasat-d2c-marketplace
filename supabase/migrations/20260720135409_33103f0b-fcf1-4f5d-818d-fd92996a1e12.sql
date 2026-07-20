CREATE OR REPLACE FUNCTION public.get_price_history_series(p_crop text, p_weeks int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical text;
  v_cfg record;
  v_since date;
  v_hasat jsonb;
  v_official jsonb := NULL;
BEGIN
  IF p_weeks IS NULL OR p_weeks < 1 THEN p_weeks := 12; END IF;
  IF p_weeks > 104 THEN p_weeks := 104; END IF;

  SELECT crop INTO v_canonical FROM public.crop_config
    WHERE lower(crop) = lower(p_crop) LIMIT 1;

  IF v_canonical IS NULL THEN
    RETURN jsonb_build_object('hasat_series', '[]'::jsonb, 'official_series', NULL);
  END IF;

  SELECT has_official_price_source, official_source_name
    INTO v_cfg FROM public.crop_config WHERE crop = v_canonical;

  v_since := (date_trunc('week', current_date) - make_interval(weeks => p_weeks - 1))::date;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.week_start), '[]'::jsonb)
    INTO v_hasat
    FROM (
      SELECT
        to_char(date_trunc('week', recorded_date), 'YYYY-MM-DD') AS week_start,
        AVG(price_per_unit)::numeric AS avg_price
      FROM public.price_history
      WHERE crop = v_canonical
        AND source = 'order'
        AND recorded_date >= v_since
      GROUP BY date_trunc('week', recorded_date)
      HAVING COUNT(DISTINCT farmer_id) >= 5
    ) t;

  IF COALESCE(v_cfg.has_official_price_source, false) THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.week_start), '[]'::jsonb)
      INTO v_official
      FROM (
        SELECT
          to_char(date_trunc('week', recorded_date), 'YYYY-MM-DD') AS week_start,
          AVG(price_per_unit)::numeric AS avg_price
        FROM public.price_history
        WHERE crop = v_canonical
          AND source = 'hks'
          AND recorded_date >= v_since
        GROUP BY date_trunc('week', recorded_date)
      ) t;
  END IF;

  RETURN jsonb_build_object(
    'hasat_series', v_hasat,
    'official_series', v_official
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_price_history_series(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_price_history_series(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_history_series(text, int) TO service_role;