-- FIN-3-S — rows that exist BEFORE the migration under test, for the initial_* backfill.
-- Applied after FIN-3 (snapshot triggers live) and before 20260925143009.

insert into public.listings (id, farmer_id, crop, quantity, price_per_unit) values
  ('b0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Domates', 100, 30);

insert into public.offers (id, buyer_id, farmer_id, listing_id, quantity, price_per_unit,
                           current_quantity, current_price, status, negotiation_history) values
  -- negotiated: history[0] is the original ask (7 @ 30), columns carry the counter (9 @ 35)
  ('b0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 9, 35, 9, 35, 'counter',
   '[{"by":"farmer","at":"2026-09-01T00:00:00Z","quantity":7,"pricePerUnit":30},
     {"by":"buyer","at":"2026-09-02T00:00:00Z","quantity":8,"pricePerUnit":33}]'),
  -- never countered: columns are the original ask
  ('b0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 5, 20, 5, 20, 'pending', '[]'),
  -- malformed history values fall back per column (quantity junk, price usable)
  ('b0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 4, 25, 4, 25, 'counter',
   '[{"by":"farmer","quantity":"abc","pricePerUnit":"22.5"}]');
