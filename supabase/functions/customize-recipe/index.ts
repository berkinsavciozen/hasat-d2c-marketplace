// customize-recipe — T6 backend clone/save contract.
// Contract: hasat-vault/Build/T6-Backend-Clone-Save-Contract.md (branch
// claude/t6-backend-clone-save-contract-th755s). Dispatch: T6 Backend — Klonlama/Kaydetme Kod
// Dispatch (2026-09-10). Scope: this function + its migration only — no UI (contract §8 / dispatch §6).
//
// Two phases, one endpoint, selected by body.phase:
//   "propose" (Faz A) — reads a PUBLIC, non-user-authored source recipe, asks an LLM to customize it
//     per the caller's free-text instruction, runs it through the repo's live structural validators,
//     and returns the proposed draft + a changedFields diff. ZERO writes to recipes/recipe_ingredients/
//     recipe_steps — the only write is an idempotency/audit row in ai_customize_requests.
//   "save" (Faz B) — takes a (possibly user-edited) draft the caller already saw in "propose" and
//     writes it as a new private recipe, via the single-transaction `rpc_create_ai_customized_recipe`
//     RPC (20260910100000_t6_ai_customize_recipe_contract.sql). Retry-safe on idempotency_key.
//
// Deliberate departure from this repo's usual edge-function style (see extract-recipe/index.ts):
// extract-recipe runs entirely as service_role and re-implements ownership checks by hand app-side.
// This function instead builds a SEPARATE client that forwards the caller's own JWT (`userClient`),
// so recipes/recipe_ingredients/recipe_steps/ai_customize_requests writes go through the SAME
// `owner_id = auth.uid()` RLS every other authenticated write already goes through (contract §2 Faz B:
// "aynı authenticated/RLS yazma yolu") — and so `rpc_create_ai_customized_recipe`, which is SECURITY
// INVOKER and reads `auth.uid()`, resolves the real caller instead of NULL (which is what it would see
// called from a service_role client with no forwarded user JWT). `serviceClient` (service_role) is
// used ONLY for the three validator RPCs, which are granted to service_role alone (confirmed live —
// `revoke all ... from public; grant execute ... to service_role`) and for `crop_config` lookups the
// validators themselves need but this function doesn't call directly.
//
// Dispatch discovery #1 (re-confirmed live this turn): `validate_recipe_units` does not exist anywhere
// in this schema. The three live validators actually available and used below are
// `validate_recipe_structure`, `validate_recipe_crop_values`, `validate_recipe_ingredient_coverage`.
// Flagged in the delivery report, not silently substituted without a trace.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const MAX_INSTRUCTION_CHARS = 2000;
const MAX_STEPS = 40;
const MAX_INGREDIENTS = 60;

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

