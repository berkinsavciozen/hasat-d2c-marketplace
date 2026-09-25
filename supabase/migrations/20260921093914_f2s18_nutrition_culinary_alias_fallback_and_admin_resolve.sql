-- F2-S18 Besin Değeri Eksikliği — Otomatik Kapatma (Sınıf B) + Admin Çözümleme RPC'si
-- (Sınıf A + C) — 2026-09-21 dispatch: "Besin Değeri Eksikliği: Otomatik Kapatma (A/B) +
-- Onay Ekranında Kalıcı Çözümleme Arayüzü (C)".
--
-- Bağlam: T4-Nutrition-Onay-Akisi-Bug-Teshis-ve-Spec-2026-09-16.md'de kurulan "onay öncesi
-- besin önizlemesi" mimarisi (f2s17 + t4b2_taze_kekik_alias_fix) kendi içinde "kalıcı kapanmış
-- bir iş değil, tekrar eden bir bakım kalemi" olduğunu belirtiyordu — bugün (2026-09-21) yeni
-- tariflerde yeni malzemeler (portakal+"adet", "tavuk göğsü fileto", "karışık mevsim
-- yeşillikleri", "badem"...) aynı duvara çarptı. Bu migration üç şeyi kapatıyor:
--
--   1) Sınıf B (kod değişikliği, sıfır veri girişi): refresh_draft_nutrition_preview VE
--      calculate_recipe_nutrition, serbest metin ingredient_nutrition_alias'ta bulunamazsa artık
--      ikinci adım olarak crop_culinary_meta.culinary_aliases (text[]) içinde normalize edilmiş
--      karşılaştırmayla arıyor; bulunursa o crop kullanılıyor. ingredient_nutrition_alias'ta zaten
--      bir eşleşme varsa ona öncelik veriliyor (daha spesifik/kasıtlı kayıt). fn_recipe_ingredient_grams_v2
--      DEĞİŞMEDİ — resolved crop bu iki dış fonksiyon tarafından zaten belirlenip ona geçiliyor.
--   2) Yeni tablo nutrition_admin_resolutions — admin_resolve_nutrition_unresolved()'ın her
--      çağrısının iz bıraktığı, sadece service_role'ün yazabildiği bir audit log.
--   3) Yeni RPC admin_resolve_nutrition_unresolved(p_job_id, p_ingredient_label, p_resolution,
--      p_notes, p_admin_actor) — Sınıf A ("add_measure": ingredient_measure_reference'a tek satır),
--      Sınıf C ("alias_to_existing" / "new_reference": sırasıyla ingredient_nutrition_alias'a tek
--      satır / ingredient_nutrition_reference'a yeni satır + otomatik alias, aynı transaction'da),
--      ve "mark_unquantified" (draftın kendi ingredients JSONB'sinde quantity/unit'i null'a çekme —
--      mevcut "damak tadına göre" istisnasıyla aynı yol) için TEK bir giriş noktası. Var olan
--      hiçbir satır değiştirilmez/silinmez — yalnız ekleme (on conflict do nothing + 'already_exists'
--      dönüşü). Her başarılı yazımdan sonra refresh_draft_nutrition_preview(p_job_id) otomatik
--      tekrar çalıştırılıp güncel önizleme döndürülür.
--
-- Kapsam dışı (bilinçli, dispatch §3): publish_recipe_draft, tg_finalize_recipe_facts_on_publish_job,
-- fn_recipe_ingredient_grams_v2 — hiçbiri değişmiyor. calculate_recipe_nutrition'ın makro hesaplama
-- matematiği aynı kalıyor, yalnızca §2.1'deki alias-fallback JOIN'i ekleniyor.

-- ============================================================================================
-- 1) refresh_draft_nutrition_preview — crop_culinary_meta.culinary_aliases fallback
-- ============================================================================================
create or replace function public.refresh_draft_nutrition_preview(p_job_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_draft record;
  v_servings numeric;
  v_ing jsonb;
  v_crop text;
  v_free_text text;
  v_quantity numeric;
  v_unit text;
  v_resolved_food_key text;
  v_resolved_crop text;
  v_alias record;
  v_grams numeric;
  v_ref record;
  v_total numeric := 0;
  v_matched numeric := 0;
  v_cal_sum numeric := 0;
  v_pro_sum numeric := 0;
  v_carb_sum numeric := 0;
  v_fat_sum numeric := 0;
  v_fiber_sum numeric := 0;
  v_unresolved jsonb := '[]'::jsonb;
  v_unresolved_flag boolean := false;
  v_coverage numeric;
  v_source text;
  v_result jsonb;
  v_idx int := 0;
  v_label text;
begin
  select * into v_draft
  from public.recipe_drafts
  where job_id = p_job_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'DRAFT_NUTRITION_PREVIEW_NO_DRAFT: no recipe_drafts row found for job %', p_job_id;
  end if;

  v_servings := v_draft.servings;

  for v_ing in select * from jsonb_array_elements(coalesce(v_draft.ingredients, '[]'::jsonb))
  loop
    v_idx := v_idx + 1;
    v_crop := nullif(v_ing->>'crop', '');
    v_free_text := nullif(v_ing->>'freeTextName', '');
    v_quantity := nullif(v_ing->>'quantity', '')::numeric;
    v_unit := nullif(v_ing->>'unit', '');
    v_label := coalesce(v_free_text, v_crop, '(bilinmeyen malzeme)');

    if v_quantity is null and v_unit is null then
      continue;
    end if;

    v_resolved_crop := v_crop;
    v_resolved_food_key := null;

    if v_crop is null then
      select a.target_kind, a.target_key into v_alias
      from public.ingredient_nutrition_alias a
      where a.normalized_alias = public.fn_nutrition_normalize_text(v_free_text);
      if found then
        if v_alias.target_kind = 'food' then
          v_resolved_food_key := v_alias.target_key;
        elsif v_alias.target_kind = 'crop' then
          v_resolved_crop := v_alias.target_key;
        end if;
      else
        -- F2-S18 Sınıf B fallback: ingredient_nutrition_alias'ta kayıt yok — daha önce farklı bir
        -- amaçla (porsiyon/gram dönüşüm ipuçları için) girilmiş crop_culinary_meta.culinary_aliases'a
        -- bak. normalize edilmiş karşılaştırma; birden fazla crop eşleşirse (beklenmez) deterministik
        -- olsun diye crop adına göre ilk sırayı al.
        select c.crop into v_resolved_crop
        from public.crop_culinary_meta c
        where exists (
          select 1 from unnest(c.culinary_aliases) as alias
          where public.fn_nutrition_normalize_text(alias) = public.fn_nutrition_normalize_text(v_free_text)
        )
        order by c.crop
        limit 1;
      end if;
    end if;

    v_grams := public.fn_recipe_ingredient_grams_v2(v_resolved_crop, v_resolved_food_key, v_free_text, v_quantity, v_unit);

    if v_grams is null then
      v_unresolved_flag := true;
      v_unresolved := v_unresolved || jsonb_build_object(
        'sortOrder', coalesce((v_ing->>'sortOrder')::int, v_idx),
        'name', v_label,
        'reason', 'quantity_or_unit_not_resolvable'
      );
      continue;
    end if;

    v_total := v_total + v_grams;

    select coalesce(fr.calories_kcal, cn.calories_kcal) as calories_kcal,
           coalesce(fr.protein_g, cn.protein_g) as protein_g,
           coalesce(fr.carbs_g, cn.carbs_g) as carbs_g,
           coalesce(fr.fat_g, cn.fat_g) as fat_g,
           coalesce(fr.fiber_g, cn.fiber_g) as fiber_g
    into v_ref
    from (values (1)) as dummy(x)
    left join public.ingredient_nutrition_reference fr on fr.food_key = v_resolved_food_key
    left join public.crop_nutrition cn on cn.crop = v_resolved_crop;

    if v_ref.calories_kcal is null or v_ref.protein_g is null or v_ref.carbs_g is null
       or v_ref.fat_g is null or v_ref.fiber_g is null then
      v_unresolved_flag := true;
      v_unresolved := v_unresolved || jsonb_build_object(
        'sortOrder', coalesce((v_ing->>'sortOrder')::int, v_idx),
        'name', v_label,
        'reason', 'nutrition_reference_missing'
      );
      continue;
    end if;

    v_matched := v_matched + v_grams;
    v_cal_sum := v_cal_sum + v_grams * v_ref.calories_kcal / 100;
    v_pro_sum := v_pro_sum + v_grams * v_ref.protein_g / 100;
    v_carb_sum := v_carb_sum + v_grams * v_ref.carbs_g / 100;
    v_fat_sum := v_fat_sum + v_grams * v_ref.fat_g / 100;
    v_fiber_sum := v_fiber_sum + v_grams * v_ref.fiber_g / 100;
  end loop;

  if v_matched <= 0 or v_servings is null or v_servings <= 0 then
    v_result := jsonb_build_object(
      'coverage_pct', 0,
      'source', 'unavailable',
      'calories', null,
      'protein_g', null,
      'carbs_g', null,
      'fat_g', null,
      'fiber_g', null,
      'unresolved', v_unresolved,
      'computed_at', now()
    );
  else
    v_coverage := round(v_matched / nullif(v_total, 0) * 100, 2);
    if v_unresolved_flag then
      v_coverage := least(v_coverage, 99.99);
    end if;
    v_source := case when not v_unresolved_flag and v_coverage = 100 then 'computed' else 'partial' end;
    v_result := jsonb_build_object(
      'coverage_pct', v_coverage,
      'source', v_source,
      'calories', round(v_cal_sum / v_servings, 2),
      'protein_g', round(v_pro_sum / v_servings, 2),
      'carbs_g', round(v_carb_sum / v_servings, 2),
      'fat_g', round(v_fat_sum / v_servings, 2),
      'fiber_g', round(v_fiber_sum / v_servings, 2),
      'unresolved', v_unresolved,
      'computed_at', now()
    );
  end if;

  update public.recipe_drafts
  set nutrition_preview = v_result,
      nutrition_preview_computed_at = now()
  where id = v_draft.id;

  return v_result;
end;
$function$;

-- ============================================================================================
-- 2) calculate_recipe_nutrition — aynı crop_culinary_meta.culinary_aliases fallback'ı,
--    üretim tarafında. Makro toplama matematiği DEĞİŞMEDİ; yalnızca resolved_crop'un nasıl
--    bulunduğu genişledi (bir LATERAL join olarak, satır sayısını değiştirmeyecek şekilde
--    LIMIT 1 ile).
-- ============================================================================================
create or replace function public.calculate_recipe_nutrition(p_recipe_id uuid)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_servings numeric; v_total numeric := 0; v_matched numeric := 0;
  v_cal numeric := 0; v_pro numeric := 0; v_carb numeric := 0; v_fat numeric := 0; v_fiber numeric := 0;
  v_sodium numeric := 0; v_potassium numeric := 0; v_calcium numeric := 0; v_iron numeric := 0;
  v_vitc numeric := 0; v_vita numeric := 0; v_micro_complete boolean := true;
  v_unresolved boolean := false; v_grams numeric; v_coverage numeric; v_source text;
  v_versions text[] := '{}'; v_warnings text[] := '{}'; v_hash text; v_ref_version text; r record;
