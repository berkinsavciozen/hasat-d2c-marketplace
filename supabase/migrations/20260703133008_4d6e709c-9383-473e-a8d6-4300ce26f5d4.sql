
-- P16-I: crop_config, production_method, price_feed source_type

CREATE TABLE IF NOT EXISTS public.crop_config (
  crop text PRIMARY KEY,
  display_name text NOT NULL,
  default_unit text NOT NULL DEFAULT 'kg',
  harvest_window_start_month int,
  harvest_window_end_month int,
  lifecycle_steps jsonb,
  price_benchmark_source text,
  category_group text
);
GRANT SELECT ON public.crop_config TO anon, authenticated;
GRANT ALL ON public.crop_config TO service_role;
ALTER TABLE public.crop_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read crop_config" ON public.crop_config;
CREATE POLICY "Public read crop_config" ON public.crop_config FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.crop_config (crop, display_name, default_unit, harvest_window_start_month, harvest_window_end_month, lifecycle_steps, price_benchmark_source, category_group) VALUES
  ('safran','Safran','g',10,11,
   '[{"key":"replant","label":"Korm/Dikim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":true}]'::jsonb,
   'Manuel','baharat'),
  ('lavanta','Lavanta','kg',6,8,
   '[{"key":"pruning","label":"Budama","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"distillation","label":"Distilasyon","required":false}]'::jsonb,
   'Manuel','tibbi_bitki'),
  ('fındık','Fındık','kg',8,9,
   '[{"key":"pruning","label":"Budama","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,
   'Manuel','sert_kabuklu'),
  ('safran_soğanı','Safran Soğanı','adet',6,8,
   '[{"key":"lifting","label":"Söküm","required":true},{"key":"grading","label":"Ayıklama","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,
   'Manuel','baharat'),
  ('tıbbi bitkiler','Tıbbi Bitkiler','kg',6,9,
   '[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,
   'Manuel','tibbi_bitki'),
  ('zeytin','Zeytin','kg',10,12,
   '[{"key":"pruning","label":"Budama","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,
   'Manuel','yaglik'),
  ('zeytinyağı','Zeytinyağı','L',10,12,
   '[{"key":"harvest","label":"Hasat","required":true},{"key":"pressing","label":"Sıkım","required":true}]'::jsonb,
   'Manuel','yaglik')
ON CONFLICT (crop) DO NOTHING;

ALTER TABLE public.parcels
  ADD COLUMN IF NOT EXISTS production_method text DEFAULT 'outdoor';
DO $$ BEGIN
  ALTER TABLE public.parcels ADD CONSTRAINT parcels_production_method_check
    CHECK (production_method IN ('indoor','outdoor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.price_feed
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'manual';
DO $$ BEGIN
  ALTER TABLE public.price_feed ADD CONSTRAINT price_feed_source_type_check
    CHECK (source_type IN ('manual','api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
