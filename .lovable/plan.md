# Gizlilik Politikası olgusal düzeltme

Yalnız `src/routes/privacy.tsx` değişecek. Başka dosya, route, stil veya bileşen değişmeyecek; diğer metinler aynen kalacak.

## Etkilenecek satırlar

1. **Satır 31** — tarih
   - Eski: `Son güncelleme: 8 Temmuz 2026`
   - Yeni: `Son güncelleme: 28 Eylül 2026`

2. **Satır 47** — "1. Topladığımız Veriler" ödeme maddesi
   - Yeni: `<li><strong className="text-foreground">Ödeme bilgileri</strong> — Çiftçinin IBAN'ı, onaylanan sipariş için yalnız ilgili alıcıya gösterilir. Hasat ödemeyi tahsil etmez; ödeme alıcıdan çiftçiye doğrudan banka havalesiyle yapılır.</li>`

3. **Satır 77** — "3. Veri Depolama — Supabase"
   - Eski: `Veriler AB veri merkezlerinde barındırılır.`
   - Yeni: `Veriler Supabase'in Japonya (Tokyo) bölgesindeki veri merkezlerinde barındırılır.`

4. **Satır 95-96** — "5. Diğer Üçüncü Taraflar" listesi şu hale gelir:
   - `<strong>Lovable AI Gateway ve Google (Gemini)</strong> — tarif çıkarma, WhatsApp asistanı ve görsel üretimi için yapay zekâ çağrıları.`
   - `<strong>Sentry</strong> — uygulama hatalarının izlenmesi için teknik hata kayıtları.`
   - `<strong>Expo</strong> — mobil uygulama bildirimlerinin iletilmesi için cihaz bildirim anahtarı.`
   - "Ödeme sağlayıcı" maddesi (satır 96) tamamen silinir.

Maddeler mevcut `<li><strong className="text-foreground">…</strong> — …</li>` stilini kullanır.

## Kabul
- Diff yalnız `src/routes/privacy.tsx` içinde.
- Bu 4 değişiklik dışında metin değişmez.
- Sayfa derlenir (typecheck + build kontrolü).
