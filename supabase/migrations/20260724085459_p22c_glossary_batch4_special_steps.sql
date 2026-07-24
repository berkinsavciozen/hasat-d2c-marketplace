-- P22-C batch 4: özel adım kombinasyonları (fındık, lavanta, tıbbi bitkiler, zeytin, zeytinyağı) — 5 crop, 16 satır

insert into crop_journal_glossary (crop, term, explanation) values
('fındık', 'Budama', 'Kışın (yaprak dökümünden sonra) yapılır — ölü/hastalıklı dallar, iç dallar (havalandırma için) ve aşırı boy uzayan sürgünler kesilir. Fındık genelde çok gövdeli (ocak) formda yetiştirilir, gövde sayısı 8-10''da tutulur.'),
('fındık', 'Bakım', 'Yaz aylarında (meyve dolum döneminde) düzenli sulama iç dolgunluğunu artırır. Fındık kurdu ve fındık kokarcası için Haziran-Temmuz''da düzenli gözlem önemlidir.'),
('fındık', 'Hasat', 'Kabuklar dalından kendiliğinden ayrılıp yere dökülmeye başladığında (Ağustos sonu-Eylül), toplama yapılır — geç kalınırsa çürüme/küflenme riski artar.'),
('fındık', 'Kurutma', 'Toplanan fındıklar güneşte veya havalandırmalı kurutucuda, nem oranı %8''in altına düşene kadar (yaklaşık 1 hafta) kurutulur — yeterince kurutulmayan fındık depoda küflenir.'),

('lavanta', 'Budama', 'Hasat sonrası (Ağustos) hafif bir budama form korur ve bir sonraki yılın çiçeklenmesini teşvik eder — odun kısmına kadar sert budama bitkiyi zayıflatabilir, dikkatli yapılmalı.'),
('lavanta', 'Bakım', 'Kurağa çok dayanıklıdır, aşırı sulama kök çürüklüğüne en sık yol açan hatadır. İyi drene, hafif alkalin toprağı sever.'),
('lavanta', 'Hasat', 'Çiçek sapları tam açmadan, alt çiçekler mora dönmeye başladığında (uçucu yağ oranı en yüksek dönem) biçilir, genelde Haziran-Temmuz.'),
('lavanta', 'Distilasyon', 'Hasat edilen çiçekler taze halde (24 saat içinde), buhar distilasyonu ile işlenir — bekletme yağ veriminde kayba yol açar.'),

('tıbbi bitkiler', 'Bakım', 'Genel olarak tıbbi/aromatik bitkiler orta düzeyde su ve düşük-orta gübre talebi ister — aşırı gübreleme genelde uçucu yağ/aktif madde yoğunluğunu düşürür. Bitkiye özgü ihtiyaçlar için tür bazlı kaynaklara bakılması önerilir.'),
('tıbbi bitkiler', 'Hasat', 'En yüksek aktif madde/uçucu yağ oranına ulaşıldığı dönem (genelde çiçeklenme öncesi/sırası) hasat için idealdir, sabah çiy kurumuşken toplama tercih edilir.'),
('tıbbi bitkiler', 'Kurutma', 'Gölgede, iyi havalandırılan ve 35-40°C''yi geçmeyen ortamda kurutulmalıdır — doğrudan güneş renk ve aktif madde kaybına yol açar.'),

('zeytin', 'Budama', 'Kışın (Aralık-Şubat) yapılır — merkez açık (vazo) formda ışık ve hava girişini artıracak şekilde budanır, iç dallar seyreltilir.'),
('zeytin', 'Bakım', 'Kurağa dayanıklı bir ağaçtır ama meyve dolum döneminde (Ağustos-Eylül) düzenli sulama verim ve yağ oranını artırır. Zeytin sineği için yaz aylarında düzenli gözlem/tuzak kontrolü önemlidir.'),
('zeytin', 'Hasat', 'Sofralık zeytin yeşilken (erken), yağlık zeytin mor-siyaha döndüğünde (Kasım-Aralık) hasat edilir — hasat yöntemi (dal silkeleme, elle toplama) meyve/dal zararını etkiler.'),

('zeytinyağı', 'Hasat', 'Zeytinyağı için hasat edilen zeytinin olgunluk derecesi (yeşilden mora) yağın aroma ve asitlik profilini belirler — bkz. Zeytin ürününün Hasat adımı.'),
('zeytinyağı', 'Sıkım', 'Hasat edilen zeytin, kalite kaybını önlemek için 24-48 saat içinde sıkılmalıdır — bekleyen zeytin asitlik oranını (serbest yağ asidi) hızla yükseltir. Soğuk sıkım (27°C altı) daha yüksek kaliteli, düşük asitli (naturel sızma, %0.8 altı) yağ verir; sıcak sıkım verimi artırsa da kaliteyi düşürür.');
