
CREATE TABLE public.buyer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_addresses TO authenticated;
GRANT ALL ON public.buyer_addresses TO service_role;

ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer_addresses_owner_all" ON public.buyer_addresses
  FOR ALL USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);

CREATE UNIQUE INDEX buyer_addresses_one_default_per_buyer
  ON public.buyer_addresses(buyer_id) WHERE is_default;

CREATE OR REPLACE FUNCTION public.buyer_addresses_clear_default()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.buyer_addresses
      SET is_default = false, updated_at = now()
      WHERE buyer_id = NEW.buyer_id
        AND id <> NEW.id
        AND is_default;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_buyer_addresses_clear_default
  BEFORE INSERT OR UPDATE OF is_default ON public.buyer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.buyer_addresses_clear_default();

CREATE OR REPLACE FUNCTION public.buyer_addresses_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_buyer_addresses_updated_at
  BEFORE UPDATE ON public.buyer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.buyer_addresses_touch_updated_at();
