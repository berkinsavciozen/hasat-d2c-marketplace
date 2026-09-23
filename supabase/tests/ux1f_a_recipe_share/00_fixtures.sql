create schema extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.recipes
  add column share_token uuid,
  add constraint recipes_source_type_check check (
    source_type = any (array[
      'manual'::text, 'text'::text, 'photo'::text, 'url'::text,
      'ai_customize'::text, 'photo_estimate'::text, 'clone'::text
    ])
  );
create unique index recipes_share_token_key on public.recipes(share_token)
  where share_token is not null;

insert into public.recipes(
  id, slug, title, status, visibility, source_type, owner_id, author_type, cover_photo_url
) values
  ('10000000-0000-0000-0000-000000000003','owner-one','Owner One','draft','private','manual','20000000-0000-0000-0000-000000000001','kullanici','private://owner-one-cover'),
  ('10000000-0000-0000-0000-000000000004','not-private','Not Private','published','public','manual','20000000-0000-0000-0000-000000000002','kullanici','private://not-private-cover'),
  ('10000000-0000-0000-0000-000000000005','delete-source','Delete Source','draft','private','manual','20000000-0000-0000-0000-000000000002','kullanici','private://delete-cover'),
  ('10000000-0000-0000-0000-000000000006','rollback-source','Rollback Source','draft','private','manual','20000000-0000-0000-0000-000000000002','kullanici','private://rollback-cover'),
  ('10000000-0000-0000-0000-000000000007','stale-source','Stale Source','draft','private','manual','20000000-0000-0000-0000-000000000002','kullanici','private://stale-cover'),
  ('10000000-0000-0000-0000-000000000008','editorial-source','Editorial Source','draft','private','manual','20000000-0000-0000-0000-000000000002','hasat','private://editorial-cover');

insert into public.recipe_ingredients(
  recipe_id, sort_order, free_text_name, quantity, unit, ingredient_class
) values
  ('10000000-0000-0000-0000-000000000002',1,'Domates',2,'adet','platform_disi'),
  ('10000000-0000-0000-0000-000000000005',1,'Biber',1,'adet','platform_disi'),
  ('10000000-0000-0000-0000-000000000006',1,'Rollback Ingredient',1,'adet','platform_disi'),
  ('10000000-0000-0000-0000-000000000007',1,'Kabak',1,'adet','platform_disi');

insert into public.recipe_steps(recipe_id,step_no,instruction,photo_url,timer_seconds) values
  ('10000000-0000-0000-0000-000000000002',1,'Doğra.','private://step-photo',60),
  ('10000000-0000-0000-0000-000000000005',1,'Pişir.','private://delete-step',30),
  ('10000000-0000-0000-0000-000000000006',1,'Hata.','private://rollback-step',10),
  ('10000000-0000-0000-0000-000000000007',1,'Beklet.','private://stale-step',20);
