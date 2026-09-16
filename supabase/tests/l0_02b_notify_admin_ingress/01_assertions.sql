\set ON_ERROR_STOP on

create function pg_temp.assert(condition boolean, message text)
returns void language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

-- Privilege boundary: the outbox/private trigger helpers are not exposed and only service_role
-- can execute the two public RPCs used by the Edge Function.
do $$
begin
  perform pg_temp.assert(
    to_regprocedure('public.notify_new_crop_type_request()') is null,
    'legacy public SECURITY DEFINER trigger function must be removed'
  );
  perform pg_temp.assert(
    not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
    'client roles must not have private schema usage'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.claim_admin_sms_event(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_admin_sms_event(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.claim_admin_sms_event(uuid)', 'execute'),
    'claim RPC must be service_role-only'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.complete_admin_sms_event(uuid,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.complete_admin_sms_event(uuid,text,text)', 'execute')
    and has_function_privilege('service_role', 'public.complete_admin_sms_event(uuid,text,text)', 'execute'),
    'completion RPC must be service_role-only'
  );
end;
$$;

-- Farmer contract: one domain INSERT yields one full allowlisted event and one signed HTTP request;
-- re-reading/updating the same product event does not create another SMS dispatch.
do $$
declare
  _farmer uuid := '00000000-0000-4000-8000-000000000001';
  _request uuid := '10000000-0000-4000-8000-000000000001';
  _payload jsonb;
  _call net.http_post_calls%rowtype;
begin
  insert into public.profiles(id, name) values (_farmer, 'Test Çiftçi');
  insert into public.crop_type_requests(
    id, requested_by, crop_name, suggested_category_group, suggested_default_unit,
    suggested_harvest_window_start_month, suggested_harvest_window_end_month,
    lifecycle_notes, note
  ) values (
    _request, _farmer, 'Safran', 'Baharat', 'kg', 9, 10, 'yedek not', 'Organik üretim'
  );

  select payload into _payload from private.admin_sms_outbox
  where event_key = 'crop_type_request:' || _request::text;
  perform pg_temp.assert(_payload ->> 'cropName' = 'Safran', 'farmer event crop name missing');
  perform pg_temp.assert(_payload ->> 'unit' = 'kg', 'farmer event unit missing');
  perform pg_temp.assert(_payload ->> 'category' = 'Baharat', 'farmer event category missing');
  perform pg_temp.assert(_payload ->> 'harvestStartMonth' = '9', 'farmer harvest start missing');
  perform pg_temp.assert(_payload ->> 'harvestEndMonth' = '10', 'farmer harvest end missing');
  perform pg_temp.assert(_payload ->> 'requesterName' = 'Test Çiftçi', 'requester missing');
  perform pg_temp.assert(_payload ->> 'note' = 'Organik üretim', 'preferred note missing');

  select * into _call from net.http_post_calls order by id desc limit 1;
  perform pg_temp.assert(_call.id is not null, 'farmer trigger must queue one HTTP request');
  perform pg_temp.assert(
    (select count(*) from jsonb_object_keys(_call.body)) = 1 and _call.body ? 'eventId',
    'HTTP body must contain only eventId');
  perform pg_temp.assert(_call.headers ? 'X-Hasat-Timestamp' and _call.headers ? 'X-Hasat-Signature',
    'HTTP request must contain timestamp and HMAC');
  perform pg_temp.assert(not (_call.headers ? 'Authorization') and not (_call.headers ? 'apikey'),
    'HTTP request must not carry anon/service tokens');

  update public.crop_type_requests set status = 'reviewed' where id = _request;
  perform pg_temp.assert((select count(*) from private.admin_sms_outbox) = 1,
    'updating the same event must not create another outbox row');
  perform pg_temp.assert((select count(*) from net.http_post_calls) = 1,
    'updating the same event must not dispatch another request');
end;
$$;

-- Buyer contract: catalog membership is decided in the database. A known product produces no
-- admin event; an unknown product produces exactly one bounded catalog-gap event.
do $$
declare
  _buyer uuid := '00000000-0000-4000-8000-000000000002';
  _known uuid := '20000000-0000-4000-8000-000000000001';
  _unknown uuid := '20000000-0000-4000-8000-000000000002';
  _before bigint;
begin
  insert into public.profiles(id, name) values (_buyer, 'Test Alıcı');
  insert into public.crop_config(crop, display_name) values ('domates', 'Domates');
  select count(*) into _before from private.admin_sms_outbox;

  insert into public.crop_requests(id, requested_by, crop_name_free_text, note)
  values (_known, _buyer, 'DOMATES', 'known');
  perform pg_temp.assert((select count(*) from private.admin_sms_outbox) = _before,
    'known catalog product must not create an admin event');

  insert into public.crop_requests(id, requested_by, crop_name_free_text, note)
  values (_unknown, _buyer, 'Ejder Meyvesi', repeat('n', 100));
  perform pg_temp.assert((select count(*) from private.admin_sms_outbox) = _before + 1,
    'unknown catalog product must create exactly one admin event');
  perform pg_temp.assert(
    (select event_type from private.admin_sms_outbox
      where event_key = 'crop_request_catalog_gap:' || _unknown::text)
      = 'crop_request.catalog_gap.created',
    'buyer event type must be allowlisted'
  );
  perform pg_temp.assert(
    length((select payload ->> 'note' from private.admin_sms_outbox
      where event_key = 'crop_request_catalog_gap:' || _unknown::text)) = 80,
    'buyer note must be bounded server-side'
  );
end;
$$;

-- Idempotent claim/completion: after one sent transition, repeated delivery is a duplicate and
-- cannot be claimed for another provider call.
do $$
declare
  _event_id uuid;
  _result jsonb;
begin
  select id into _event_id from private.admin_sms_outbox order by created_at limit 1;

  set role service_role;
  _result := public.claim_admin_sms_event(_event_id);
  perform pg_temp.assert(_result ->> 'outcome' = 'claimed', 'first delivery must claim');
  perform pg_temp.assert(
    public.claim_admin_sms_event(_event_id) ->> 'outcome' = 'in_progress_or_uncertain',
    'concurrent delivery must not claim'
  );
  perform pg_temp.assert(
    public.complete_admin_sms_event(_event_id, 'sent', 'SMtest') = true,
    'claimed event must complete once'
  );
  perform pg_temp.assert(
    public.claim_admin_sms_event(_event_id) ->> 'outcome' = 'duplicate',
    'sent retry must be a duplicate no-op'
  );
  reset role;
end;
$$;

-- Measurable global gate: at most five claims in a rolling minute.
do $$
declare
  _id uuid;
  _result jsonb;
  _index integer;
begin
  delete from private.admin_sms_outbox;
  for _index in 1..6 loop
    insert into private.admin_sms_outbox(event_key, event_type, payload)
    values (
      'rate:' || _index,
      'crop_request.catalog_gap.created',
      jsonb_build_object(
        'sourceId', gen_random_uuid()::text,
        'cropName', 'Test ' || _index
      )
    ) returning id into _id;

    set role service_role;
    _result := public.claim_admin_sms_event(_id);
    reset role;

    if _index <= 5 then
      perform pg_temp.assert(_result ->> 'outcome' = 'claimed', 'first five claims must pass');
    else
      perform pg_temp.assert(_result ->> 'outcome' = 'rate_limited', 'sixth claim must be rate limited');
    end if;
  end loop;
end;
$$;

-- Definite provider failure is retryable and the cron producer requeues it; no secret is present
-- in the stored job command or request body.
do $$
declare
  _event_id uuid;
  _before bigint;
begin
  delete from private.admin_sms_outbox;
  delete from net.http_post_calls;
  insert into private.admin_sms_outbox(event_key, event_type, payload)
  values (
    'retry:1',
    'crop_request.catalog_gap.created',
    jsonb_build_object('sourceId', gen_random_uuid()::text, 'cropName', 'Retry Crop')
  ) returning id into _event_id;

  set role service_role;
  perform public.claim_admin_sms_event(_event_id);
  perform public.complete_admin_sms_event(_event_id, 'retryable_failure');
  reset role;

  update private.admin_sms_outbox set next_attempt_at = clock_timestamp() - interval '1 second'
  where id = _event_id;
  select count(*) into _before from net.http_post_calls;
  perform private.retry_admin_sms_events();
  perform pg_temp.assert((select count(*) from net.http_post_calls) = _before + 1,
    'due failed event must be requeued exactly once per retry scan');
  perform pg_temp.assert(
    (select command from cron.job where jobname = 'notify-admin-outbox-retry')
      = 'select private.retry_admin_sms_events();',
    'cron job must contain only the private retry function call'
  );
  perform pg_temp.assert((select count(*) from cron.job where jobname = 'notify-admin-outbox-retry') = 1,
    'exactly one retry job must exist');
end;
$$;

\echo 'L0-02B notify-admin SQL contract suite: ALL ASSERTIONS PASSED'
