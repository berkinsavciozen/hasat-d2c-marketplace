
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS buyer_type public.company_type;

UPDATE public.profiles p
SET buyer_type = bp.company_type
FROM public.buyer_profiles bp
WHERE bp.user_id = p.id AND p.buyer_type IS NULL;
