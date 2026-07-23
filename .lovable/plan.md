
# P21-A — Kontrollü Batch Mimarisi

Amaç: aynı parcel+crop için birden fazla `listings` (batch) kasıtlı ve kullanıcı seçimiyle açılsın; yeni hasat kayıtları tek bir batch'e bağlansın.

## Bulgular (mevcut durum)

- `useCreateListing` — `src/lib/hasat/queries.ts:~806`, explicit `status: 'active'` yazıyor. Duplicate kontrolü yok. Çağrıldığı yer: `src/routes/farmer.storefront.tsx` (ListingSheet, satır ~355).
- `useCreateEntry` — `src/lib/hasat/queries.ts:230`. Sadece `harvest_entries` insert eder; `listing_harvest_entries` bağını DB trigger'ı (`tg_harvest_entries_after_insert_autolink`) yapar. Trigger, aynı farmer+parcel+crop'a sahip TÜM draft/active listing'lere link atar (ON CONFLICT DO NOTHING).
- Çağrıldığı yerler: `src/routes/farmer.journal.new.tsx:25` ve AI chat akışı — `src/components/hasat/ai-chat/JournalEntryCard.tsx:141` (bu doğrudan `supabase.from("harvest_entries").insert(...)` — hook kullanmıyor).
- DB verisi: bugün için aynı farmer+parcel+crop'ta çoklu draft/active listing **YOK** (kontrol edildi, 0 satır). Yani "Ahmet'in safranındaki 3 listing" mevcut durumda birden fazla parselden geliyor olabilir — parcel bazında duplicate yok.
- `listing_harvest_entries`'te 2 listing'e birden bağlı 5 harvest_entry var — autolink trigger'ının geçmiş dönemde ürettiği kayıtlar (farklı listing'lerin overlap ettiği anlar). Fanout gerçek.

## Uygulama planı

### 1) Migration (tek migration)

- `ALTER TABLE public.listings ADD COLUMN batch_name text` (nullable).
- `tg_harvest_entries_after_insert_autolink` trigger fonksiyonunu güncelle: **eğer aynı farmer+parcel+crop için birden fazla draft/active listing varsa hiçbir şey yapma** (frontend seçecek). Tek eşleşme varsa mevcut davranışı koru (backward compatible, tek batch senaryosunu bozmaz).
- Not: `listing_harvest_entries` üzerinde yeni bir kısıt eklemiyoruz (bir harvest_entry'nin fiziksel olarak birden fazla listing'e link'lenmesi teorik olarak geçerli kalabilir; bu turda sadece yeni-kayıt akışını tek-batch'e sabitliyoruz).
- Geriye dönük veri temizliği: bu turda YAPMIYORUZ. 5 çoklu-linkli mevcut kayıt olduğu gibi kalır (stok toplamı bugün de bu kayıtlar için üste-sayıma yol açmıyor çünkü `useListingStock` `SUM(harvest_entries.quantity)`'yi listing başına ayrı hesaplıyor; her listing kendi bağlarını görüyor). İleride P21-B'de "orphan link temizliği" olarak ele alınabilir — planın kapsamına almadım.

### 2) `useCreateListing` — duplicate ön-kontrolü

- Insert öncesi aynı `farmer_id + parcel_id + crop` için `status in ('draft','active')` listing var mı diye sorgula.
- Varsa: throw etme; mutation'ın çağırdığı UI karar versin. Bunu iki yoldan biriyle çözelim (planda A'yı öneriyorum):
  - **A (önerilen):** yeni bir hook `useExistingBatches(parcelId, crop)` ekle. `ListingSheet` "Yeni Ürün" açıldığında bu hook'u çalıştırır; eşleşme varsa formu göstermeden önce bir "Batch kararı" ekranı gösterir. Böylece `useCreateListing` mantığı sadeleşir, duplicate riski UI'da yakalanır.
  - B: `useCreateListing` içine `force: boolean` parametresi ekleyip sunucu tarafında engelleme — daha kırılgan, UX zayıf.

### 3) `ListingSheet` (`src/routes/farmer.storefront.tsx`) UI

Yeni bir ön-adım (form açılmadan önce):

