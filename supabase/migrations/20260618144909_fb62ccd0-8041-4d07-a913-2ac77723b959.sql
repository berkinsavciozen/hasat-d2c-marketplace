CREATE SEQUENCE IF NOT EXISTS public.order_seq;

DROP TRIGGER IF EXISTS orders_set_order_ref ON public.orders;
CREATE TRIGGER orders_set_order_ref
BEFORE INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.order_ref IS NULL OR NEW.order_ref = '')
EXECUTE FUNCTION public.generate_order_ref();