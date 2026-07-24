-- P22-C batch 2: meyve + sert kabuklu ailesi (bakım-hasat pattern) — 20 crop, 40 satır

insert into crop_journal_glossary (crop, term, explanation) values
('antep_fıstığı', 'Bakım', 'Kurağa dayanıklı bir ağaçtır, aşırı sulama kök hastalıklarına yol açar — yaz aylarında 3-4 haftada bir derin sulama yeterlidir. Dişi ağaçlar meyve verir, verimli tozlanma için her 8-10 dişiye 1 erkek ağaç (rüzgar yönünde) gereklidir.'),
('antep_fıstığı', 'Hasat', 'Meyve kabuğu (mezokarp) pembe-kırmızıya döndüğünde, Eylül sonu-Ekim başında hasat edilir — geç kalınırsa kabuk kendiliğinden çatlar ve kalite/lezzet düşer.'),

('armut', 'Bakım', 'Düzenli sulama (özellikle meyve büyüme döneminde) ve yılda 1 kış budaması (havalandırma, ışık alımı için) önerilir. Ateş yanıklığı hastalığına karşı çiçeklenme döneminde dikkatli gözlem gerekir.'),
('armut', 'Hasat', 'Armut, ağaçta tam olgunlaşmadan (yeşilden sarıya dönmeye başladığında, hâlâ sert) hasat edilip soğukta olgunlaştırılır — ağaçta aşırı olgunlaşma etin unlaşmasına yol açar.'),

('ayva', 'Bakım', 'Kurağa nispeten dayanıklıdır ama meyve gelişim döneminde düzenli sulama verim ve meyve iriliğini artırır. Kışın hafif budama yeterlidir, aşırı budama verim kaybına yol açar.'),
('ayva', 'Hasat', 'Meyveler sarı renge dönüp karakteristik kokusunu verdiğinde, Ekim ayında hasat edilir — donlardan önce toplanmalıdır (dona maruz kalan ayva çabuk bozulur).'),

('badem', 'Bakım', 'Çiçeklenme (Şubat-Mart) dona karşı hassastır, geç don riski olan bölgelerde önlem alınmalı. Yaz aylarında düzenli sulama iç dolgunluğunu artırır — su stresi boş/buruşuk iç oranını yükseltir.'),
('badem', 'Hasat', 'Dış kabuk (hull) çatlayıp kahverengiye döndüğünde (Ağustos-Eylül), ağaç sallanarak veya elle hasat edilir, ardından kabuk ayrıştırılıp kurutulur.'),

('ceviz', 'Bakım', 'Derin köklü, kurağa nispeten dayanıklı bir ağaçtır ama meyve dolum döneminde (Temmuz-Ağustos) düzenli sulama iç kalitesini belirgin artırır. Genç ağaçlarda şekil budaması, olgunlarda minimal budama yeterlidir.'),
('ceviz', 'Hasat', 'Dış kabuk (yeşil kabuk) çatlamaya başladığında, Eylül-Ekim''de hasat edilir — geciken hasat iç rengini kararmaya, kalitenin düşmesine yol açar.'),

('çilek', 'Bakım', 'Sık ve az miktarda sulama (damla sulama idealdir) tercih edilir — yaprak ıslatan sulama gri küf riskini artırır. Meyve toprakla temas etmesin diye malç (saman/plastik) kullanımı önerilir.'),
('çilek', 'Hasat', 'Meyveler tam kırmızı renge ulaştığında (olgunlaşma sonrası hızlı bozulur), 2-3 günde bir, sabah serin saatte elle toplanır.'),

('elma', 'Bakım', 'Büyüme döneminde (Nisan-Eylül) düzenli toprak nemi takip edilmeli, su stresinden kaçınılmalıdır. Yıllık gübreleme erken ilkbahar ve hasat sonrası olmak üzere 2 dönemde yapılır. Kabuklu bit ve elma iç kurdu için haftalık gözlem önerilir.'),
('elma', 'Hasat', 'Çeşide göre değişmekle birlikte genelde Ağustos-Ekim arasında, meyve sapı kolayca ayrıldığında ve zemin rengi değiştiğinde hasat edilir — erken hasat depolama kalitesini düşürür.'),

('erik', 'Bakım', 'Çiçeklenme döneminde geç donlara karşı hassastır. Meyve seyreltme (aşırı yüklü dallarda meyveler arası 5-8 cm bırakma) meyve iriliğini artırır.'),
('erik', 'Hasat', 'Meyveler tam renk aldığında ve hafif yumuşadığında, genelde Temmuz-Ağustos''ta, birkaç günde bir seçici olarak toplanır (aynı ağaçta olgunlaşma eş zamanlı değildir).'),

('greyfurt', 'Bakım', 'Turunçgil ailesi, düzenli sulama ve kışın soğuktan koruma (özellikle genç ağaçlarda) gerektirir. Yılda 2-3 kez dengeli gübreleme (azot-fosfor-potasyum) önerilir.'),
('greyfurt', 'Hasat', 'Kabuk rengi ve iç şeker oranı (briks) hasat zamanını belirler, genelde Aralık-Mart arasındadır — turunçgiller hasat sonrası olgunlaşmaya devam etmez, ağaçta tam olgunlaşmalıdır.'),