- Sheet açıldığında, seçili crop yoksa mevcut akış aynen sürsün.
- Crop seçilir seçilmez (veya "Yeni Ürün" bir crop için başlatıldığında) `useExistingBatches` sonucunu göster:
  - 0 mevcut batch → normal form (mevcut davranış, `status:'active'` ile create).
  - ≥1 mevcut batch → 3 seçenekli kart:
    1. Liste: mevcut batch'ler `{batch_name || 'Batch #n'} · stok: X {unit}` şeklinde. Seçilirse Sheet kapanır, kullanıcı hasat kaydı formuna yönlendirilir (o batch preselected). Yeni listing açılmaz.
    2. "Yeni batch aç" → form açılır ama create çağrısı `status: 'draft'` yollar (mevcut "✓ Yayınla" akışıyla sonradan aktifleşir).
    3. İptal.
- Form'a yeni opsiyonel input: **Batch adı** (`batch_name`). Boşsa DB'ye null gider; kartlarda UI fallback `"Batch #${index+1}"` gösterir.
- `ListingCard` (aynı dosya) başlığına `batch_name` (varsa) ekle.

### 4) Hasat kaydı formu — batch seçici

Etkilenen yerler:

- `src/routes/farmer.journal.new.tsx`: parsel+crop seçildikten sonra yeni bir "Hangi batch'e ekleniyor?" select alanı. Seçenekler: aynı parcel+crop için draft/active listing'ler; varsayılan: en son `created_at` olan; "hiçbirine bağlama" seçeneği de olsun (bugünün autolink-none davranışını koruyan alt sınır).
- `src/components/hasat/ai-chat/JournalEntryCard.tsx`: aynı seçici bileşeni; AI parse ettiği alanlar dolduktan sonra kullanıcıya "kaydet"ten önce göster.
- Insert sonrası: eğer kullanıcı bir batch seçtiyse frontend, `harvest_entries` insert'inden sonra `listing_harvest_entries` satırını kendisi `insert({listing_id, harvest_entry_id})` yapar. Trigger değişikliği (yukarıda) çoklu-eşleşme durumunda hiçbir şey yapmadığı için double-link olmaz; tek-eşleşme durumunda kullanıcı seçmese bile trigger o tek listing'e bağlar (BC).
- Yeni hook: `useCreateEntryWithBatch({ entry, listingId? })` — mevcut `useCreateEntry`'yi wrap edip listing_id opsiyonel bağlamayı yönetir. (`useCreateEntry`'ye direkt param eklemek de olabilir; tercih: yeni hook, mevcut callers dokunulmaz.)

### 5) Etkilenen dosyalar (özet)

- `src/lib/hasat/queries.ts` — `useExistingBatches`, `useCreateListing` (batch_name'i insert'e ekle, `draft` opsiyonu), `useCreateEntryWithBatch`, `HarvestEntry`/`Listing` tiplerine `batchName`.
- `src/lib/hasat/types.ts` — `Listing.batchName?: string`.
- `src/routes/farmer.storefront.tsx` — ListingSheet ön-adım, batch adı input, ListingCard etiketi.
- `src/routes/farmer.journal.new.tsx` — batch seçici.
- `src/components/hasat/ai-chat/JournalEntryCard.tsx` — batch seçici; direkt insert yerine yeni hook'u kullan.
- 1 migration (kolon + trigger update).

### 6) Soruların cevapları

1. **Etkilenen kod**: yukarıdaki 5 dosya + 1 migration. `useCreateListing`, yeni `useExistingBatches`, yeni `useCreateEntryWithBatch`; `useCreateEntry` iç imzası değişmez.
2. **Geriye dönük çoklu listing'ler**: bugün aynı farmer+parcel+crop için duplicate listing YOK (sorgu ile doğrulandı). Migration/temizlik gerekmiyor. Yeni akış yalnızca ileriye dönük çalışır.
3. **Mevcut çoklu-linkli harvest_entries**: 5 kayıt var (2 listing'e birden bağlı). Bu turda dokunulmaz — mevcut `useListingStock` hesabı bu kayıtlar için sorun üretmiyor. P21-B'de opsiyonel "eski linkleri tek batch'e daralt" temizliği düşünülebilir; şimdi kapsam dışı.

## Kapsam dışı (bilinçli)

- Aynı-crop farklı-parcel kısıtı yok — planın konusu parcel+crop düzeyinde.
- `listing_harvest_entries` üzerinde UNIQUE(harvest_entry_id) eklemiyoruz — bir harvest_entry'nin ilerideki manuel çoklu-batch senaryolarını (nadir) kapatmamak için.
- Mevcut çoklu-linkli 5 satırın temizliği.
