-- P22-G: buyer_addresses üzerinde aynı işi yapan iki trigger bulundu —
-- trg_buyer_addresses_clear_default (→ buyer_addresses_clear_default(), diğer varsayılan adresi
-- temizlerken updated_at'i de günceller) ve trg_enforce_single_default_address
-- (→ tg_enforce_single_default_address(), P23-M1-a'da eklenmiş, aynı işi tekrar yapıyor, updated_at
-- yönetmiyor). İkincisi düşürülüyor, birincisi (+ ayrı trg_buyer_addresses_updated_at) kalıyor.

drop trigger if exists trg_enforce_single_default_address on public.buyer_addresses;
drop function if exists public.tg_enforce_single_default_address();
