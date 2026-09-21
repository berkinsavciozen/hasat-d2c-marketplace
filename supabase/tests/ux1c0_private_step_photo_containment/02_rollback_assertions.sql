\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end $$;

select pg_temp.assert(exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'recipe-step-photos owner insert'
), 'transaction rollback restores legacy INSERT policy');
select pg_temp.assert(exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'recipe-step-photos owner update'
), 'transaction rollback restores legacy UPDATE policy');
select pg_temp.assert(exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'recipe-step-photos owner delete'
    and roles = array['public']::name[]
), 'transaction rollback restores legacy DELETE role target');

\echo 'UX-1C-0 transactional rollback assertions passed'
