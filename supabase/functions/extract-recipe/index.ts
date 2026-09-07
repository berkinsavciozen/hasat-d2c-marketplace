// extract-recipe — P23-M2 (Hasat), P23-M6-ek'te genişletildi
// Metin veya YAZILI TARİF FOTOĞRAFI -> yapılandırılmış tarif (recipes + recipe_steps + recipe_ingredients).
//
// Kapsam kararları (Build/P23-Mobile.md "AI ile tarif çıkarma — modalite matrisi"):
//   ✅ mode="text"  — yazıyla yapıştırma
//   ✅ mode="photo" — yazılı tarif fotoğrafı (kitap sayfası / el yazısı), vision + OCR
//   ⛔ YouTube/link ve bitmiş yemek fotoğrafından tahmin -> M9 (hukuki kontrol şartlı)
//
// Zorunlu kurallar:
//   • verify_jwt AÇIK — kullanıcı tetiklemeli fonksiyon. sync-izmir-hal-prices'taki
//     cron istisnası burada GEÇERLİ DEĞİL.
//   • visibility='private' SUNUCU TARAFINDA zorlanır; client'ın gönderdiği değere
//     bakılmaz. Kullanıcı importları asla public korpusa girmez.
//   • owner_id JWT'nin sub claim'inden alınır, body'den ASLA.
//   • author_type='kullanici' (P23-M2-ek). Öncesinde default 'hasat' kalıyordu
//     ve import editoryal korpusmuş gibi görünüyordu — eksik veriydi.
//   • Kota mevcut ai_usage_tracking ile (can_send_ai_message / increment_ai_usage).
//     Yeni kota altyapısı kurulmaz.
//   • [P23-M6-ek — DEĞİŞTİ] recipe_ingredients.crop artık DAİMA null yazılmıyor
//     iddiası geçersiz: bu fonksiyon hâlâ crop:null insert eder (kendi başına
//     tahmin YAPMAZ), ama recipe_ingredients üzerindeki
//     trg_recipe_ingredients_auto_match_crop (BEFORE INSERT) satır insert
//     edilirken crop_culinary_meta.culinary_aliases'e karşı DETERMİNİSTİK
//     (fuzzy değil, birebir alias lookup) bir eşleştirme dener — bkz.
//     Build/DB-Schema.md → "P23-M6-ek". Bu edge function'ın kendisi hâlâ hiçbir
//     eşleştirme YAPMAZ, sadece DB trigger'ının çalışmasına izin verir.
//   • [P23-M6-ek — YENİ] `recipe_name` (opsiyonel): kullanıcının girdiği tarifin
//     orijinal adı. KESİN SINIR: yalnızca OCR/çıkarımı yönlendirmek için
//     prompt'a eklenir — modelin bu isimden malzeme/adım UYDURMASI yasaktır.
//     Kaynakta adım yoksa/okunamıyorsa "steps" boş döner, bu geçerli bir sonuçtur.
//   • [P23-M6-ek — YENİ] Her malzeme için "is_agricultural" (tarımsal ürün mü /
//     market malzemesi mi) olgusal sınıflandırması istenir, `ingredient_class`
//     kolonuna yazılır. Kullanıcı önizleme ekranında düzeltebilir.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const MAX_TEXT_CHARS = 20000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_STEPS = 40;
const MAX_INGREDIENTS = 60;
const MAX_RECIPE_NAME_CHARS = 200;

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

// Türkçe karakterleri sadeleştirerek URL-güvenli slug. Private tarifte SEO amacı yok,
// ama recipes.slug NOT NULL + UNIQUE — çakışmayı rastgele son ek engelliyor.
function slugify(title: string): string {
  const map: Record<string, string> = {
    "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
    "Ç": "c", "Ğ": "g", "İ": "i", "I": "i", "Ö": "o", "Ş": "s", "Ü": "u",
  };
  const base = title
    .split("").map((ch) => map[ch] ?? ch).join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  return `${base || "tarif"}-${rand}`;
}

