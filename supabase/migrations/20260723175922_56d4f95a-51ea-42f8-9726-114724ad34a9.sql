
ALTER TABLE public.harvest_subscriptions
  ADD COLUMN IF NOT EXISTS crop text,
  ADD COLUMN IF NOT EXISTS note text;
