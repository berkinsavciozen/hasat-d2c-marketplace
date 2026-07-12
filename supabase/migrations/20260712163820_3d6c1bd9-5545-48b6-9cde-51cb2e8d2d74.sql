UPDATE public.crop_config
SET lifecycle_steps = '[
  {"key":"ekim","label":"Korm/Dikim","required":true},
  {"key":"care","label":"Bakım","required":false},
  {"key":"harvest","label":"Hasat","required":true},
  {"key":"drying","label":"Kurutma","required":true}
]'::jsonb
WHERE crop = 'safran';