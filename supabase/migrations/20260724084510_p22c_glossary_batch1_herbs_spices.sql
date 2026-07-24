-- P22-C batch 1: baharat/tıbbi bitki ailesi (dikim-bakım-hasat-kurutma pattern) — 14 crop, 55 satır

insert into crop_journal_glossary (crop, term, explanation) values
('adaçayı', 'Dikim', 'Fide veya çelikle Mart-Nisan ya da Eylül-Ekim''de dikilir; sıra arası 40-50 cm, m²''de 3-4 bitki idealdir. İyi drene, hafif alkalin toprağı sever — ağır/nemli toprakta kök çürüklüğü riski yüksektir.'),
('adaçayı', 'Bakım', 'Kurağa dayanıklıdır, aşırı sulamadan kaçının — toprak yüzeyi kuruduktan sonra sulayın. Yılda 1 kez hafif gübreleme yeterlidir; 3. yıldan sonra bitkiler odunlaşır, yenilenmesi önerilir.'),
('adaçayı', 'Hasat', 'Çiçeklenmeden hemen önce (uçucu yağ oranı en yüksek dönem), sabah çiy kurumuşken hasat edilir. Yılda 2-3 kez yaprak hasadı mümkündür.'),
('adaçayı', 'Kurutma', 'Gölgede, iyi havalandırılan, 30-35°C''yi geçmeyen ortamda 7-10 gün kurutulur — doğrudan güneş uçucu yağ ve renk kaybına yol açar.'),

('anason', 'Dikim', 'Doğrudan tohumla Mart-Nisan''da ekilir, sıra arası 40-45 cm, ekim derinliği 2-3 cm. Soğuğa hassastır, don riski geçtikten sonra ekilmelidir.'),
('anason', 'Bakım', 'Düzenli ama ölçülü sulama gerekir — çiçeklenme ve tohum bağlama döneminde su stresinden kaçının. İlk 6 haftada düzenli çapalama önemlidir.'),
('anason', 'Hasat', 'Tohum başaklarının %70-80''i kahverengiye döndüğünde, sabah erken biçilir — aşırı olgunlaşma tohum dökülmesine yol açar.'),
('anason', 'Kurutma', 'Demet halinde asılıp gölgede 10-14 gün kurutulur, ardından harmanlanıp elenir; nihai nem oranı %10''un altına düşürülmelidir.'),

('defne', 'Dikim', 'Çelik veya fidanla ilkbahar ya da sonbaharda dikilir; sıra arası en az 2-3 m (yavaş büyüyen, uzun ömürlü bir ağaçtır). Güneşli, rüzgardan korunaklı, iyi drene yer seçin.'),
('defne', 'Bakım', 'Kuruluğa dayanıklıdır ama genç fidanlarda düzenli sulama gerekir. Yılda 1 hafif budama şekil vermek ve havalandırmayı artırmak için yapılır.'),
('defne', 'Hasat', 'Yaprak hasadı yıl boyu yapılabilir, ama en yoğun aroma ilkbahar sonu-yaz başında toplanan yapraklardadır. Yaşlı, koyu yeşil yapraklar tercih edilir.'),
('defne', 'Kurutma', 'Gölgede, iyi havalandırılan yerde 2-3 hafta kurutulur — güneşte kurutma yaprağın rengini ve aromasını bozar.'),

('gül', 'Dikim', 'Köklü fidanla sonbahar (Kasım) ya da erken ilkbaharda dikilir; sıra arası 2-2.5 m, sıra üzeri 1-1.5 m. Verime 3. yılda başlanır, tam verime 5. yılda ulaşılır.'),
('gül', 'Bakım', 'Kışın budama (odun budaması) verim için kritiktir — ölü/hastalıklı ve iç dallar temizlenir. Çiçeklenme öncesi (Nisan) bir gübreleme yapılır.'),
('gül', 'Hasat', 'Çiçekler, uçucu yağ oranının en yüksek olduğu sabah 05:00-09:00 arası, güneş yükselmeden önce elle toplanır — sıcaklık arttıkça yağ buharlaşır, verim düşer.'),
('gül', 'Kurutma', 'Yağ gülü genelde kurutulmaz, hasat gününde taze işlenir (distilasyona gönderilir); bekletme yağ kaybına yol açar.'),

('ıhlamur', 'Dikim', 'Fidanla sonbahar veya ilkbaharda dikilir; büyük bir ağaç olduğundan sıra arası en az 6-8 m bırakılmalı. Derin, nemli ama iyi drene toprağı sever.'),
('ıhlamur', 'Bakım', 'Genç ağaçlarda düzenli sulama, olgun ağaçlarda ek bakım genelde gerekmez. Yılda 1 hafif şekil budaması yeterlidir.'),
('ıhlamur', 'Hasat', 'Çiçekler tam açtığında (Haziran), kuru ve güneşli bir günde, öğleden önce toplanır — nemli çiçek hızla kararır ve aroma kaybeder.'),
('ıhlamur', 'Kurutma', 'İnce serilerek gölgede, iyi hava sirkülasyonu olan yerde 4-6 gün kurutulur; yığın halinde bırakılırsa küflenme riski yüksektir.'),

