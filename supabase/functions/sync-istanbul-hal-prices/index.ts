import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Source: İBB Tarımsal Hizmetler Dairesi Başkanlığı daily hal price lookup
// (https://tarim.ibb.istanbul/tr/istatistik/124/hal-fiyatlari.html). The
// halfiyatlaripublicdata.ibb.gov.tr Web API documented in probe-ibb-hal never
// resolves a working route (its own swagger spec endpoint is broken server-side),
// so this uses the same backend the department's own public page calls.
const TARIM_URL = "https://tarim.ibb.istanbul/inc/halfiyatlari/gunluk_fiyatlar.asp";
// tUsr/tPas/tVal are not Hasat secrets: they are the fixed client-side query
// params the department's own public hal-fiyatlari.html page sends on every
// request (visible to anyone via view-source, no session or login involved).
// Set as Supabase function secrets (TARIM_TUSR / TARIM_TPAS / TARIM_TVAL) —
// not hardcoded here — so they aren't duplicated in source control; see the
// deployed function for the current values, sourced from tarim.ibb.istanbul.
const TARIM_AUTH = {
  tUsr: Deno.env.get("TARIM_TUSR") ?? "",
  tPas: Deno.env.get("TARIM_TPAS") ?? "",
  tVal: Deno.env.get("TARIM_TVAL") ?? "",
  HalTurId: "2",
};
// 5 = Meyve (fruit), 6 = Sebze (vegetable) — matches the crop domain below.
const CATEGORIES = ["5", "6"];

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const reqUrl = new URL(req.url);
    const dateParam = reqUrl.searchParams.get("date");
    const date = dateParam ?? new Date().toISOString().slice(0, 10);

    const rows: { name: string; unit: string; min: number; max: number }[] = [];
    for (const kategori of CATEGORIES) {
      const url = new URL(TARIM_URL);
      url.searchParams.set("tarih", date);
      url.searchParams.set("kategori", kategori);
      for (const [k, v] of Object.entries(TARIM_AUTH)) url.searchParams.set(k, v);

      const res = await fetch(url.toString(), { headers: { "Accept": "text/html" } });
      if (!res.ok) continue;
      const html = await res.text();
      rows.push(...parseRows(html));
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, date, note: "no bulletin rows for this date" }));
    }

    // Same crop identifier set used by sync-izmir-hal-prices (must exist in crop_config).
    const CROP_PREFIXES: Record<string, string> = {
      domates: "DOMATES", elma: "ELMA", patates: "PATATES", armut: "ARMUT", biber: "BİBER",
      çilek: "CILEK", erik: "ERİK", greyfurt: "GREYFURT", havuç: "HAVUÇ", ıspanak: "ISPANAK",
      kabak: "KABAK", karpuz: "KARPUZ", kavun: "KAVUN", kayısı: "KAYISI", kiraz: "KIRAZ",
      lahana: "LAHANA", limon: "LİMON", marul: "MARUL", muz: "MUZ", nane: "Y.NANE", nar: "NAR",
      patlıcan: "PATLICAN", portakal: "PORTAKAL", salatalık: "SALATALIK", sarımsak: "SARIMSAK",
      soğan: "SOĞAN", şeftali: "ŞEFTALI", üzüm: "ÜZÜM", vişne: "VISNE",
    };

    const rowsToInsert: any[] = [];
    const perCropSamples: Record<string, { name: string; mid: number; unit: string }[]> = {};

    for (const [crop, prefix] of Object.entries(CROP_PREFIXES)) {
      const matches = rows.filter(
        (r) => r.unit === "Kilogram" && r.name.toLocaleUpperCase("tr-TR").startsWith(prefix),
      );
      if (matches.length === 0) continue;
      perCropSamples[crop] = matches.map((r) => ({ name: r.name, mid: (r.min + r.max) / 2, unit: r.unit }));
      const avgMid = matches.reduce((s, r) => s + (r.min + r.max) / 2, 0) / matches.length;
      rowsToInsert.push({
        crop, source: "external", market_source_code: "istanbul_hal", price_per_unit: avgMid,
        unit: "kg", region: "İstanbul", recorded_date: date, farmer_id: null, order_id: null,
      });
    }

    if (rowsToInsert.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, date, note: "no matching crops found" }));
    }

    const crops = rowsToInsert.map((r) => r.crop);
    const { error: delError } = await supabase
      .from("price_history").delete()
      .eq("market_source_code", "istanbul_hal").eq("recorded_date", date).in("crop", crops);
    if (delError) {
      return new Response(JSON.stringify({ error: `cleanup failed: ${delError.message}` }), { status: 500 });
    }

    const { data, error } = await supabase
      .from("price_history").insert(rowsToInsert).select("id, crop, price_per_unit, recorded_date");

    if (error) {
      return new Response(JSON.stringify({ error: error.message, attempted: rowsToInsert }), { status: 500 });
    }

    return new Response(JSON.stringify({ inserted: data?.length ?? 0, date, rows: data, samples: perCropSamples }));
  } catch (e) {
    return new Response(JSON.stringify({ fetch_error: String(e) }), { status: 500 });
  }
});

function parseRows(html: string): { name: string; unit: string; min: number; max: number }[] {
  const rowRe =
    /<tr>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([\d.,]+)(?:<span[^>]*>[^<]*<\/span>)?<\/td>\s*<td>([\d.,]+)(?:<span[^>]*>[^<]*<\/span>)?<\/td>\s*<\/tr>/g;
  const out: { name: string; unit: string; min: number; max: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const min = Number(m[3].replace(",", "."));
    const max = Number(m[4].replace(",", "."));
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
    out.push({ name: m[1].trim(), unit: m[2].trim(), min, max });
  }
  return out;
}
