export interface ParsedJournal {
  crop: string;
  quantity: number;
  unit: "g" | "kg" | "L";
  quality: "A" | "B" | "C";
  harvest_date: string; // YYYY-MM-DD
  parcel_id?: string;
  parcel_name?: string;
  notes?: string;
  costs?: Record<string, number>;
}

export interface ParseResult {
  visibleText: string;
  journal: ParsedJournal | null;
  parseError?: string;
}

const BLOCK_RE = /\[JOURNAL_ENTRY\]([\s\S]*?)\[\/JOURNAL_ENTRY\]/;
const BLOCK_RE_G = /\[JOURNAL_ENTRY\]([\s\S]*?)\[\/JOURNAL_ENTRY\]/g;

function mapUnit(v: unknown): "g" | "kg" | "L" | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "g" || s === "gr" || s === "gram") return "g";
  if (s === "kg" || s === "kilo" || s === "kilogram") return "kg";
  if (s === "l" || s === "lt" || s === "litre" || s === "liter") return "L";
  return null;
}

function mapQuality(v: unknown): "A" | "B" | "C" {
  if (typeof v !== "string") return "A";
  const s = v.trim().toLowerCase();
  if (["a", "iyi", "good", "kaliteli"].includes(s)) return "A";
  if (["b", "orta", "medium"].includes(s)) return "B";
  if (["c", "düşük", "dusuk", "kötü", "kotu", "low"].includes(s)) return "C";
  return "A";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function sanitizeCosts(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof val === "number" ? val : Number(val);
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseAssistantContent(raw: string): ParseResult {
  if (!raw) return { visibleText: "", journal: null };
  const match = raw.match(BLOCK_RE);
  if (!match) return { visibleText: raw, journal: null };

  // Detect extras for logging
  const allMatches = raw.match(BLOCK_RE_G);
  if (allMatches && allMatches.length > 1) {
    console.warn("[parseAssistantContent] multiple JOURNAL_ENTRY blocks; using first");
  }

  const inner = match[1].trim();
  let payload: any;
  try {
    payload = JSON.parse(inner);
  } catch (e) {
    console.warn("[parseAssistantContent] JSON parse failed", e);
    return { visibleText: raw, journal: null, parseError: "json_parse_failed" };
  }

  const crop = typeof payload?.crop === "string" ? payload.crop.trim() : "";
  const quantity = typeof payload?.quantity === "number" ? payload.quantity : Number(payload?.quantity);
  const unit = mapUnit(payload?.unit);
  const date = normalizeDate(payload?.harvest_date) ?? todayISO();

  if (!crop || !Number.isFinite(quantity) || !unit) {
    console.warn("[parseAssistantContent] missing required fields", { crop, quantity, unit });
    return { visibleText: raw, journal: null, parseError: "missing_required" };
  }

  const journal: ParsedJournal = {
    crop,
    quantity,
    unit,
    quality: mapQuality(payload?.quality),
    harvest_date: date,
    parcel_id: typeof payload?.parcel_id === "string" ? payload.parcel_id : undefined,
    parcel_name: typeof payload?.parcel_name === "string" ? payload.parcel_name : undefined,
    notes: typeof payload?.notes === "string" ? payload.notes : undefined,
    costs: sanitizeCosts(payload?.costs),
  };

  // Strip ALL blocks from visible text
  const visibleText = raw.replace(BLOCK_RE_G, "").replace(/\n{3,}/g, "\n\n").trim();
  return { visibleText, journal };
}
