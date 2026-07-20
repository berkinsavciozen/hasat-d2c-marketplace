export type TourStep = {
  selector: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

export const FARMER_TOUR_STORAGE_KEY = "hasat_onboarding_tour_done";

export const FARMER_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="ai-box"]',
    title: "Günün Özeti",
    body: "Hasat AI günün durumunu, önemli uyarıları ve önerileri burada özetler.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="chat-input"]',
    title: "Hasadını Yaz",
    body: "Hasat kaydı, fiyat sorusu ya da alıcı önerisi için buraya yazın. AI kaydı sizin adınıza oluşturur.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="whatsapp"]',
    title: "WhatsApp'tan Gönder",
    body: "Tarladan çıkmadan sesli ya da yazılı olarak WhatsApp üzerinden de gönderebilirsiniz.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="tab-storefront"]',
    title: "Vitrin",
    body: "Ürünlerinizi burada yayınlayın; alıcılar doğrudan teklif verebilsin.",
    placement: "top",
  },
  {
    selector: '[data-tour="tab-prices"]',
    title: "Fiyatlar",
    body: "Ürünlerinizin güncel piyasa fiyatlarını ve son işlemleri takip edin.",
    placement: "top",
  },
];
