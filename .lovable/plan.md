# Admin tarif kalite ekranı tip hatalarını düzeltme

## Yapılacaklar

1. `admin.recipes.quality.tsx` içindeki ortak çağrı tipini, ekranda gerçekten kullanılan `GET | POST | PATCH` yöntemleriyle sınırla.
2. İstek gövdesini Supabase fonksiyon çağrısının kabul ettiği nesne tipiyle eşleştir; gövdesiz GET/POST çağrılarını koru.
3. Aynı yardımcıyı alt bileşene aktaran imzayı da tek ortak tipe bağla; mevcut veri, yetkilendirme ve işlem davranışını değiştirme.
4. `tsgo` ile tip kontrolünü çalıştır ve bu iki hatanın kapandığını doğrula.
5. Ardından bekleyen landing sayfası sadeleştirme değerlendirmesine geri dön; tamamlanan ürün akışı ve tekrar analizini kullanarak seçenekleri sun.

## Teknik kapsam

- Yalnızca `src/routes/admin.recipes.quality.tsx` değişecek.
- Supabase migration, edge function, API sözleşmesi veya çalışma zamanı davranışı değişmeyecek.
