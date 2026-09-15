create table public.t4_reconciliation_replay_snapshot as
select md5(
  (select string_agg(row_to_json(x)::text,'|' order by x.food_key)
     from public.ingredient_nutrition_reference x) || '|' ||
  (select string_agg(row_to_json(x)::text,'|' order by x.normalized_alias)
     from public.ingredient_nutrition_alias x) || '|' ||
  (select string_agg(row_to_json(x)::text,'|' order by x.target_kind,x.target_key,x.normalized_unit)
     from public.ingredient_measure_reference x) || '|' ||
  (select string_agg(row_to_json(x)::text,'|' order by x.id)
     from public.recipe_ingredients x
     where x.id in (
       '1f4b2328-1b2b-4129-98e1-0725f9c17c2b','7b8fafb1-178d-42dc-b080-9ee39ead5ea4',
       'c93f566e-06bf-4735-b629-3ccd7973ff87','5b8fff0d-0c85-451c-a70a-df7671babf23',
       '4c6d5e69-73ef-4d04-94c3-fe0267fce9bd','fa458a3f-29ee-4aa5-b09a-74c2ad3b3dbf'
     )) || '|' ||
  (select row_to_json(x)::text from public.crop_nutrition x where x.crop='sumak')
) as digest;
