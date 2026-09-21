create table storage.buckets (
  id text primary key,
  public boolean not null default false
);
insert into storage.buckets(id, public) values ('recipe-step-photos', true);

create function storage.foldername(name text)
returns text[]
language sql
immutable
set search_path = ''
as $$ select string_to_array(name, '/') $$;

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

create policy "recipe-step-photos public read"
  on storage.objects for select to public
  using (bucket_id = 'recipe-step-photos');
create policy "recipe-step-photos owner insert"
  on storage.objects for insert to public
  with check (
    bucket_id = 'recipe-step-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "recipe-step-photos owner update"
  on storage.objects for update to public
  using (
    bucket_id = 'recipe-step-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'recipe-step-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "recipe-step-photos owner delete"
  on storage.objects for delete to public
  using (
    bucket_id = 'recipe-step-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

insert into storage.objects(bucket_id, name) values
  ('recipe-step-photos', '20000000-0000-0000-0000-000000000001/pre-existing/read.jpg'),
  ('recipe-step-photos', '20000000-0000-0000-0000-000000000001/cleanup/delete.jpg');