function str(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
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

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

type DraftIngredient = {
  crop: string | null;
  freeTextName: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  isKeyIngredient: boolean;
  sortOrder: number;
};

type DraftStep = {
  stepNo: number;
  instruction: string;
  timerSeconds: number | null;
};

type Draft = {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  difficulty: string | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
};

function normalizeIngredient(raw: any, i: number): DraftIngredient {
  return {
    crop: str(raw?.crop, 80),
    freeTextName: str(raw?.freeTextName ?? raw?.free_text_name, 200),
    quantity: (() => {
      const n = typeof raw?.quantity === "number" ? raw.quantity : Number(raw?.quantity);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    unit: str(raw?.unit, 40),
    note: str(raw?.note, 400),
    isKeyIngredient: raw?.isKeyIngredient === true || raw?.is_key_ingredient === true,
    sortOrder: posInt(raw?.sortOrder) ?? i,
  };
}

function normalizeStep(raw: any, i: number): DraftStep {
  return {
    stepNo: posInt(raw?.stepNo ?? raw?.step_no) ?? i + 1,
    instruction: str(raw?.instruction, 4000) ?? "",
    timerSeconds: posInt(raw?.timerSeconds ?? raw?.timer_seconds),
  };
}

// A p_draft shape matching what validate_recipe_structure / validate_recipe_crop_values /
// validate_recipe_ingredient_coverage all read (confirmed live this turn from pg_proc source).
function toValidatorDraft(d: Draft) {
  return {
    title: d.title,
    servings: d.servings,
    prepMinutes: d.prepMinutes,
    cookMinutes: d.cookMinutes,
    restMinutes: d.restMinutes,
    difficulty: d.difficulty,
    ingredients: d.ingredients.map((ing) => ({
      crop: ing.crop,
      freeTextName: ing.freeTextName,
      quantity: ing.quantity,
      isKeyIngredient: ing.isKeyIngredient,
    })),
    steps: d.steps.map((s) => ({ stepNo: s.stepNo, instruction: s.instruction, timerSeconds: s.timerSeconds })),
  };
}

function diffScalar(path: string, before: unknown, after: unknown, out: string[]) {
  if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) out.push(path);
}

// Best-effort changedFields diff for the UI preview (contract §2 Faz A). T6 UI itself is out of this
// dispatch's scope — this only needs to be correct enough for a future UI to highlight diffs with.
function computeChangedFields(before: Draft, after: Draft): string[] {
  const out: string[] = [];
  diffScalar("title", before.title, after.title, out);
  diffScalar("description", before.description, after.description, out);
  diffScalar("servings", before.servings, after.servings, out);
  diffScalar("prepMinutes", before.prepMinutes, after.prepMinutes, out);
  diffScalar("cookMinutes", before.cookMinutes, after.cookMinutes, out);
  diffScalar("restMinutes", before.restMinutes, after.restMinutes, out);
  diffScalar("difficulty", before.difficulty, after.difficulty, out);

  const maxIng = Math.max(before.ingredients.length, after.ingredients.length);
  for (let i = 0; i < maxIng; i++) {
    const b = before.ingredients[i];
    const a = after.ingredients[i];
    if (!b && a) out.push(`ingredients[${i}].added`);
    else if (b && !a) out.push(`ingredients[${i}].removed`);
    else if (b && a && JSON.stringify(b) !== JSON.stringify(a)) out.push(`ingredients[${i}]`);
  }

  const maxSteps = Math.max(before.steps.length, after.steps.length);
  for (let i = 0; i < maxSteps; i++) {
    const b = before.steps[i];
    const a = after.steps[i];
    if (!b && a) out.push(`steps[${i}].added`);
    else if (b && !a) out.push(`steps[${i}].removed`);
    else if (b && a && JSON.stringify(b) !== JSON.stringify(a)) out.push(`steps[${i}]`);
  }

  return out;
}

const SYSTEM_PROMPT = `Sen bir yemek tarifi ÖZELLEŞTİRME asistanısın. Sana kaynak bir tarifin tam
içeriği (başlık, açıklama, süreler, malzemeler, adımlar) ve kullanıcının bu tarifte ne değiştirmek
istediğini anlatan serbest bir talimat verilir. Görevin, YALNIZCA kullanıcının istediği değişiklikleri
uygulanmış, tarifin geri kalanını olabildiğince KORUYAN yeni bir tarif taslağı üretmek.

KESİN KURALLAR:
- Kullanıcının talimatıyla İLGİSİZ hiçbir malzemeyi, adımı veya alanı DEĞİŞTİRME. Talimat sadece bir
  malzemeyi ilgilendiriyorsa geri kalan her şey (diğer malzemeler, adımlar, süreler, başlık) AYNEN
  kalır.
- Bir malzemenin ismini/miktarını/birimini değiştiriyorsan ama o malzemenin ÖZÜ aynı kalıyorsa
  (ör. "tuzu azalt"), o malzemenin "crop" alanını AYNEN koru, sadece quantity/unit/note değişsin.
- Tamamen yeni bir malzeme ekliyorsan veya bir malzemeyi BAŞKA bir malzemeyle değiştiriyorsan, yeni/
  değişen malzeme için "crop" alanını HER ZAMAN null bırak, ismi sadece "freeTextName" alanına yaz —
  var olmayan bir crop kodu UYDURMA.
- Adım metinlerini, değişen malzemelerle TUTARLI kalacak şekilde güncelle (ör. bir malzeme çıkarıldıysa
  onu anan adım cümlesini de güncelle), ama talimatın kapsamadığı adımları olduğu gibi bırak.
- stepNo değerleri 1'den başlayarak, boşluksuz ve tekrarsız sıralı olmalı.
- Uydurma yok: kaynakta veya talimatta karşılığı olmayan hiçbir bilgiyi ekleme.

Yalnızca şu şemada JSON döndür, başka hiçbir metin yazma:
{
  "title": "string",
  "description": "string|null",
  "servings": number|null,
  "prepMinutes": number|null,
  "cookMinutes": number|null,
  "restMinutes": number|null,
  "difficulty": "kolay|orta|zor|null",
  "ingredients": [
    {"crop":"string|null","freeTextName":"string|null","quantity":number|null,"unit":"string|null","note":"string|null","isKeyIngredient":boolean,"sortOrder":number}
  ],
  "steps": [
    {"stepNo":1,"instruction":"string","timerSeconds":number|null}
  ]
}`;

async function callValidator(
  serviceClient: ReturnType<typeof createClient>,
  fn: string,
  draft: unknown,
): Promise<{ valid: boolean; issues: unknown[] }> {
  const { data, error } = await serviceClient.rpc(fn, { p_draft: draft });
  if (error) {
    console.error(`[customize-recipe] validator ${fn} failed`, error);
    return { valid: false, issues: [{ code: "VALIDATOR_CALL_FAILED", field: fn, severity: "blocking", message: error.message }] };
  }
  return { valid: data?.valid === true, issues: Array.isArray(data?.issues) ? data.issues : [] };
}

async function handlePropose(req: Request, userId: string, userClient: ReturnType<typeof createClient>, serviceClient: ReturnType<typeof createClient>, body: any) {
  const sourceRecipeId = body.source_recipe_id;
  const instruction = str(body.instruction, MAX_INSTRUCTION_CHARS);
  const idempotencyKey = body.idempotency_key;

  if (!isUuid(sourceRecipeId)) return json({ error: "invalid_source_recipe_id" }, 400);
  if (!instruction || instruction.length < 5) return json({ error: "instruction_required" }, 400);
  if (!isUuid(idempotencyKey)) return json({ error: "invalid_idempotency_key" }, 400);

  // ── Kota (contract §2 Faz A / §1 Bulgu 3: can_send_ai_message reused as-is) ──────────────────────
  const { data: canSend, error: canErr } = await userClient.rpc("can_send_ai_message", { _user_id: userId });
  if (canErr) {
    console.error("[customize-recipe] can_send_ai_message error", canErr);
    return json({ error: "quota_check_failed" }, 500);
  }
  if (canSend === false) {
    return json({ error: "quota_exceeded", detail: "Aylık AI kullanım limitine ulaşıldı." }, 429);
  }

  // ── Kaynak tarifi server-side oku ve doğrula (dispatch §1.5 — istemciden gelen veriye güvenme) ───
  const { data: source, error: sourceErr } = await userClient
    .from("recipes")
    .select("id, title, description, servings, prep_minutes, cook_minutes, rest_minutes, difficulty, visibility, author_type, status")
    .eq("id", sourceRecipeId)
    .maybeSingle();

  if (sourceErr) {
    console.error("[customize-recipe] source recipe read failed", sourceErr);
    return json({ error: "source_read_failed" }, 500);
  }
  if (!source) return json({ error: "source_not_found" }, 404);
  if (source.visibility !== "public" || source.author_type === "kullanici") {
    return json({ error: "source_not_eligible", detail: "Kaynak tarif public ve author_type != kullanici olmalı." }, 403);
  }

  const [{ data: sourceIngredients, error: siErr }, { data: sourceSteps, error: ssErr }] = await Promise.all([
    userClient.from("recipe_ingredients").select("crop, free_text_name, quantity, unit, note, is_key_ingredient, sort_order").eq("recipe_id", sourceRecipeId).order("sort_order"),
    userClient.from("recipe_steps").select("step_no, instruction, timer_seconds").eq("recipe_id", sourceRecipeId).order("step_no"),
  ]);
  if (siErr || ssErr) {
    console.error("[customize-recipe] source ingredients/steps read failed", siErr, ssErr);
    return json({ error: "source_read_failed" }, 500);
  }

  const sourceDraft: Draft = {
    title: source.title,
    description: source.description,
    servings: source.servings,
    prepMinutes: source.prep_minutes,
    cookMinutes: source.cook_minutes,
    restMinutes: source.rest_minutes,
    difficulty: source.difficulty,
    ingredients: (sourceIngredients ?? []).map((r: any, i: number) =>
      normalizeIngredient({ crop: r.crop, freeTextName: r.free_text_name, quantity: r.quantity, unit: r.unit, note: r.note, isKeyIngredient: r.is_key_ingredient, sortOrder: r.sort_order }, i)),
    steps: (sourceSteps ?? []).map((r: any, i: number) => normalizeStep({ stepNo: r.step_no, instruction: r.instruction, timerSeconds: r.timer_seconds }, i)),
  };

  // Faz A audit/idempotency row — safe to call twice for the same key (network retry of Faz A itself).
  const { error: reqErr } = await userClient
    .from("ai_customize_requests")
    .upsert({ idempotency_key: idempotencyKey, user_id: userId, source_recipe_id: sourceRecipeId, status: "pending" }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (reqErr) {
    console.error("[customize-recipe] ai_customize_requests insert failed", reqErr);
    return json({ error: "request_log_failed" }, 500);
  }

  // ── LLM çağrısı ───────────────────────────────────────────────────────────────────────────────
  const userContent = `Kaynak tarif:\n${JSON.stringify(sourceDraft)}\n\nKullanıcının talimatı: ${instruction}`;

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
    console.error("[customize-recipe] upstream fetch failed", e);
    return json({ error: "ai_unreachable" }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("[customize-recipe] upstream error", upstream.status, detail.slice(0, 500));
    const code = upstream.status === 402 ? "credits_exhausted" : upstream.status === 429 ? "rate_limited" : "ai_error";
    return json({ error: code }, upstream.status === 402 || upstream.status === 429 ? upstream.status : 502);
  }

  let parsed: any;
  try {
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content ?? "";
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch (e) {
    console.error("[customize-recipe] parse failed", e);
    return json({ error: "ai_bad_output" }, 502);
  }

  const title = str(parsed?.title, 200);
  if (!title) return json({ error: "ai_bad_output", detail: "başlık üretilemedi" }, 422);

  const draft: Draft = {
    title,
    description: str(parsed.description, 4000),
    servings: posInt(parsed.servings),
    prepMinutes: nonNegInt(parsed.prepMinutes),
    cookMinutes: nonNegInt(parsed.cookMinutes),
    restMinutes: nonNegInt(parsed.restMinutes),
    difficulty: ["kolay", "orta", "zor"].includes(parsed.difficulty) ? parsed.difficulty : null,
    ingredients: (Array.isArray(parsed.ingredients) ? parsed.ingredients.slice(0, MAX_INGREDIENTS) : []).map(normalizeIngredient),
    steps: (Array.isArray(parsed.steps) ? parsed.steps.slice(0, MAX_STEPS) : []).map(normalizeStep),
  };

  // increment_ai_usage: contract §2 Faz A — YALNIZCA LLM başarıyla döndükten sonra, öneri kalitesinden
  // bağımsız (aşağıdaki validator sonucu ne olursa olsun burada zaten çağrılmış olur).
  const { error: incErr } = await userClient.rpc("increment_ai_usage", { _user_id: userId });
  if (incErr) console.error("[customize-recipe] increment_ai_usage failed", incErr);

  // ── F2'nin canlı doğrulayıcıları (dispatch §1.1 keşfet-önce: validate_recipe_units YOK, üçü değil
  //    ikisi + validate_recipe_structure kullanılıyor — bkz. dosya başı DISCOVERY notu) ────────────
  const validatorDraft = toValidatorDraft(draft);
  const [structureResult, cropResult, coverageResult] = await Promise.all([
    callValidator(serviceClient, "validate_recipe_structure", validatorDraft),
    callValidator(serviceClient, "validate_recipe_crop_values", validatorDraft),
    callValidator(serviceClient, "validate_recipe_ingredient_coverage", validatorDraft),
  ]);
  const allIssues = [...structureResult.issues, ...cropResult.issues, ...coverageResult.issues];
  const valid = structureResult.valid && cropResult.valid && coverageResult.valid;

  const changedFields = computeChangedFields(sourceDraft, draft);

  return json({
    idempotency_key: idempotencyKey,
    source_recipe_id: sourceRecipeId,
    draft,
    changedFields,
    validation: { valid, issues: allIssues },
  }, valid ? 200 : 422);
}

async function handleSave(req: Request, userId: string, userClient: ReturnType<typeof createClient>, body: any) {
  const idempotencyKey = body.idempotency_key;
  const sourceRecipeId = body.source_recipe_id;
  if (!isUuid(idempotencyKey)) return json({ error: "invalid_idempotency_key" }, 400);
  if (!isUuid(sourceRecipeId)) return json({ error: "invalid_source_recipe_id" }, 400);

  const title = str(body.title, 200);
  if (!title) return json({ error: "title_required" }, 400);

  const ingredients = Array.isArray(body.ingredients) ? body.ingredients.slice(0, MAX_INGREDIENTS).map(normalizeIngredient) : [];
  const steps = Array.isArray(body.steps) ? body.steps.slice(0, MAX_STEPS).map(normalizeStep) : [];
  if (ingredients.length === 0) return json({ error: "ingredients_required" }, 400);
  if (steps.length === 0) return json({ error: "steps_required" }, 400);

  // Faz B'nin 3 INSERT'i tek bir DB transaction'ında (dispatch §1.6) — rpc_create_ai_customized_recipe
  // içinde, userClient (RLS/auth.uid() SECURITY INVOKER) ile çağrılır (bkz. dosya başı yorum).
  const { data: recipeId, error } = await userClient.rpc("rpc_create_ai_customized_recipe", {
    p_idempotency_key: idempotencyKey,
    p_source_recipe_id: sourceRecipeId,
    p_title: title,
    p_description: str(body.description, 4000),
    p_servings: posInt(body.servings),
    p_prep_minutes: nonNegInt(body.prep_minutes ?? body.prepMinutes),
    p_cook_minutes: nonNegInt(body.cook_minutes ?? body.cookMinutes),
    p_rest_minutes: nonNegInt(body.rest_minutes ?? body.restMinutes),
    p_difficulty: ["kolay", "orta", "zor"].includes(body.difficulty) ? body.difficulty : null,
    p_ingredients: ingredients,
    p_steps: steps,
  });

  if (error || !recipeId) {
    console.error("[customize-recipe] rpc_create_ai_customized_recipe failed", error);
    // Contract §7: transaction başarısızsa ai_customize_requests.status='failed' işaretlenir. Bu
    // güncelleme yalnızca Faz A'dan kalan 'pending' satırı henüz var/commit edilmişse etkili olur —
    // RPC'nin kendi transaction'ı (varsa kendi içindeki insert-if-missing dahil) zaten geri alındı,
    // bkz. migrasyonun Part 3 yorumu.
    await userClient
      .from("ai_customize_requests")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("idempotency_key", idempotencyKey)
      .eq("user_id", userId)
      .eq("status", "pending");

    const message = error?.message ?? "";
    if (message.includes("not eligible for AI customization")) return json({ error: "source_not_eligible" }, 403);
    if (message.includes("source recipe not found")) return json({ error: "source_not_found" }, 404);
    if (message.includes("different user")) return json({ error: "idempotency_key_conflict" }, 409);
    return json({ error: "save_failed" }, 500);
  }

  return json({ recipe_id: recipeId });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const userId = userIdFromAuth(req);
  if (!userId) return json({ error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // userClient: caller's own JWT forwarded, so RLS/auth.uid() apply exactly as they do for any other
  // authenticated write in this app (see file-header note on why this differs from extract-recipe).
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  // serviceClient: ONLY for the three validator RPCs (service_role-only grant, confirmed live).
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body?.phase === "propose") return handlePropose(req, userId, userClient, serviceClient, body);
  if (body?.phase === "save") return handleSave(req, userId, userClient, body);
  return json({ error: "invalid_phase", detail: "phase 'propose' veya 'save' olmalı." }, 400);
});
