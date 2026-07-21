ALTER TABLE public.crop_requests
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS target_date_start date,
  ADD COLUMN IF NOT EXISTS target_date_end date,
  ADD COLUMN IF NOT EXISTS target_price numeric;