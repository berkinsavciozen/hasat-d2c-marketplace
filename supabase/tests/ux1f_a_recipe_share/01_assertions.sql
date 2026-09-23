\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

create temp table test_runtime_tokens(
  label text primary key,
  token text not null,
  grant_id uuid not null
);
create temp table test_ids(label text primary key, id uuid not null);
grant all on test_runtime_tokens, test_ids to authenticated;

-- Schema, RLS, ACL, definer-boundary, and legacy retirement matrix.
select pg_temp.assert((select relrowsecurity from pg_class where oid='private.recipe_share_grants'::regclass),'grant RLS enabled');
select pg_temp.assert((select relrowsecurity from pg_class where oid='private.recipe_share_clone_operations'::regclass),'operation RLS enabled');
select pg_temp.assert(not has_table_privilege('authenticated','private.recipe_share_grants','select'),'authenticated grant table denied');
select pg_temp.assert(not has_table_privilege('service_role','private.recipe_share_grants','select'),'service role grant table denied');
select pg_temp.assert(not has_table_privilege('anon','private.recipe_share_clone_operations','insert'),'anon operation table denied');
select pg_temp.assert(not exists(
  select 1 from pg_class c
  cross join lateral aclexplode(c.relacl) x
  where c.oid in ('private.recipe_share_grants'::regclass,'private.recipe_share_clone_operations'::regclass)
    and x.grantee=0
),'PUBLIC has no ledger privilege');
select pg_temp.assert(to_regprocedure('public.rpc_get_shared_recipe(uuid)') is null,'legacy anonymous resolve removed');
select pg_temp.assert(to_regprocedure('public.rpc_clone_shared_recipe(uuid)') is null,'legacy non-idempotent clone removed');
select pg_temp.assert(to_regprocedure('public.rpc_generate_recipe_share_token(uuid)') is null,'legacy raw token mint removed');
select pg_temp.assert((select bool_and(share_token is null) from public.recipes),'legacy raw tokens cleared');
select pg_temp.assert(not has_column_privilege('authenticated','public.recipes','share_token','update'),'F0 share_token UPDATE denial preserved');

select pg_temp.assert(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'rpc_create_recipe_share_grant','rpc_list_recipe_share_grants',
    'rpc_rotate_recipe_share_grant','rpc_revoke_recipe_share_grant',
    'rpc_resolve_recipe_share','rpc_clone_shared_recipe'
  ) and p.prosecdef
),'public recipe share RPCs are SECURITY INVOKER');
select pg_temp.assert((
  select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname like '%recipe_share%'
    and p.proname <> 'validate_recipe_share_expiry'
),'private share definers have empty search_path');

select pg_temp.assert(has_function_privilege('authenticated','public.rpc_create_recipe_share_grant(uuid,timestamptz)','execute'),'authenticated create execute');
select pg_temp.assert(has_function_privilege('authenticated','public.rpc_resolve_recipe_share(text)','execute'),'authenticated resolve execute');
select pg_temp.assert(has_function_privilege('authenticated','public.rpc_clone_shared_recipe(text,uuid)','execute'),'authenticated clone execute');
select pg_temp.assert(not has_function_privilege('anon','public.rpc_resolve_recipe_share(text)','execute'),'anon resolve denied');
select pg_temp.assert(not has_function_privilege('service_role','public.rpc_clone_shared_recipe(text,uuid)','execute'),'service role clone execute denied');

set role anon;
do $$ begin
  begin
    perform public.rpc_resolve_recipe_share(repeat('a',64));
    raise exception 'expected anon execute denial';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Owner lifecycle and eligibility. Raw tokens stay only in this disposable temp
-- table and are never selected or printed by the test runner.
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
do $$
declare
  v_created jsonb;
  v_rotated jsonb;
  v_second jsonb;
  v_self jsonb;
  v_revoke jsonb;
