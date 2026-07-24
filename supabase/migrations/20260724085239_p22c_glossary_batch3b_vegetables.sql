-- P22-C batch 3b: sebze ailesi (ekim-bakım-hasat pattern) — 11 crop, 33 satır

insert into crop_journal_glossary (crop, term, explanation) values
('biber', 'Ekim', 'Fide ile don riski geçtikten sonra (Mayıs) dikilir, sıra arası 60-70 cm, sıra üzeri 40-50 cm.'),
('biber', 'Bakım', 'Düzenli sulama gerekir, damla sulama önerilir — su stresi çiçek/meyve dökümüne yol açar. Çiçeklenme döneminde dengeli gübreleme verimi artırır.'),
('biber', 'Hasat', 'İstenen renk/olgunluğa (yeşil veya kırmızı, çeşide göre) ulaştığında elle toplanır, düzenli hasat yeni meyve bağlamasını teşvik eder.'),

('domates', 'Ekim', 'Fide ile toprak sıcaklığı en az 15°C olduğunda (Nisan sonu-Mayıs) dikilir, sıra arası 70-80 cm, sıra üzeri 40-50 cm.'),
('domates', 'Bakım', 'Düzenli, dengeli sulama önemlidir — düzensiz sulama meyve çatlamasına ve çiçek burnu çürüklüğüne yol açar. Destekleme (kazık/tel) ve yan sürgün alma verimi artırır.'),
('domates', 'Hasat', 'Meyveler istenen renge (yeşilden kırmızıya) ulaştığında, olgunluk seviyesine göre (nakliye mesafesine göre) toplanır.'),

('havuç', 'Ekim', 'Doğrudan tohumla ilkbahar (Mart-Nisan) veya yaz sonunda (Ağustos, kışlık hasat için) ekilir, sıra arası 25-30 cm, derinlik 1-2 cm.'),
('havuç', 'Bakım', 'Düzenli, hafif sulama önemlidir — düzensiz sulama kök çatlamasına yol açar. Taze fide seyreltme (bitkiler arası 5-8 cm) kök iriliğini artırır.'),
('havuç', 'Hasat', 'Kök çapı istenen boyuta ulaştığında (genelde ekimden 70-90 gün sonra) sökülür.'),

('ıspanak', 'Ekim', 'Serin iklim bitkisidir, ilkbahar (Mart) veya sonbaharda (Eylül-Ekim) ekilir, sıra arası 25-30 cm.'),
('ıspanak', 'Bakım', 'Düzenli sulama ve serin sıcaklıklar ister — sıcak havada erken çiçeklenir (bolting), yaprak kalitesi düşer. Azot ağırlıklı gübreleme yaprak gelişimini destekler.'),
('ıspanak', 'Hasat', 'Yapraklar istenen boyuta ulaştığında (ekimden 40-50 gün sonra), dış yapraklardan başlayarak veya bütün bitki kesilerek hasat edilir.'),

('kabak', 'Ekim', 'Don riski geçtikten sonra (Mayıs), doğrudan tohum veya fide ile, sıra arası 100-120 cm (yayılan bir bitkidir).'),
('kabak', 'Bakım', 'Yüksek su talebi vardır, düzenli sulama gerekir. Çiçeklenme döneminde arı/tozlayıcı aktivitesi meyve tutumu için önemlidir.'),
('kabak', 'Hasat', 'Genç, körpe meyveler (aşırı büyümeden, kabuk henüz sertleşmeden) 2-3 günde bir toplanır — sık hasat yeni meyve oluşumunu teşvik eder.'),

('karpuz', 'Ekim', 'Toprak sıcaklığı en az 18°C olduğunda (Mayıs), sıra arası 200-250 cm (çok yayılan bir bitkidir).'),
('karpuz', 'Bakım', 'Çiçeklenme ve meyve büyüme döneminde düzenli sulama gerekir, ama olgunlaşma yaklaşırken sulama azaltılır (şeker oranını artırır). Tozlaklama için arı aktivitesi önemlidir.'),
('karpuz', 'Hasat', 'Meyveye yakın sülük kurumaya başladığında ve alt kısımdaki "toprak lekesi" sarardığında (ayrıca vurulduğunda boğuk ses vermesi) olgunluk işaretidir.'),

('kavun', 'Ekim', 'Toprak sıcaklığı en az 18°C olduğunda (Mayıs), sıra arası 150-200 cm.'),
('kavun', 'Bakım', 'Düzenli sulama gerekir, olgunlaşma öncesi azaltılan sulama şeker oranını artırır. Mildiyö gibi mantar hastalıklarına karşı yaprak ıslatmayan sulama (damla) önerilir.'),
('kavun', 'Hasat', 'Sap ile meyve arasındaki bağlantı çatlamaya başladığında ve karakteristik koku belirdiğinde olgunluk işaretidir.'),

('lahana', 'Ekim', 'Fide ile ilkbahar (Mart-Nisan) veya yaz sonunda (kışlık hasat için Temmuz-Ağustos) dikilir, sıra arası 50-60 cm.'),
('lahana', 'Bakım', 'Düzenli sulama önemlidir — su stresi baş çatlamasına yol açar. Lahana kelebeği/tırtılı için düzenli gözlem önerilir.'),
('lahana', 'Hasat', 'Baş sıkı ve istenen boyuta ulaştığında kesilerek hasat edilir — aşırı bekleme baş çatlamasına yol açar.'),

('marul', 'Ekim', 'Serin iklim bitkisidir, ilkbahar veya sonbaharda ekilir/dikilir, sıra arası 25-30 cm.'),
('marul', 'Bakım', 'Düzenli, hafif sulama ister — sıcak havada erken çiçeklenir (bolting), yaprak acılaşır. Hızlı büyüyen bir bitkidir, yoğun gübre talebi yoktur.'),
('marul', 'Hasat', 'Baş istenen sıkılığa/boyuta ulaştığında (ekimden 45-60 gün sonra) kesilerek hasat edilir.'),

('patlıcan', 'Ekim', 'Fide ile don riski geçtikten sonra (Mayıs) dikilir, sıra arası 70-80 cm, sıra üzeri 50-60 cm.'),
('patlıcan', 'Bakım', 'Düzenli sulama ve sıcak iklim ister — soğuk gecelerde (10°C altı) gelişim durur. Kırmızı örümcek ve patlıcan böceğine karşı düzenli gözlem önerilir.'),
('patlıcan', 'Hasat', 'Meyve parlak, kabuk gergin ve tam renk almışken (aşırı olgunlaşma tohumların sertleşmesine, etin acılaşmasına yol açar) toplanır.'),

('salatalık', 'Ekim', 'Don riski geçtikten sonra (Mayıs), sıra arası 100-150 cm (yayılan veya tırmanan çeşitlere göre).'),
('salatalık', 'Bakım', 'Yüksek su talebi vardır, düzensiz sulama meyvede acılığa yol açabilir. Sık hasat yeni meyve oluşumunu teşvik eder.'),
('salatalık', 'Hasat', 'İstenen boyuta ulaştığında (aşırı büyümeden, tohumlar sertleşmeden) genelde her gün veya gün aşırı toplanır.');
