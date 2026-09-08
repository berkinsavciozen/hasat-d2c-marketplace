-- Local fixtures only. No real user IDs, contacts, tokens or project credentials.
create function public.b9_assert(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'B9: %', message; end if;
end $$;

select public.b9_assert(
  (select data_type = 'timestamp with time zone' and is_nullable = 'YES'
   from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='deleted_at'),
  'nullable timestamptz contract');
select public.b9_assert(not has_function_privilege('anon', 'public.rpc_delete_own_account()', 'EXECUTE'), 'anon denied');
select public.b9_assert(has_function_privilege('authenticated', 'public.rpc_delete_own_account()', 'EXECUTE'), 'authenticated allowed');
select public.b9_assert((select prosecdef from pg_proc where oid='public.rpc_delete_own_account()'::regprocedure), 'RPC remains definer');
select public.b9_assert(not (select prosecdef from pg_proc where oid='public.protect_profile_deleted_at()'::regprocedure), 'marker trigger must be invoker');
select public.b9_assert((select deleted_at is null from profiles where id='00000000-0000-0000-0000-0000000000a1'), 'legacy lookalike is not auto-backfilled');

-- Exercise both roles through authenticated, including FK preservation, all
-- personal-data tables, repeat calls, rollback and a stale JWT marker reset.
do $$
declare r public.user_role; u uuid; marker timestamptz;
begin
  foreach r in array array['buyer','farmer']::public.user_role[] loop
    u := gen_random_uuid();
    insert into auth.users(id) values(u);
    insert into profiles(id, role, name, city, iban, bank_account_name)
      values(u, r, 'Fixture', 'Fixture city', 'fixture-only', 'Fixture');
    insert into b9_retained_reference(profile_id) values(u);
    insert into buyer_addresses(buyer_id) values(u);
    insert into buyer_profiles(user_id) values(u);
    insert into recipe_saves(user_id) values(u);
    insert into recipes(owner_id,author_type) values(u,'kullanici'),(u,'editor');
    insert into device_tokens(user_id) values(u);
    insert into ai_usage_tracking(user_id) values(u);
    insert into ai_chat_messages(user_id) values(u);
    insert into mcp_tool_calls(user_id) values(u);
    perform set_config('request.jwt.claim.sub', u::text, true);
    set local role authenticated;
    perform rpc_delete_own_account();
    reset role;
    select deleted_at into marker from profiles where id=u;
    perform b9_assert(marker = transaction_timestamp(), 'timestamp set in RPC transaction');
    perform b9_assert((select name='Silinmiş Kullanıcı' and city is null and iban is null and bank_account_name is null from profiles where id=u), 'profile anonymized');
    perform b9_assert((select email is null and phone is null and raw_user_meta_data='{}'::jsonb and encrypted_password='' and isfinite(banned_until) and banned_until>now() from auth.users where id=u), 'auth scrub and finite ban');
    perform b9_assert(exists(select from b9_retained_reference where profile_id=u), 'references retained');
    perform b9_assert(not exists(select from buyer_addresses where buyer_id=u)
      and not exists(select from buyer_profiles where user_id=u)
      and not exists(select from recipe_saves where user_id=u)
      and not exists(select from recipes where owner_id=u and author_type='kullanici')
      and exists(select from recipes where owner_id=u and author_type='editor')
      and not exists(select from device_tokens where user_id=u)
      and not exists(select from ai_usage_tracking where user_id=u)
      and not exists(select from ai_chat_messages where user_id=u)
      and not exists(select from mcp_tool_calls where user_id=u), 'personal rows scrubbed');
    set local role authenticated;
    begin
      update profiles set deleted_at=null where id=u;
      raise exception 'stale JWT restored deletion marker';
    exception when insufficient_privilege then null; end;
    perform rpc_delete_own_account();
    reset role;
    perform b9_assert((select deleted_at=marker from profiles where id=u), 'repeat call preserves original timestamp');
  end loop;
end $$;

-- Farmer blockers and RPC rollback preserve both marker and personal data.
do $$
declare u uuid := gen_random_uuid(); blocker text;
begin
  insert into auth.users(id) values(u);
  insert into profiles(id,role,name) values(u,'farmer','Unchanged');
  insert into buyer_addresses(buyer_id) values(u);
  perform set_config('request.jwt.claim.sub',u::text,true);
  foreach blocker in array array['listing','order'] loop
    if blocker='listing' then insert into listings(farmer_id,status) values(u,'active');
    else insert into orders(farmer_id,status) values(u,'pending'); end if;
    begin
      perform rpc_delete_own_account();
      raise exception 'expected farmer blocker';
    exception when raise_exception then
      if SQLERRM <> 'Önce açık ilanlarınızı ve siparişlerinizi tamamlayın' then raise; end if;
    end;
    perform b9_assert((select deleted_at is null and name='Unchanged' from profiles where id=u), 'blocked profile unchanged');
    perform b9_assert(exists(select from buyer_addresses where buyer_id=u), 'blocked personal rows retained');
    delete from listings where farmer_id=u;
    delete from orders where farmer_id=u;
  end loop;
  insert into orders(farmer_id,status) values(u,'completed'),(u,'cancelled');
  begin
    perform rpc_delete_own_account();
    raise exception 'simulate outer transaction failure';
  exception when raise_exception then
    if SQLERRM <> 'simulate outer transaction failure' then raise; end if;
  end;
  perform b9_assert((select deleted_at is null and name='Unchanged' from profiles where id=u), 'transaction rollback restores marker/profile');
  perform b9_assert(exists(select from buyer_addresses where buyer_id=u), 'transaction rollback restores deletes');
  perform rpc_delete_own_account();
  perform b9_assert((select deleted_at is not null from profiles where id=u), 'closed orders allow deletion');
end $$;

-- Direct inserts/updates cannot forge status; ordinary edits still work.
set role authenticated;
do $$
declare u uuid := gen_random_uuid();
begin
  insert into profiles(id,role,name) values(u,'buyer','Before');
  update profiles set name='After' where id=u;
  perform b9_assert((select name='After' and deleted_at is null from profiles where id=u),'ordinary profile edits allowed');
  begin
    update profiles set deleted_at=now() where id=u;
    raise exception 'client set marker';
  exception when insufficient_privilege then null; end;
  begin
    insert into profiles(id,role,deleted_at) values(gen_random_uuid(),'buyer',now());
    raise exception 'client inserted marker';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform rpc_delete_own_account();
    raise exception 'unauthenticated RPC succeeded';
  exception when raise_exception then
    if SQLERRM <> 'Oturum bulunamadı' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform rpc_delete_own_account();
    raise exception 'missing profile RPC succeeded';
  exception when raise_exception then
    if SQLERRM <> 'Profil bulunamadı' then raise; end if;
  end;
end $$;
reset role;
\echo 'B-9 SQL assertions passed'
