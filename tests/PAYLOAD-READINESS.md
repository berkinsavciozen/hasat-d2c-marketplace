# T3/T4 payload-readiness — web

## 1. Amaç / kapsam
C0 → C1 hazırlığı: generated recipe alanları, null-safe detail payload ve fixture/test kanıtı. UI implementasyonu değildir.

## 2. Referans / kararlar
- [04.13 kanonik specification](https://docs.google.com/document/d/1ygyl6GKeeoDqNEkDfYib8F8pjEm6gI60FKeZW61_lnE/edit?tab=t.0). C0 NOT READY / C1 BLOCKED başlangıcı.
- T3-A2 / PR #100 sonrası kontrollü slug, insan review anlamına gelmez; unreviewed verinin public güven sınırı korunur.
- Repo: `berkinsavciozen/hasat-d2c-marketplace`; branch: `codex/t3-t4-payload-readiness-web`; temiz origin/main tabanı: `cefea5077eed4dcb433c51f00e8b771d6623cfaa`.
- Koordineli diğer değişiklik: `hasat-mobile / codex/t3-t4-payload-readiness-mobile`. PR bağlantıları GitHub PR açıklamasında karşılıklı verilir.
- Canlı proje `efuqpiaavrzimvstpdpm`: 2026-09-07 Supabase MCP generated TypeScript çıktısı ve information_schema salt-okunur sorgusuyla 16 alan doğrulandı. Generated dosyaların yalnız T3/T4 recipes Row/Insert/Update alanları senkronlandı; ilgisiz schema drift alınmadı. Vendored core senkronizasyonu bu görevin açık yetkisiyle yapıldı; hasat-core deposu değiştirilmedi.

## 3. Değişen dosyalar
- `src/integrations/supabase/types.ts`
- `src/lib/core/db/types.ts`
- `src/lib/hasat/recipes.ts`
- `src/lib/hasat/recipeFacts.ts`
- `tests/recipeFacts.fixtures.mjs`
- `tests/recipePayload.live.mjs`
- `tests/recipePayload.test.mjs`
- `tests/recipeTestRuntime.mjs`
- `tests/PAYLOAD-READINESS.md`

## 4. Sözleşme davranışı
- 16 alan detail select → mapper → RecipeDetail akışında taşınır; list select genişletilmez.
- Eksik legacy alanlar null/false/[] olur; sayısal 0 korunur. Null allergen_labels, reviewed boş array değildir.
- Ham aday etiketleri transport alanında kalır. `getReviewedAllergens` yalnız true review + tarih + geçerli benzersiz kontrollü taksonomide güvenilir etiket döndürür; aksi halde labels=null/unreviewed. Review-by opsiyoneldir ve audit alanları korunur.
- `getNutritionState`: computed/100, partial/(0,100), estimated/0; eksik/geçersiz makro, metadata veya servings unavailable. Lif ve micronutrients bağımsız null kalabilir; warnings kaybolmaz. Hesaplama/formatlama yapılmaz.

## 5. Kapsam dışı / korunan yüzeyler
UI/routes/components, JSON-LD, alerjen/ekipman filtre UI, Supabase migrations/RLS/DB write/backfill/review, nutrition engine/reference data, PR #99 runtime/deploy ve offers.updated_at değiştirilmedi. C1 başlatılmadı.

## 6. Testler / kanıtlar
- `node --test tests/*.test.mjs src/lib/hasat/*.test.ts`: **37/37 PASS**, including 11 new payload/contract cases.
- `npm run build`: **PASS**, client + SSR production outputs.
- `node node_modules/typescript/bin/tsc --noEmit` after build: **PASS**. A fresh checkout's pre-build check has 21 errors from the existing stale generated route registration. Build regenerates it; that generated artifact was restored and is excluded from this payload-only change.
- `node node_modules/eslint/bin/eslint.js src/lib/hasat/recipeFacts.ts`: **PASS**. Existing recipes lint: baseline 5 → current 3 `no-explicit-any` errors; **zero new violations**.
- Dependencies reused from source in an isolated copy; no package/lockfile changes.
- `node tests/recipePayload.live.mjs`: **PASS**, gerçek anonim production detail sorgusu; 16 alan, nutrition=unavailable, allergens=unreviewed, 5 adım / 8 malzeme. Yalnız tek public tarif smoke testi; computed/reviewed production verisi varmış gibi bir iddia yok.
- `git diff --check`: **PASS**.
- UI/screen/JSON-LD/filter, `supabase/**`, package ve lockfile diff: **boş**. Web build'in geçici routeTree.gen.ts üretimi geri alındı.
- Test runtime: Node 25.9.0; yeni testler built-in registerHooks/TypeScript stripping ve mobil node:sqlite kullanır, yeni bağımlılık yok.

## 7. Deploy / migration / live-write / rollback
Deploy, production/schema migration, DB write, backfill ve merge **yok**. Yalnız anonim SELECT + schema introspection yapıldı. Mobil cihaz-içi cache upgrade teslim #5 kapsamındadır, production migration değildir. Rollback: bu payload commit'ini revert et; mobil eski kod ek nullable sütunu yok sayar, cache zaten yeniden indirilebilir.

## 8. Riskler / reviewer kararı / tek sonraki adım
Kanıtlar implementer-reported; bağımsız acceptance değildir. Public veri örneği unavailable/unreviewed kalıyor. C1 önerisi: **henüz hazır değil**; iki koordineli payload değişikliğinin bağımsız incelemesi ve Berkin'in UI freeze delta onayı beklenmeli. Tek sonraki adım: bu iki değişikliği birlikte bağımsız C0 payload-readiness incelemesine al. C1 veya sonraki aşamayı otomatik başlatma; merge etme.