begin
  select servings into v_servings from public.recipes where id=p_recipe_id;
  if not found then raise exception 'calculate_recipe_nutrition: recipe % not found',p_recipe_id; end if;

  for r in
    select ri.id,ri.crop,ri.free_text_name,ri.quantity,ri.unit,ri.nutrition_food_key,ri.nutrition_exclusion_reason,
      coalesce(ri.nutrition_food_key,case when a.target_kind='food' then a.target_key end) food_key,
      coalesce(ri.crop,case when a.target_kind='crop' then a.target_key end, ccm.crop) resolved_crop,
      coalesce(fr.calories_kcal,cn.calories_kcal) calories_kcal,
      coalesce(fr.protein_g,cn.protein_g) protein_g,coalesce(fr.carbs_g,cn.carbs_g) carbs_g,
      coalesce(fr.fat_g,cn.fat_g) fat_g,coalesce(fr.fiber_g,cn.fiber_g) fiber_g,
      coalesce(fr.sodium_mg,cn.sodium_mg) sodium_mg,coalesce(fr.potassium_mg,cn.potassium_mg) potassium_mg,
      coalesce(fr.calcium_mg,cn.calcium_mg) calcium_mg,coalesce(fr.iron_mg,cn.iron_mg) iron_mg,
      coalesce(fr.vitamin_c_mg,cn.vitamin_c_mg) vitamin_c_mg,
      coalesce(fr.vitamin_a_mcg_rae,cn.vitamin_a_mcg_rae) vitamin_a_mcg_rae,
      coalesce(fr.reference_version,cn.reference_version) reference_version
    from public.recipe_ingredients ri
    left join public.ingredient_nutrition_alias a on ri.crop is null and ri.nutrition_food_key is null
      and a.normalized_alias=public.fn_nutrition_normalize_text(ri.free_text_name)
    left join lateral (
      select ccm.crop
      from public.crop_culinary_meta ccm
      where ri.crop is null and ri.nutrition_food_key is null and a.target_kind is null
        and exists (
          select 1 from unnest(ccm.culinary_aliases) as alias
          where public.fn_nutrition_normalize_text(alias) = public.fn_nutrition_normalize_text(ri.free_text_name)
        )
      order by ccm.crop
      limit 1
    ) ccm on true
    left join public.ingredient_nutrition_reference fr on fr.food_key=coalesce(ri.nutrition_food_key,case when a.target_kind='food' then a.target_key end)
    left join public.crop_nutrition cn on cn.crop=coalesce(ri.crop,case when a.target_kind='crop' then a.target_key end, ccm.crop)
    where ri.recipe_id=p_recipe_id order by ri.sort_order,ri.id
  loop
    if r.nutrition_exclusion_reason is not null then
      v_warnings := array_append(v_warnings,'excluded_ingredient:'||r.nutrition_exclusion_reason);
      continue;
    end if;
    v_grams := public.fn_recipe_ingredient_grams_v2(r.resolved_crop,r.food_key,r.free_text_name,r.quantity,r.unit);
    if v_grams is null then v_unresolved:=true; continue; end if;
    v_total:=v_total+v_grams;
    if r.calories_kcal is null or r.protein_g is null or r.carbs_g is null or r.fat_g is null or r.fiber_g is null then
      v_unresolved:=true; continue;
    end if;
    v_matched:=v_matched+v_grams;
    v_cal:=v_cal+v_grams*r.calories_kcal/100; v_pro:=v_pro+v_grams*r.protein_g/100;
    v_carb:=v_carb+v_grams*r.carbs_g/100; v_fat:=v_fat+v_grams*r.fat_g/100;
    v_fiber:=v_fiber+v_grams*r.fiber_g/100;
    if r.sodium_mg is null or r.potassium_mg is null or r.calcium_mg is null or r.iron_mg is null
       or r.vitamin_c_mg is null or r.vitamin_a_mcg_rae is null then v_micro_complete:=false;
    else
      v_sodium:=v_sodium+v_grams*r.sodium_mg/100; v_potassium:=v_potassium+v_grams*r.potassium_mg/100;
      v_calcium:=v_calcium+v_grams*r.calcium_mg/100; v_iron:=v_iron+v_grams*r.iron_mg/100;
      v_vitc:=v_vitc+v_grams*r.vitamin_c_mg/100; v_vita:=v_vita+v_grams*r.vitamin_a_mcg_rae/100;
    end if;
    if r.reference_version is not null and not r.reference_version=any(v_versions) then v_versions:=v_versions||r.reference_version; end if;
  end loop;

  if v_unresolved then v_warnings:=array_append(v_warnings,'unmatched_ingredient'); end if;
  select array(select distinct x from unnest(v_warnings) x order by x) into v_warnings;
  if v_matched<=0 or v_servings is null or v_servings<=0 then
    update public.recipes set calories=null,protein_g=null,carbs_g=null,fat_g=null,fiber_g=null,micronutrients=null,
      nutrition_source=null,nutrition_coverage_pct=null,nutrition_calculated_at=null,nutrition_input_hash=null,
      nutrition_reference_version=null,nutrition_warnings=v_warnings where id=p_recipe_id; return;
  end if;
  v_coverage:=round(v_matched/nullif(v_total,0)*100,2);
  if v_unresolved then v_coverage:=least(v_coverage,99.99); end if;
  v_source:=case when not v_unresolved and v_coverage=100 then 'computed' else 'partial' end;
  v_ref_version:=array_to_string(v_versions,'+');
  select md5(p_recipe_id::text||'|t4-nutrition-v2|'||v_servings::text||'|'||coalesce(v_ref_version,'')||'|'||
    coalesce(string_agg(coalesce(ri.crop,'')||':'||coalesce(ri.free_text_name,'')||':'||coalesce(ri.nutrition_food_key,'')||':'||
      coalesce(ri.nutrition_exclusion_reason,'')||':'||coalesce(ri.quantity::text,'')||':'||coalesce(ri.unit,''),',' order by ri.sort_order,ri.id),''))
    into v_hash from public.recipe_ingredients ri where ri.recipe_id=p_recipe_id;
  update public.recipes set calories=round(v_cal/v_servings,2),protein_g=round(v_pro/v_servings,2),
    carbs_g=round(v_carb/v_servings,2),fat_g=round(v_fat/v_servings,2),fiber_g=round(v_fiber/v_servings,2),
    micronutrients=case when v_micro_complete then jsonb_build_object('schema_version',1,'basis','per_serving','values',jsonb_build_object(
      'sodium_mg',round(v_sodium/v_servings,2),'potassium_mg',round(v_potassium/v_servings,2),
      'calcium_mg',round(v_calcium/v_servings,2),'iron_mg',round(v_iron/v_servings,2),
      'vitamin_c_mg',round(v_vitc/v_servings,2),'vitamin_a_mcg_rae',round(v_vita/v_servings,2))) else null end,
    nutrition_source=v_source,nutrition_coverage_pct=v_coverage,nutrition_calculated_at=now(),nutrition_input_hash=v_hash,
    nutrition_reference_version=v_ref_version,nutrition_warnings=v_warnings where id=p_recipe_id;
