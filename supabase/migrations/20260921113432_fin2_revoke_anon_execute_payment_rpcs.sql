-- Supabase projesinde public şemasındaki fonksiyonlara varsayılan olarak anon+authenticated
-- EXECUTE veriliyor (ALTER DEFAULT PRIVILEGES) — `revoke all from public` bunu kapatmıyor çünkü
-- grant PUBLIC üzerinden değil doğrudan anon/authenticated rolüne. auth.uid() kontrolü zaten
-- anon çağrıları güvenli şekilde reddediyor, ama savunma derinliği için anon EXECUTE'u da
-- kapatıyoruz — codebase'deki diğer birçok fonksiyonun aksine, bu iki fonksiyon para/ödeme
-- durumunu değiştirdiği için mümkün olan en dar yüzeyde tutulmalı.
revoke execute on function public.buyer_mark_transfer_sent(uuid) from anon;
revoke execute on function public.farmer_confirm_payment_received(uuid) from anon;