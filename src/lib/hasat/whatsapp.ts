// Build a wa.me deeplink from a raw Turkish phone number. Returns null when the
// input has fewer than 10 digits so we don't render a broken link.
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D+/g, "");
  if (!digits) return null;
  // Normalize TR local formats: strip leading 0, prepend 90 when missing.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = "90" + digits;
  if (digits.length < 11) return null;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
