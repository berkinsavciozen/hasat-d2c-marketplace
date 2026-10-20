export type DemoRole = "buyer" | "farmer";

export type DemoStep = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

export const DEMO_EXPERIENCE_VERSION = "pilot-v1";
export const DEMO_DISCLOSURE = "Örnek — gerçek işlem değildir";

const DEMO_STEPS: Record<DemoRole, readonly DemoStep[]> = {
  farmer: [
    {
      id: "parcel",
      title: "Parselini ekle",
      description: "Ürünün yetiştiği alanı ve genel üretim yöntemini tanımla.",
      icon: "📍",
    },
    {
      id: "harvest",
      title: "Hasadı kaydet",
      description: "Miktar, tarih ve fotoğrafla ürün geçmişini oluştur.",
      icon: "🌾",
    },
    {
      id: "listing",
      title: "İlanı yayınla",
      description: "Stok, birim fiyat ve minimum siparişi belirle.",
      icon: "🏪",
    },
    {
      id: "offer",
      title: "Teklifi değerlendir",
      description: "Alıcının miktar, fiyat ve teslimat teklifine cevap ver.",
      icon: "🤝",
    },
    {
      id: "payment",
      title: "Ödemeyi doğrula",
      description: "Doğrudan banka transferi hesabına ulaştığında onayla.",
      icon: "✅",
    },
  ],
  buyer: [
    {
      id: "discover",
      title: "Ürünü keşfet",
      description: "Üretici, konum, hasat geçmişi ve gerçek fotoğrafları incele.",
      icon: "🔎",
    },
    {
      id: "offer",
      title: "Teklif gönder",
      description: "İhtiyacın olan miktarı, fiyatı ve teslim tarihini belirt.",
      icon: "📝",
    },
    {
      id: "acceptance",
      title: "Üretici yanıtını gör",
      description: "Kabul, ret veya karşı teklif geldiğinde kararını ver.",
      icon: "🤝",
    },
    {
      id: "transfer",
      title: "Doğrudan ödeme yap",
      description: "Kabul edilen tutarı üreticinin IBAN'ına gönder.",
      icon: "🏦",
    },
    {
      id: "delivery",
      title: "Teslimatı takip et",
      description: "Sipariş durumunu gör ve teslimattan sonra deneyimini değerlendir.",
      icon: "📦",
    },
  ],
};

export function getDemoSteps(role: DemoRole): readonly DemoStep[] {
  return DEMO_STEPS[role];
}

export function shouldShowDemoExperience({
  role,
  dismissed,
  hasActiveListing = false,
}: {
  role: DemoRole;
  dismissed: boolean;
  hasActiveListing?: boolean;
}): boolean {
  if (dismissed) return false;
  return role === "farmer" ? !hasActiveListing : true;
}

export function demoDismissalKey(userId: string, role: DemoRole): string {
  return `hasat_demo:${DEMO_EXPERIENCE_VERSION}:${role}:${userId}`;
}

export interface DemoDismissalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readDemoDismissed(
  storage: DemoDismissalStorage,
  userId: string,
  role: DemoRole,
): boolean {
  try {
    return storage.getItem(demoDismissalKey(userId, role)) === "dismissed";
  } catch {
    return false;
  }
}

export function writeDemoDismissed(
  storage: DemoDismissalStorage,
  userId: string,
  role: DemoRole,
): void {
  try {
    storage.setItem(demoDismissalKey(userId, role), "dismissed");
  } catch {
    // A blocked/full browser store must not break the product flow.
  }
}
