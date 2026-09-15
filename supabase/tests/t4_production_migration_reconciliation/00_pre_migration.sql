-- The T4 reference migration adds a pul_biber nutrition row; reproduce its controlled crop FK.
insert into public.crop_config(crop,display_name,default_unit) values ('pul_biber','Pul biber','kg');
insert into public.crop_culinary_meta(crop,is_edible,conversion_hints) values ('pul_biber',true,'{}');

-- Reproduce the project's permissive function default ACL. PostgreSQL grants EXECUTE to PUBLIC
-- by default; these extra role grants prove every function in the migration closes all three paths.
alter default privileges in schema public grant execute on functions to public, anon, authenticated;

-- Rows matching the six live T4-B guarded corrections. These are synthetic test fixtures only.
insert into public.crop_config(crop,display_name,default_unit) values
  ('sumak','Sumak','kg'),
  ('kekik','Kekik','kg');
insert into public.crop_culinary_meta(crop,is_edible,conversion_hints) values
  ('sumak',true,'{}'),
  ('kekik',true,'{}');
insert into public.recipes(id,slug,title,servings,owner_id,status,visibility) values
  ('00000000-0000-0000-0000-000000000200','t4b-replay-fixture','T4-B replay fixture',2,
   '00000000-0000-0000-0000-0000000000a1','draft','private');
insert into public.recipe_ingredients(id,recipe_id,sort_order,free_text_name,quantity,unit) values
  ('1f4b2328-1b2b-4129-98e1-0725f9c17c2b','00000000-0000-0000-0000-000000000200',1,'salatalık',1,null),
  ('7b8fafb1-178d-42dc-b080-9ee39ead5ea4','00000000-0000-0000-0000-000000000200',2,'domates',1,null),
  ('c93f566e-06bf-4735-b629-3ccd7973ff87','00000000-0000-0000-0000-000000000200',3,'kekik',1,'tatli_kasigi'),
  ('5b8fff0d-0c85-451c-a70a-df7671babf23','00000000-0000-0000-0000-000000000200',4,'tuz',null,null),
  ('4c6d5e69-73ef-4d04-94c3-fe0267fce9bd','00000000-0000-0000-0000-000000000200',5,'tuz',null,null),
  ('fa458a3f-29ee-4aa5-b09a-74c2ad3b3dbf','00000000-0000-0000-0000-000000000200',6,'karabiber',null,null);
