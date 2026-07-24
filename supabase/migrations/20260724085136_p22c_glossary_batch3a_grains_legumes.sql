-- P22-C batch 3a: tahıl + baklagil ailesi (ekim-bakım-hasat pattern) — 10 crop, 30 satır

insert into crop_journal_glossary (crop, term, explanation) values
('arpa', 'Ekim', 'Kışlık ekim Ekim-Kasım''da, yazlık ekim Şubat-Mart''ta yapılır; ekim derinliği 4-5 cm, dekara 18-20 kg tohum kullanılır. Buğdaya göre soğuğa ve kurağa daha dayanıklıdır.'),
('arpa', 'Bakım', 'Kardeşlenme döneminde (erken ilkbahar) azotlu gübreleme verimi belirgin artırır. Yabancı ot mücadelesi kardeşlenme öncesi yapılmalıdır.'),
('arpa', 'Hasat', 'Tane nem oranı %13-14''e düştüğünde (sarı-altın renk, sap kuru), biçerdöverle hasat edilir — erken hasat nem sorununa, geç hasat dökülme kaybına yol açar.'),

('buğday', 'Ekim', 'Kışlık ekim Ekim-Kasım''da yapılır, ekim derinliği 4-6 cm, dekara 18-22 kg tohum. Toprak sıcaklığı 10-15°C''de çimlenme en iyi olur.'),
('buğday', 'Bakım', 'Kardeşlenme (Şubat-Mart) ve başaklanma (Nisan-Mayıs) dönemlerinde olmak üzere 2 dönem azotlu gübreleme yapılır. Sarı pas hastalığı için erken ilkbaharda gözlem önemlidir.'),
('buğday', 'Hasat', 'Tane nem oranı %13-14''e düştüğünde biçerdöverle hasat edilir, genelde Haziran-Temmuz.'),

('çavdar', 'Ekim', 'Kışlık ekim Eylül-Ekim''de yapılır, ekim derinliği 3-4 cm. Fakir/kumlu topraklara diğer tahıllardan daha iyi uyum sağlar.'),
('çavdar', 'Bakım', 'Düşük gübre talebi olan bir tahıldır, aşırı azot yatmaya (sap kırılmasına) yol açar. Kardeşlenme döneminde tek bir gübreleme genelde yeterlidir.'),
('çavdar', 'Hasat', 'Tane sertleşip sap sarardığında, Haziran-Temmuz''da biçerdöverle hasat edilir.'),

('çeltik', 'Ekim', 'Nisan-Mayıs''ta, tava sistemiyle (su altında) veya kuru ekim yapılır; su yönetimi çeltik yetiştiriciliğinin en kritik unsurudur (sürekli su seviyesi kontrolü gerekir).'),
('çeltik', 'Bakım', 'Büyüme döneminde tarla su seviyesi 5-10 cm''de tutulur, sadece olgunlaşma öncesi su kesilir. Yabancı ot mücadelesi su seviyesiyle de desteklenir.'),
('çeltik', 'Hasat', 'Tanelerin %80-85''i sarardığında, tarla suyu boşaltılıp toprak biraz sertleştikten sonra hasat edilir, genelde Eylül-Ekim.'),

('mısır', 'Ekim', 'Toprak sıcaklığı 10°C''yi geçtiğinde (Nisan-Mayıs), ekim derinliği 4-6 cm, sıra arası 70 cm, sıra üzeri 20-25 cm.'),
('mısır', 'Bakım', 'Yüksek su ve azot talebi olan bir bitkidir — özellikle püskül çıkarma döneminde su stresi verimi ciddi düşürür. Mısır kurdu için düzenli gözlem önemlidir.'),
('mısır', 'Hasat', 'Tane nem oranına göre (silajlık %65-70, danelik %20-25) zamanı belirlenir; danelik mısır genelde Eylül-Ekim''de hasat edilir.'),

('yulaf', 'Ekim', 'Kışlık (Ekim-Kasım) veya yazlık (Mart) ekilebilir, ekim derinliği 3-4 cm. Soğuğa buğdaydan daha az dayanıklıdır ama nemli toprakları daha iyi tolere eder.'),
('yulaf', 'Bakım', 'Orta düzeyde gübre talebi vardır, aşırı azot yatmaya yol açar. Yabancı ot mücadelesi erken dönemde önemlidir.'),
('yulaf', 'Hasat', 'Tane sertleşip sap sarardığında, genelde Temmuz''da biçerdöverle hasat edilir.'),

('bakla', 'Ekim', 'Sonbahar (Ekim-Kasım, ılıman bölgelerde) veya erken ilkbaharda (Şubat-Mart) ekilir, ekim derinliği 5-7 cm, sıra arası 40-50 cm.'),
('bakla', 'Bakım', 'Baklagil olduğu için azot ihtiyacı düşüktür (kök nodüllerinde kendi azotunu fikse eder), fosfor-potasyum ağırlıklı gübreleme yeterlidir. Kara kulak biti için düzenli gözlem önerilir.'),
('bakla', 'Hasat', 'Taze tüketim için baklalar dolgunlaşıp yeşilken (Nisan-Mayıs), kuru tane için baklalar kararıp kuruduğunda (Haziran-Temmuz) hasat edilir.'),

('kuru_fasulye', 'Ekim', 'Don riski geçtikten sonra (Mayıs), ekim derinliği 4-5 cm, sıra arası 50-60 cm.'),
('kuru_fasulye', 'Bakım', 'Çiçeklenme ve bakla dolum döneminde düzenli sulama verimi belirgin artırır — su stresi çiçek dökümüne yol açar. Baklagil olduğundan azot ihtiyacı düşüktür.'),
('kuru_fasulye', 'Hasat', 'Bitkinin %80-90''ı sararıp baklalar kuruduğunda (Eylül), bitki sökülüp harman edilir.'),

('mercimek', 'Ekim', 'Kışlık (Ekim-Kasım, güneyde) veya erken ilkbaharda (Mart) ekilir, ekim derinliği 3-5 cm, sıra arası 20-30 cm.'),
('mercimek', 'Bakım', 'Kurağa oldukça dayanıklı bir baklagildir, aşırı sulama/nem hastalık riskini artırır. Azot ihtiyacı düşüktür.'),
('mercimek', 'Hasat', 'Alt baklalar kahverengileşip üst kısım hâlâ yeşilken (aşırı olgunlaşma dökülmeye yol açar) biçilir, genelde Haziran-Temmuz.'),

('nohut', 'Ekim', 'Kışlık (Ekim-Kasım, ılıman bölgelerde) veya ilkbaharda (Mart) ekilir, ekim derinliği 5-8 cm, sıra arası 30-40 cm.'),
('nohut', 'Bakım', 'Kurağa dayanıklı bir baklagildir, aşırı nem antraknoz gibi hastalıkları tetikler. Azot ihtiyacı düşüktür (kök nodülleri azot fikse eder).'),
('nohut', 'Hasat', 'Baklalar kahverengileşip tane sertleştiğinde, genelde Temmuz''da biçilir/sökülür.');
