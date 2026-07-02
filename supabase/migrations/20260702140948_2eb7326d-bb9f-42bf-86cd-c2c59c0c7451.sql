CREATE TABLE public.price_feed (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_name text NOT NULL,
  price_per_kg numeric NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  source text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT ON public.price_feed TO anon, authenticated;
GRANT INSERT ON public.price_feed TO authenticated;
GRANT ALL ON public.price_feed TO service_role;

ALTER TABLE public.price_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read price feed"
  ON public.price_feed FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Farmers can insert price feed"
  ON public.price_feed FOR INSERT
  TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'farmer')
  );

CREATE INDEX idx_price_feed_crop_recorded ON public.price_feed (LOWER(TRIM(crop_name)), recorded_at DESC);