begin
  v_created := public.rpc_create_recipe_share_grant(
    '10000000-0000-0000-0000-000000000002', clock_timestamp()+interval '1 day'
  );
  perform pg_temp.assert((v_created->>'token') ~ '^[0-9a-f]{64}$','token has 256-bit hex shape');
  insert into test_runtime_tokens values ('old',v_created->>'token',(v_created->>'grant_id')::uuid);
  perform pg_temp.assert(
    public.rpc_list_recipe_share_grants('10000000-0000-0000-0000-000000000002')::text
      not like '%' || (v_created->>'token') || '%',
    'grant listing never returns raw token'
  );

  begin
    perform public.rpc_create_recipe_share_grant(
      '10000000-0000-0000-0000-000000000004', clock_timestamp()+interval '1 day'
    );
    raise exception 'expected public/published source denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_source_not_eligible','public/published rejected');
  end;
  begin
    perform public.rpc_create_recipe_share_grant(
      '10000000-0000-0000-0000-000000000008', clock_timestamp()+interval '1 day'
    );
    raise exception 'expected editorial source denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_source_not_eligible','editorial source rejected');
  end;
  begin
    perform public.rpc_create_recipe_share_grant(
      '10000000-0000-0000-0000-000000000002', clock_timestamp()+interval '1 minute'
    );
    raise exception 'expected short expiry denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_invalid_expiry','mandatory expiry bounds enforced');
  end;

  v_rotated := public.rpc_rotate_recipe_share_grant(
    (v_created->>'grant_id')::uuid, clock_timestamp()+interval '2 days'
  );
  insert into test_runtime_tokens values ('rotated',v_rotated->>'token',(v_rotated->>'grant_id')::uuid);

  v_second := public.rpc_create_recipe_share_grant(
    '10000000-0000-0000-0000-000000000002', clock_timestamp()+interval '1 day'
  );
  insert into test_runtime_tokens values ('second',v_second->>'token',(v_second->>'grant_id')::uuid);

  v_self := public.rpc_create_recipe_share_grant(
    '10000000-0000-0000-0000-000000000005', clock_timestamp()+interval '1 day'
  );
  insert into test_runtime_tokens values ('delete',v_self->>'token',(v_self->>'grant_id')::uuid);

  begin
    perform public.rpc_clone_shared_recipe(v_self->>'token','30000000-0000-4000-8000-000000000199');
    raise exception 'expected own clone denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_cannot_clone_own','owner cannot clone own share');
  end;

  v_revoke := public.rpc_create_recipe_share_grant(
    '10000000-0000-0000-0000-000000000005', clock_timestamp()+interval '1 day'
  );
  insert into test_runtime_tokens values ('revoked',v_revoke->>'token',(v_revoke->>'grant_id')::uuid);
  perform public.rpc_revoke_recipe_share_grant((v_revoke->>'grant_id')::uuid);
  perform public.rpc_revoke_recipe_share_grant((v_revoke->>'grant_id')::uuid);
end $$;

-- Owner cannot create a grant for another owner's recipe.
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
do $$ begin
  begin
    perform public.rpc_create_recipe_share_grant(
      '10000000-0000-0000-0000-000000000002', clock_timestamp()+interval '1 day'
    );
    raise exception 'expected cross-owner denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_source_not_eligible','cross-owner create rejected');
  end;
end $$;

