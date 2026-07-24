-- P22-C batch 3c: yumru + yağlık + endüstri bitkisi ailesi (ekim-bakım-hasat pattern) — 10 crop, 30 satır

insert into crop_journal_glossary (crop, term, explanation) values
('patates', 'Ekim', 'Don riski geçtikten sonra (Mart-Nisan), tohumluk yumrular 8-10 cm derinliğe dikilir, sıra arası 70-75 cm, sıra üzeri 25-30 cm.'),
('patates', 'Bakım', 'Boğaz doldurma (toprağı gövde etrafına yığma) yumru gelişimini destekler ve yumruların güneş görüp yeşermesini önler. Çiçeklenme ve yumru şişme döneminde düzenli sulama kritiktir.'),
('patates', 'Hasat', 'Bitki sararıp kurumaya başladığında (yumru kabuğu sertleştiğinde) sökülür, genelde ekimden 90-120 gün sonra.'),

('sarımsak', 'Ekim', 'Sonbaharda (Ekim-Kasım) diş halinde dikilir, dikim derinliği 5-6 cm, sıra arası 20-25 cm — soğuk dönem (vernalizasyon) baş oluşumu için gereklidir.'),
('sarımsak', 'Bakım', 'İlkbaharda düzenli sulama, hasat öncesi (yapraklar sararmaya başlayınca) sulama kesilir. Çiçek sapı (bazı çeşitlerde) baş büyümesini desteklemek için kesilir.'),
('sarımsak', 'Hasat', 'Yaprakların 1/3-1/2''si sarardığında sökülür — erken söküm küçük baş, geç söküm dağılmış diş oranını artırır.'),

('soğan', 'Ekim', 'Fide veya set soğanla ilkbaharda (Mart) dikilir, sıra arası 25-30 cm.'),
('soğan', 'Bakım', 'Baş şişme döneminde düzenli sulama önemlidir, hasat öncesi (yapraklar yatmaya başlayınca) sulama kesilir. Baş şişmesi gün uzunluğuna duyarlıdır (çeşit seçimi bölgeye uygun olmalı).'),
('soğan', 'Hasat', 'Yaprakların çoğu doğal olarak yatıp sarardığında sökülür, birkaç gün tarlada kurutulup boyun kısmı sıkılaştırılır.'),

('ayçiçeği', 'Ekim', 'Toprak sıcaklığı 8-10°C''ye ulaştığında (Nisan), ekim derinliği 4-6 cm, sıra arası 70 cm.'),
('ayçiçeği', 'Bakım', 'Derin köklü, kurağa nispeten dayanıklıdır ama çiçeklenme döneminde su stresi verimi düşürür. Kuş zararına karşı olgunlaşma döneminde gözlem önerilir.'),
('ayçiçeği', 'Hasat', 'Tabla arkası sarıdan kahverengiye döndüğünde ve tane nem oranı %10-12''ye düştüğünde biçerdöverle hasat edilir.'),

('kanola', 'Ekim', 'Kışlık ekim Eylül''de yapılır, ekim derinliği 1-2 cm (küçük tohumdur), sıra arası 15-25 cm.'),
('kanola', 'Bakım', 'Kardeşlenme ve çiçeklenme döneminde azotlu gübreleme verimi belirgin artırır. Böcek zararlılarına (özellikle çiçeklenme döneminde) karşı gözlem önemlidir.'),
('kanola', 'Hasat', 'Kapsüllerin %60-70''i sarardığında (aşırı olgunlaşma dökülme kaybına yol açar), Haziran''da biçerdöverle hasat edilir.'),

('susam', 'Ekim', 'Toprak sıcaklığı en az 20°C olduğunda (Mayıs), ekim derinliği 2-3 cm, sıra arası 40-50 cm.'),
('susam', 'Bakım', 'Kurağa oldukça dayanıklıdır, aşırı sulama kök hastalıklarına yol açar. Çiçeklenme döneminde ölçülü sulama verimi destekler.'),
('susam', 'Hasat', 'Kapsüller sararıp alt kısımdan çatlamaya başladığında (Eylül), bitki kesilip demet halinde kurutulduktan sonra tohum dökümü yapılır — kapsüller kendiliğinden çatlayarak tohum döktüğü için zamanlama kritiktir.'),

('yerfıstığı', 'Ekim', 'Toprak sıcaklığı en az 18°C olduğunda (Mayıs), ekim derinliği 5-7 cm, sıra arası 45-60 cm.'),
('yerfıstığı', 'Bakım', 'Çiçeklenmeden sonra oluşan çiçek sapı toprağa girip meyveyi yer altında oluşturur — bu dönemde toprağın gevşek/rahat girilebilir olması (hafif boğaz doldurma) önemlidir.'),
('yerfıstığı', 'Hasat', 'Yapraklar sararmaya başladığında (Eylül-Ekim) bitki sökülüp ters çevrilerek birkaç gün tarlada kurutulur, sonra harman edilir.'),

('pamuk', 'Ekim', 'Toprak sıcaklığı en az 16°C olduğunda (Nisan-Mayıs), ekim derinliği 3-5 cm, sıra arası 70 cm.'),
('pamuk', 'Bakım', 'Uzun büyüme mevsimi ve yüksek su talebi vardır — özellikle çiçeklenme ve koza oluşum döneminde düzenli sulama kritiktir. Pamuk yaprak biti ve kırmızı örümcek için düzenli gözlem önerilir.'),
('pamuk', 'Hasat', 'Kozalar tam açılıp lif beyazlaştığında, genelde Eylül-Ekim''de (elle veya makineyle) hasat edilir.'),

('şeker_pancarı', 'Ekim', 'Erken ilkbaharda (Mart), ekim derinliği 2-3 cm, sıra arası 45-50 cm.'),
('şeker_pancarı', 'Bakım', 'Düzenli sulama kök gelişimini ve şeker oranını artırır. Yabancı ot rekabeti erken dönemde verimi ciddi etkiler, düzenli çapalama önemlidir.'),
('şeker_pancarı', 'Hasat', 'Kök şeker oranı hedeflenen seviyeye ulaştığında (genelde Eylül-Ekim, ekimden 180-200 gün sonra) sökülür.'),

('tütün', 'Ekim', 'Fide ile don riski geçtikten sonra (Mayıs) dikilir, sıra arası 100-120 cm, sıra üzeri 50-60 cm.'),
('tütün', 'Bakım', 'Çiçek tomurcuğu alma ve yan sürgün temizleme yaprak kalitesini ve iriliğini artırır. Düzenli, ölçülü sulama önemlidir.'),
('tütün', 'Hasat', 'Yapraklar alttan üste doğru, her biri kendi olgunluk rengine (sarımsı-yeşil) ulaştıkça kademeli olarak (birkaç hafta boyunca) elle toplanır.');
