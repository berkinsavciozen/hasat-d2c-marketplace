import { convertQuantity } from "../core/units.ts";

export type ListingUnit = "g" | "kg" | "L";

export interface ListingUnitValues {
  quantity: number;
  minOrder: number;
  pricePerUnit: number;
}

export interface ActiveListingDraft extends ListingUnitValues {
  crop: string;
  parcelId: string;
  unit: ListingUnit;
  photoCount: number;
}

const round = (value: number) => Math.round(value * 1e8) / 1e8;

export function convertListingUnitValues(
  values: ListingUnitValues,
  fromUnit: ListingUnit,
  toUnit: ListingUnit,
): ListingUnitValues & { converted: boolean } {
  if (fromUnit === toUnit) return { ...values, converted: true };

  const massUnits = new Set<ListingUnit>(["g", "kg"]);
  if (!massUnits.has(fromUnit) || !massUnits.has(toUnit)) {
    return { ...values, converted: false };
  }

  const quantityRate = convertQuantity(1, fromUnit, toUnit);
  return {
    quantity: round(values.quantity * quantityRate),
    minOrder: round(values.minOrder * quantityRate),
    pricePerUnit: round(values.pricePerUnit / quantityRate),
    converted: true,
  };
}

export function validateActiveListing(input: ActiveListingDraft): string | null {
  if (!input.crop.trim()) return "Yayınlamak için bir ürün seçin.";
  if (!input.parcelId.trim()) return "Yayınlamak için ürünün yetiştiği parseli seçin.";
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return "Toplam miktar 0'dan büyük olmalı.";
  }
  if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit <= 0) {
    return `Birim fiyatı 0'dan büyük olmalı (₺/${input.unit}).`;
  }
  if (!Number.isFinite(input.minOrder) || input.minOrder <= 0) {
    return `Minimum sipariş 0'dan büyük olmalı (${input.unit}).`;
  }
  if (input.minOrder > input.quantity) {
    return "Minimum sipariş, toplam miktardan büyük olamaz.";
  }
  if (input.photoCount < 1) {
    return "Yayınlamak için ürüne ait en az bir gerçek fotoğraf ekleyin.";
  }
  return null;
}

export function listingSaveErrorMessage(error: unknown): string {
  const fallback = "İlan kaydedilemedi. Bilgileriniz ekranda duruyor; tekrar deneyin.";
  if (!(error instanceof Error)) return fallback;
  const message = error.message.toLocaleLowerCase("tr-TR");
  if (message.includes("network") || message.includes("fetch")) {
    return "Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.";
  }
  if (message.includes("duplicate") || message.includes("unique")) {
    return "Bu ürün ve parsel için benzer bir ilan zaten var. Mevcut hasat partisini kontrol edin.";
  }
  return fallback;
}
