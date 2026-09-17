// estimate-recipe-from-photo — T7a (Hasat)
// BİTMİŞ/PİŞMİŞ YEMEK FOTOĞRAFI -> AI TAHMİNİ yapılandırılmış tarif taslağı
// (recipes + recipe_steps + recipe_ingredients).
//
// extract-recipe/index.ts'in ikiz kardeşi: aynı auth/kota/insert/rollback iskeleti, aynı vision
// pipeline (LOVABLE_API_KEY -> Lovable AI Gateway). extract-recipe'in kendi başlık yorumu bu
// senaryoyu (bitmiş yemek fotoğrafından tahmin) "⛔ ... -> M9 (hukuki kontrol şartlı)" diye
// işaretlemişti — bu fonksiyon, Berkin'in açık onayıyla (kural #107 sorusu + "Devam et, hukuki risk
// kabul" cevabı, 2026-09-10) o sınırı bilinçli olarak aşıyor, ama extract-recipe'ten temelde farklı
// bir güven seviyesiyle: bu bir OCR/okuma değil, bir TAHMİN. Bu yüzden aşağıdaki ek kısıtlar var:
//
//   • DÖNÜŞ DEĞERİ HER ZAMAN sunucu tarafında sabitlenmiş bir `disclaimer` alanı taşır — model
//     çıktısına bağlı değildir, İSTEMCİ TARAFINDAN GÖRMEZDEN GELİNEMEZ VARSAYILMAMALI: bu dispatch'i
//     tüketen her UI (web/mobil) bu alanı belirgin şekilde göstermek ZORUNDA (ayrı dispatch
//     dokümanlarında UI kabul kriteri olarak tekrarlanacak).
//   • visibility='private' / status='draft' / author_type='kullanici' / source_type='photo_estimate'
//     SUNUCU TARAFINDA zorlanır (extract-recipe ile aynı disiplin) — bu satır asla F2 editoryal
//     pipeline'ına veya public korpusa girmez.
//   • allergen_labels / allergens_reviewed / nutrition_* kolonlarına HİÇ dokunulmaz — DB default'ları
//     (unreviewed) geçerli kalır. T3-B'nin allergen/nutrition publish-gate'i (henüz canlıya
//     uygulanmadı ama uygulandığında da) bu satırı etkilemez çünkü satır asla publish edilmeye
//     çalışılmaz burada.
//   • Sistem prompt'u modelin düşük/orta güven bildirmesini ve görünürde belirsiz/gizli olabilecek
//     malzemeleri (ör. sos içindeki gluten/soya, süslemedeki kuruyemiş) açıkça listelemesini ister —
//     bunlar YAPISAL alerjen etiketi DEĞİL, serbest metin uyarılardır (allergens_reviewed'i asla
//     otomatik true yapmaz, o hâlâ ayrı bir insan-review akışı, bkz. recipeFacts.ts).
//   • verify_jwt AÇIK, kota mevcut ai_usage_tracking (can_send_ai_message/increment_ai_usage) ile —
//     extract-recipe ile AYNI bucket, yeni kota altyapısı kurulmaz.
//   • crop DAİMA null insert edilir (trg_recipe_ingredients_auto_match_crop deterministik eşlemeyi
//     kendisi dener) — bu fonksiyon kendi başına crop tahmini YAPMAZ.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_STEPS = 40;
const MAX_INGREDIENTS = 60;
const MAX_RECIPE_NAME_CHARS = 200;