end $function$;

-- ============================================================================================
-- 3) nutrition_admin_resolutions — admin_resolve_nutrition_unresolved()'ın her çağrısının iz
--    bıraktığı audit tablosu. recipe_admin_reviews ile aynı RLS/grant deseni: RLS açık, policy
--    yok (yalnız RLS'i bypass eden service_role yazar/okur).
-- ============================================================================================
create table public.nutrition_admin_resolutions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recipe_generation_jobs(id),
  ingredient_label text not null,
  resolution_kind text not null check (resolution_kind in ('add_measure', 'alias_to_existing', 'new_reference', 'mark_unquantified')),
  resolution jsonb not null,
  outcome text not null check (outcome in ('applied', 'already_exists', 'ingredient_not_found')),
  notes text,
  admin_actor text,
  created_at timestamptz not null default now()
);

alter table public.nutrition_admin_resolutions enable row level security;

grant select, insert on public.nutrition_admin_resolutions to service_role;

-- ============================================================================================
-- 4) admin_resolve_nutrition_unresolved — Sınıf A + C için tek yazma yolu. Var olan hiçbir
--    alias/ölçü/referans satırı değiştirilmez/silinmez, yalnız ekleme (çakışma varsa
--    {ok:false, error:'already_exists'} döner, edge function bunu 409'a çevirir). Her başarılı
--    yazımdan hemen sonra refresh_draft_nutrition_preview(p_job_id) tekrar çalıştırılır.
-- ============================================================================================
create or replace function public.admin_resolve_nutrition_unresolved(
  p_job_id uuid,
  p_ingredient_label text,
  p_resolution jsonb,
  p_notes text default null,
  p_admin_actor text default null
)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_kind text := p_resolution->>'kind';
  v_draft record;
  v_normalized_label text := public.fn_nutrition_normalize_text(p_ingredient_label);
  v_scope jsonb;
  v_target_kind text;
  v_target_key text;
  v_unit text;
  v_grams numeric;
  v_food_key text;
  v_ingredients jsonb;
  v_ing jsonb;
  v_matched boolean;
  v_outcome text;
  v_preview jsonb;
  v_audit_id uuid;
begin
  if v_kind is null or v_kind not in ('add_measure', 'alias_to_existing', 'new_reference', 'mark_unquantified') then
    raise exception 'ADMIN_NUTRITION_RESOLVE_UNKNOWN_KIND: resolution.kind must be one of add_measure, alias_to_existing, new_reference, mark_unquantified (got %)', v_kind;
  end if;
  if p_ingredient_label is null or btrim(p_ingredient_label) = '' then
    raise exception 'ADMIN_NUTRITION_RESOLVE_INGREDIENT_LABEL_REQUIRED: ingredientLabel is required';
  end if;

  select * into v_draft
  from public.recipe_drafts
  where job_id = p_job_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'ADMIN_NUTRITION_RESOLVE_NO_DRAFT: no recipe_drafts row found for job %', p_job_id;
  end if;

  v_outcome := 'applied';

  if v_kind = 'add_measure' then
    v_scope := p_resolution->'scope';
    if v_scope ? 'crop' and nullif(v_scope->>'crop', '') is not null then
      v_target_kind := 'crop'; v_target_key := v_scope->>'crop';
    elsif v_scope ? 'foodKey' and nullif(v_scope->>'foodKey', '') is not null then
      v_target_kind := 'food'; v_target_key := v_scope->>'foodKey';
    else
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_SCOPE: add_measure requires resolution.scope.crop or resolution.scope.foodKey';
    end if;

    v_unit := public.fn_nutrition_normalize_unit(p_resolution->>'unit');
    if v_unit is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_UNIT: resolution.unit could not be normalized';
    end if;

    v_grams := (p_resolution->>'gramsPerUnit')::numeric;
    if v_grams is null or v_grams <= 0 then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_GRAMS: resolution.gramsPerUnit must be a positive number';
    end if;

    insert into public.ingredient_measure_reference
      (target_kind, target_key, normalized_unit, grams_per_unit, reference_source, reference_version, notes)
    values
      (v_target_kind, v_target_key, v_unit, v_grams, 'admin_manual', 'unverified',
       'ADMIN GİRİŞİ — canlı kaynakla doğrulanmadı, ' || to_char(now(), 'YYYY-MM-DD') || coalesce(' — ' || p_notes, ''))
    on conflict (target_kind, target_key, normalized_unit) do nothing;

    if not found then
      v_outcome := 'already_exists';
    end if;

  elsif v_kind = 'alias_to_existing' then
    v_target_kind := p_resolution->>'targetKind';
    v_target_key := nullif(p_resolution->>'targetKey', '');
    if v_target_kind is null or v_target_kind not in ('crop', 'food') or v_target_key is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_TARGET: alias_to_existing requires resolution.targetKind (crop|food) and resolution.targetKey';
    end if;

    insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
    values (
      v_normalized_label, v_target_kind, v_target_key,
      'ADMIN GİRİŞİ — ' || to_char(now(), 'YYYY-MM-DD') || coalesce(' — ' || p_notes, '')
    )
    on conflict (normalized_alias) do nothing;

    if not found then
      v_outcome := 'already_exists';
    end if;

  elsif v_kind = 'new_reference' then
    v_food_key := nullif(p_resolution->>'foodKey', '');
    if v_food_key is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_FOOD_KEY: new_reference requires resolution.foodKey';
    end if;
    if (p_resolution->>'caloriesKcal') is null or (p_resolution->>'proteinG') is null
       or (p_resolution->>'carbsG') is null or (p_resolution->>'fatG') is null
       or (p_resolution->>'fiberG') is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INCOMPLETE_MACROS: new_reference requires caloriesKcal, proteinG, carbsG, fatG and fiberG';
    end if;

    insert into public.ingredient_nutrition_reference (
      food_key, display_name, reference_source, reference_version,
      calories_kcal, protein_g, carbs_g, fat_g, fiber_g, notes
    ) values (
      v_food_key,
      coalesce(nullif(p_resolution->>'displayName', ''), p_ingredient_label),
      'admin_manual', 'unverified',
      (p_resolution->>'caloriesKcal')::numeric, (p_resolution->>'proteinG')::numeric,
      (p_resolution->>'carbsG')::numeric, (p_resolution->>'fatG')::numeric, (p_resolution->>'fiberG')::numeric,
      'ADMIN GİRİŞİ — canlı kaynakla doğrulanmadı, ' || to_char(now(), 'YYYY-MM-DD') || coalesce(' — ' || p_notes, '')
    )
    on conflict (food_key) do nothing;

    if not found then
      v_outcome := 'already_exists';
    else
      -- Aynı transaction içinde otomatik alias — spec §2.2 new_reference davranışı.
      insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
      values (
        v_normalized_label, 'food', v_food_key,
        'ADMIN GİRİŞİ — new_reference ile birlikte otomatik oluşturuldu, ' || to_char(now(), 'YYYY-MM-DD')
      )
      on conflict (normalized_alias) do nothing;
    end if;

  elsif v_kind = 'mark_unquantified' then
    v_ingredients := '[]'::jsonb;
    v_matched := false;
    for v_ing in select * from jsonb_array_elements(coalesce(v_draft.ingredients, '[]'::jsonb))
    loop
      if public.fn_nutrition_normalize_text(coalesce(nullif(v_ing->>'freeTextName', ''), nullif(v_ing->>'crop', ''))) = v_normalized_label then
        v_matched := true;
        v_ing := v_ing || jsonb_build_object('quantity', null, 'unit', null);
      end if;
      v_ingredients := v_ingredients || jsonb_build_array(v_ing);
    end loop;

    if not v_matched then
      v_outcome := 'ingredient_not_found';
    else
      update public.recipe_drafts
      set ingredients = v_ingredients, updated_at = now()
      where id = v_draft.id;
    end if;
  end if;

  insert into public.nutrition_admin_resolutions
    (job_id, ingredient_label, resolution_kind, resolution, outcome, notes, admin_actor)
  values
    (p_job_id, p_ingredient_label, v_kind, p_resolution, v_outcome, p_notes, p_admin_actor)
  returning id into v_audit_id;

  if v_outcome <> 'applied' then
    return jsonb_build_object('ok', false, 'error', v_outcome, 'auditId', v_audit_id);
  end if;

  v_preview := public.refresh_draft_nutrition_preview(p_job_id);

  return jsonb_build_object('ok', true, 'auditId', v_audit_id, 'preview', v_preview);
end;
$function$;

-- Yalnızca service_role çağırır (admin-recipe-nutrition-resolve edge function'ı üzerinden,
-- getSupabaseAdminClient() ile) — 20260917102138'in refresh_draft_nutrition_preview için
-- kurduğu "authenticated'a gereksiz EXECUTE verme" disiplinini burada baştan uyguluyoruz.
revoke all on function public.admin_resolve_nutrition_unresolved(uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_nutrition_unresolved(uuid, text, jsonb, text, text) to service_role;
