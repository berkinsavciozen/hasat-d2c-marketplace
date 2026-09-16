CREATE OR REPLACE FUNCTION public.get_price_board(p_days integer DEFAULT 30, p_crops text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_cur_from date := current_date - v_days;
  v_prev_from date := current_date - (2 * v_days);
  v_result jsonb;
BEGIN
  WITH cfg AS (
    SELECT c.crop, c.display_name, c.default_unit, c.price_window_type,
           c.has_official_price_source, c.official_source_name
    FROM public.crop_config c
    WHERE p_crops IS NULL
       OR lower(c.crop) = ANY (SELECT lower(x) FROM unnest(p_crops) x)
  ),
  ph AS (
    SELECT p.crop, p.source, p.market_source_code, p.price_per_unit,
           p.farmer_id, p.recorded_date,
           (p.recorded_date >= v_cur_from) AS is_cur,
           (p.recorded_date >= v_prev_from AND p.recorded_date < v_cur_from) AS is_prev
    FROM public.price_history p
    WHERE p.recorded_date >= v_prev_from
      AND p.crop IN (SELECT crop FROM cfg)
  ),
  hasat AS (
    SELECT c.crop,
           AVG(x.price_per_unit) FILTER (WHERE x.is_cur) AS cur_price,
           AVG(x.price_per_unit) FILTER (WHERE x.is_prev) AS prev_price,
           COUNT(DISTINCT x.farmer_id) FILTER (WHERE x.is_cur) AS cur_farmers,
           COUNT(DISTINCT x.farmer_id) FILTER (WHERE x.is_prev) AS prev_farmers,
           COUNT(*) FILTER (WHERE x.is_cur) AS cur_points,
           MAX(x.recorded_date) FILTER (WHERE x.is_cur) AS last_date
    FROM cfg c
    LEFT JOIN ph x ON x.crop = c.crop AND x.source = 'order'
    GROUP BY c.crop
  ),
  official AS (
    SELECT c.crop,
           AVG(x.price_per_unit) FILTER (WHERE x.is_cur) AS cur_price,
           AVG(x.price_per_unit) FILTER (WHERE x.is_prev) AS prev_price,
           COUNT(*) FILTER (WHERE x.is_cur) AS cur_points,
           MAX(x.recorded_date) FILTER (WHERE x.is_cur) AS last_date
    FROM cfg c
    LEFT JOIN ph x ON x.crop = c.crop AND x.source = 'hks'
    GROUP BY c.crop
  ),
  markets AS (
    SELECT x.crop, ms.code, ms.display_name, ms.region,
           AVG(x.price_per_unit) FILTER (WHERE x.is_cur) AS cur_price,
           AVG(x.price_per_unit) FILTER (WHERE x.is_prev) AS prev_price,
           COUNT(*) FILTER (WHERE x.is_cur) AS cur_points,
           MAX(x.recorded_date) FILTER (WHERE x.is_cur) AS last_date
    FROM ph x
    JOIN public.market_sources ms ON ms.code = x.market_source_code
    WHERE x.market_source_code IS NOT NULL
    GROUP BY x.crop, ms.code, ms.display_name, ms.region
  ),
  market_json AS (
    SELECT m.crop,
           jsonb_agg(
             jsonb_build_object(
               'key', m.code,
               'kind', 'market',
               'label', m.display_name,
               'region', m.region,
               'price', m.cur_price,
               'prev_price', m.prev_price,
               'change_pct', CASE WHEN m.cur_price IS NOT NULL AND m.prev_price IS NOT NULL AND m.prev_price <> 0
                                  THEN round(((m.cur_price - m.prev_price) / m.prev_price) * 100, 1) END,
               'points', m.cur_points,
               'last_date', m.last_date,
               'insufficient', false
             ) ORDER BY m.display_name
           ) AS sources
    FROM markets m
    WHERE m.cur_price IS NOT NULL
    GROUP BY m.crop
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.display_name,
           jsonb_build_object(
             'crop', c.crop,
             'display_name', c.display_name,
             'unit', c.default_unit,
             'window_type', c.price_window_type,
             'hasat', jsonb_build_object(
                'key', 'hasat',
                'kind', 'hasat',
                'label', 'Hasat',
                'insufficient', (COALESCE(h.cur_farmers, 0) < 5),
                'price', CASE WHEN COALESCE(h.cur_farmers, 0) >= 5 THEN h.cur_price END,
                'prev_price', CASE WHEN COALESCE(h.cur_farmers, 0) >= 5 AND COALESCE(h.prev_farmers, 0) >= 5 THEN h.prev_price END,
                'change_pct', CASE WHEN COALESCE(h.cur_farmers, 0) >= 5 AND COALESCE(h.prev_farmers, 0) >= 5
                                     AND h.cur_price IS NOT NULL AND h.prev_price IS NOT NULL AND h.prev_price <> 0
                                   THEN round(((h.cur_price - h.prev_price) / h.prev_price) * 100, 1) END,
                'farmer_count', COALESCE(h.cur_farmers, 0),
                'points', COALESCE(h.cur_points, 0),
                'last_date', h.last_date
             ),
             'official', CASE WHEN c.has_official_price_source AND o.cur_price IS NOT NULL THEN
                jsonb_build_object(
                  'key', 'official',
                  'kind', 'official',
                  'label', COALESCE(c.official_source_name, 'Resmi kaynak'),
                  'price', o.cur_price,
                  'prev_price', o.prev_price,
                  'change_pct', CASE WHEN o.prev_price IS NOT NULL AND o.prev_price <> 0
                                     THEN round(((o.cur_price - o.prev_price) / o.prev_price) * 100, 1) END,
                  'points', o.cur_points,
                  'last_date', o.last_date,
                  'insufficient', false
                ) END,
             'markets', COALESCE(mj.sources, '[]'::jsonb),
             'has_any_data', (
               (COALESCE(h.cur_farmers, 0) >= 5 AND h.cur_price IS NOT NULL)
               OR (c.has_official_price_source AND o.cur_price IS NOT NULL)
               OR mj.sources IS NOT NULL
             )
           ) AS row_json
    FROM cfg c
    LEFT JOIN hasat h ON h.crop = c.crop
    LEFT JOIN official o ON o.crop = c.crop
    LEFT JOIN market_json mj ON mj.crop = c.crop
  ) rows;

  RETURN COALESCE(v_result, '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION public.get_price_board(integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_price_board(integer, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_board(integer, text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_price_board(integer, text[]) TO service_role;