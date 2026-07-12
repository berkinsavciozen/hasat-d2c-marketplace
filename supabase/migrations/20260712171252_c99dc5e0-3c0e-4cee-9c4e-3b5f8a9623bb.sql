CREATE OR REPLACE FUNCTION public.get_price_history_summary(p_crop text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_canonical text;
  v_cfg record;
  v_days int; v_since date;
  v_hasat jsonb; v_official jsonb := NULL;
  v_avg numeric; v_std numeric; v_cnt int; v_last timestamptz;
BEGIN
  SELECT crop INTO v_canonical FROM public.crop_config
    WHERE lower(crop) = lower(p_crop) LIMIT 1;
  IF v_canonical IS NULL THEN
    RETURN jsonb_build_object('hasat_data', jsonb_build_object('insufficient_data', true),
                              'official_data', NULL, 'last_updated', NULL);
  END IF;

  SELECT price_window_type, has_official_price_source, official_source_name
    INTO v_cfg FROM public.crop_config WHERE crop = v_canonical;

  v_days := CASE WHEN v_cfg.price_window_type = 'rolling_365d' THEN 365 ELSE 30 END;
  v_since := current_date - v_days;

  SELECT AVG(price_per_unit), STDDEV_SAMP(price_per_unit),
         COUNT(DISTINCT farmer_id), MAX(created_at)
    INTO v_avg, v_std, v_cnt, v_last
    FROM public.price_history
    WHERE crop = v_canonical AND source = 'order' AND recorded_date >= v_since;

  IF COALESCE(v_cnt,0) < 5 THEN
    v_hasat := jsonb_build_object('insufficient_data', true,
                                  'distinct_farmer_count', COALESCE(v_cnt,0));
  ELSE
    v_hasat := jsonb_build_object('insufficient_data', false,
      'avg_price', v_avg, 'stddev_price', COALESCE(v_std,0),
      'distinct_farmer_count', v_cnt);
  END IF;

  IF v_cfg.has_official_price_source THEN
    SELECT AVG(price_per_unit) INTO v_avg
      FROM public.price_history
      WHERE crop = v_canonical AND source = 'hks' AND recorded_date >= v_since;
    IF v_avg IS NOT NULL THEN
      v_official := jsonb_build_object('avg_price', v_avg,
                                       'official_source_name', v_cfg.official_source_name);
    END IF;
  END IF;

  RETURN jsonb_build_object('hasat_data', v_hasat,
                            'official_data', v_official,
                            'last_updated', v_last);
END $$;