const DISCLAIMER =
  "Bu tarif, yüklediğiniz fotoğraftaki yemeğe bakılarak yapay zeka tarafından TAHMİN edilmiştir. " +
  "Malzemeler, ölçüler, pişirme adımları ve olası alerjenler doğrulanmamıştır — gerçek tarifle " +
  "farklılık gösterebilir. Kaydetmeden/paylaşmadan/pişirmeden önce mutlaka kendiniz kontrol edin.";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function userIdFromAuth(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const tok = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : h.trim();
  const parts = tok.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad;
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `Sen bir yemek fotoğrafından tarif TAHMİN eden bir asistansın. Sana verilen
fotoğraf, PİŞMİŞ/HAZIRLANMIŞ BİR YEMEĞİN fotoğrafıdır (yazılı bir tarif metni DEĞİL) — görsel
ipuçlarından (görünüm, renk, doku, tabaktaki sunuş) yola çıkarak MUHTEMEL malzemeleri, ölçüleri ve
pişirme adımlarını TAHMİN edersin.

KESİN SINIRLAR:
- Bu bir OKUMA değil, bir TAHMİNDİR. Yemeğin gerçek tarifini bilemezsin — sadece görsel olarak
  MANTIKLI/OLASI bir versiyon üret.
- Fotoğraf yenilebilir/pişmiş bir yemek DEĞİLSE (ör. çiğ ürün fotoğrafı, alakasız görsel, yazılı
  metin fotoğrafı): {"is_recipe": false, "reason": "..."} döndür. Yazılı tarif fotoğrafları BU
  fonksiyonun kapsamında DEĞİL (o extract-recipe'te ele alınıyor) — böyle bir görsel görürsen de
  is_recipe:false döndür ve reason'da belirt.
- "extraction_confidence": bu TAHMİN olduğu için, çok net/basit yemekler dışında genelde ORTA-DÜŞÜK
  bir değer ver (0.3-0.6 aralığı tipik). Sadece görselden kesin emin olduğun, çok basit/tek malzemeli
  bir yemekte 0.7 üzerine çık. Asla yüksek güven verip TAHMİN olduğunu gizleme — dürüst ol.
- "uncertain_notes": string dizisi — görünürde OLABİLECEK ama fotoğraftan kesin göremediğin
  malzeme/pişirme detaylarını buraya yaz (ör. "sosta soya sosu veya gluten içeren bir bileşen
  olabilir, kesin değil", "kremalı görünüyor, süt ürünü içerebilir", "üzerinde kuruyemiş kırığı
  olabilir"). Bu YAPISAL bir alerjen etiketi değildir, sadece kullanıcıyı uyaran serbest metindir —
  emin olmadığın her şeyi buraya yaz, ana ingredients listesine UYDURMA malzeme ekleme.
- Miktar ve birimi AYIR, Türkçe mutfak birimi kullan (adet, demet, yemek kaşığı, çay kaşığı, tutam,
  bardak, g, kg, ml, L) — bunlar da tahminidir, makul bir porsiyon için mantıklı değerler ver.
- "is_key_ingredient": tarifin kimliğini belirleyen ana malzemeler için true.
- "is_agricultural": her malzeme için olgusal sınıflandırma. Ham tarım ürünüyse (sebze, meyve,
  tahıl, baklagil, kuruyemiş, baharat, zeytinyağı) true; hayvansal/süt ürünü/işlenmiş/temel mutfak
  malzemesiyse (tuz, su, un, süt, yumurta, kıyma) false.
- difficulty yalnızca "kolay", "orta" veya "zor" olabilir.

Yalnızca şu şemada JSON döndür, başka hiçbir metin yazma:
{
  "is_recipe": true,
  "title": "string (yemeğin tahmini adı)",
  "description": "string|null",
  "servings": number|null,
  "prep_minutes": number|null,
  "cook_minutes": number|null,
  "difficulty": "kolay|orta|zor|null",
  "cuisine": "string|null",
  "diet_tags": ["vejetaryen","vegan","glutensiz"],
  "ingredients": [
    {"name":"string","quantity":number|null,"unit":"string|null","note":"string|null","is_key_ingredient":boolean,"is_agricultural":boolean}
  ],
  "steps": [
    {"step_no":1,"instruction":"string","timer_seconds":number|null}
  ],
  "uncertain_notes": ["string"],
  "extraction_confidence": 0.0
}`;

function clampConfidence(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function posInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function nonNegInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function str(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function strArray(v: unknown, maxItems = 10, maxChars = 300): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((t) => str(t, maxChars)).filter((t): t is string => !!t).slice(0, maxItems);
}

function ingredientClass(v: unknown): "tarimsal" | "platform_disi" | null {
  if (v === true) return "tarimsal";
  if (v === false) return "platform_disi";
  return null;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const userId = userIdFromAuth(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  let body: {
    image_base64?: string;
    image_mime?: string;
    recipe_name?: string;
    operation_key?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const recipeName = str(body.recipe_name, MAX_RECIPE_NAME_CHARS);
  if (body.operation_key !== undefined && !isUuid(body.operation_key)) {
    return json({ error: "invalid_operation_key" }, 400);
  }
  const operationKey = body.operation_key ?? crypto.randomUUID();
  const raw = (body.image_base64 ?? "").trim();
  if (!raw) return json({ error: "image_required" }, 400);
  const b64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return json({ error: "image_too_large", max_bytes: MAX_IMAGE_BYTES }, 413);
  }
  const mime = body.image_mime && /^image\/(png|jpe?g|webp|heic|heif)$/i.test(body.image_mime)
    ? body.image_mime
    : "image/jpeg";
  const imageDataUrl = raw.startsWith("data:") ? raw : `data:${mime};base64,${b64}`;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const requestHash = await sha256(JSON.stringify({
    image_base64: body.image_base64 ?? null,
    image_mime: body.image_mime ?? null,
    recipe_name: recipeName,
  }));
  const { data: existing, error: preflightError } = await userClient.rpc("rpc_get_private_recipe_operation", {
    p_operation_key: operationKey,
    p_operation_type: "create_photo_estimate",
    p_input_hash: requestHash,
  });
  if (preflightError) {
    const conflict = preflightError.message?.includes("idempotency_conflict");
    return json({ error: conflict ? "idempotency_conflict" : "operation_check_failed" }, conflict ? 409 : 500);
  }
  if (existing?.recipe_id) {
    const recipeId = existing.recipe_id as string;
    const [{ data: saved }, { count: ingredientCount }, { count: stepCount }, { count: cropLinkedCount }] = await Promise.all([
      sb.from("recipes").select("title, extraction_confidence").eq("id", recipeId).single(),
      sb.from("recipe_ingredients").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId),
      sb.from("recipe_steps").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId),
      sb.from("recipe_ingredients").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId).not("crop", "is", null),
    ]);
    return json({
      recipe: { id: recipeId, slug: `private-${recipeId.replaceAll("-", "")}`, title: saved?.title,
        visibility: "private", status: "draft", source_type: "photo_estimate", author_type: "kullanici",
        extraction_confidence: saved?.extraction_confidence, version: existing.version },
      operation_key: operationKey,
      ingredient_count: ingredientCount ?? 0,
      step_count: stepCount ?? 0,
      crop_linked_count: cropLinkedCount ?? 0,
      uncertain_notes: [],
      disclaimer: DISCLAIMER,
    });
  }

  // ── Kota: mevcut ai_usage_tracking altyapısı, extract-recipe ile AYNI bucket ──────────────────
  const { data: canSend, error: canErr } = await sb.rpc("can_send_ai_message", { _user_id: userId });
  if (canErr) {
    console.error("[estimate-recipe-from-photo] can_send_ai_message error", canErr);
    return json({ error: "quota_check_failed" }, 500);
  }
  if (canSend === false) {
    return json({ error: "quota_exceeded", detail: "Aylık AI kullanım limitine ulaşıldı." }, 429);
  }

  // ── AI çağrısı ──────────────────────────────────────────────────────────────────────────────
  const nameHint = recipeName
    ? `Kullanıcı bu yemeğe "${recipeName}" adını verdi. Bu SADECE bir ipucudur, fotoğrafta gerçekten
görmediğin hiçbir malzemeyi bu isimden yola çıkarak UYDURMA — yine de görsel kanıtlarla tahmin et.\n\n`
    : "";
  const userContent = [
    { type: "text", text: `${nameHint}Bu fotoğraftaki PİŞMİŞ/HAZIRLANMIŞ yemeğe bakarak muhtemel tarifi tahmin et. Yenilebilir/pişmiş bir yemek değilse veya yazılı bir tarif metni fotoğrafıysa is_recipe:false döndür.` },
    { type: "image_url", image_url: { url: imageDataUrl } },
  ];

  let upstream: Response;
  try {
    upstream = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    console.error("[estimate-recipe-from-photo] upstream fetch failed", e);
    return json({ error: "ai_unreachable" }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("[estimate-recipe-from-photo] upstream error", upstream.status, detail.slice(0, 500));
    const code = upstream.status === 402 ? "credits_exhausted"
               : upstream.status === 429 ? "rate_limited"
               : "ai_error";
    return json({ error: code }, upstream.status === 402 || upstream.status === 429 ? upstream.status : 502);
  }

  let parsed: any;
  try {
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content ?? "";
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch (e) {
    console.error("[estimate-recipe-from-photo] parse failed", e);
    return json({ error: "ai_bad_output" }, 502);
  }

  if (!parsed || parsed.is_recipe === false) {
    return json({ error: "not_a_recipe", reason: str(parsed?.reason) ?? null }, 422);
  }

  const title = str(parsed.title, 200);
  if (!title) return json({ error: "ai_bad_output", detail: "başlık çıkarılamadı" }, 422);

  const rawIngredients = Array.isArray(parsed.ingredients) ? parsed.ingredients.slice(0, MAX_INGREDIENTS) : [];
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps.slice(0, MAX_STEPS) : [];
  if (rawIngredients.length === 0 && rawSteps.length === 0) {
    return json({ error: "not_a_recipe", reason: "malzeme ve adım tahmin edilemedi" }, 422);
  }

  const difficulty = ["kolay", "orta", "zor"].includes(parsed.difficulty) ? parsed.difficulty : null;
  const dietTags = Array.isArray(parsed.diet_tags)
    ? parsed.diet_tags.map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 10)
    : [];
  const uncertainNotes = strArray(parsed.uncertain_notes);

  const recipePayload = {
    title,
    description: str(parsed.description, 4000),
    servings: posInt(parsed.servings),
    prep_minutes: nonNegInt(parsed.prep_minutes),
    cook_minutes: nonNegInt(parsed.cook_minutes),
    difficulty,
    cuisine: str(parsed.cuisine, 80),
    diet_tags: dietTags,
    extraction_confidence: clampConfidence(parsed.extraction_confidence),
    ingredients: rawIngredients.map((ing: any) => ({
      // crop null insert edilir: trg_recipe_ingredients_auto_match_crop (BEFORE INSERT) deterministik
      // eşleşmeyi kendisi dener — bu fonksiyon kendi başına eşleştirme YAPMAZ (extract-recipe ile aynı).
      crop: null as string | null,
      free_text_name: str(ing?.name, 200),
      quantity: (() => {
        const n = typeof ing?.quantity === "number" ? ing.quantity : Number(ing?.quantity);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      unit: str(ing?.unit, 40),
      note: str(ing?.note, 400),
      is_key_ingredient: ing?.is_key_ingredient === true,
      ingredient_class: ingredientClass(ing?.is_agricultural),
    })).filter((r: any) => r.free_text_name),
    steps: rawSteps.map((s: any) => ({
      instruction: str(s?.instruction, 4000),
      timer_seconds: posInt(s?.timer_seconds),
    })).filter((r: any) => r.instruction),
  };

  const { data: writeResult, error: recErr } = await userClient.rpc("rpc_create_private_recipe", {
    p_operation_key: operationKey,
    p_operation_type: "create_photo_estimate",
    p_payload: recipePayload,
    p_input_hash: requestHash,
  });
  if (recErr || !writeResult?.recipe_id) {
    console.error("[estimate-recipe-from-photo] atomic recipe RPC failed", recErr);
    const code = recErr?.message?.includes("idempotency_conflict") ? "idempotency_conflict" : "insert_failed";
    return json({ error: code }, code === "idempotency_conflict" ? 409 : 500);
  }
  const recipeId = writeResult.recipe_id as string;

  const { error: incErr } = await sb.rpc("increment_ai_usage", { _user_id: userId });
  if (incErr) console.error("[estimate-recipe-from-photo] increment_ai_usage failed", incErr);

  let cropLinkedCount = 0;
  if (recipePayload.ingredients.length > 0) {
    const { count } = await sb
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true })
      .eq("recipe_id", recipeId)
      .not("crop", "is", null);
    cropLinkedCount = count ?? 0;
  }

  return json({
    recipe: {
      id: recipeId,
      slug: `private-${recipeId.replaceAll("-", "")}`,
      title,
      visibility: "private",
      status: "draft",
      source_type: "photo_estimate",
      author_type: "kullanici",
      extraction_confidence: recipePayload.extraction_confidence,
      version: writeResult.version,
    },
    operation_key: operationKey,
    ingredient_count: recipePayload.ingredients.length,
    step_count: recipePayload.steps.length,
    crop_linked_count: cropLinkedCount,
    uncertain_notes: uncertainNotes,
    // Sunucuda sabitlenmiş, modele bağlı olmayan uyarı — UI bunu göstermek ZORUNDA.
    disclaimer: DISCLAIMER,
  });
});
