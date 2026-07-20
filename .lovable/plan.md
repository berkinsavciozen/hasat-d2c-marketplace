İki değişiklik, yalnızca `src/` içinde, `supabase/` dokunmadan.

## 1. Alıcı menüsünden "Fiyatlar" gizleme
- Hedef: `src/routes/buyer.tsx`
- İşlem: `tabs` ve `mobileTabs` dizilerinden `{ to: "/buyer/prices", label: "Fiyatlar", icon: LineChart }` girdisini kaldır. `moreItems` zaten Fiyatlar içermiyorsa dokunulmayacak.
- Not: Önceki turda `buyer.prices.tsx` silinmiş görünüyor; kullanıcı rotayı korumak istediğinden, dosya yoksa aynı içerikle yeniden oluşturulacak (`/buyer/prices` erişimi çalışmaya devam edecek, sadece menüden gizlenmiş olacak). `LineChart` import'u gerekirse kaldırılacak.

## 2. Çiftçi ana sayfası: sohbet-önde giriş akışı
- Hedef: `src/routes/farmer.home.tsx`
- Yardımcı: `window.dispatchEvent(new CustomEvent("hasat:ai-chat:open", { detail: { prefill?: string } }))` zaten `FarmerAIChat.tsx` tarafından dinleniyor (satır 159-168).
- Yapılacaklar:
  a. Quick action düzenlemesi:
     - "Hasat Kaydet" butonunun `to="/farmer/journal/new"` Link davranışını kaldır; tıklanınca `hasat:ai-chat:open` event'ini `prefill: "Hasat kaydı eklemek istiyorum: "` ile tetikle.
     - "Vitrine Ekle" ve "Alıcı Bul" quick action'ları aynen kalır.
  b. Sayfa en üstüne, `AIBox` üzerine, tek satırlık chat input barı ekle:
     - Placeholder: "Hasadını yaz veya WhatsApp'tan gönder…"
     - Tıklanınca (veya odaklanınca) `hasat:ai-chat:open` event'ini boş prefill ile tetikle (sohbet açılır).
     - Sağ tarafında küçük WhatsApp ikonu; `HASAT_WHATSAPP_NUMBER` constant'ından `https://wa.me/905421241011` linkine gitsin. Yeşil `#25D366` sadece bu gerçek wa.me bağlantısında/ikonunda kullanılır (mevcut tema kuralı korunur).
     - Masaüstü ve mobilde responsive, dokunma hedefi minimum 48×48 px olacak şekilde tasarlanır.
  c. Boş durum (`isEmpty`) kartındaki CTA:
     - "Hasat Kaydet" butonu artık `/farmer/journal/new` yerine aynı chat event tetikleyicisi olacak.
     - "Vitrine Ekle" butonu aynen kalır.

## Teknik doğrulama
- Değişiklikler sonrası `tsgo` çalıştırılır.
- `src/` dışında dosya oluşturulmaz/değiştirilmez; `supabase/` dokunulmaz.
- Gerçek kaynak değişikliği kullanıcı onayı sonrası build modunda yapılır.