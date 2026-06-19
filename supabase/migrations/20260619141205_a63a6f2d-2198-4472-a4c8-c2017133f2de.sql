
-- 1) Profiles: replace broad buyer→farmer read with relationship-scoped read
DROP POLICY IF EXISTS "Buyers read farmer profiles" ON public.profiles;
CREATE POLICY "Buyers read related farmer profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  role = 'farmer'::user_role
  AND public.get_my_role() = 'buyer'
  AND (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.farmer_id = profiles.id AND o.buyer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.harvest_subscriptions s WHERE s.farmer_id = profiles.id AND s.buyer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.offers of WHERE of.farmer_id = profiles.id AND of.buyer_id = auth.uid())
  )
);

-- 2) harvest_entries: scope buyer reads to entries tied to their actual orders
DROP POLICY IF EXISTS "Buyers read entries for completed orders" ON public.harvest_entries;
CREATE POLICY "Buyers read entries for their orders" ON public.harvest_entries
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.offers of ON of.id = o.offer_id
    JOIN public.listings l ON l.id = of.listing_id
    WHERE o.buyer_id = auth.uid()
      AND l.harvest_entry_id = harvest_entries.id
  )
);

-- 3) Storage: certificates UPDATE/DELETE
DROP POLICY IF EXISTS "Farmers update own certificates" ON storage.objects;
DROP POLICY IF EXISTS "Farmers delete own certificates" ON storage.objects;
CREATE POLICY "Farmers update own certificates" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'certificates' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'certificates' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Farmers delete own certificates" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'certificates' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 4) Storage: harvest-photos UPDATE/DELETE scoped to owner
DROP POLICY IF EXISTS "Farmers update own photos" ON storage.objects;
DROP POLICY IF EXISTS "Farmers delete own photos" ON storage.objects;
CREATE POLICY "Farmers update own photos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'harvest-photos' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'harvest-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Farmers delete own photos" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'harvest-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 5) Storage: drop overly broad listing on harvest-photos. Public bucket URLs still work.
DROP POLICY IF EXISTS "Anyone reads harvest photos" ON storage.objects;

-- 6) Realtime: restrict broadcast channel subscriptions to the user's own topic.
-- postgres_changes continues to flow through source-table RLS unaffected.
DROP POLICY IF EXISTS "Users subscribe to own topic" ON realtime.messages;
CREATE POLICY "Users subscribe to own topic" ON realtime.messages
FOR SELECT TO authenticated
USING ( (select auth.uid())::text = realtime.topic() );

-- 7) Lock down search_path on trigger functions flagged by the linter
CREATE OR REPLACE FUNCTION public.generate_order_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  new.order_ref := 'HT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_seq')::text, 4, '0');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  if tg_op = 'INSERT' then
    update community_posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update community_posts set likes_count = likes_count - 1 where id = old.post_id;
  end if;
  return null;
end;
$function$;

-- 8) Revoke EXECUTE from anon/authenticated for internal trigger/event-trigger functions
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generate_order_ref() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_likes_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_offer_received() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_offer_accepted() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_order_status() FROM anon, authenticated, public;

-- 9) get_my_role is used inside RLS policies as SECURITY DEFINER — keep authenticated execute,
-- but drop anon (unauthenticated callers should never need role lookup).
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
