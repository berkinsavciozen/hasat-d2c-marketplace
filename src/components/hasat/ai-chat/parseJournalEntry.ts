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

  // Normalize AI schema drift: accept common field-name variants.
  const norm: any = {};
  norm.crop = typeof payload?.crop === "string" ? payload.crop : undefined;
  norm.quality = payload?.quality;
  norm.harvest_date = payload?.harvest_date ?? payload?.date;
  norm.parcel_name = payload?.parcel_name ?? payload?.parcel ?? payload?.field;
  norm.parcel_id = payload?.parcel_id;
  norm.notes = payload?.notes ?? payload?.note;
  norm.costs = payload?.costs;

  // quantity + unit: accept numeric quantity, "5g"/"5 kg" strings, or amount field.
  const AMOUNT_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|kilo|kilogram|l|lt|litre|liter)?\s*$/i;
  const parseAmount = (v: unknown): { q?: number; u?: string } => {
    if (typeof v === "number" && Number.isFinite(v)) return { q: v };
    if (typeof v === "string") {
      const m = v.match(AMOUNT_RE);
      if (m) return { q: Number(m[1].replace(",", ".")), u: m[2] };
    }
    return {};
  };
  const fromQty = parseAmount(payload?.quantity);
  const fromAmt = parseAmount(payload?.amount);
  norm.quantity = fromQty.q ?? fromAmt.q;
  norm.unit = payload?.unit ?? fromQty.u ?? fromAmt.u;

  const crop = typeof norm.crop === "string" ? norm.crop.trim() : "";
  const quantity = typeof norm.quantity === "number" ? norm.quantity : Number(norm.quantity);
  const unit = mapUnit(norm.unit);
  const date = normalizeDate(norm.harvest_date) ?? todayISO();

  if (!crop || !Number.isFinite(quantity) || !unit) {
    console.warn("[parseAssistantContent] missing required fields", { crop, quantity, unit });
    return { visibleText: raw, journal: null, parseError: "missing_required" };
  }

  const journal: ParsedJournal = {
    crop,
    quantity,
    unit,
    quality: mapQuality(norm.quality),
    harvest_date: date,
    parcel_id: typeof norm.parcel_id === "string" ? norm.parcel_id : undefined,
    parcel_name: typeof norm.parcel_name === "string" ? norm.parcel_name : undefined,
    notes: typeof norm.notes === "string" ? norm.notes : undefined,
    costs: sanitizeCosts(norm.costs),
  };

  // Strip ALL blocks from visible text
  const visibleText = raw.replace(BLOCK_RE_G, "").replace(/\n{3,}/g, "\n\n").trim();
  return { visibleText, journal };
}
