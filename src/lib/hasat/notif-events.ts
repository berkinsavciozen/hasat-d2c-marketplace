import type { NotifPrefKey } from "./queries";

// F4 — Bildirim tercihleri: 16 event'in kanonik event/rol/kanal tablosu.
// Başlıklar F3'ün notify_* fonksiyonlarındaki (notify_offer_received,
// notify_offer_accepted, notify_order_status, notify_subscription_changes,
// notify_crop_request_fulfilled, send_subscription_harvest_reminders)
// gerçek in-app bildirim başlıklarıyla birebir aynı — Supabase MCP ile
// pg_get_functiondef üzerinden doğrulandı (efuqpiaavrzimvstpdpm).
//
// community_push ve price_alert_* kolonları F3 migration round 2'de
// düşürüldü, artık hiç gösterilmiyor.
//
// crop_request_match İKİ yönlü — iki ayrı kod yolu aynı event key'i paylaşıyor:
//   1. notify_crop_request_fulfilled (DB trigger, yeni aktif listing): pending
//      crop_requests.requested_by'a (her zaman buyer — talep oluşturma
//      buyer.discover.tsx/CropRequestSheet.tsx'te role==="farmer" iken engelli)
//      push+sms — "talebiniz karşılandı".
//   2. useCreateCropRequest (web queries.ts + mobil cropRequests.ts, talep
//      oluşturma anı): mevcut ilan/parsel eşleşen ÇİFTÇİLERE sms (push YOK,
//      yalnızca dispatch_sms çağrılıyor) — "yeni talep var".
// Yani hem farmer hem buyer bu toggle'a bağlı bildirim alabiliyor — etiket
// bilinçli olarak yöne göre değişmiyor (aynı toggle iki farklı senaryoyu
// kapsıyor).
export type NotifChannel = "whatsapp" | "push" | "sms";
export type NotifRole = "farmer" | "buyer";

export interface NotifEventDef {
  key: string;
  label: string;
  roles: NotifRole[];
  cols: Partial<Record<NotifChannel, NotifPrefKey>>;
  /** Kolon DB'de var ama hiçbir yerde dispatch_whatsapp yok — toggle işlevsiz, gri/devre dışı gösterilmeli. */
  whatsappComingSoon?: boolean;
}

export const NOTIF_EVENTS: NotifEventDef[] = [
  {
    key: "new_offer",
    label: "Yeni Teklif",
    roles: ["farmer"],
    cols: { whatsapp: "new_offer_whatsapp", push: "new_offer_push", sms: "new_offer_sms" },
    whatsappComingSoon: true,
  },
  {
    key: "offer_accepted",
    label: "Teklifiniz Kabul Edildi",
    roles: ["farmer", "buyer"],
    cols: { push: "offer_accepted_push", sms: "offer_accepted_sms" },
  },
  {
    key: "offer_countered",
    label: "Karşı Teklif",
    roles: ["farmer", "buyer"],
    cols: { push: "offer_countered_push" },
  },
  {
    key: "offer_rejected",
    label: "Teklif Reddedildi",
    roles: ["buyer"],
    cols: { push: "offer_rejected_push", sms: "offer_rejected_sms" },
  },
  {
    key: "payment_confirmed",
    label: "Ödeme Alındı",
    roles: ["farmer"],
    cols: { push: "payment_confirmed_push", sms: "payment_confirmed_sms" },
  },
  {
    key: "order_preparing",
    label: "Siparişiniz Hazırlanıyor",
    roles: ["buyer"],
    cols: { push: "order_preparing_push", sms: "order_preparing_sms" },
  },
  {
    key: "order_shipped",
    label: "Siparişiniz Kargoya Verildi",
    roles: ["buyer"],
    cols: { push: "order_shipped_push", sms: "order_shipped_sms" },
  },
  {
    key: "order_delivered",
    label: "Siparişiniz Teslim Edildi",
    roles: ["buyer"],
    cols: { push: "order_delivered_push", sms: "order_delivered_sms" },
  },
  {
    key: "order_cancelled",
    label: "Sipariş İptal Edildi",
    roles: ["farmer", "buyer"],
    cols: { push: "order_cancelled_push", sms: "order_cancelled_sms" },
  },
  {
    key: "dispute_opened",
    label: "Siparişte İhtilaf Açıldı",
    roles: ["farmer", "buyer"],
    cols: { push: "dispute_opened_push", sms: "dispute_opened_sms" },
  },
  {
    key: "order_completed",
    label: "Sipariş Tamamlandı",
    roles: ["buyer"],
    cols: { push: "order_completed_push", sms: "order_completed_sms" },
  },
  {
    key: "crop_request_match",
    label: "Ürün Talebi Eşleşti",
    roles: ["farmer", "buyer"],
    cols: { push: "crop_request_match_push", sms: "crop_request_match_sms" },
  },
  {
    key: "harvest_time",
    label: "Hasat Yaklaşıyor",
    roles: ["farmer", "buyer"],
    cols: { whatsapp: "harvest_time_whatsapp", push: "harvest_time_push", sms: "harvest_time_sms" },
    whatsappComingSoon: true,
  },
  {
    key: "subscription_new",
    label: "Yeni Abonelik Talebi",
    roles: ["farmer"],
    cols: { push: "subscription_new_push", sms: "subscription_new_sms" },
  },
  {
    key: "subscription_accepted",
    label: "Aboneliğiniz Aktif",
    roles: ["buyer"],
    cols: { push: "subscription_accepted_push", sms: "subscription_accepted_sms" },
  },
  {
    key: "subscription_rejected",
    label: "Abonelik Reddedildi",
    roles: ["buyer"],
    cols: { push: "subscription_rejected_push", sms: "subscription_rejected_sms" },
  },
];

export function notifEventsForRole(role: NotifRole): NotifEventDef[] {
  return NOTIF_EVENTS.filter((e) => e.roles.includes(role));
}

export const NOTIF_CHANNELS: { key: NotifChannel; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "push", label: "Push" },
  { key: "sms", label: "SMS" },
];
