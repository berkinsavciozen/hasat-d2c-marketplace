-- P22-E: Yeni ürün türü talep sistemi (çiftçi tarafı)

create table public.crop_type_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  crop_name text not null,
  suggested_category_group text,
  suggested_default_unit text,
  suggested_harvest_window_start_month int,
  suggested_harvest_window_end_month int,
  lifecycle_notes text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'added', 'rejected')),
  created_at timestamptz not null default now()
);

create index crop_type_requests_requested_by_idx on public.crop_type_requests(requested_by);
create index crop_type_requests_status_idx on public.crop_type_requests(status);

alter table public.crop_type_requests enable row level security;

create policy "Farmers create own crop type requests"
  on public.crop_type_requests for insert
  to authenticated
  with check (auth.uid() = requested_by);

create policy "Farmers read own crop type requests"
  on public.crop_type_requests for select
  to authenticated
  using (auth.uid() = requested_by);

-- Yeni talep geldiğinde Berkin'e anlık SMS.
create function public.notify_new_crop_type_request()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  _farmer_name text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/notify-admin';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg';
begin
  select name into _farmer_name from public.profiles where id = new.requested_by;
  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _anon),
    body := jsonb_build_object('message', format('🌾 Yeni ürün türü talebi: %s — %s', new.crop_name, coalesce(_farmer_name, 'bir çiftçi')))
  );
  return new;
exception when others then
  raise log 'notify_new_crop_type_request failed: %', sqlerrm;
  return new;
end;
$function$;

create trigger tg_crop_type_requests_notify
  after insert on public.crop_type_requests
  for each row execute function public.notify_new_crop_type_request();
