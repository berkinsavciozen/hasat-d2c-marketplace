import { toast } from "sonner";

const PUBLIC_BASE = "https://hasat.lovable.app";

function slugify(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function vitrinUrl(profile: { id: string; name?: string | null } | null | undefined): string {
  if (!profile) return `${PUBLIC_BASE}/s/`;
  const slug = profile.name ? slugify(profile.name) : "";
  return `${PUBLIC_BASE}/s/${slug || profile.id}`;
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
