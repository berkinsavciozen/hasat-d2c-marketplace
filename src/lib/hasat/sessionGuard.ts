// P23-M8-b — web "çıkış butonu fatal hata veriyor" kök neden düzeltmesi.
//
// Kök neden: `supabase.auth.signOut()` gotrue-js içinde `_removeSession()`'ı
// (ve `onAuthStateChange`'in `SIGNED_OUT` event'ini) İSTEK HENÜZ SONUÇLANMADAN
// senkron gibi tetikler. Bu proje `SIGNED_OUT`'u İKİ ayrı yerde ele alıyordu:
// (1) `__root.tsx` → `AuthBootstrap`'taki GLOBAL dinleyici (`reset()` +
// `router.navigate({to:"/"})`), (2) her sayfanın kendi `logout()`/
// `afterAccountDeleted()`'ındaki (`buyer.account.tsx`, `farmer.settings.tsx`)
// AYNI temizlik, `finally` bloğunda tekrar. Sonuç: tek bir "Çıkış Yap"
// tıklamasında `reset()` ve `navigate()` neredeyse aynı anda İKİ farklı yerden
// tetikleniyor — ikinci `navigate()` çoğunlukla ilkinin ürettiği unmount'un
// ortasında, TanStack Router'ın kendi navigasyon state machine'i bunu bir
// yarış durumu olarak görüp hataya düşürüyordu (kural #106'nın client-içi
// simetriği: aynı temizlik iki yerde ayrı ayrı sürüklenince sapma/çakışma
// kaçınılmaz).
//
// Düzeltme: temizlik + yönlendirme TEK yerde (bu dosya + `__root.tsx`'in
// dinleyicisi) yapılır. Sayfalar yalnızca `signOut()`'u tetikler, event'i
// beklemez — mobil'in `sessionGuard.ts`'iyle aynı mimari (kural #106'nın
// ruhu, iki client aynı deseni paylaşıyor).
let expected = false;

/** Kendi başlattığımız (manuel çıkış / hesap silme) bir signOut'tan hemen
 * önce çağrılır — global dinleyici bunu "beklenmedik oturum sonlanması"
 * olarak görüp gereksiz bir toast göstermez. */
export function markExpectedSignOut(): void {
  expected = true;
}

/** `__root.tsx`'teki `SIGNED_OUT` dinleyicisi tarafından bir kez okunup
 * sıfırlanır. */
export function takeExpectedSignOut(): boolean {
  const v = expected;
  expected = false;
  return v;
}
