-- B-1 (canlı denetim): public.dispatch_push bir SECURITY DEFINER fonksiyondur ve
-- gövdesi çağıranın _user_id ile ilişkisini hiç doğrulamıyor -- doğrudan
-- net.http_post ile send-push edge function'ına gidiyor. Fonksiyon PUBLIC'e
-- (dolayısıyla anon ve authenticated'a) açıktı, yani anon key ile (istemci
-- paketinde açıkta duran bir anahtar) herhangi biri herhangi bir _user_id'ye
-- istediği başlık/gövdeyle push gönderebiliyordu.
--
-- Meşru çağıranlar (notify_offer_received, notify_offer_accepted,
-- notify_order_status, notify_subscription_changes,
-- notify_crop_request_fulfilled, send_subscription_harvest_reminders) hepsi
-- `postgres` sahipli SECURITY DEFINER fonksiyonlardır; dispatch_push'ı çağırdıklarında
-- yürütme rolü de `postgres`tir (fonksiyon sahibi), ve bir sahip kendi
-- fonksiyonu üzerindeki EXECUTE hakkını bu REVOKE'tan bağımsız olarak her zaman
-- örtük biçimde korur. Bu yüzden bu REVOKE, dispatch_push'ı yalnızca doğrudan
-- RPC (PostgREST /rest/v1/rpc/dispatch_push) üzerinden anon/authenticated key
-- ile çağırmayı kapatır; iç trigger zincirini etkilemez. Fonksiyon imzası ve
-- gövdesi değişmiyor.
REVOKE EXECUTE ON FUNCTION public.dispatch_push(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
