-- B-2 (canlı denetim): public.send_subscription_harvest_reminders() parametresiz, SECURITY
-- DEFINER bir fonksiyondur ve `harvest_subscriptions` tablosundaki next_harvest_date =
-- CURRENT_DATE + 3 olan TÜM aktif abonelikleri tarayıp her biri için çiftçiye ve alıcıya
-- hem `notifications` satırı ekliyor hem de dispatch_sms (gerçek SMS, maliyetli) ve
-- dispatch_push ile bildirim gönderiyor. Fonksiyon PUBLIC'e (dolayısıyla anon ve
-- authenticated'a) açıktı -- yani anon key ile (istemci paketinde açıkta duran bir anahtar)
-- herhangi biri bu RPC'yi istediği sıklıkta çağırıp sistemdeki tüm eşleşen aboneliklerdeki
-- kullanıcılara tekrar tekrar SMS/push spam'i yaptırabiliyordu (dispatch_push'ın aksine bu
-- bir veri sızıntısı değil, bir maliyet + spam istismarı).
--
-- Bu, `pg_cron` ile zaten günlük 07:00'de otomatik çalışan bir job (cron.job, jobid=2,
-- `subscription-harvest-reminders-daily`, username=postgres) -- yani RPC ile doğrudan
-- çağrılabilir olması hiçbir meşru kullanım senaryosuna hizmet etmiyordu. Fonksiyon
-- `postgres` sahipli SECURITY DEFINER olduğu için, bir sahip kendi fonksiyonu üzerindeki
-- EXECUTE hakkını bu REVOKE'tan bağımsız olarak her zaman örtük biçimde korur -- bu yüzden
-- bu REVOKE pg_cron job'ını etkilemez, yalnızca doğrudan RPC (PostgREST
-- /rest/v1/rpc/send_subscription_harvest_reminders) üzerinden anon/authenticated key ile
-- çağırmayı kapatır. Fonksiyon imzası ve gövdesi değişmiyor.
REVOKE EXECUTE ON FUNCTION public.send_subscription_harvest_reminders()
  FROM PUBLIC, anon, authenticated;
