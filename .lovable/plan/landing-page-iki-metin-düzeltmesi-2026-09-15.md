# Landing page — iki metin düzeltmesi

Sadece `src/routes/index.tsx` içindeki iki metni değiştir; başka dosya, sayfa veya backend değişikliği yok.

## 1. Hero — süreç gösterimi altındaki teknik uyarı metnini yumuşat

**Dosya:** `src/routes/index.tsx`  
**Konum:** `ProductFlow` içinde, `<p className="mt-3 text-[11px] ...">` etiketi.

**Mevcut metin:**
```
Sayısal veri gösterilmez; kayıtlar yalnızca gerçek kaynak bağlandığında görünür.
```

**Yeni metin:**
```
Fiyatlar ve satış bilgileri yalnızca kaynağı doğrulanmış gerçek verilerden gösterilir.
```

## 2. "Tek merkez" bölümündeki altı adet boş durum mesajını tek ortak mesaja indirge

**Dosya:** `src/routes/index.tsx`  
**Konum:** `OperationsSection` içinde, grid'deki 6 kartın her birinin altındaki `<p className="mt-1 text-xs text-muted-foreground">Henüz veri bulunmuyor</p>` satırları.

**Yapılacak değişiklik:**
- Her kartın altındaki `Henüz veri bulunmuyor` satırını kaldır.
- Grid'in üstüne veya altına tam genişlikte (`sm:col-span-2 lg:col-span-3` / `col-span-full`) tek bir açıklama ekle.

**Yeni ortak mesaj:**
```
Kayıtlı teklifleriniz, siparişleriniz, teslimatlarınız ve ödemeleriniz burada tek ekranda görünür.
```

**Önerilen yerleşim:** Grid altına, `rounded-lg border bg-background/50 p-4 text-center text-sm text-muted-foreground` stilinde bir satır; 6 kart hâlâ etiket + ikon olarak kalır.

## Doğrulama

- `bunx tsgo --noEmit` ile tip kontrolü çalıştır.
- Preview'da 320/375/390/430 px ve desktop genişliklerinde yatay kayma olmadığını gör.
- "Tek merkez" bölümünde 6 karta hâlâ simge + başlık geldiğini, boşluk dengesinin bozulmadığını doğrula.
