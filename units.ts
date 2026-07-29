// hasat-core — BU DOSYAYI BURADA DÜZENLEME. Değişiklik hasat-core reposunda yapılır.
// Sadece kütle ailesi (g/kg) dönüşümü. Diğer birimler (L, adet) tek crop'a özel preset
// olduğu için karışmaz.
export function convertQuantity(qty: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return qty;
  const toGrams: Record<string, number> = { g: 1, kg: 1000 };
  if (fromUnit in toGrams && toUnit in toGrams) {
    return (qty * toGrams[fromUnit]) / toGrams[toUnit];
  }
  // Aynı crop farklı birim ailesinde olamaz (L bir kg ile karışmaz) —
  // beklenmeyen durum, olduğu gibi döndür.
  return qty;
}
