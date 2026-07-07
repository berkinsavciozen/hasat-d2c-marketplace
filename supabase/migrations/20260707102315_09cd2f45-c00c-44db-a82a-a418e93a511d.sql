CREATE TABLE IF NOT EXISTS public.indoor_interest_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  city text,
  interest_type text CHECK (interest_type IN ('danışmanlık','ortaklık','diğer')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.indoor_interest_leads TO anon, authenticated;
GRANT ALL ON public.indoor_interest_leads TO service_role;

ALTER TABLE public.indoor_interest_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit indoor interest"
  ON public.indoor_interest_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
