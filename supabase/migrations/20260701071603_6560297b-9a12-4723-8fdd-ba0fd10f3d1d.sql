CREATE POLICY "Farmers read related buyer profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'buyer'::user_role
  AND get_my_role() = 'farmer'
  AND (
    EXISTS (SELECT 1 FROM offers o WHERE o.buyer_id = profiles.id AND o.farmer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM orders o WHERE o.buyer_id = profiles.id AND o.farmer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM harvest_subscriptions s WHERE s.buyer_id = profiles.id AND s.farmer_id = auth.uid())
  )
);