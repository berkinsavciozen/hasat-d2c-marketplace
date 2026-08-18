import { toast } from "sonner";
import { PUBLIC_BASE_URL as PUBLIC_BASE } from "@/lib/hasat/constants";

export function slugifyFarmer(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Path (not full URL) to the public storefront for a farmer profile. */
export function farmerStorefrontPath(profile: { id: string; name?: string | null } | null | undefined): string {
  if (!profile) return `/s/`;
  const slug = profile.name ? slugifyFarmer(profile.name) : "";
  return `/s/${slug || profile.id}`;
}

export function vitrinUrl(profile: { id: string; name?: string | null } | null | undefined): string {
  if (!profile) return `${PUBLIC_BASE}/s/`;
  return `${PUBLIC_BASE}${farmerStorefrontPath(profile)}`;
}

export async function copyVitrinLink(profile: { id: string; name?: string | null } | null | undefined) {
  const url = vitrinUrl(profile);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Vitrin linki kopyalandı");
  } catch {
    toast.error("Kopyalanamadı");
  }
  return url;
}
