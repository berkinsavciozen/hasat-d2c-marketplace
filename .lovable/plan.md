## P17-E: Yapılandırılmış RFQ (talep akışı)

Alıcının arama sonucu boşken bir talep bırakabilmesi, çiftçilerin bu talepten haberdar olması ve alıcının kendi taleplerini takip edebilmesi için uçtan uca akış.

### 1) Şema (migration — sadece ekleme, mevcut veriyi bozmaz)

`public.crop_requests`'e opsiyonel kolonlar:
- `quantity numeric`
- `unit text`
- `region text` (şehir)
- `target_date_start date`
- `target_date_end date`
- `target_price numeric`

Mevcut RLS/policy'lere dokunulmaz. Yeni kolonların hepsi NULLable, default yok — eski satırlar geçerli kalır.

### 2) `queries.ts` — hook genişletmesi

`useCreateCropRequest` girişini genişlet:
```
{ cropName, note?, quantity?, unit?, region?, targetDateStart?, targetDateEnd?, targetPrice? }
```
Insert bu alanları da yazar (boşlar `null`).

Yeni: `useMyCropRequests()` — `requested_by = auth.uid()` ile kendi taleplerini `created_at desc` çeker (RLS zaten kısıtlıyor). Dönen tipi ekranın ihtiyacı olan alanlarla map'ler.

### 3) Talep oluşturma UI'sı — `buyer.discover.tsx`

"Sonuç bulunamadı" boş durumuna **"Bu ürünü talep et"** butonu. Tıklayınca modal:
- Ürün adı (`query`'den prefill, editable)
- Miktar + birim (birim: `g/kg/L` select)
- Bölge/şehir (opsiyonel, `TR_PROVINCES` select, "Farketmez" seçeneği)
- Tarih aralığı (opsiyonel, iki `<input type="date">`)
- Hedef fiyat (opsiyonel, ₺/birim)
- Not (opsiyonel textarea)

Başarıda toast + modal kapanır. Var olan `CropChips.tsx` içindeki `CropRequestDialog` daha basit; ondan bağımsız yeni modal (dolu form) `discover` içine inline yerleştirilir — mevcut dialog davranışı bozulmaz.

### 4) Eşleşme + bildirim (best-effort)

`useCreateCropRequest` içinde insert başarılı olduktan sonra, ayrı bir try/catch bloğu:
1. `crop_config`'ten `display_name`/`crop` case-insensitive lookup → canonical crop.
2. `listings` (status in `active`,`draft`) ve `parcels.crops` array'inden bu ürünü üreten `farmer_id`'leri union'la.
3. `region` doluysa `profiles.city = region` filtresi; boşsa filtre yok.
4. Her benzersiz çiftçi için `notifications` insert:
   - `type: 'crop_request'`
   - `title: 'Yeni ürün talebi'`
   - `body: '{buyer_name veya "Bir alıcı"} {ürün} arıyor{ · miktar varsa " — {qty} {unit}"}{ · region varsa " · {region}"}'`
   - `related_id: request.id`

`useCreateReview`/`useCreateReply`'daki desende — hata olursa sessizce log, ana mutation başarılı kalır. Tek insert için tek `.insert(rows)` çağrısı.

### 5) Alıcı — "Taleplerim" sayfası

Yeni route `src/routes/buyer.requests.tsx`:
- `BuyerHeader` (başlık: "Taleplerim", geri `/buyer/account`).
- `useMyCropRequests()` sonuçlarını kart listesi olarak:
  - Ürün adı + status chip (`open`/`matched`/`closed` — mevcut değerler)
  - Miktar+birim / bölge / tarih aralığı / hedef fiyat satırları (dolu olanlar)
  - Not (varsa)
  - Oluşturulma tarihi
- Boş durum: "Henüz talep oluşturmadın. Keşfet'te aradığın ürün yoksa 'Bu ürünü talep et' ile buraya ekleyebilirsin."

`buyer.account.tsx`'e bir menü satırı: "Taleplerim" (ClipboardList veya Search ikon + ChevronRight), diğer account link'leriyle aynı görsel desende. Alıcı shell nav'ına eklenmez.

### 6) Doğrulama

`tsgo` typecheck. Manuel akış: discover'da olmayan bir ürün ara → "Bu ürünü talep et" → form doldur → gönder → `buyer.account`'tan "Taleplerim" → kart görünür.

### Kapsam dışı (bu tur)
- Çiftçi tarafında "Talepler" gelen kutusu (bildirim yeterli, ayrı sayfa sonraki tur).
- Talep kapatma/silme UI'sı.
- Eşleşme kalitesi skorlaması / otomatik teklif önerisi.