const SYSTEM_PROMPT = `Sen bir yemek tarifi çıkarma asistanısın. Sana verilen metinden veya
YAZILI BİR TARİF FOTOĞRAFINDAN (kitap sayfası, el yazısı not, ekran görüntüsü) tarifi
yapılandırılmış JSON olarak çıkarırsın.

KURALLAR:
- SADECE kaynakta gerçekten yazan bilgiyi çıkar. Eksik alanı UYDURMA, null bırak.
- Kaynak bir tarif değilse veya okunamıyorsa: {"is_recipe": false, "reason": "..."} döndür.
- Kullanıcı ayrıca tarifin ORİJİNAL ADINI verebilir. Bu ad SADECE kaynağı (metni/görseli)
  doğru okumana yardımcı olması için bir İPUCUDUR — kesin bir sınır var: kaynakta gerçekten
  yazmayan hiçbir malzemeyi veya adımı bu isimden ya da kendi genel bilginden yola çıkarak
  UYDURMA/tahmin etme. Kaynakta adımlar hiç yazmıyorsa veya okunamıyorsa "steps" dizisini
  BOŞ bırak — bu geçerli ve beklenen bir sonuçtur, adım uydurmaktan daima iyidir. Aynı kural
  malzemeler için de geçerli: isimden "muhtemelen olması gereken" bir malzemeyi ekleme,
  yalnızca kaynakta yazanı listele.
- Miktar ve birimi AYIR. Birim Türkçe mutfak birimi olarak kalsın
  (adet, demet, yemek kaşığı, çay kaşığı, tutam, bardak, g, kg, ml, L).
- "is_key_ingredient": tarifin kimliğini belirleyen ana malzemeler için true
  (tuz, karabiber, su, yağ gibi temel şeyler için false).
- "is_agricultural": her malzeme için olgusal bir sınıflandırma (halüsinasyon riski düşük,
  sadece kategorize et, uydurma). Çiftlikte yetişen/hasat edilen HAM TARIM ÜRÜNÜ ise
  (sebze, meyve, tahıl, baklagil, kuruyemiş, baharat, zeytinyağı gibi) true. Hayvansal ürün,
  süt ürünü, işlenmiş/paketli market malzemesi veya temel mutfak malzemesi ise
  (ör. tuz, su, un, süt, yumurta, kıyma) false.
- "extraction_confidence": 0 ile 1 arası. Kaynak net ve eksiksizse yüksek;
  bulanık fotoğraf, eksik adım, tahmin gerektiren yerlerde DÜŞÜK ver. Dürüst ol.
- difficulty yalnızca "kolay", "orta" veya "zor" olabilir.

Yalnızca şu şemada JSON döndür, başka hiçbir metin yazma:
{
  "is_recipe": true,
  "title": "string",
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

// is_agricultural -> ingredient_class. Model boolean dönmezse (beklenmez ama
// savunma amaçlı) sınıflandırma boş bırakılır — uydurma yok.
function ingredientClass(v: unknown): "tarimsal" | "platform_disi" | null {
  if (v === true) return "tarimsal";
  if (v === false) return "platform_disi";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const userId = userIdFromAuth(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  let body: {
    mode?: string;
    text?: string;
    image_base64?: string;
    image_mime?: string;
    recipe_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const mode = body.mode === "photo" ? "photo" : body.mode === "text" ? "text" : null;
  if (!mode) {
    return json({ error: "invalid_mode", detail: "mode 'text' veya 'photo' olmalı. Link/YouTube ve yemek fotoğrafından tahmin M9'a sıralı." }, 400);
  }

  const text = (body.text ?? "").trim();
  const recipeName = str(body.recipe_name, MAX_RECIPE_NAME_CHARS);
  let imageDataUrl: string | null = null;

  if (mode === "text") {
    if (text.length < 20) return json({ error: "text_too_short" }, 400);
    if (text.length > MAX_TEXT_CHARS) return json({ error: "text_too_long", max: MAX_TEXT_CHARS }, 413);
  } else {
    const raw = (body.image_base64 ?? "").trim();
    if (!raw) return json({ error: "image_required" }, 400);
    const b64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
    if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) {
      return json({ error: "image_too_large", max_bytes: MAX_IMAGE_BYTES }, 413);
    }
    const mime = body.image_mime && /^image\/(png|jpe?g|webp|heic|heif)$/i.test(body.image_mime)
      ? body.image_mime
      : "image/jpeg";
    imageDataUrl = raw.startsWith("data:") ? raw : `data:${mime};base64,${b64}`;
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Kota: mevcut ai_usage_tracking altyapısı (yeni sistem kurulmaz) ────────
  const { data: canSend, error: canErr } = await sb.rpc("can_send_ai_message", { _user_id: userId });
  if (canErr) {
    console.error("[extract-recipe] can_send_ai_message error", canErr);
    return json({ error: "quota_check_failed" }, 500);
  }
  if (canSend === false) {
    return json({ error: "quota_exceeded", detail: "Aylık AI kullanım limitine ulaşıldı." }, 429);
  }

  // ── AI çağrısı ────────────────────────────────────────────────────────────
  // recipe_name yalnızca bir okuma ipucu olarak eklenir — kesin sınır SYSTEM_PROMPT'ta.
  const nameHint = recipeName
    ? `Kullanıcının belirttiğine göre bu tarifin adı: "${recipeName}". Bu adı SADECE aşağıdaki kaynağı doğru okumana yardımcı olması için bir ipucu olarak kullan; kaynakta gerçekten yazmayan hiçbir malzeme veya adımı bu isimden uydurma.\n\n`
    : "";
  const userContent = mode === "text"
    ? [{ type: "text", text: `${nameHint}Aşağıdaki tarifi çıkar:\n\n${text}` }]
    : [
        { type: "text", text: `${nameHint}Bu fotoğraftaki YAZILI tarifi oku ve çıkar. Fotoğrafta yazılı tarif yoksa is_recipe:false döndür.` },
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
    console.error("[extract-recipe] upstream fetch failed", e);
    return json({ error: "ai_unreachable" }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("[extract-recipe] upstream error", upstream.status, detail.slice(0, 500));
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
    console.error("[extract-recipe] parse failed", e);
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
    return json({ error: "not_a_recipe", reason: "malzeme ve adım çıkarılamadı" }, 422);
  }

  const difficulty = ["kolay", "orta", "zor"].includes(parsed.difficulty) ? parsed.difficulty : null;
  const dietTags = Array.isArray(parsed.diet_tags)
    ? parsed.diet_tags.map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 10)
    : [];

  // ── Kayıt. visibility/status/owner_id/source_type/author_type SUNUCUDA belirlenir
  const { data: recipe, error: recErr } = await sb
    .from("recipes")
    .insert({
      slug: slugify(title),
      title,
      description: str(parsed.description, 4000),
      servings: posInt(parsed.servings),
      prep_minutes: nonNegInt(parsed.prep_minutes),
      cook_minutes: nonNegInt(parsed.cook_minutes),
      difficulty,
      cuisine: str(parsed.cuisine, 80),
      diet_tags: dietTags,
      status: "draft",
      visibility: "private",              // <- sunucu tarafında zorunlu
      source_type: mode,                  // 'text' | 'photo'
      owner_id: userId,                   // <- JWT'den, body'den değil
      author_type: "kullanici",           // <- P23-M2-ek: import != editoryal korpus
      extraction_confidence: clampConfidence(parsed.extraction_confidence),
    })
    .select("id, slug, visibility, status, source_type, author_type, extraction_confidence")
    .single();

  if (recErr || !recipe) {
    console.error("[extract-recipe] recipe insert failed", recErr);
    return json({ error: "insert_failed" }, 500);
  }

  const ingredientRows = rawIngredients
    .map((ing: any, i: number) => ({
      recipe_id: recipe.id,
      sort_order: i + 1,
      // crop null insert edilir: bu fonksiyon kendi başına eşleştirme YAPMAZ.
      // recipe_ingredients üzerindeki trg_recipe_ingredients_auto_match_crop
      // (BEFORE INSERT, P23-M6-ek) crop_culinary_meta.culinary_aliases'e karşı
      // deterministik birebir eşleşme varsa bu insert sırasında crop'u kendisi
      // dolduracak — bkz. Build/DB-Schema.md → "P23-M6-ek".
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
    }))
    .filter((r: any) => r.free_text_name);

  const stepRows = rawSteps
    .map((s: any, i: number) => ({
      recipe_id: recipe.id,
      step_no: posInt(s?.step_no) ?? i + 1,
      instruction: str(s?.instruction, 4000),
      timer_seconds: posInt(s?.timer_seconds),
    }))
    .filter((r: any) => r.instruction)
    // step_no benzersizliğini garantiye al (UNIQUE(recipe_id, step_no))
    .map((r: any, i: number) => ({ ...r, step_no: i + 1 }));

  if (ingredientRows.length > 0) {
    const { error } = await sb.from("recipe_ingredients").insert(ingredientRows);
    if (error) {
      console.error("[extract-recipe] ingredients insert failed", error);
      await sb.from("recipes").delete().eq("id", recipe.id);
      return json({ error: "insert_failed" }, 500);
    }
  }
  if (stepRows.length > 0) {
    const { error } = await sb.from("recipe_steps").insert(stepRows);
    if (error) {
      console.error("[extract-recipe] steps insert failed", error);
      await sb.from("recipes").delete().eq("id", recipe.id);
      return json({ error: "insert_failed" }, 500);
    }
  }

  const { error: incErr } = await sb.rpc("increment_ai_usage", { _user_id: userId });
  if (incErr) console.error("[extract-recipe] increment_ai_usage failed", incErr);

  // Trigger'ın kaç malzemeyi gerçekten bağladığını oku — sabit false değil,
  // gerçek DB durumunu döndür (P23-M6-ek).
  let cropLinkedCount = 0;
  if (ingredientRows.length > 0) {
    const { count } = await sb
      .from("recipe_ingredients")
      .select("id", { count: "exact", head: true })
      .eq("recipe_id", recipe.id)
      .not("crop", "is", null);
    cropLinkedCount = count ?? 0;
  }

  return json({
    recipe: {
      id: recipe.id,
      slug: recipe.slug,
      title,
      visibility: recipe.visibility,
      status: recipe.status,
      source_type: recipe.source_type,
      author_type: recipe.author_type,
      extraction_confidence: recipe.extraction_confidence,
    },
    ingredient_count: ingredientRows.length,
    step_count: stepRows.length,
    // P23-M6-ek: artık gerçek sayı — deterministik alias eşleşmesiyle bağlanan
    // malzeme sayısı (crop_culinary_meta.culinary_aliases'i olan 14 crop ile
    // sınırlı, kalan 56 crop M9'da doldurulacak).
    crop_linked_count: cropLinkedCount,
  });
});
