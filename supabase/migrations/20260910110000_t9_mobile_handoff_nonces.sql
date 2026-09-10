-- T9 — mobil→web köprüsünde refresh-token URL zayıflığının kapatılması (migration half).
-- Dispatch: [T9-nonce] hasat-d2c-marketplace + hasat-mobile — mobil→web köprüsünde refresh-token
-- URL zayıflığının kapatılması (2026-09-10). İş akışı: T9 (Faz 1, Release Gate sonrası hardening).
-- Kanonik doküman: dispatch'in kendisi (salt-okunur bir tasarım turunda hazırlandı, kod turu bu).
--
-- =================================================================================================
-- BAĞLAM
-- =================================================================================================
--
-- `hasat-mobile/src/lib/hasat/webLinks.ts`'teki `openWebWithSession()`, mobil oturumun gerçek
-- `access_token` + `refresh_token`'ını doğrudan bir URL fragment'ine koyup `Linking.openURL()` ile
-- web'e açıyordu. Fragment HTTP isteklerine dahil edilmez/sunucu loglarına düşmez, ama (1) çoğu mobil
-- tarayıcı navigasyonu tarayıcı geçmişine fragment dahil tam URL'siyle yazar (sayfa scripti fragment'i
-- temizlemeden ÖNCE) — uzun ömürlü `refresh_token` tarayıcı geçmişinde kalıcı iz bırakabilir; (2)
-- `Linking.openURL()` OS seviyesinde bir çağrı — OS logları veya URL'i işleyen başka bir yüzey token'ı
-- görebilir; (3) sızan şey `refresh_token` — anlık değil, kalıcı oturum ele geçirme riski.
--
-- Çözüm: URL'de artık gerçek token yerine 60 saniyelik, tek kullanımlık, opak bir nonce taşınıyor;
-- gerçek token'lar yalnızca sunucu tarafında (edge function'lar arası, HTTPS POST body üzerinden) el
-- değiştiriyor. Bu migration nonce'un DB tarafını (tablo + atomik tek-kullanımlık tüketim RPC'si)
-- ekliyor. Edge function'lar (`mobile-handoff-issue`, `mobile-handoff-exchange`) ve web route
-- (`src/routes/auth.mobile-handoff.tsx`) aynı PR'da, ayrı dosyalarda.
--
-- =================================================================================================
-- TASARIM
-- =================================================================================================
--
-- `mobile_handoff_nonces`: RLS AÇIK, sıfır policy — `anon`/`authenticated` için hiçbir doğrudan
-- erişim yok (ne SELECT ne INSERT ne UPDATE). Yalnızca `service_role` (RLS'i her zaman bypass eder)
-- tabloya dokunur — dispatch §1'in "iki edge function, service_role ile dokunuyor" gereksinimi.
-- `ai_customize_requests` (20260910100000_t6_...) tablosunun RLS-açık-ama-policy'li deseninin aksine,
-- burada gerçek token'lar taşındığı için kullanıcının SELECT ile bile kendi satırını okumasına izin
-- verilmiyor — okuma yolu tek: `rpc_consume_mobile_handoff_nonce`, ve o da yalnızca `service_role`'e
-- GRANT edilmiş.
--
-- `expires_at` sütunu `default (now() + interval '60 seconds')` — `mobile-handoff-issue` edge
-- function'ı bu değeri hiç göndermez, DB'nin kendi `now()`'ı hesaplar. Bu, edge function'ın Deno
-- saatiyle DB saati arasındaki olası clock-skew'i tamamen ortadan kaldırıyor (dispatch'in önerdiği
-- "now() + interval '60 seconds'" değeri birebir).
--
-- `rpc_consume_mobile_handoff_nonce(p_nonce text)`: dispatch §3'ün istediği atomik tek-kullanımlık
-- tüketimi tek bir `UPDATE ... SET consumed_at = now() WHERE nonce = $1 AND consumed_at IS NULL AND
-- expires_at > now() RETURNING *` ile yapıyor. Bu, standart Postgres READ COMMITTED semantiğiyle
-- race-safe: iki eşzamanlı çağrı aynı satırı hedeflediğinde, ikincisi birincinin satır kilidinde
-- bloke olur; birincisi commit olduktan sonra ikincisinin WHERE'i (artık `consumed_at IS NULL` yanlış
-- olduğu için) satırı bulamaz ve 0 satır günceller — ekstra kilitleme/serializable isolation gerekmez.
-- SECURITY INVOKER (DEFINER değil): çağıran zaten yalnızca `service_role` olabilir (execute GRANT'i
-- öyle kısıtlı) ve `service_role` her durumda RLS'i bypass ediyor — burada köprülenmesi gereken bir
-- yetki farkı yok (rpc_create_ai_customized_recipe'nin dosya başı yorumundaki gerekçenin aynısı).
--
-- Rollback: pure addition. `DROP FUNCTION public.rpc_consume_mobile_handoff_nonce(text)`,
-- `DROP TABLE public.mobile_handoff_nonces` bu migration'ı tam geri alır. Hiçbir mevcut veri
-- değiştirilmiyor/taşınmıyor.
--
-- Kapsam dışı (dispatch §8, bilinçli): süresi geçmiş/tüketilmiş satırların periyodik cron sweep'i —
-- hacim çok düşük (kullanıcı başına handoff'ta bir satır, 60s sonra zaten anlamsız), acil değil.

create table public.mobile_handoff_nonces (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  next_path text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  consumed_at timestamptz null
);

comment on table public.mobile_handoff_nonces is
  'T9. Mobil->web oturum köprüsü: her satır, mobile-handoff-issue tarafından üretilen tek kullanımlık, '
  '60s geçerli bir nonce''un altında saklanan gerçek access_token/refresh_token çifti. Yalnızca '
  'mobile-handoff-exchange, rpc_consume_mobile_handoff_nonce üzerinden bir kez okuyup tüketir. RLS '
  'açık, sıfır policy: anon/authenticated için hiçbir doğrudan erişim yok, yalnızca service_role.';

create index mobile_handoff_nonces_user_id_idx on public.mobile_handoff_nonces(user_id);

alter table public.mobile_handoff_nonces enable row level security;

-- Bilinçli olarak sıfır policy: bu tablo gerçek token taşıyor, kullanıcının kendi satırını bile
-- doğrudan SELECT ile okumasına izin verilmiyor. Tek okuma/tüketim yolu aşağıdaki RPC.
revoke all on public.mobile_handoff_nonces from anon, authenticated;

create or replace function public.rpc_consume_mobile_handoff_nonce(p_nonce text)
returns table (
  user_id uuid,
  access_token text,
  refresh_token text,
  next_path text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update public.mobile_handoff_nonces t
  set consumed_at = now()
  where t.nonce = p_nonce
    and t.consumed_at is null
    and t.expires_at > now()
  returning t.user_id, t.access_token, t.refresh_token, t.next_path;
end;
$$;

comment on function public.rpc_consume_mobile_handoff_nonce(text) is
  'T9. mobile-handoff-exchange''in tek çağrı noktası: nonce''u atomik olarak tüketir (consumed_at IS '
  'NULL AND expires_at > now() koşuluyla), eşleşme yoksa (bulunamadı/süresi geçmiş/zaten tüketilmiş) '
  'boş sonuç döner. SECURITY INVOKER — yalnızca service_role''e GRANT edilmiş, ve service_role zaten '
  'RLS''i bypass ettiği için burada köprülenen bir yetki farkı yok.';

revoke all on function public.rpc_consume_mobile_handoff_nonce(text) from public;
grant execute on function public.rpc_consume_mobile_handoff_nonce(text) to service_role;
