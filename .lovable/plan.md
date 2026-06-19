## Sorun

`farmer.journal.new.tsx` ve `farmer.journal.$entryId.tsx` mevcut → TanStack Router `farmer.journal.tsx`'i bu çocukların parent layout'u olarak görüyor. Parent layout `<Outlet />` render etmediği sürece çocuk route eşleşse bile ekran parent içeriğiyle dolu kalıyor. Şu an olan tam olarak bu: URL `/farmer/journal/new` ama görsel hâlâ liste ekranı.

## Çözüm (tek dosya işlemi, salt routing fix)

1. **Mevcut `src/routes/farmer.journal.tsx` içeriğini `src/routes/farmer.journal.index.tsx`'e taşı.** Tek değişiklik: `createFileRoute("/farmer/journal")` → `createFileRoute("/farmer/journal/")`. İçerik (FarmerHeader, stats bar, parsel sheet, gruplar, FAB, hepsi) aynı kalır.
2. **`src/routes/farmer.journal.tsx`'i pathless layout'a çevir.** Sadece `<Outlet />` döndüren küçük bir component:
   ```tsx
   import { createFileRoute, Outlet } from "@tanstack/react-router";
   export const Route = createFileRoute("/farmer/journal")({
     component: () => <Outlet />,
   });
   ```
3. Build sırasında `routeTree.gen.ts` otomatik regenerate olur — manuel düzenleme yok.

## Sonuç

- `/farmer/journal` → `farmer.journal.index.tsx` (mevcut liste ekranı, Bevel-stili)
- `/farmer/journal/new` → `farmer.journal.new.tsx` (yeni form, structured sections)
- `/farmer/journal/$entryId` → mevcut detay ekranı

Publish meselesi: routing fix uygulandıktan ve preview'da yeni form göründükten sonra, sen onaylarsan Publish'i ben tetikleyebilirim — ama önce preview'da doğrulayalım.

## Değişen dosyalar

- yeni: `src/routes/farmer.journal.index.tsx` (mevcut journal.tsx içeriği aynen)
- değişti: `src/routes/farmer.journal.tsx` (sadece Outlet wrapper, ~6 satır)

Başka hiçbir route, query, ya da component dosyasına dokunulmayacak.