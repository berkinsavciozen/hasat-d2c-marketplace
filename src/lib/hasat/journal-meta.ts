// Journal metadata helpers — encodes work-type + 1-5 health rating into the
// existing `notes` column so we don't need a schema change. Old entries with
// no prefix parse as { work: "gozlem", health: undefined, text: notes }.

export type WorkTypeKey =
  | "sulama"
  | "gubreleme"
  | "budama"
  | "ilaclama"
  | "hasat"
  | "gozlem";

export const WORK_TYPES: { key: WorkTypeKey; label: string; emoji: string }[] = [
  { key: "sulama", label: "Sulama", emoji: "🚿" },
  { key: "gubreleme", label: "Gübreleme", emoji: "🌱" },
  { key: "budama", label: "Budama", emoji: "✂️" },
  { key: "ilaclama", label: "İlaçlama", emoji: "🪲" },
  { key: "hasat", label: "Hasat", emoji: "🌾" },
  { key: "gozlem", label: "Gözlem", emoji: "📝" },
];

export const WORK_TYPE_MAP: Record<WorkTypeKey, { label: string; emoji: string }> =
  Object.fromEntries(WORK_TYPES.map((w) => [w.key, { label: w.label, emoji: w.emoji }])) as any;

const META_RE = /^\[work:([a-z]+)\](?:\[health:([1-5])\])?\s*/;

export function encodeNotes(meta: { work: WorkTypeKey; health?: number; text: string }): string {
  const h = meta.health ? `[health:${meta.health}]` : "";
  return `[work:${meta.work}]${h} ${meta.text ?? ""}`.trim();
}

export function parseNotes(notes: string | null | undefined): {
  work: WorkTypeKey;
  health?: number;
  text: string;
} {
  if (!notes) return { work: "gozlem", text: "" };
  const m = notes.match(META_RE);
  if (!m) return { work: "gozlem", text: notes };
  const work = (WORK_TYPE_MAP[m[1] as WorkTypeKey] ? m[1] : "gozlem") as WorkTypeKey;
  const health = m[2] ? Number(m[2]) : undefined;
  return { work, health, text: notes.replace(META_RE, "") };
}

export function healthToQuality(h: number): "A" | "B" | "C" {
  if (h >= 4) return "A";
  if (h === 3) return "B";
  return "C";
}

export const ZERO_COSTS = { labor: 0, fertilizer: 0, packaging: 0, transport: 0, other: 0 };

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTHS_TR[Number(m) - 1] ?? ""} ${y}`;
}

export function shortDay(date: string): { day: string; mon: string } {
  const d = new Date(date);
  if (isNaN(d.getTime())) return { day: "—", mon: "" };
  return {
    day: String(d.getDate()).padStart(2, "0"),
    mon: MONTHS_TR[d.getMonth()].slice(0, 3),
  };
}

export function relativeTr(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return "bugün";
  if (diff === 1) return "dün";
  if (diff < 7) return `${diff} gün önce`;
  if (diff < 30) return `${Math.floor(diff / 7)} hafta önce`;
  return `${Math.floor(diff / 30)} ay önce`;
}

export function cropChipColor(crop: string): { bg: string; fg: string } {
  const c = (crop || "").toLowerCase();
  if (c.includes("safran")) return { bg: "color-mix(in oklab, var(--saffron) 18%, transparent)", fg: "var(--saffron)" };
  if (c.includes("lavanta")) return { bg: "color-mix(in oklab, var(--lav) 18%, transparent)", fg: "var(--lav)" };
  if (c.includes("zeytin") || c.includes("tıbbi") || c.includes("tibbi")) return { bg: "color-mix(in oklab, var(--sage) 18%, transparent)", fg: "var(--sage)" };
  return { bg: "color-mix(in oklab, var(--dark) 10%, transparent)", fg: "var(--dark)" };
}
