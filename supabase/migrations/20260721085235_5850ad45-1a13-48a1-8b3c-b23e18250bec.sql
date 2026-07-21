
-- 1) Add 'cancelled' to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2) Add columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS dispute_window_expires_at timestamptz;

-- 3) Disputes table
CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  evidence_photo_urls text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution text,
  resolved_at timestamptz,
  window_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order parties can view own disputes"
  ON public.disputes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = disputes.order_id
      AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
  ));

CREATE POLICY "Order parties can open disputes"
  ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = disputes.order_id
        AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
    )
  );

CREATE POLICY "Order parties can update own disputes"
  ON public.disputes FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = disputes.order_id
      AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = disputes.order_id
      AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS disputes_order_id_idx ON public.disputes(order_id);

-- 4) Storage RLS for delivery-photos bucket (bucket itself created via tool)
-- Path convention: <order_id>/...
CREATE POLICY "Order parties can read delivery photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id::text = split_part(name, '/', 1)
        AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
    )
  );

CREATE POLICY "Order parties can upload delivery photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-photos'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id::text = split_part(name, '/', 1)
        AND (o.buyer_id = auth.uid() OR o.farmer_id = auth.uid())
    )
  );