('incir', 'Bakım', 'Kurağa oldukça dayanıklıdır, aşırı sulama meyve çatlamasına yol açabilir. Kışın hafif budama (ölü/kesişen dallar) yeterlidir.'),
('incir', 'Hasat', 'Meyve sapı gevşediğinde ve hafif eğildiğinde (tam olgunluk), sabah erken saatte elle toplanır — olgun incir çok çabuk bozulur, günlük hasat gerekebilir.'),

('kayısı', 'Bakım', 'Erken çiçeklenir (Mart), geç don riski en büyük tehdittir — riskli bölgelerde don koruma önlemleri (duman, sulama) düşünülmelidir. Meyve seyreltme kalite ve iriliği artırır.'),
('kayısı', 'Hasat', 'Meyveler tam renk alıp hafif yumuşadığında, genelde Haziran-Temmuz''da toplanır — kayısı hasat sonrası çok az olgunlaşır, ağaçta doğru zamanı yakalamak önemlidir.'),

('kiraz', 'Bakım', 'Çiçeklenme döneminde geç dona hassastır. Meyve çatlaması yağmura karşı büyük risktir — olgunlaşma döneminde yağmurdan hemen sonra sıcaklık artışı çatlamayı tetikler.'),
('kiraz', 'Hasat', 'Meyveler tam renk ve tatlılığa ulaştığında sapıyla birlikte elle koparılır — kiraz hasat sonrası olgunlaşmaz, doğru zamanlama kritiktir.'),

('limon', 'Bakım', 'Turunçgil ailesi, don hassasiyeti yüksektir (özellikle genç ağaçlar), kış aylarında koruma gerekebilir. Düzenli ama ölçülü sulama, aşırı sulama kök çürüklüğüne yol açar.'),
('limon', 'Hasat', 'Limon yıl boyu birkaç dönemde hasat edilebilir (çeşide göre), kabuk sarı-yeşil renk aldığında ve istenen boyuta ulaştığında toplanır.'),

('mandalina', 'Bakım', 'Turunçgil ailesi, düzenli sulama ve dengeli gübreleme (özellikle meyve tutumu döneminde) verimi belirler. Don riskine karşı genç ağaçlar korunmalıdır.'),
('mandalina', 'Hasat', 'Kabuk turuncu renge dönüp kolayca soyulduğunda, genelde Kasım-Ocak arasında hasat edilir — ağaçta tam olgunlaşma beklenmelidir.'),

('muz', 'Bakım', 'Sıcak, nemli iklim ve bol su ister — toprak nemi hiç kurumamalı. Rüzgardan korunaklı alan seçilmeli (geniş yapraklar rüzgarda kolayca yırtılır/devrilir).'),
('muz', 'Hasat', 'Salkımdaki meyveler köşeli değil yuvarlak/dolgun göründüğünde (tam olgunlaşmadan, yeşilken) kesilip hasat sonrası olgunlaştırılır — ağaçta olgunlaşan muz çatlar ve kısa sürede bozulur.'),

('nar', 'Bakım', 'Kurağa dayanıklıdır ama meyve gelişim döneminde düzenli sulama meyve çatlamasını önler (ani sulama sonrası kuraklık dönemleri çatlamaya en çok yol açan etkendir). Yılda 1 hafif budama yeterlidir.'),
('nar', 'Hasat', 'Kabuk parlak kırmızı renge dönüp "metalik" bir ses verdiğinde (hafifçe vurulduğunda), genelde Ekim''de hasat edilir — geç kalınırsa çatlama riski artar.'),

('portakal', 'Bakım', 'Turunçgil ailesi, düzenli sulama ve dengeli gübreleme gerektirir; don riskine karşı özellikle genç ağaçlar korunmalıdır. Yaz aylarında düzenli sulama meyve iriliğini artırır.'),
('portakal', 'Hasat', 'Kabuk turuncu renk alıp iç şeker/asit oranı dengelendiğinde (çeşide göre Kasım-Mart), ağaçta tam olgunlaşma beklenerek hasat edilir.'),

('şeftali', 'Bakım', 'Erken çiçeklenir, geç don riskine hassastır. Meyve seyreltme (meyveler arası 10-15 cm) iriliği ve kaliteyi belirgin artırır; yaprak kıvırcıklığı hastalığına karşı erken ilkbahar kontrolü önemlidir.'),
('şeftali', 'Hasat', 'Meyve zemin rengi yeşilden sarı/krem tonuna döndüğünde ve hafif yumuşadığında, genelde Temmuz-Ağustos''ta, birkaç günde bir seçici toplanır.'),

('üzüm', 'Bakım', 'Kışın sert budama (bir sonraki yılın verimini belirler) kritiktir. Yaz aylarında yaprak alma/seyreltme (salkım çevresindeki fazla yaprakların alınması) havalanmayı artırıp mantar hastalıklarını azaltır.'),
('üzüm', 'Hasat', 'Şeker oranı (briks) ve asitlik dengesi hedeflenen kullanıma (sofralık/şaraplık) göre ölçülüp Ağustos-Ekim arasında hasat edilir — tadım ve refraktometre ile kontrol önerilir.'),

('vişne', 'Bakım', 'Kirazdan daha soğuğa dayanıklıdır ama yine de çiçeklenme döneminde geç dona hassastır. Düzenli sulama meyve iriliğini artırır, aşırı sulama ise ekşilik/şeker dengesini bozabilir.'),
('vişne', 'Hasat', 'Meyveler koyu kırmızıya döndüğünde ve hafif yumuşadığında, genelde Haziran-Temmuz''da toplanır — vişne hasat sonrası olgunlaşmaz.');
