
-- Field crops (grains / legumes / oilseeds / industrial / tubers / vegetables)
INSERT INTO public.crop_config (crop, display_name, default_unit, harvest_window_start_month, harvest_window_end_month, lifecycle_steps, price_benchmark_source, category_group) VALUES
-- TAHIL
('buğday','Buğday','kg',6,8,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','tahil'),
('arpa','Arpa','kg',6,7,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','tahil'),
('mısır','Mısır','kg',9,11,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','tahil'),
('çeltik','Çeltik','kg',9,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','tahil'),
('yulaf','Yulaf','kg',6,8,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','tahil'),
('çavdar','Çavdar','kg',7,8,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','tahil'),
-- BAKLAGIL
('nohut','Nohut','kg',7,8,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','baklagil'),
('mercimek','Mercimek','kg',6,7,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','baklagil'),
('kuru_fasulye','Kuru Fasulye','kg',8,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','baklagil'),
('bakla','Bakla','kg',5,7,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','baklagil'),
-- YAGLI_TOHUM
('ayçiçeği','Ayçiçeği','kg',8,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','yaglik'),
('susam','Susam','kg',9,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','yaglik'),
('kanola','Kanola','kg',6,7,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','yaglik'),
('yerfıstığı','Yerfıstığı','kg',9,11,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','yaglik'),
-- ENDUSTRI_BITKISI
('pamuk','Pamuk','kg',9,11,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','endustri_bitkisi'),
('tütün','Tütün','kg',7,9,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','endustri_bitkisi'),
('şeker_pancarı','Şeker Pancarı','kg',9,11,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','endustri_bitkisi'),
-- YUMRU
('patates','Patates','kg',7,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','yumru'),
('soğan','Soğan','kg',6,8,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','yumru'),
('sarımsak','Sarımsak','kg',6,8,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','yumru'),
-- SEBZE
('domates','Domates','kg',6,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('biber','Biber','kg',7,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('patlıcan','Patlıcan','kg',7,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('salatalık','Salatalık','kg',5,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('kabak','Kabak','kg',6,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('havuç','Havuç','kg',6,10,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('lahana','Lahana','kg',9,12,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('ıspanak','Ispanak','kg',3,5,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('marul','Marul','kg',4,6,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('kavun','Kavun','kg',7,9,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze'),
('karpuz','Karpuz','kg',7,9,'[{"key":"ekim","label":"Ekim","required":true},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sebze')
ON CONFLICT (crop) DO NOTHING;

-- Perennial fruit/tree crops
INSERT INTO public.crop_config (crop, display_name, default_unit, harvest_window_start_month, harvest_window_end_month, lifecycle_steps, price_benchmark_source, category_group) VALUES
('elma','Elma','kg',9,11,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('armut','Armut','kg',8,10,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('kayısı','Kayısı','kg',6,7,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('şeftali','Şeftali','kg',6,8,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('kiraz','Kiraz','kg',5,7,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('vişne','Vişne','kg',6,7,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('erik','Erik','kg',6,8,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('üzüm','Üzüm','kg',8,10,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('nar','Nar','kg',9,11,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('incir','İncir','kg',8,10,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('muz','Muz','kg',10,3,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('portakal','Portakal','kg',11,3,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('mandalina','Mandalina','kg',10,2,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('limon','Limon','kg',10,3,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('greyfurt','Greyfurt','kg',11,3,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('ceviz','Ceviz','kg',9,10,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sert_kabuklu'),
('antep_fıstığı','Antep Fıstığı','kg',8,9,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sert_kabuklu'),
('badem','Badem','kg',7,9,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','sert_kabuklu'),
('çilek','Çilek','kg',4,6,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve'),
('ayva','Ayva','kg',9,11,'[{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true}]'::jsonb,'Manuel','meyve')
ON CONFLICT (crop) DO NOTHING;

-- Medicinal / aromatic / spice
INSERT INTO public.crop_config (crop, display_name, default_unit, harvest_window_start_month, harvest_window_end_month, lifecycle_steps, price_benchmark_source, category_group) VALUES
('kekik','Kekik','kg',6,8,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','tibbi_bitki'),
('nane','Nane','kg',5,9,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','tibbi_bitki'),
('adaçayı','Adaçayı','kg',5,8,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','tibbi_bitki'),
('kimyon','Kimyon','kg',6,7,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','baharat'),
('anason','Anason','kg',8,9,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','baharat'),
('rezene','Rezene','kg',8,10,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','baharat'),
('gül','Gül (Yağlık)','kg',5,6,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','tibbi_bitki'),
('defne','Defne','kg',11,3,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','tibbi_bitki'),
('papatya','Papatya','kg',5,7,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','tibbi_bitki'),
('ıhlamur','Ihlamur','kg',6,7,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','tibbi_bitki'),
('pul_biber','Pul Biber','kg',9,10,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','baharat'),
('sumak','Sumak','kg',8,10,'[{"key":"dikim","label":"Dikim","required":false},{"key":"care","label":"Bakım","required":false},{"key":"harvest","label":"Hasat","required":true},{"key":"drying","label":"Kurutma","required":false}]'::jsonb,'Manuel','baharat')
ON CONFLICT (crop) DO NOTHING;