('kekik', 'Dikim', 'Fide veya çelikle ilkbahar (Nisan) ya da sonbaharda (Eylül-Ekim) dikilir; sıra arası 30-40 cm. Kayalık, kireçli, iyi drene toprakları sever — bereketli/nemli toprakta aroma zayıflar.'),
('kekik', 'Bakım', 'Kurağa çok dayanıklıdır, aşırı sulama kök çürüklüğüne yol açar. Yılda 1 hafif gübreleme yeterli; fazla azot aroma yoğunluğunu düşürür.'),
('kekik', 'Hasat', 'Tam çiçeklenme döneminde (uçucu yağ zirvede), sabah çiy kurumuşken hasat edilir. Yılda 2 hasat (Haziran ve Eylül) mümkündür.'),
('kekik', 'Kurutma', 'Demetler halinde asılıp gölgede, iyi havalandırılan yerde 1-2 hafta kurutulur; 35°C üstü sıcaklık uçucu yağ kaybına neden olur.'),

('kimyon', 'Dikim', 'Doğrudan tohumla erken ilkbaharda (Mart) ekilir, sıra arası 30-40 cm, ekim derinliği 1-2 cm. Sıcak, kurak iklimi sever, don riskine karşı hassastır.'),
('kimyon', 'Bakım', 'Çimlenme döneminde düzenli nem, sonrasında ölçülü sulama gerekir. Yabancı ot rekabeti verimi ciddi düşürür — ilk 8 hafta düzenli çapalama önemlidir.'),
('kimyon', 'Hasat', 'Tohum başakları kahverengiye dönüp kurumaya başladığında (aşırı olgunlaşmadan önce) sabah erken biçilir — geç kalınırsa tohum dökülür.'),
('kimyon', 'Kurutma', 'Demet halinde 7-10 gün gölgede kurutulup harmanlanır; nihai nem %8-10 aralığında olmalıdır.'),

('nane', 'Dikim', 'Rizom veya fide ile ilkbaharda dikilir, sıra arası 40-50 cm — çok yayılgan bir bitkidir, saksı/bariyer kullanılmazsa komşu alanları istila edebilir.'),
('nane', 'Bakım', 'Nem seven bir bitkidir, düzenli sulama gerektirir (toprağın kurumasına izin vermeyin). Yılda 2-3 kez gübreleme verim artırır.'),
('nane', 'Hasat', 'Çiçeklenmeden hemen önce, sabah erken saatte biçilir; yılda 2-3 kez hasat mümkündür (biçim sonrası yeniden sürer).'),
('nane', 'Kurutma', 'Demet halinde asılıp gölgede 5-7 gün kurutulur; doğrudan güneş yaprağı kararır, mentol aromasını zayıflatır.'),

('papatya', 'Dikim', 'Fide veya doğrudan tohumla sonbahar (Ekim) ya da erken ilkbaharda ekilir; tohum çok küçüktür, yüzeye serpilir, üstü hafif bastırılır (derin gömülmemeli).'),
('papatya', 'Bakım', 'Düzenli ama hafif sulama yeterlidir, su birikmesinden kaçının. Yabancı ot kontrolü genç dönemde önemlidir, sonra bitki kendi kendine baskılayıcı olur.'),
('papatya', 'Hasat', 'Çiçekler tam açtığında (taç yaprakları yatay konuma geldiğinde), elle veya tarakla, sabah kuru havada toplanır — 3-4 günde bir tekrarlanır.'),
('papatya', 'Kurutma', 'İnce tabaka halinde gölgede, 35°C''yi geçmeyen sıcaklıkta 3-5 gün kurutulur.'),

('pul_biber', 'Dikim', 'Fide ile Nisan-Mayıs''ta dikilir (biber ailesi, dona hassas), sıra arası 60-70 cm, sıra üzeri 40-50 cm.'),
('pul_biber', 'Bakım', 'Düzenli sulama gerekir ama aşırı nem meyve çürüklüğüne yol açar; damla sulama önerilir. Çiçeklenme döneminde dengeli gübreleme verimi artırır.'),
('pul_biber', 'Hasat', 'Meyveler tam kırmızı olgunluğa ulaştığında elle toplanır — erken toplanan yeşil/turuncu meyve renk ve acılığı düşürür.'),
('pul_biber', 'Kurutma', 'Güneşte veya düşük ısılı kurutucuda (50-60°C) meyveler tam kuruyana kadar kurutulur, sonra öğütülür; nem oranı %8''in altına düşürülmelidir (küflenmeyi önlemek için).'),

