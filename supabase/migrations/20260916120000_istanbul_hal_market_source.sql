insert into market_sources (code, display_name, region)
values ('istanbul_hal', 'İstanbul Toptancı Hali', 'İstanbul')
on conflict (code) do nothing;
