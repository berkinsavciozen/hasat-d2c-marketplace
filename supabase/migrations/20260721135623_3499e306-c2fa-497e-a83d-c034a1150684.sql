
ALTER FUNCTION public.buyer_addresses_clear_default() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.buyer_addresses_clear_default() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buyer_addresses_touch_updated_at() FROM PUBLIC, anon;
ALTER FUNCTION public.buyer_addresses_touch_updated_at() SET search_path = public;
