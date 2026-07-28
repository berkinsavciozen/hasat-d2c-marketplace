-- P22-G: notify_new_crop_type_request() SMS'i sadece ürün adını içeriyordu; formun topladığı
-- birim/kategori/hasat ayı/not alanları sessizce kayboluyordu. Berkin kararı: kritik alanları
-- ekle + notu kısalt (300 karakter sınırının içinde, tek SMS).
create or replace function public.notify_new_crop_type_request()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  _farmer_name text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/notify-admin';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg';
  _unit_label text;
  _category_label text;
  _window_label text;
  _extra text;
  _msg text;
begin
  select name into _farmer_name from public.profiles where id = new.requested_by;

  _unit_label := coalesce(new.suggested_default_unit, '');
  _category_label := case when new.suggested_category_group is not null then ' · ' || new.suggested_category_group else '' end;
  _window_label := case
    when new.suggested_harvest_window_start_month is not null and new.suggested_harvest_window_end_month is not null
    then format(' · Hasat: %s-%s ay', new.suggested_harvest_window_start_month, new.suggested_harvest_window_end_month)
    else ''
  end;

  -- "Ek not" öncelikli, yoksa "nasıl yetiştiriliyor" notu — ikisi birden değil, kısa tutmak için tek alan.
  _extra := trim(both from coalesce(nullif(new.note, ''), nullif(new.lifecycle_notes, ''), ''));
  if length(_extra) > 80 then _extra := left(_extra, 77) || '...'; end if;

  _msg := format(
    '🌾 Yeni ürün türü talebi: %s (%s)%s%s — %s',
    new.crop_name, _unit_label, _category_label, _window_label, coalesce(_farmer_name, 'bir çiftçi')
  );
  if _extra <> '' then
    _msg := _msg || format(' · Not: %s', _extra);
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _anon),
    body := jsonb_build_object('message', _msg)
  );
  return new;
exception when others then
  raise log 'notify_new_crop_type_request failed: %', sqlerrm;
  return new;
end;
$function$;
