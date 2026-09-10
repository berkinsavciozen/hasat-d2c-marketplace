# T6-UI ("AI ile özelleştir") + F11-UI ("Kendime kopyala")

Sadece UI. Hiçbir migration dosyasına dokunulmaz, hiçbir migration uygulanmaz, edge function değiştirilmez. Yayınlama (publish) akışı kapsam dışı.

## Mevcut durumun tespiti (okundu, doğrulandı)

- `customize-recipe` edge function canlıda; `phase: "propose"` ve `phase: "save"` tek endpoint üzerinden. Propose yanıtı: `{ idempotency_key, source_recipe_id, draft, changedFields, validation: { valid, issues } }`; geçersizse HTTP 422 ama gövde yine dolu geliyor.
- `rpc_clone_recipe(p_source_recipe_id)` ve `rpc_create_ai_customized_recipe(...)` üretilen tiplerde mevcut.
- RLS: kullanıcı kendi `recipes` / `recipe_ingredients` / `recipe_steps` satırlarını okuyup güncelleyebiliyor (`owner_id = auth.uid()`). Yani taslak listesi ve düzenleme ekranı doğrudan client'tan çalışır.
- Projede kullanıcının kendi tariflerini gördüğü **hiçbir ekran yok** — T6 ve F11'in "yeni taslağa yönlendir" kabul kriteri için bu ekranların bu turda yazılması gerekiyor.
- `fetchRecipeBySlug` şu an `author_type` / `visibility` alanlarını seçmiyor; CTA görünürlük kuralı için `author_type` select listesine eklenecek (davranış değişmez, sadece bir kolon).

## Yapılacaklar

### 1. Yeni ekranlar — "Tariflerim"

- `/tariflerim` — kullanıcının kendi taslakları (owner_id = kendisi), kart listesi: başlık, kaynak tarif bağlantısı, oluşturma tarihi, "Düzenle" ve "Sil". Giriş yoksa `/login`'e yönlendiren boş durum.
- `/tariflerim/$recipeId` — düzenleme ekranı: başlık, açıklama, porsiyon, hazırlık/pişirme/dinlenme dakikaları, zorluk; malzeme satırları (miktar, birim, isim/not, anahtar malzeme) ekle/sil/sırala; adım satırları (metin, opsiyonel süre) ekle/sil/sırala. Kaydet, `recipes` + `recipe_ingredients` + `recipe_steps` üzerinde kullanıcının kendi satırlarını günceller.
- Bu iki ekran hem T6 hem F11'in çıkış noktası — akış sonunda kullanıcı doğrudan `/tariflerim/$recipeId`'a düşer.
- Menüye "Tariflerim" girişi (giriş yapmış kullanıcı için) eklenir; mevcut navigasyon yapısı değişmez.

### 2. T6 — AI ile özelleştir

- `/tarifler/$slug` sayfasına, yalnızca kaynak uygunsa (public + published + `author_type <> 'kullanici'`) ve kullanıcı giriş yapmışsa görünen **"AI ile özelleştir"** butonu.
- Buton bir sheet açar:
  1. **İstek adımı**: serbest metin ("vegan yap", "fındığı çıkar"), 5–2000 karakter. Gönder → `customize-recipe` `phase: "propose"`.
  2. **Öneri adımı**: dönen taslak düzenlenebilir biçimde gösterilir (aynı malzeme/adım editörü bileşeni, `/tariflerim/$recipeId` ile paylaşılır). `changedFields` ile değişen alanlar işaretlenir; `validation.issues` uyarı olarak listelenir.
  3. **Kaydet**: kullanıcının son hali `phase: "save"` ile gönderilir; dönen `recipe_id` ile `/tariflerim/$recipeId`'a yönlendirilir.
- `idempotency_key` sheet açılışında bir kez `crypto.randomUUID()` ile üretilir; propose ve save aynı anahtarı kullanır, yeniden denemede yeni anahtar üretilmez. Sheet kapanıp yeniden açılırsa yeni anahtar üretilir.
- Hata eşlemesi (Türkçe toast): `quota_exceeded` → aylık AI limiti mesajı, `credits_exhausted` / `rate_limited` → "şu anda yoğunluk var, birazdan tekrar dene", `ai_bad_output` / `ai_error` → "öneri üretilemedi", `source_not_eligible` → "bu tarif özelleştirilemiyor", diğerleri genel hata.

### 3. F11 — Kendime kopyala

- Aynı görünürlük kuralıyla, aynı yerde **"Kendime kopyala"** ikincil butonu.
- Tek tık: `supabase.rpc('rpc_clone_recipe', { p_source_recipe_id })`; başarı → `/tariflerim/$recipeId`.
- Buton tıklamada anında devre dışı kalır ve istek bitene kadar öyle kalır (backend'de idempotency yok). Hata → "Bu tarif şu anda kopyalanamıyor".
- Kopyanın adım fotoğraflarının gelmediği, düzenleme ekranında sessizce kabul edilir (ayrı iş).

## Teknik notlar

- Yeni veri katmanı: `src/lib/hasat/myRecipes.ts` — kendi taslakları listeleme, tek taslak okuma, taslak güncelleme, silme; React Query ile, mevcut `recipes.ts` desenine uygun.
- Yeni bileşenler: `src/components/hasat/RecipeDraftEditor.tsx` (malzeme/adım editörü, T6 sheet'i ve düzenleme sayfası ortak kullanır), `src/components/hasat/CustomizeRecipeSheet.tsx`, `src/components/hasat/CloneRecipeButton.tsx`.
- Değişen mevcut dosyalar: `src/routes/tarifler.$slug.tsx` (iki CTA), `src/lib/hasat/recipes.ts` (`author_type` kolonu + tipte alan), navigasyon bileşeni ("Tariflerim" bağlantısı).
- Edge function çağrısı `supabase.functions.invoke("customize-recipe", ...)` ile yapılır (oturum token'ı otomatik iletilir).
- Yeni taslaklar `allergens_reviewed = false` ile gelir; UI'de alerjen/besin panelleri taslaklarda "değerlendirilmedi" durumunda kalır, publish aksiyonu yoktur.
- Sonunda `tsgo` ile tip kontrolü.
