// F2-S18 Besin Değeri Eksikliği — Otomatik Kapatma (Sınıf B) + Onay Ekranında Kalıcı Çözümleme
// Arayüzü (Sınıf A + C) — 2026-09-21 dispatch.
//
// Sınıf A (bilinen bir crop/food'un eksik ölçü birimi — örn. portakal+"adet") ve Sınıf C
// (sistemin hiç bilmediği yeni bir malzeme — örn. "badem") mekanik olarak aynı eylem: "eksik bir
// satırı ilgili paylaşılan referans tabloya kalıcı olarak ekle". Bu modül o tek yazma yoluna ince
// bir TypeScript kabuğu geçiriyor — gerçek iş (INSERT'ler, çakışma tespiti, aynı transaction'da
// otomatik alias, audit satırı, ardından refresh_draft_nutrition_preview ile yeniden hesaplama)
// tamamen `admin_resolve_nutrition_unresolved` Postgres RPC'sinde yaşıyor (bkz. migration
// 20260921100000 + düzeltmesi 20260921100100) — review-actions.ts'in kendi CAS/audit mantığını
// SQL tarafında değil TS tarafında tuttuğu desenden FARKLI olarak, burada atomicity (özellikle
// new_reference'ın referans+alias'ı aynı transaction'da yazması) bir Postgres fonksiyonu dışında
// güvenilir şekilde sağlanamayacağı için bilinçli olarak SQL tarafında tutuldu.
//
// Sistemin kendi başına (insan onayı olmadan) yeni bir besin referans değeri üretip tabloya
// yazması bu modülün YAPMADIĞI şey — her yazım burada admin'in kendi girdiği bir `resolution`
// objesinden geliyor, LLM tahminiyle sessizce doldurulan hiçbir alan yok.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";

export interface AddMeasureResolution {
  kind: "add_measure";
  scope: { crop: string } | { foodKey: string };
  unit: string;
  gramsPerUnit: number;
}

export interface AliasToExistingResolution {
  kind: "alias_to_existing";
  targetKind: "crop" | "food";
  targetKey: string;
}

export interface NewReferenceResolution {
  kind: "new_reference";
  foodKey: string;
  displayName: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MarkUnquantifiedResolution {
  kind: "mark_unquantified";
}

export type NutritionResolution =
  | AddMeasureResolution
  | AliasToExistingResolution
  | NewReferenceResolution
  | MarkUnquantifiedResolution;

export interface ResolveNutritionUnresolvedParams {
  jobId: string;
  ingredientLabel: string;
  resolution: NutritionResolution;
  notes?: string | null;
  adminActor?: string | null;
}

export interface DraftNutritionPreviewSummary {
  coveragePct: number;
  source: "computed" | "partial" | "unavailable";
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  unresolved: Array<{ sortOrder: number; name: string; reason: string }>;
  computedAt: string;
}

export type ResolveNutritionUnresolvedFailureReason = "already_exists" | "ingredient_not_found";

export type ResolveNutritionUnresolvedResult =
  | { ok: true; auditId: string; preview: DraftNutritionPreviewSummary }
  | { ok: false; reason: ResolveNutritionUnresolvedFailureReason; auditId: string };

interface RawRpcResult {
  ok: boolean;
  error?: string;
  auditId: string;
  preview?: {
    coverage_pct: number;
    source: string;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    unresolved: Array<{ sortOrder: number; name: string; reason: string }>;
    computed_at: string;
  };
}

/**
 * Sınıf A/C için tek giriş noktası — `admin_resolve_nutrition_unresolved(p_job_id,
 * p_ingredient_label, p_resolution, p_notes, p_admin_actor)` RPC'sini çağırır. Var olan hiçbir
 * alias/ölçü/referans satırını değiştirmez/silmez (RPC'nin kendisi `on conflict do nothing`
 * kullanıyor) — bir çakışma varsa `{ ok: false, reason: 'already_exists' }` döner.
 * `mark_unquantified` eşleşen malzemeyi bulamazsa `{ ok: false, reason: 'ingredient_not_found' }`
 * döner. Başarılı her çağrı, RPC'nin kendi içinde tekrar çalıştırdığı
 * `refresh_draft_nutrition_preview`'ın güncel sonucunu taşır — admin ekranı ayrı bir çağrı
 * yapmadan anında yenilenebilir.
 */
export async function resolveNutritionUnresolved(
  client: SupabaseClient,
  params: ResolveNutritionUnresolvedParams,
): Promise<ResolveNutritionUnresolvedResult> {
  const { data, error } = await client.rpc("admin_resolve_nutrition_unresolved", {
    p_job_id: params.jobId,
    p_ingredient_label: params.ingredientLabel,
    p_resolution: params.resolution,
    p_notes: params.notes ?? null,
    p_admin_actor: params.adminActor ?? null,
  });

  if (error) {
    throw new RecipeAutomationError({
      code: "ADMIN_NUTRITION_RESOLVE_RPC_FAILED",
      message: (error as { message?: string }).message ?? "admin_resolve_nutrition_unresolved RPC failed",
      retryable: false,
      details: { pgCode: (error as { code?: string }).code },
    });
  }

  const raw = data as RawRpcResult;

  if (!raw.ok) {
    return { ok: false, reason: raw.error as ResolveNutritionUnresolvedFailureReason, auditId: raw.auditId };
  }

  const p = raw.preview!;
  return {
    ok: true,
    auditId: raw.auditId,
    preview: {
      coveragePct: Number(p.coverage_pct),
      source: p.source as DraftNutritionPreviewSummary["source"],
      calories: p.calories,
      proteinG: p.protein_g,
      carbsG: p.carbs_g,
      fatG: p.fat_g,
      fiberG: p.fiber_g,
      unresolved: Array.isArray(p.unresolved) ? p.unresolved : [],
      computedAt: p.computed_at,
    },
  };
}
