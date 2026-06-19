ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS negotiation_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.offers
SET negotiation_history = jsonb_build_array(
  jsonb_build_object(
    'by', CASE WHEN status = 'counter' THEN 'buyer' ELSE 'farmer' END,
    'at', COALESCE(updated_at, created_at),
    'quantity', (counter_offer->>'quantity')::numeric,
    'pricePerUnit', (counter_offer->>'pricePerUnit')::numeric,
    'delivery', counter_offer->>'delivery',
    'deliveryDate', counter_offer->>'deliveryDate',
    'note', counter_offer->>'note'
  )
)
WHERE negotiation_history = '[]'::jsonb
  AND counter_offer IS NOT NULL
  AND counter_offer ? 'quantity'
  AND counter_offer ? 'pricePerUnit';