('rezene', 'Dikim', 'Doğrudan tohumla ilkbahar (Mart-Nisan) ya da sonbaharda ekilir, sıra arası 40-50 cm, derinlik 1-2 cm.'),
('rezene', 'Bakım', 'Orta düzeyde su ister, kuraklığa nispeten dayanıklıdır. Rüzgarlı alanlarda uzun boylu bitkiler için destek gerekebilir.'),
('rezene', 'Hasat', 'Tohum başakları kahverengileşip kurumaya başladığında sabah erken biçilir.'),
('rezene', 'Kurutma', 'Demet halinde gölgede 7-10 gün kurutulup harmanlanır, nihai nem %10''un altında tutulmalıdır.'),

('sumak', 'Dikim', 'Fidanla sonbahar veya ilkbaharda dikilir; sıra arası 3-4 m (çalı/küçük ağaç formunda), kayalık/kurak yamaçlara iyi uyum sağlar.'),
('sumak', 'Bakım', 'Kurağa çok dayanıklıdır, ek sulama genelde gerekmez. Yılda 1 hafif budama form ve havalandırma için yeterlidir.'),
('sumak', 'Hasat', 'Meyve salkımları koyu kırmızıya döndüğünde (Ağustos-Eylül), kuru bir günde elle toplanır — yağmur sonrası toplama ekşiliği ve aromayı zayıflatır.'),
('sumak', 'Kurutma', 'Salkımlar gölgede 1-2 hafta kurutulup öğütülür, nem oranı düşük tutulmalı (küflenme riski).'),

('safran', 'Korm/Dikim', 'Safran kormları Haziran-Ağustos arasında, toprak sıcaklığı 20°C''nin altına düşmeden dikilir. İdeal dikim derinliği 10-15 cm, sıra arası 20-25 cm''dir — sığ dikim kormun kışın donmasına, çok derin dikim ise çiçeklenmenin gecikmesine yol açar. Dikim öncesi toprağın iyi drene olduğundan emin olun (su birikmesi kormu çürütür); ağır killi topraklarda kum/perlit katkısı önerilir.'),
('safran', 'Bakım', 'Çiçeklenme öncesi (Eylül-Ekim) hafif bir gübreleme (fosfor-potasyum ağırlıklı) verimi artırır — aşırı azot yaprak gelişimini artırıp çiçeklenmeyi geciktirebilir. Yaz aylarında (kormun dinlenme dönemi) sulama tamamen kesilir; sonbaharda çiçeklenme öncesi, toprak kuruysa sulama yapılır. Yabancı ot mücadelesi elle/çapayla yapılmalı, kimyasal herbisitlerden kaçınılmalıdır (kormlar sığ ve hassastır).'),
('safran', 'Hasat', 'Çiçekler Ekim-Kasım''da, genelde sabah gün doğumundan sonraki 2-3 saat içinde (çiçekler güneşle açılmadan) elle toplanır — geç toplama stigma kalitesini düşürür. Çiçeklenme dönemi 2-3 hafta sürer, günlük hasat gerekebilir (bir gün gecikme çiçeğin solmasına yol açar). Toplanan çiçeklerden kırmızı stigmalar aynı gün elle ayrıştırılmalıdır.'),
('safran', 'Kurutma', 'Toplanan stigmalar hasat gününün akşamına kadar (en geç 24 saat içinde) kurutulmalı — geciken kurutma küflenme ve renk/aroma kaybına yol açar. Geleneksel yöntemde ince bir tabaka halinde elekte, 40-50°C''yi geçmeyen dolaylı ısıda 15-20 dakika kurutulur; sanayi tipi kurutucuda 45°C''de 10-15 dakika yeterlidir. Doğru kurutulmuş safran nemini %10-12''ye düşürür.'),

('safran_soğanı', 'Söküm', 'Safran soğanları (kormlar) yaz sonunda (Temmuz-Ağustos), yapraklar tamamen sarardıktan/kuruduktan sonra sökülür — erken söküm kormun gelişimini yarıda keser, verim ve kalite düşer. Sökülen kormlar toprak ve döküntülerden hafifçe temizlenip gölgede birkaç gün havalandırılır.'),
('safran_soğanı', 'Ayıklama', 'Sökülen kormlar büyüklüğüne göre sınıflandırılır — çapı 2.5-3 cm üzeri kormlar çiçeklenme/tekrar dikim için ayrılır, küçük/hasarlı/hastalıklı olanlar elenir (mantar hastalığı belirtisi olan kormlar imha edilmelidir, bulaşıcıdır). Sağlıklı, iri kormlar bir sonraki dikim sezonuna kadar serin (10-15°C), kuru ve havadar bir yerde saklanır.'),
('safran_soğanı', 'Hasat', 'Safran soğanı üretiminde "hasat" ürünün kendisi kormun sökümüdür — Söküm adımına bakın. Bu iki adım birbirine bağlıdır ve genelde aynı dönemde gerçekleşir.');
