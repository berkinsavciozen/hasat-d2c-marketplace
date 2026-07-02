
ALTER TYPE public.offer_status ADD VALUE IF NOT EXISTS 'pending_farmer';
ALTER TYPE public.offer_status ADD VALUE IF NOT EXISTS 'pending_buyer';

UPDATE public.offers
SET current_price = COALESCE(current_price, price_per_unit),
    current_quantity = COALESCE(current_quantity, quantity),
    ball_side = COALESCE(ball_side, 'farmer'),
    payment_status = COALESCE(payment_status, 'unpaid')
WHERE current_price IS NULL
   OR current_quantity IS NULL
   OR ball_side IS NULL
   OR payment_status IS NULL;
