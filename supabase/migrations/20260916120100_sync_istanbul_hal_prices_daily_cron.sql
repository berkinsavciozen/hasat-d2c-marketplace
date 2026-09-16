-- Daily İstanbul Hal price sync, mirroring sync-izmir-hal-prices-daily's pattern.
-- İzmir runs at 06:00; this runs at 06:15 to avoid overlap.
-- sync-istanbul-hal-prices has verify_jwt = false, so no apikey header is required.
select cron.schedule(
  'sync-istanbul-hal-prices-daily',
  '15 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/sync-istanbul-hal-prices',
    headers := jsonb_build_object(
      'Content-Type','application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
