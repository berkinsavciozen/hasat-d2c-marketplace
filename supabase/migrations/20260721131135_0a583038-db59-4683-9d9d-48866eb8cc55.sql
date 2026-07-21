
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_role text NOT NULL CHECK (reviewer_role IN ('farmer','buyer')),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, reviewer_id)
);

CREATE INDEX reviews_reviewee_idx ON public.reviews(reviewee_id);
CREATE INDEX reviews_order_idx ON public.reviews(order_id);

GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly readable"
  ON public.reviews FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Order parties can insert their review"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.status IN ('delivered','completed')
        AND (
          (reviewer_role = 'buyer'  AND o.buyer_id  = auth.uid() AND o.farmer_id = reviewee_id)
          OR
          (reviewer_role = 'farmer' AND o.farmer_id = auth.uid() AND o.buyer_id  = reviewee_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_farmer_rating_summary(_farmer_id uuid)
RETURNS TABLE(avg_rating numeric, review_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT AVG(rating)::numeric, COUNT(*)::int
  FROM public.reviews
  WHERE reviewee_id = _farmer_id
    AND reviewer_role = 'buyer';
$$;

GRANT EXECUTE ON FUNCTION public.get_farmer_rating_summary(uuid) TO anon, authenticated;