-- Rotated and forged tokens fail closed; the replacement resolves without media.
do $$
declare v_payload jsonb;
begin
  begin
    perform public.rpc_resolve_recipe_share((select token from test_runtime_tokens where label='old'));
    raise exception 'expected rotated token denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_invalid_or_inactive','rotated token fails closed');
  end;
  begin
    perform public.rpc_resolve_recipe_share(repeat('f',64));
    raise exception 'expected forged token denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_invalid_or_inactive','forged token fails closed');
  end;
  begin
    perform public.rpc_resolve_recipe_share((select token from test_runtime_tokens where label='revoked'));
    raise exception 'expected revoked token denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_invalid_or_inactive','revoked token fails closed');
  end;
  v_payload := public.rpc_resolve_recipe_share((select token from test_runtime_tokens where label='rotated'));
  perform pg_temp.assert(not (v_payload::text like '%photo%'),'resolve payload excludes private media fields');
  perform pg_temp.assert(v_payload#>>'{recipe,title}'='Private Source','valid token resolves minimum view');
end $$;

-- Idempotent clone, replay, same-key conflict, invariant enforcement, and no media.
do $$
declare
  v_first jsonb;
  v_replay jsonb;
  v_recipe_id uuid;
begin
  v_first := public.rpc_clone_shared_recipe(
    (select token from test_runtime_tokens where label='rotated'),
    '30000000-0000-4000-8000-000000000101'
  );
  v_replay := public.rpc_clone_shared_recipe(
    (select token from test_runtime_tokens where label='rotated'),
    '30000000-0000-4000-8000-000000000101'
  );
  v_recipe_id := (v_first->>'recipe_id')::uuid;
  insert into test_ids values ('clone',v_recipe_id);
  perform pg_temp.assert(v_first->>'replayed'='false','first clone is not replay');
  perform pg_temp.assert(v_replay->>'replayed'='true','retry reports replay');
  perform pg_temp.assert(v_replay->>'recipe_id'=v_first->>'recipe_id','retry returns same clone');
  perform pg_temp.assert((
    select owner_id=auth.uid() and visibility='private' and status='draft'
      and author_type='kullanici' and source_type='shared_clone'
      and cloned_from_recipe_id is null and cover_photo_url is null
    from public.recipes where id=v_recipe_id
  ),'clone is independent private draft user snapshot');
  perform pg_temp.assert((
    select bool_and(photo_url is null) from public.recipe_steps where recipe_id=v_recipe_id
  ),'step photos are not copied');

  begin
    perform public.rpc_clone_shared_recipe(
      (select token from test_runtime_tokens where label='second'),
      '30000000-0000-4000-8000-000000000101'
    );
    raise exception 'expected idempotency conflict';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_idempotency_conflict','same key different grant conflicts');
  end;
end $$;

-- Clone rollback: forced child failure leaves neither clone nor completed ledger.
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
do $$ declare v_failure jsonb; begin
  v_failure := public.rpc_create_recipe_share_grant(
    '10000000-0000-0000-0000-000000000006', clock_timestamp()+interval '1 day'
  );
  insert into test_runtime_tokens values ('failure',v_failure->>'token',(v_failure->>'grant_id')::uuid);
end $$;
reset role;
update public.recipe_ingredients set free_text_name='FORCE_FAIL'
where recipe_id='10000000-0000-0000-0000-000000000006';
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
do $$ begin
  begin
    perform public.rpc_clone_shared_recipe(
      (select token from test_runtime_tokens where label='failure'),
      '30000000-0000-4000-8000-000000000102'
    );
    raise exception 'expected forced child failure';
  exception when others then
    perform pg_temp.assert(sqlerrm='forced child failure','child failure reached');
  end;
  perform pg_temp.assert(not exists(
    select 1 from public.recipes where owner_id=auth.uid() and title='Rollback Source'
  ),'failed clone parent rolled back');
end $$;
reset role;

select pg_temp.assert(not exists(
  select 1 from private.recipe_share_clone_operations
  where operation_key='30000000-0000-4000-8000-000000000102'
),'failed clone ledger rolled back');

-- Expiry and stale/deleted source all use the same fail-closed error.
update private.recipe_share_grants
set created_at=clock_timestamp()-interval '2 days',
    expires_at=clock_timestamp()-interval '1 second'
where id=(select grant_id from test_runtime_tokens where label='second');

set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
do $$ begin
  begin
    perform public.rpc_resolve_recipe_share((select token from test_runtime_tokens where label='second'));
    raise exception 'expected expired token denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_invalid_or_inactive','expired token fails closed');
  end;
  begin
    perform public.rpc_revoke_recipe_share_grant((select grant_id from test_runtime_tokens where label='rotated'));
    raise exception 'expected cross-owner revoke denial';
  exception when sqlstate '22023' then
    perform pg_temp.assert(sqlerrm='recipe_share_grant_not_found','cross-owner revoke rejected');
  end;
end $$;
reset role;

-- Mint a stale-source grant before changing state.
update public.recipes set visibility='private', status='draft'
where id='10000000-0000-0000-0000-000000000007';
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
do $$ declare v_stale jsonb; begin
  v_stale := public.rpc_create_recipe_share_grant(
    '10000000-0000-0000-0000-000000000007', clock_timestamp()+interval '1 day'
  );
  insert into test_runtime_tokens values ('stale',v_stale->>'token',(v_stale->>'grant_id')::uuid);
end $$;
reset role;
update public.recipes set visibility='public', status='published'
where id='10000000-0000-0000-0000-000000000007';

-- Deleting a source cascades its grant, but a previously completed clone is independent.
delete from public.recipes where id='10000000-0000-0000-0000-000000000005';
delete from public.recipes where id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(exists(
  select 1 from public.recipes where id=(select id from test_ids where label='clone')
),'clone survives source/grant deletion');
select pg_temp.assert((
  select title='Private Source' from public.recipes where id=(select id from test_ids where label='clone')
),'clone snapshot stays unchanged');

set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
do $$
declare v_label text;
begin
  foreach v_label in array array['second','delete','stale'] loop
    begin
      perform public.rpc_resolve_recipe_share((select token from test_runtime_tokens where label=v_label));
      raise exception 'expected inactive token denial';
    exception when sqlstate '22023' then
      perform pg_temp.assert(sqlerrm='recipe_share_invalid_or_inactive',v_label || ' fails closed');
    end;
  end loop;
end $$;
reset role;

-- No raw token-shaped value exists in either persistent ledger.
select pg_temp.assert((select bool_and(octet_length(token_digest)=32) from private.recipe_share_grants),'only 32-byte digests persisted');
select pg_temp.assert(not exists(
  select 1 from information_schema.columns
  where table_schema='private' and table_name in ('recipe_share_grants','recipe_share_clone_operations')
    and column_name='token'
),'persistent ledgers have no raw token column');

drop table test_runtime_tokens;
