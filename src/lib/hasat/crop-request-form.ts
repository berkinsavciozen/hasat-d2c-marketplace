export interface CropRequestDraft {
  cropName: string;
  quantity: string;
  targetPrice: string;
  startDate: string;
  endDate: string;
}

export function validateCropRequest(input: CropRequestDraft): string | null {
  if (!input.cropName.trim()) return "Talep etmek istediğiniz ürünü yazın.";

  if (input.quantity.trim()) {
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return "Miktar giriyorsanız 0'dan büyük bir değer yazın.";
    }
  }

  if (input.targetPrice.trim()) {
    const targetPrice = Number(input.targetPrice);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return "Hedef fiyat giriyorsanız 0'dan büyük bir değer yazın.";
    }
  }

  if (input.endDate && !input.startDate) {
    return "Bitiş tarihi için önce bir başlangıç tarihi seçin.";
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return "Bitiş tarihi başlangıç tarihinden önce olamaz.";
  }

  return null;
}
