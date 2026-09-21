\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end $$;

select pg_temp.assert(
  (select public from storage.buckets where id = 'recipe-step-photos'),
  'legacy bucket remains public for read compatibility'
);
select pg_temp.assert(not exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in (
      'recipe-step-photos owner insert',
      'recipe-step-photos owner update'
    )
), 'legacy INSERT and UPDATE policies are absent');
select pg_temp.assert(exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'recipe-step-photos public read'
    and cmd = 'SELECT' and roles = array['public']::name[]
), 'public SELECT policy is unchanged');
select pg_temp.assert(exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'recipe-step-photos owner delete'
    and cmd = 'DELETE' and roles = array['authenticated']::name[]
), 'owner DELETE is narrowed to authenticated');

set role anon;
select pg_temp.assert(
  (select count(*) = 1 from storage.objects
   where bucket_id = 'recipe-step-photos' and name like '%/read.jpg'),
  'anon keeps existing read compatibility'
);
do $$ begin
  begin
    insert into storage.objects(bucket_id, name)
    values ('recipe-step-photos', 'anon/new.jpg');
    raise exception 'expected anon insert denial';
  exception when insufficient_privilege then null; end;
end $$;
update storage.objects set name = 'anon/overwrite.jpg'
where bucket_id = 'recipe-step-photos';
select pg_temp.assert(not exists(
  select 1 from storage.objects where name = 'anon/overwrite.jpg'
), 'anon UPDATE affects zero rows');
delete from storage.objects where bucket_id = 'recipe-step-photos';
select pg_temp.assert(
  (select count(*) = 2 from storage.objects where bucket_id = 'recipe-step-photos'),
  'anon DELETE affects zero rows'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);
select pg_temp.assert(
  (select count(*) = 1 from storage.objects
   where bucket_id = 'recipe-step-photos' and name like '%/read.jpg'),
  'authenticated keeps existing read compatibility'
);
do $$ begin
  begin
    insert into storage.objects(bucket_id, name) values (
      'recipe-step-photos',
      auth.uid()::text || '/new.jpg'
    );
    raise exception 'expected authenticated insert denial';
  exception when insufficient_privilege then null; end;
end $$;
update storage.objects set name = auth.uid()::text || '/overwrite.jpg'
where bucket_id = 'recipe-step-photos';
select pg_temp.assert(not exists(
  select 1 from storage.objects where name like '%/overwrite.jpg'
), 'authenticated UPDATE affects zero rows');
delete from storage.objects
where bucket_id = 'recipe-step-photos'
  and name = '20000000-0000-0000-0000-000000000001/cleanup/delete.jpg';
select pg_temp.assert(not exists(
  select 1 from storage.objects where name like '%/cleanup/delete.jpg'
), 'authenticated owner DELETE remains available for cleanup');
reset role;

set role service_role;
insert into storage.objects(bucket_id, name)
values ('recipe-step-photos', 'service/new.jpg');
update storage.objects set name = 'service/updated.jpg'
where bucket_id = 'recipe-step-photos' and name = 'service/new.jpg';
select pg_temp.assert(exists(
  select 1 from storage.objects where name = 'service/updated.jpg'
), 'service_role bypass keeps write operations available');
delete from storage.objects
where bucket_id = 'recipe-step-photos' and name = 'service/updated.jpg';
reset role;

\echo 'UX-1C-0 storage containment assertions passed'
